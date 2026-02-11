import { db } from "../db";
import { screens, advertisers } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getYodeckClient } from "./yodeckClient";
import type { YodeckClient, YodeckMedia, YodeckPlaylist } from "./yodeckClient";
import {
  yodeckRequest,
  getBasePlaylistId,
  ensureScreenPlaylist,
  applyPlayerSourceAndPush,
  getScreenNowPlayingSimple,
} from "./simplePlaylistModel";
import {
  buildScreenPlaylistItems,
  getPlaylistItems,
  replacePlaylistItems,
} from "./baselineSyncService";

const LOG = "[YodeckTruth]";

interface TruthScreen {
  screenId: string;
  playerId: string;
  playlistId: number | null;
  itemCount: number;
  mediaIds: number[];
}

interface TruthResult {
  ok: boolean;
  correlationId: string;
  baseline: { id: number; name: string; itemCount: number; mediaIds: number[] };
  screens: TruthScreen[];
  keep: { playlistIds: number[]; mediaIds: number[] };
  canonicalMediaIds: number[];
  errors: string[];
}

interface CleanupResult {
  ok: boolean;
  correlationId: string;
  dryRun: boolean;
  truth: { baselineId: number; keepPlaylistCount: number; keepMediaCount: number };
  inventory: { totalMedia: number; totalPlaylists: number };
  candidates: {
    deleteMediaIds: number[];
    deletePlaylistIds: number[];
    deleteMediaCount: number;
    deletePlaylistCount: number;
    truncated: boolean;
  };
  deletedMedia: Array<{ id: number; ok: boolean; error?: string }>;
  deletedPlaylists: Array<{ id: number; ok: boolean; error?: string }>;
  failed: Array<{ type: string; id: number; error: string }>;
  errors: string[];
}

interface SyncScreen {
  screenId: string;
  playerId: string;
  playlistId: number | null;
  updatedItemCount: number;
  pushed: boolean;
  nowPlayingOk: boolean;
  topItems: string[];
  error?: string;
}

interface SyncResult {
  ok: boolean;
  correlationId: string;
  baseline: { id: number; name: string; itemCount: number };
  screens: SyncScreen[];
  errors: string[];
}

async function getScreensForLocation(locationId?: string) {
  let allScreens = await db.select().from(screens).where(isNotNull(screens.yodeckPlayerId));
  if (locationId) {
    allScreens = allScreens.filter(s => s.locationId === locationId);
  }
  return allScreens;
}

async function getCanonicalMediaIds(): Promise<number[]> {
  try {
    const allAdvertisers = await db.select({
      id: advertisers.id,
      yodeckMediaIdCanonical: advertisers.yodeckMediaIdCanonical,
    }).from(advertisers);
    return allAdvertisers
      .filter(a => a.yodeckMediaIdCanonical != null)
      .map(a => a.yodeckMediaIdCanonical!);
  } catch {
    return [];
  }
}

