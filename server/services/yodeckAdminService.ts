import { db } from "../db";
import { screens, advertisers, adAssets } from "@shared/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { storage } from "../storage";
import { yodeckRequest } from "./simplePlaylistModel";

const LOG = "[YodeckAdmin]";

interface PlaylistSearchResult {
  id: number;
  name: string;
  modified_at?: string;
  created_at?: string;
  items?: Array<{ id: number; type: string; name: string }>;
}

interface SyncPlaylistMappingEntry {
  playerId: string;
  screenId: string;
  screenName: string;
  oldPlaylistId: string | null;
  newPlaylistId: string | null;
  playlistName: string | null;
  action: string;
}

export async function syncPlaylistMappings(): Promise<{
  ok: boolean;
  correlationId: string;
  mappings: SyncPlaylistMappingEntry[];
  errors: string[];
}> {
  const correlationId = `sync-plm-${Date.now().toString(16)}`;
  const mappings: SyncPlaylistMappingEntry[] = [];
  const errors: string[] = [];

  console.log(`${LOG} [${correlationId}] Starting playlist mapping sync...`);

  const allScreens = await db.select()
    .from(screens)
    .where(isNotNull(screens.yodeckPlayerId));

  for (const screen of allScreens) {
    const playerId = screen.yodeckPlayerId!;
    const oldPlaylistId = screen.playlistId;

    try {
      const prefix = `EVZ | SCREEN | ${playerId}`;
      const searchResult = await yodeckRequest<{ count: number; results: PlaylistSearchResult[] }>(
        `/playlists/?search=${encodeURIComponent(prefix)}`
      );

      if (!searchResult.ok || !searchResult.data) {
        errors.push(`Player ${playerId}: Yodeck search failed: ${searchResult.error}`);
        mappings.push({
          playerId,
          screenId: screen.id,
          screenName: screen.name,
          oldPlaylistId,
          newPlaylistId: oldPlaylistId,
          playlistName: null,
          action: "ERROR_SEARCH_FAILED",
        });
        continue;
      }

      const exactMatches = searchResult.data.results.filter(p => p.name.startsWith(prefix));

      if (exactMatches.length === 0) {
        const playerResult = await yodeckRequest<{
          id: number;
          screen_content?: { source_type: string | null; source_id: number | null; source_name: string | null };
        }>(`/screens/${playerId}/`);

        if (playerResult.ok && playerResult.data?.screen_content?.source_type === "playlist" && playerResult.data.screen_content.source_id) {
          const livePlaylistId = String(playerResult.data.screen_content.source_id);
          const livePlaylistName = playerResult.data.screen_content.source_name || null;

          await db.update(screens)
            .set({ playlistId: livePlaylistId, updatedAt: new Date() })
            .where(eq(screens.id, screen.id));

          mappings.push({
            playerId,
            screenId: screen.id,
            screenName: screen.name,
            oldPlaylistId,
            newPlaylistId: livePlaylistId,
            playlistName: livePlaylistName,
            action: oldPlaylistId === livePlaylistId ? "UNCHANGED_FROM_PLAYER" : "SYNCED_FROM_PLAYER",
          });
          console.log(`${LOG} [${correlationId}] Player ${playerId}: synced from live player source -> playlist ${livePlaylistId}`);
        } else {
          mappings.push({
            playerId,
            screenId: screen.id,
            screenName: screen.name,
            oldPlaylistId,
            newPlaylistId: oldPlaylistId,
            playlistName: null,
            action: "NO_PLAYLIST_FOUND",
          });
          console.warn(`${LOG} [${correlationId}] Player ${playerId}: no EVZ playlist found and no live playlist source`);
        }
        continue;
      }

      let chosen: PlaylistSearchResult;
      if (exactMatches.length === 1) {
        chosen = exactMatches[0];
      } else {
        chosen = exactMatches.sort((a, b) => {
          const aDate = a.modified_at || a.created_at || "";
          const bDate = b.modified_at || b.created_at || "";
          return bDate.localeCompare(aDate);
        })[0];
        console.log(`${LOG} [${correlationId}] Player ${playerId}: ${exactMatches.length} playlists found, chose most recent: ${chosen.id} "${chosen.name}"`);
      }

      const newPlaylistId = String(chosen.id);
      const action = oldPlaylistId === newPlaylistId ? "UNCHANGED" : "UPDATED";

      await db.update(screens)
        .set({ playlistId: newPlaylistId, updatedAt: new Date() })
        .where(eq(screens.id, screen.id));

      mappings.push({
        playerId,
        screenId: screen.id,
        screenName: screen.name,
        oldPlaylistId,
        newPlaylistId,
        playlistName: chosen.name,
        action,
      });

      console.log(`${LOG} [${correlationId}] Player ${playerId}: ${action} playlistId ${oldPlaylistId} -> ${newPlaylistId} ("${chosen.name}")`);
    } catch (err: any) {
      errors.push(`Player ${playerId}: ${err.message}`);
      mappings.push({
        playerId,
        screenId: screen.id,
        screenName: screen.name,
        oldPlaylistId,
        newPlaylistId: oldPlaylistId,
        playlistName: null,
        action: "ERROR_EXCEPTION",
      });
    }
  }

  console.log(`${LOG} [${correlationId}] Sync complete: ${mappings.length} screens, ${errors.length} errors`);
  return { ok: errors.length === 0, correlationId, mappings, errors };
}

export async function ensureBaselinePlaylist(locationId?: string): Promise<{
  ok: boolean;
  correlationId: string;
  baselinePlaylistId: number | null;
  baselinePlaylistName: string | null;
  wasCreated: boolean;
  itemCount: number;
  envVarSet: boolean;
  error?: string;
}> {
  const correlationId = `baseline-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] Ensuring baseline playlist exists...`);

  const { BASELINE_MEDIA_IDS } = await import("../config/contentPipeline");
  const { getBasePlaylistId } = await import("./simplePlaylistModel");

  const baseResult = await getBasePlaylistId();

  if (baseResult.ok && baseResult.basePlaylistId) {
    console.log(`${LOG} [${correlationId}] Baseline already exists: id=${baseResult.basePlaylistId}`);

    const playlistDetail = await yodeckRequest<{ id: number; name: string; items: Array<{ id: number }> }>(
      `/playlists/${baseResult.basePlaylistId}/`
    );
    const itemCount = playlistDetail.data?.items?.length || 0;

    process.env.BASELINE_PLAYLIST_ID = String(baseResult.basePlaylistId);
    process.env.AUTOPILOT_BASELINE_PLAYLIST_ID = String(baseResult.basePlaylistId);

    return {
      ok: true,
      correlationId,
      baselinePlaylistId: baseResult.basePlaylistId,
      baselinePlaylistName: baseResult.basePlaylistName,
      wasCreated: false,
      itemCount,
      envVarSet: true,
    };
  }

  console.log(`${LOG} [${correlationId}] Baseline playlist not found, creating...`);

  const baselineName = "Basis playlist";
  const baselineItems = BASELINE_MEDIA_IDS.map((mediaId, index) => ({
    id: mediaId,
    priority: index + 1,
    duration: 10,
    type: "media" as const,
  }));

  const createResult = await yodeckRequest<{ id: number; name: string }>(
    "/playlists/",
    "POST",
    {
      name: baselineName,
      description: `Elevizion baseline playlist${locationId ? ` for location ${locationId}` : ""}`,
      items: baselineItems,
      add_gaps: false,
      shuffle_content: false,
    }
  );

  if (!createResult.ok || !createResult.data?.id) {
    return {
      ok: false,
      correlationId,
      baselinePlaylistId: null,
      baselinePlaylistName: null,
      wasCreated: false,
      itemCount: 0,
      envVarSet: false,
      error: `Failed to create baseline playlist: ${createResult.error}`,
    };
  }

  const newId = createResult.data.id;
  process.env.BASELINE_PLAYLIST_ID = String(newId);
  process.env.AUTOPILOT_BASELINE_PLAYLIST_ID = String(newId);

  console.log(`${LOG} [${correlationId}] Created baseline playlist: id=${newId}, items=${BASELINE_MEDIA_IDS.length}`);

  return {
    ok: true,
    correlationId,
    baselinePlaylistId: newId,
    baselinePlaylistName: baselineName,
    wasCreated: true,
    itemCount: BASELINE_MEDIA_IDS.length,
    envVarSet: true,
  };
}

interface DuplicateCandidate {
  id: number;
  name: string;
  status: string;
  usedInPlaylists: number[];
  isCanonical: boolean;
  action: "KEEP" | "WOULD_DELETE" | "DELETED" | "SKIP_IN_USE";
}