export async function collectTruth(locationId?: string): Promise<TruthResult> {
  const correlationId = `truth-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] collectTruth locationId=${locationId || "ALL"}...`);

  const errors: string[] = [];

  const baseResult = await getBasePlaylistId();
  if (!baseResult.ok || !baseResult.basePlaylistId) {
    return {
      ok: false, correlationId,
      baseline: { id: 0, name: "", itemCount: 0, mediaIds: [] },
      screens: [], keep: { playlistIds: [], mediaIds: [] },
      canonicalMediaIds: [],
      errors: [`Baseline playlist niet gevonden: ${baseResult.error || "Basis playlist does not exist"}`],
    };
  }

  const baselinePlaylistId = baseResult.basePlaylistId;
  const basePl = await getPlaylistItems(baselinePlaylistId);
  if (!basePl.ok) {
    return {
      ok: false, correlationId,
      baseline: { id: baselinePlaylistId, name: baseResult.basePlaylistName || "", itemCount: 0, mediaIds: [] },
      screens: [], keep: { playlistIds: [baselinePlaylistId], mediaIds: [] },
      canonicalMediaIds: [],
      errors: [basePl.error || "Failed to fetch baseline items"],
    };
  }

  const baselineMediaIds = basePl.items.map(i => i.id);
  const keepPlaylistIds = new Set<number>([baselinePlaylistId]);
  const keepMediaIds = new Set<number>(baselineMediaIds);

  const targetScreens = await getScreensForLocation(locationId);
  const truthScreens: TruthScreen[] = [];

  for (const screen of targetScreens) {
    const playerId = screen.yodeckPlayerId!;
    const dbPlaylistId = screen.playlistId ? Number(screen.playlistId) : null;

    if (dbPlaylistId) keepPlaylistIds.add(dbPlaylistId);

    let livePlaylistId: number | null = dbPlaylistId;
    let itemCount = 0;
    const mediaIds: number[] = [];

    const playerResult = await yodeckRequest<{
      screen_content?: { source_type: string | null; source_id: number | null };
    }>(`/screens/${playerId}/`);

    if (playerResult.ok && playerResult.data?.screen_content?.source_type === "playlist") {
      const liveId = playerResult.data.screen_content.source_id;
      if (liveId) {
        livePlaylistId = liveId;
        keepPlaylistIds.add(liveId);
      }
    }

    if (livePlaylistId) {
      const plItems = await getPlaylistItems(livePlaylistId);
      if (plItems.ok) {
        itemCount = plItems.items.length;
        for (const item of plItems.items) {
          mediaIds.push(item.id);
          keepMediaIds.add(item.id);
        }
      }
    }

    truthScreens.push({
      screenId: screen.id,
      playerId,
      playlistId: livePlaylistId,
      itemCount,
      mediaIds,
    });
  }

  const canonicalMediaIds = await getCanonicalMediaIds();
  for (const id of canonicalMediaIds) {
    keepMediaIds.add(id);
  }

  console.log(`${LOG} [${correlationId}] Truth: baseline=${baselinePlaylistId} keepPlaylists=${keepPlaylistIds.size} keepMedia=${keepMediaIds.size} canonical=${canonicalMediaIds.length}`);

  return {
    ok: errors.length === 0,
    correlationId,
    baseline: {
      id: baselinePlaylistId,
      name: basePl.name || baseResult.basePlaylistName || "",
      itemCount: basePl.items.length,
      mediaIds: baselineMediaIds,
    },
    screens: truthScreens,
    keep: {
      playlistIds: Array.from(keepPlaylistIds),
      mediaIds: Array.from(keepMediaIds),
    },
    canonicalMediaIds,
    errors,
  };
}