export async function cleanupDuplicates(
  advertiserId: string,
  dryRun: boolean = true
): Promise<{
  ok: boolean;
  correlationId: string;
  advertiserId: string;
  dryRun: boolean;
  canonicalMediaId: number | null;
  candidates: DuplicateCandidate[];
  deletedCount: number;
  skippedCount: number;
  error?: string;
}> {
  const correlationId = `cleanup-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] Cleanup duplicates for advertiser=${advertiserId} dryRun=${dryRun}`);

  const advertiser = await storage.getAdvertiser(advertiserId);
  if (!advertiser) {
    return { ok: false, correlationId, advertiserId, dryRun, canonicalMediaId: null, candidates: [], deletedCount: 0, skippedCount: 0, error: "Advertiser niet gevonden" };
  }

  const canonicalMediaId = advertiser.yodeckMediaIdCanonical;
  if (!canonicalMediaId) {
    return { ok: false, correlationId, advertiserId, dryRun, canonicalMediaId: null, candidates: [], deletedCount: 0, skippedCount: 0, error: "Advertiser has no canonical mediaId" };
  }

  const { buildSearchPatterns } = await import("./canonicalMediaService");
  const assets = await db.select().from(adAssets).where(eq(adAssets.advertiserId, advertiserId));
  const patterns = buildSearchPatterns(advertiser, assets);

  const allMedia: Array<{ id: number; name: string; status: string }> = [];
  const seenIds = new Set<number>();

  for (const pattern of patterns.slice(0, 5)) {
    const base = pattern.replace(/\.(mp4|mov|avi|webm)$/i, "").substring(0, 50);
    if (base.length < 3) continue;

    const searchResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string; status: string }> }>(
      `/media/?search=${encodeURIComponent(base)}`
    );
    if (searchResult.ok && searchResult.data?.results) {
      for (const m of searchResult.data.results) {
        if (!seenIds.has(m.id)) {
          seenIds.add(m.id);
          allMedia.push(m);
        }
      }
    }
  }

  console.log(`${LOG} [${correlationId}] Found ${allMedia.length} media items across Yodeck search`);

  const allPlaylists = await yodeckRequest<{ count: number; results: Array<{ id: number; items: Array<{ id: number }> }> }>(
    `/playlists/`
  );
  const playlistMediaMap = new Map<number, number[]>();
  if (allPlaylists.ok && allPlaylists.data?.results) {
    for (const pl of allPlaylists.data.results) {
      for (const item of (pl.items || [])) {
        const existing = playlistMediaMap.get(item.id) || [];
        existing.push(pl.id);
        playlistMediaMap.set(item.id, existing);
      }
    }
  }

  const candidates: DuplicateCandidate[] = [];
  let deletedCount = 0;
  let skippedCount = 0;

  for (const media of allMedia) {
    const isCanonical = media.id === canonicalMediaId;
    const usedInPlaylists = playlistMediaMap.get(media.id) || [];

    if (isCanonical) {
      candidates.push({ id: media.id, name: media.name, status: media.status, usedInPlaylists, isCanonical: true, action: "KEEP" });
      continue;
    }

    if (usedInPlaylists.length > 0) {
      candidates.push({ id: media.id, name: media.name, status: media.status, usedInPlaylists, isCanonical: false, action: "SKIP_IN_USE" });
      skippedCount++;
      continue;
    }

    if (dryRun) {
      candidates.push({ id: media.id, name: media.name, status: media.status, usedInPlaylists, isCanonical: false, action: "WOULD_DELETE" });
    } else {
      const deleteResult = await yodeckRequest(`/media/${media.id}/`, "DELETE");
      if (deleteResult.ok) {
        candidates.push({ id: media.id, name: media.name, status: media.status, usedInPlaylists, isCanonical: false, action: "DELETED" });
        deletedCount++;
        console.log(`${LOG} [${correlationId}] DELETED media ${media.id} "${media.name}"`);
      } else {
        candidates.push({ id: media.id, name: media.name, status: media.status, usedInPlaylists, isCanonical: false, action: "SKIP_IN_USE" });
        skippedCount++;
        console.warn(`${LOG} [${correlationId}] Failed to delete media ${media.id}: ${deleteResult.error}`);
      }
    }
  }

  console.log(`${LOG} [${correlationId}] Cleanup complete: ${candidates.length} candidates, ${deletedCount} deleted, ${skippedCount} skipped`);
  return { ok: true, correlationId, advertiserId, dryRun, canonicalMediaId, candidates, deletedCount, skippedCount };
}

export async function checkEnhancedMappingHealth(advertiserId: string): Promise<{
  ok: boolean;
  correlationId: string;
  advertiserId: string;
  advertiserName: string | null;
  canonicalMediaId: number | null;
  mediaStatus: { exists: boolean; status: string | null; isReady: boolean } | null;
  screens: Array<{
    screenId: string;
    playerId: string;
    dbPlaylistId: string | null;
    livePlaylistId: number | null;
    livePlaylistName: string | null;
    playlistMatch: boolean;
    adInPlaylist: boolean;
  }>;
  baselineConfigured: boolean;
  baselinePlaylistId: number | null;
  baselinePlaylistName: string | null;
  error?: string;
}> {
  const correlationId = `mh-${Date.now().toString(16)}`;
  const advertiser = await storage.getAdvertiser(advertiserId);

  if (!advertiser) {
    return {
      ok: false, correlationId, advertiserId, advertiserName: null, canonicalMediaId: null,
      mediaStatus: null, screens: [], baselineConfigured: false, baselinePlaylistId: null, baselinePlaylistName: null,
      error: "Advertiser niet gevonden",
    };
  }

  const canonicalMediaId = advertiser.yodeckMediaIdCanonical;
  let mediaStatus: { exists: boolean; status: string | null; isReady: boolean } | null = null;

  if (canonicalMediaId) {
    const mediaResult = await yodeckRequest<{ id: number; status: string }>(`/media/${canonicalMediaId}/`);
    if (mediaResult.ok && mediaResult.data) {
      const status = (mediaResult.data.status || "").toLowerCase();
      const readyStatuses = ["finished", "ready", "done", "encoded", "active", "ok", "completed"];
      mediaStatus = { exists: true, status, isReady: readyStatuses.includes(status) };
    } else if (mediaResult.status === 404) {
      mediaStatus = { exists: false, status: null, isReady: false };
    } else {
      mediaStatus = { exists: false, status: null, isReady: false };
    }
  }

  const allScreens = await db.select()
    .from(screens)
    .where(isNotNull(screens.yodeckPlayerId));

  const screenResults: Array<{
    screenId: string;
    playerId: string;
    dbPlaylistId: string | null;
    livePlaylistId: number | null;
    livePlaylistName: string | null;
    playlistMatch: boolean;
    adInPlaylist: boolean;
  }> = [];

  for (const screen of allScreens) {
    const playerId = screen.yodeckPlayerId!;
    const dbPlaylistId = screen.playlistId;
    let livePlaylistId: number | null = null;
    let livePlaylistName: string | null = null;
    let adInPlaylist = false;

    const playerResult = await yodeckRequest<{
      screen_content?: { source_type: string | null; source_id: number | null; source_name: string | null };
    }>(`/screens/${playerId}/`);

    if (playerResult.ok && playerResult.data?.screen_content?.source_type === "playlist") {
      livePlaylistId = playerResult.data.screen_content.source_id;
      livePlaylistName = playerResult.data.screen_content.source_name || null;
    }

    if (livePlaylistId && canonicalMediaId) {
      const plResult = await yodeckRequest<{ items: Array<{ id: number }> }>(`/playlists/${livePlaylistId}/`);
      if (plResult.ok && plResult.data?.items) {
        adInPlaylist = plResult.data.items.some(item => item.id === canonicalMediaId);
      }
    }

    const playlistMatch = dbPlaylistId != null && livePlaylistId != null && String(livePlaylistId) === dbPlaylistId;

    screenResults.push({
      screenId: screen.id,
      playerId,
      dbPlaylistId,
      livePlaylistId,
      livePlaylistName,
      playlistMatch,
      adInPlaylist,
    });
  }

  const { getBasePlaylistId } = await import("./simplePlaylistModel");
  const baseResult = await getBasePlaylistId();
  const baselineConfigured = baseResult.ok && !!baseResult.basePlaylistId;

  const allOk = !!canonicalMediaId && (mediaStatus?.isReady ?? false) && baselineConfigured &&
    screenResults.every(s => s.playlistMatch);

  return {
    ok: allOk,
    correlationId,
    advertiserId,
    advertiserName: advertiser.companyName || null,
    canonicalMediaId,
    mediaStatus,
    screens: screenResults,
    baselineConfigured,
    baselinePlaylistId: baseResult.basePlaylistId,
    baselinePlaylistName: baseResult.basePlaylistName || null,
  };
}