export async function cleanupYodeck(locationId: string | undefined, opts: { dryRun: boolean; allowLarge?: boolean }): Promise<CleanupResult> {
  const correlationId = `cleanup-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] cleanupYodeck dryRun=${opts.dryRun} allowLarge=${opts.allowLarge || false}...`);

  const errors: string[] = [];
  const truth = await collectTruth(locationId);
  if (!truth.ok) {
    return {
      ok: false, correlationId, dryRun: opts.dryRun,
      truth: { baselineId: 0, keepPlaylistCount: 0, keepMediaCount: 0 },
      inventory: { totalMedia: 0, totalPlaylists: 0 },
      candidates: { deleteMediaIds: [], deletePlaylistIds: [], deleteMediaCount: 0, deletePlaylistCount: 0, truncated: false },
      deletedMedia: [], deletedPlaylists: [], failed: [],
      errors: truth.errors,
    };
  }

  const keepPlaylistSet = new Set(truth.keep.playlistIds);
  const keepMediaSet = new Set(truth.keep.mediaIds);

  const client = await getYodeckClient();
  if (!client) {
    return {
      ok: false, correlationId, dryRun: opts.dryRun,
      truth: { baselineId: truth.baseline.id, keepPlaylistCount: keepPlaylistSet.size, keepMediaCount: keepMediaSet.size },
      inventory: { totalMedia: 0, totalPlaylists: 0 },
      candidates: { deleteMediaIds: [], deletePlaylistIds: [], deleteMediaCount: 0, deletePlaylistCount: 0, truncated: false },
      deletedMedia: [], deletedPlaylists: [], failed: [],
      errors: ["YodeckClient not available"],
    };
  }

  const allMedia = await client.getMediaIndex();
  const allPlaylists = await client.getPlaylists();

  const allMediaIds = Array.from(allMedia.keys());
  const allPlaylistIds = allPlaylists.map(p => p.id);

  const deleteMediaIds = allMediaIds.filter(id => !keepMediaSet.has(id));
  const deletePlaylistIds = allPlaylistIds.filter(id => !keepPlaylistSet.has(id));

  console.log(`${LOG} [${correlationId}] Inventory: ${allMediaIds.length} media, ${allPlaylistIds.length} playlists`);
  console.log(`${LOG} [${correlationId}] Delete candidates: ${deleteMediaIds.length} media, ${deletePlaylistIds.length} playlists`);

  if (!opts.allowLarge && (deleteMediaIds.length > 500 || deletePlaylistIds.length > 200)) {
    return {
      ok: false, correlationId, dryRun: opts.dryRun,
      truth: { baselineId: truth.baseline.id, keepPlaylistCount: keepPlaylistSet.size, keepMediaCount: keepMediaSet.size },
      inventory: { totalMedia: allMediaIds.length, totalPlaylists: allPlaylistIds.length },
      candidates: {
        deleteMediaIds: deleteMediaIds.slice(0, 200),
        deletePlaylistIds: deletePlaylistIds.slice(0, 200),
        deleteMediaCount: deleteMediaIds.length,
        deletePlaylistCount: deletePlaylistIds.length,
        truncated: true,
      },
      deletedMedia: [], deletedPlaylists: [], failed: [],
      errors: [`Too many deletes: ${deleteMediaIds.length} media, ${deletePlaylistIds.length} playlists. Set allowLarge=true to proceed.`],
    };
  }

  const truncated = deleteMediaIds.length > 200 || deletePlaylistIds.length > 200;

  if (opts.dryRun) {
    return {
      ok: true, correlationId, dryRun: true,
      truth: { baselineId: truth.baseline.id, keepPlaylistCount: keepPlaylistSet.size, keepMediaCount: keepMediaSet.size },
      inventory: { totalMedia: allMediaIds.length, totalPlaylists: allPlaylistIds.length },
      candidates: {
        deleteMediaIds: deleteMediaIds.slice(0, 200),
        deletePlaylistIds: deletePlaylistIds.slice(0, 200),
        deleteMediaCount: deleteMediaIds.length,
        deletePlaylistCount: deletePlaylistIds.length,
        truncated,
      },
      deletedMedia: [], deletedPlaylists: [], failed: [],
      errors: [],
    };
  }

  const deletedPlaylists: Array<{ id: number; ok: boolean; error?: string }> = [];
  const deletedMedia: Array<{ id: number; ok: boolean; error?: string }> = [];
  const failed: Array<{ type: string; id: number; error: string }> = [];

  for (const plId of deletePlaylistIds) {
    if (keepPlaylistSet.has(plId)) continue;
    try {
      const result = await client.deletePlaylist(plId);
      deletedPlaylists.push({ id: plId, ok: result.ok, error: result.error });
      if (!result.ok) {
        failed.push({ type: "playlist", id: plId, error: result.error || "unknown" });
      }
      console.log(`${LOG} [${correlationId}] DELETE playlist ${plId}: ${result.ok ? "ok" : result.error}`);
      await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      deletedPlaylists.push({ id: plId, ok: false, error: err.message });
      failed.push({ type: "playlist", id: plId, error: err.message });
    }
  }

  for (const mediaId of deleteMediaIds) {
    if (keepMediaSet.has(mediaId)) continue;
    try {
      const result = await client.deleteMedia(mediaId);
      deletedMedia.push({ id: mediaId, ok: result.ok, error: result.error });
      if (!result.ok) {
        failed.push({ type: "media", id: mediaId, error: result.error || "unknown" });
      }
      console.log(`${LOG} [${correlationId}] DELETE media ${mediaId}: ${result.ok ? "ok" : result.error}`);
      await new Promise(r => setTimeout(r, 150));
    } catch (err: any) {
      deletedMedia.push({ id: mediaId, ok: false, error: err.message });
      failed.push({ type: "media", id: mediaId, error: err.message });
    }
  }

  client.clearCaches();

  console.log(`${LOG} [${correlationId}] Cleanup done: ${deletedPlaylists.filter(d => d.ok).length}/${deletePlaylistIds.length} playlists, ${deletedMedia.filter(d => d.ok).length}/${deleteMediaIds.length} media`);

  return {
    ok: failed.length === 0,
    correlationId,
    dryRun: false,
    truth: { baselineId: truth.baseline.id, keepPlaylistCount: keepPlaylistSet.size, keepMediaCount: keepMediaSet.size },
    inventory: { totalMedia: allMediaIds.length, totalPlaylists: allPlaylistIds.length },
    candidates: {
      deleteMediaIds: deleteMediaIds.slice(0, 200),
      deletePlaylistIds: deletePlaylistIds.slice(0, 200),
      deleteMediaCount: deleteMediaIds.length,
      deletePlaylistCount: deletePlaylistIds.length,
      truncated,
    },
    deletedMedia,
    deletedPlaylists,
    failed,
    errors,
  };
}

export async function syncBaselineToScreens(locationId: string | undefined, opts: { push: boolean }): Promise<SyncResult> {
  const correlationId = `bl-sync-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] syncBaselineToScreens locationId=${locationId || "ALL"} push=${opts.push}...`);

  const errors: string[] = [];

  const baseResult = await getBasePlaylistId();
  if (!baseResult.ok || !baseResult.basePlaylistId) {
    return {
      ok: false, correlationId,
      baseline: { id: 0, name: "", itemCount: 0 },
      screens: [],
      errors: [`Baseline playlist niet gevonden: ${baseResult.error || "Basis playlist does not exist"}`],
    };
  }

  const baselinePlaylistId = baseResult.basePlaylistId;
  const basePl = await getPlaylistItems(baselinePlaylistId);
  if (!basePl.ok) {
    return {
      ok: false, correlationId,
      baseline: { id: baselinePlaylistId, name: baseResult.basePlaylistName || "", itemCount: 0 },
      screens: [],
      errors: [basePl.error || "Failed to fetch baseline items"],
    };
  }

  const baselineItems = basePl.items;
  console.log(`${LOG} [${correlationId}] Baseline: id=${baselinePlaylistId} name="${basePl.name}" items=${baselineItems.length}`);

  const targetScreens = await getScreensForLocation(locationId);
  const syncScreens: SyncScreen[] = [];

  for (const screen of targetScreens) {
    const playerId = screen.yodeckPlayerId!;
    try {
      const ensureResult = await ensureScreenPlaylist(screen);
      if (!ensureResult.ok || !ensureResult.screenPlaylistId) {
        syncScreens.push({
          screenId: screen.id, playerId, playlistId: null,
          updatedItemCount: 0, pushed: false, nowPlayingOk: false, topItems: [],
          error: ensureResult.error,
        });
        errors.push(`Screen ${playerId}: ${ensureResult.error}`);
        continue;
      }

      const screenPlaylistId = ensureResult.screenPlaylistId;

      const existingPl = await getPlaylistItems(screenPlaylistId);
      let extraItems: Array<{ id: number; name?: string; type?: string; duration?: number; priority?: number }> = [];
      if (existingPl.ok) {
        const baselineIds = new Set(baselineItems.map(i => i.id));
        extraItems = existingPl.items.filter(i => !baselineIds.has(i.id));
      }

      const desiredItems = buildScreenPlaylistItems({ baselineItems, extraItems });

      const updateResult = await replacePlaylistItems(screenPlaylistId, desiredItems);
      if (!updateResult.ok) {
        syncScreens.push({
          screenId: screen.id, playerId, playlistId: screenPlaylistId,
          updatedItemCount: 0, pushed: false, nowPlayingOk: false, topItems: [],
          error: updateResult.error,
        });
        errors.push(`Screen ${playerId}: ${updateResult.error}`);
        continue;
      }

      console.log(`${LOG} [${correlationId}] Screen ${playerId}: set ${desiredItems.length} items (${baselineItems.length} baseline + ${extraItems.length} extras)`);

      let pushed = false;
      if (opts.push) {
        const assignResult = await applyPlayerSourceAndPush(playerId, screenPlaylistId);
        pushed = assignResult.pushed;
        if (!assignResult.ok) {
          errors.push(`Screen ${playerId} push: ${assignResult.error}`);
        }

        await db.update(screens).set({
          playlistId: String(screenPlaylistId),
          lastPushAt: new Date(),
          lastPushResult: assignResult.ok ? "ok" : "failed",
          lastPushError: assignResult.error || null,
          updatedAt: new Date(),
        }).where(eq(screens.id, screen.id));
      }

      let nowPlayingOk = false;
      let topItems: string[] = [];

      if (opts.push) {
        await new Promise(r => setTimeout(r, 1000));
        const np = await getScreenNowPlayingSimple(screen.id);
        nowPlayingOk = np.isCorrect;
        topItems = np.topItems || [];

        await db.update(screens).set({
          lastVerifyAt: new Date(),
          lastVerifyResult: nowPlayingOk ? "ok" : "mismatch",
          lastVerifyError: nowPlayingOk ? null : `expected=${screenPlaylistId} actual=${np.actualSourceId}`,
        }).where(eq(screens.id, screen.id));
      }

      syncScreens.push({
        screenId: screen.id,
        playerId,
        playlistId: screenPlaylistId,
        updatedItemCount: desiredItems.length,
        pushed,
        nowPlayingOk,
        topItems,
      });
    } catch (err: any) {
      syncScreens.push({
        screenId: screen.id, playerId, playlistId: null,
        updatedItemCount: 0, pushed: false, nowPlayingOk: false, topItems: [],
        error: err.message,
      });
      errors.push(`Screen ${playerId}: ${err.message}`);
    }
  }

  const allOk = errors.length === 0 && syncScreens.every(s => !opts.push || s.nowPlayingOk);
  console.log(`${LOG} [${correlationId}] Sync complete: ${syncScreens.length} screens, ${errors.length} errors, allOk=${allOk}`);

  return {
    ok: allOk,
    correlationId,
    baseline: {
      id: baselinePlaylistId,
      name: basePl.name || baseResult.basePlaylistName || "",
      itemCount: baselineItems.length,
    },
    screens: syncScreens,
    errors,
  };
}
