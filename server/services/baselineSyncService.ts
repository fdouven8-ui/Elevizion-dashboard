import { db } from "../db";
import { screens } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { storage } from "../storage";
import {
  yodeckRequest,
  getBasePlaylistId,
  ensureScreenPlaylist,
  applyPlayerSourceAndPush,
  getScreenNowPlayingSimple,
  collectAdsForScreen,
} from "./simplePlaylistModel";

const LOG = "[BaselineSync]";

interface PlaylistItem {
  id: number;
  name?: string;
  type?: string;
  duration?: number;
  priority?: number;
}

interface ScreenSyncProof {
  screenId: string;
  yodeckPlayerId: string;
  screenPlaylistId: number | null;
  itemsSet: number;
  pushed: boolean;
  verified: boolean;
  isCorrect: boolean;
  expectedPlaylistId: number | null;
  actualSourceId: number | null;
  topItems?: string[];
  error?: string;
}

export function buildScreenPlaylistItems(opts: {
  baselineItems: PlaylistItem[];
  extraItems: PlaylistItem[];
}): Array<{ id: number; priority: number; duration: number; type: string }> {
  const seen = new Set<number>();
  const result: Array<{ id: number; priority: number; duration: number; type: string }> = [];
  let priority = 1;

  for (const item of opts.baselineItems) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({
      id: item.id,
      priority: priority++,
      duration: item.duration || 10,
      type: item.type || "media",
    });
  }

  for (const item of opts.extraItems) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    result.push({
      id: item.id,
      priority: priority++,
      duration: item.duration || 10,
      type: item.type || "media",
    });
  }

  return result;
}

export async function getPlaylistItems(playlistId: number): Promise<{ ok: boolean; items: PlaylistItem[]; name?: string; error?: string }> {
  const result = await yodeckRequest<{ id: number; name: string; items: PlaylistItem[] }>(
    `/playlists/${playlistId}/`
  );
  if (!result.ok || !result.data) {
    return { ok: false, items: [], error: result.error || `Failed to fetch playlist ${playlistId}` };
  }
  return { ok: true, items: result.data.items || [], name: result.data.name };
}

export async function replacePlaylistItems(
  playlistId: number,
  items: Array<{ id: number; priority: number; duration: number; type: string }>
): Promise<{ ok: boolean; error?: string }> {
  const result = await yodeckRequest(`/playlists/${playlistId}/`, "PATCH", { items });
  if (!result.ok) {
    return { ok: false, error: result.error || `Failed to update playlist ${playlistId}` };
  }
  return { ok: true };
}

export async function pushToScreen(playerId: string): Promise<{ ok: boolean; httpStatus?: number; error?: string }> {
  const token = process.env.YODECK_AUTH_TOKEN?.trim() || "";
  if (!token) return { ok: false, error: "YODECK_AUTH_TOKEN not configured" };

  try {
    const resp = await fetch(`https://app.yodeck.com/api/v2/screens/${playerId}/push/`, {
      method: "POST",
      headers: { "Authorization": `Token ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ use_download_timeslots: true }),
    });
    return { ok: resp.ok, httpStatus: resp.status };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

async function verifyScreenNowPlaying(screenId: string): Promise<{
  isCorrect: boolean;
  expectedPlaylistId: string | null;
  actualSourceId: number | null;
  actualSourceType: string | null;
  itemCount: number;
  topItems?: string[];
}> {
  const np = await getScreenNowPlayingSimple(screenId);
  return {
    isCorrect: np.isCorrect,
    expectedPlaylistId: np.expectedPlaylistId,
    actualSourceId: np.actualSourceId,
    actualSourceType: np.actualSourceType,
    itemCount: np.itemCount,
    topItems: np.topItems,
  };
}

async function getScreensForLocation(locationId?: string) {
  let allScreens = await db.select().from(screens).where(isNotNull(screens.yodeckPlayerId));
  if (locationId) {
    allScreens = allScreens.filter(s => s.locationId === locationId);
  }
  return allScreens;
}

export async function playlistTruth(locationId?: string): Promise<{
  ok: boolean;
  correlationId: string;
  baselinePlaylistId: number | null;
  baselinePlaylistName: string | null;
  baselineItemCount: number;
  screens: Array<{
    screenId: string;
    yodeckPlayerId: string;
    dbPlaylistId: string | null;
    livePlaylistId: number | null;
    livePlaylistName: string | null;
    playlistMatch: boolean;
    liveItemCount: number;
    topItems?: string[];
  }>;
  mismatches: string[];
  duplicatesDetected: string[];
}> {
  const correlationId = `truth-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] Playlist truth check${locationId ? ` for location ${locationId}` : ""}...`);

  const baseResult = await getBasePlaylistId();
  const baselinePlaylistId = baseResult.basePlaylistId;
  let baselineItemCount = 0;
  let baselinePlaylistName: string | null = null;
  const baselineMediaIds = new Set<number>();

  if (baselinePlaylistId) {
    const basePl = await getPlaylistItems(baselinePlaylistId);
    baselineItemCount = basePl.items.length;
    baselinePlaylistName = basePl.name || null;
    basePl.items.forEach(i => baselineMediaIds.add(i.id));
  }

  const targetScreens = await getScreensForLocation(locationId);
  const screenResults: Array<{
    screenId: string; yodeckPlayerId: string; dbPlaylistId: string | null;
    livePlaylistId: number | null; livePlaylistName: string | null;
    playlistMatch: boolean; liveItemCount: number; topItems?: string[];
  }> = [];
  const mismatches: string[] = [];
  const duplicatesDetected: string[] = [];

  for (const screen of targetScreens) {
    const playerId = screen.yodeckPlayerId!;
    const dbPlaylistId = screen.playlistId;
    let livePlaylistId: number | null = null;
    let livePlaylistName: string | null = null;
    let liveItemCount = 0;
    let topItems: string[] | undefined;

    const playerResult = await yodeckRequest<{
      screen_content?: { source_type: string | null; source_id: number | null; source_name: string | null };
    }>(`/screens/${playerId}/`);

    if (playerResult.ok && playerResult.data?.screen_content?.source_type === "playlist") {
      livePlaylistId = playerResult.data.screen_content.source_id;
      livePlaylistName = playerResult.data.screen_content.source_name || null;

      if (livePlaylistId) {
        const plItems = await getPlaylistItems(livePlaylistId);
        liveItemCount = plItems.items.length;
        topItems = plItems.items.slice(0, 5).map(i => i.name || `Media ${i.id}`);

        const liveIds = new Set(plItems.items.map(i => i.id));
        Array.from(baselineMediaIds).forEach(baseId => {
          if (!liveIds.has(baseId)) {
            mismatches.push(`Screen ${playerId}: missing baseline media ${baseId}`);
          }
        });

        const idCounts = new Map<number, number>();
        for (const item of plItems.items) {
          idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);
        }
        Array.from(idCounts.entries()).forEach(([id, count]) => {
          if (count > 1) {
            duplicatesDetected.push(`Screen ${playerId}: media ${id} appears ${count}x`);
          }
        });
      }
    }

    const playlistMatch = dbPlaylistId != null && livePlaylistId != null && String(livePlaylistId) === dbPlaylistId;
    if (!playlistMatch) {
      mismatches.push(`Screen ${playerId}: DB playlistId=${dbPlaylistId} vs live=${livePlaylistId}`);
    }

    screenResults.push({
      screenId: screen.id, yodeckPlayerId: playerId, dbPlaylistId,
      livePlaylistId, livePlaylistName, playlistMatch, liveItemCount, topItems,
    });
  }

  return {
    ok: mismatches.length === 0 && duplicatesDetected.length === 0,
    correlationId,
    baselinePlaylistId,
    baselinePlaylistName,
    baselineItemCount,
    screens: screenResults,
    mismatches,
    duplicatesDetected,
  };
}

export async function syncPlaylists(locationId?: string, push: boolean = false): Promise<{
  ok: boolean;
  correlationId: string;
  baselinePlaylistId: number | null;
  baselineItemCount: number;
  screens: ScreenSyncProof[];
  errors: string[];
}> {
  const correlationId = `sync-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] Sync playlists${locationId ? ` for location ${locationId}` : ""} push=${push}...`);

  const baseResult = await getBasePlaylistId();
  if (!baseResult.ok || !baseResult.basePlaylistId) {
    return {
      ok: false, correlationId, baselinePlaylistId: null, baselineItemCount: 0,
      screens: [], errors: [`Baseline playlist niet gevonden. Maak eerst een playlist "${baseResult.error || "Basis playlist"}" in Yodeck.`],
    };
  }

  const baselinePlaylistId = baseResult.basePlaylistId;
  const basePl = await getPlaylistItems(baselinePlaylistId);
  if (!basePl.ok) {
    return { ok: false, correlationId, baselinePlaylistId, baselineItemCount: 0, screens: [], errors: [basePl.error || "Failed to fetch baseline"] };
  }

  const baselineItems = basePl.items;
  console.log(`${LOG} [${correlationId}] Baseline: ${baselineItems.length} items [${baselineItems.map(i => `${i.id}(${i.name || i.type})`).join(", ")}]`);

  const targetScreens = await getScreensForLocation(locationId);
  const proofs: ScreenSyncProof[] = [];
  const errors: string[] = [];

  for (const screen of targetScreens) {
    const playerId = screen.yodeckPlayerId!;
    try {
      const ensureResult = await ensureScreenPlaylist(screen);
      if (!ensureResult.ok || !ensureResult.screenPlaylistId) {
        proofs.push({
          screenId: screen.id, yodeckPlayerId: playerId, screenPlaylistId: null,
          itemsSet: 0, pushed: false, verified: false, isCorrect: false,
          expectedPlaylistId: null, actualSourceId: null, error: ensureResult.error,
        });
        errors.push(`Screen ${playerId}: ${ensureResult.error}`);
        continue;
      }

      const screenPlaylistId = ensureResult.screenPlaylistId;

      const beforePl = await getPlaylistItems(screenPlaylistId);
      const beforeKeys = beforePl.ok ? beforePl.items.map(i => `${i.type || "media"}:${i.id}`) : [];
      console.log(`${LOG} [${correlationId}] Screen ${playerId} playlist=${screenPlaylistId} BEFORE: ${beforeKeys.length} items [${beforeKeys.join(", ")}]`);

      const adsResult = await collectAdsForScreen(screen);
      console.log(`${LOG} [${correlationId}] Screen ${playerId} ads: ${adsResult.adMediaIds.length} selected (candidates=${adsResult.stats.candidates}, targeting=${adsResult.stats.targetingMatches})`);

      const adItems: PlaylistItem[] = adsResult.adMediaIds.map(id => ({
        id,
        type: "media",
        duration: 15,
      }));

      const desiredItems = buildScreenPlaylistItems({ baselineItems, extraItems: adItems });

      const desiredKeys = desiredItems.map(i => `${i.type}:${i.id}`);
      console.log(`${LOG} [${correlationId}] Screen ${playerId} DESIRED: ${desiredKeys.length} items [${desiredKeys.join(", ")}] (${baselineItems.length} baseline + ${adsResult.adMediaIds.length} ads)`);

      const updateResult = await replacePlaylistItems(screenPlaylistId, desiredItems);
      if (!updateResult.ok) {
        proofs.push({
          screenId: screen.id, yodeckPlayerId: playerId, screenPlaylistId,
          itemsSet: 0, pushed: false, verified: false, isCorrect: false,
          expectedPlaylistId: screenPlaylistId, actualSourceId: null, error: updateResult.error,
        });
        errors.push(`Screen ${playerId}: ${updateResult.error}`);
        continue;
      }

      const afterPl = await getPlaylistItems(screenPlaylistId);
      const afterKeys = afterPl.ok ? afterPl.items.map(i => `${i.type || "media"}:${i.id}`) : [];
      console.log(`${LOG} [${correlationId}] Screen ${playerId} AFTER: ${afterKeys.length} items [${afterKeys.join(", ")}]`);

      const desiredKeySet = new Set(desiredKeys);
      const afterKeySet = new Set(afterKeys);
      const missingFromPlaylist = desiredKeys.filter(k => !afterKeySet.has(k));
      const unexpectedInPlaylist = afterKeys.filter(k => !desiredKeySet.has(k));

      if (missingFromPlaylist.length > 0 || unexpectedInPlaylist.length > 0) {
        const mismatchMsg = `VERIFICATION MISMATCH: missing=[${missingFromPlaylist.join(",")}] unexpected=[${unexpectedInPlaylist.join(",")}]`;
        console.error(`${LOG} [${correlationId}] Screen ${playerId} ${mismatchMsg}`);
        errors.push(`Screen ${playerId}: ${mismatchMsg}`);
        proofs.push({
          screenId: screen.id, yodeckPlayerId: playerId, screenPlaylistId,
          itemsSet: desiredItems.length, pushed: false, verified: true, isCorrect: false,
          expectedPlaylistId: screenPlaylistId, actualSourceId: null,
          error: mismatchMsg,
        });
        continue;
      }

      console.log(`${LOG} [${correlationId}] Screen ${playerId} VERIFIED OK: ${afterKeys.length} items match desired`);

      let pushed = false;
      if (push) {
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

      let isCorrect = false;
      let actualSourceId: number | null = null;
      let topItems: string[] | undefined;

      if (push) {
        await new Promise(r => setTimeout(r, 1000));
        const verify = await verifyScreenNowPlaying(screen.id);
        isCorrect = verify.isCorrect;
        actualSourceId = verify.actualSourceId;
        topItems = verify.topItems;

        await db.update(screens).set({
          lastVerifyAt: new Date(),
          lastVerifyResult: isCorrect ? "ok" : "mismatch",
          lastVerifyError: isCorrect ? null : `expected=${screenPlaylistId} actual=${actualSourceId}`,
        }).where(eq(screens.id, screen.id));
      }

      proofs.push({
        screenId: screen.id, yodeckPlayerId: playerId, screenPlaylistId,
        itemsSet: desiredItems.length, pushed, verified: push, isCorrect,
        expectedPlaylistId: screenPlaylistId, actualSourceId, topItems,
      });
    } catch (err: any) {
      proofs.push({
        screenId: screen.id, yodeckPlayerId: playerId, screenPlaylistId: null,
        itemsSet: 0, pushed: false, verified: false, isCorrect: false,
        expectedPlaylistId: null, actualSourceId: null, error: err.message,
      });
      errors.push(`Screen ${playerId}: ${err.message}`);
    }
  }

  const allOk = errors.length === 0 && proofs.every(p => !push || p.isCorrect);
  console.log(`${LOG} [${correlationId}] Sync complete: ${proofs.length} screens, ${errors.length} errors, allOk=${allOk}`);

  return { ok: allOk, correlationId, baselinePlaylistId, baselineItemCount: baselineItems.length, screens: proofs, errors };
}

export async function addBaselineItemAndSync(opts: {
  baselinePlaylistId?: number;
  mediaId: number;
  duration: number;
  position?: number;
  locationId?: string;
}): Promise<{
  ok: boolean;
  correlationId: string;
  baselinePlaylistId: number | null;
  itemAdded: boolean;
  newItemCount: number;
  syncResult: {
    screens: ScreenSyncProof[];
    errors: string[];
  };
}> {
  const correlationId = `bl-sync-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] Adding media ${opts.mediaId} to baseline and syncing...`);

  let baselinePlaylistId = opts.baselinePlaylistId || null;
  if (!baselinePlaylistId) {
    const baseResult = await getBasePlaylistId();
    if (!baseResult.ok || !baseResult.basePlaylistId) {
      return { ok: false, correlationId, baselinePlaylistId: null, itemAdded: false, newItemCount: 0, syncResult: { screens: [], errors: ["Baseline playlist niet gevonden"] } };
    }
    baselinePlaylistId = baseResult.basePlaylistId;
  }

  const plDetail = await getPlaylistItems(baselinePlaylistId);
  if (!plDetail.ok) {
    return { ok: false, correlationId, baselinePlaylistId, itemAdded: false, newItemCount: 0, syncResult: { screens: [], errors: [plDetail.error || "Failed to fetch baseline"] } };
  }

  const existingItems = plDetail.items;
  const alreadyPresent = existingItems.some(i => i.id === opts.mediaId);
  let itemAdded = false;

  if (!alreadyPresent) {
    const newItems = [...existingItems.map((item, idx) => ({
      id: item.id,
      priority: idx + 1,
      duration: item.duration || 10,
      type: (item.type || "media") as string,
    }))];

    const insertAt = opts.position != null ? Math.min(opts.position, newItems.length) : newItems.length;
    newItems.splice(insertAt, 0, {
      id: opts.mediaId,
      priority: insertAt + 1,
      duration: opts.duration,
      type: "media",
    });

    for (let i = 0; i < newItems.length; i++) {
      newItems[i].priority = i + 1;
    }

    const patchResult = await replacePlaylistItems(baselinePlaylistId, newItems);
    if (!patchResult.ok) {
      return { ok: false, correlationId, baselinePlaylistId, itemAdded: false, newItemCount: existingItems.length, syncResult: { screens: [], errors: [`Failed to add item: ${patchResult.error}`] } };
    }
    itemAdded = true;
    console.log(`${LOG} [${correlationId}] Added media ${opts.mediaId} to baseline at position ${insertAt}`);
  } else {
    console.log(`${LOG} [${correlationId}] Media ${opts.mediaId} already in baseline`);
  }

  const newItemCount = alreadyPresent ? existingItems.length : existingItems.length + 1;

  const syncResult = await syncPlaylists(opts.locationId, true);

  return {
    ok: syncResult.ok,
    correlationId,
    baselinePlaylistId,
    itemAdded,
    newItemCount,
    syncResult: { screens: syncResult.screens, errors: syncResult.errors },
  };
}

export async function migrateLivePlaylistMappings(): Promise<{
  ok: boolean;
  correlationId: string;
  migrations: Array<{
    screenId: string;
    yodeckPlayerId: string;
    oldPlaylistId: string | null;
    newPlaylistId: string | null;
    action: string;
  }>;
  errors: string[];
}> {
  const correlationId = `migrate-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] Migrating DB playlistId from live Yodeck...`);

  const allScreens = await db.select().from(screens).where(isNotNull(screens.yodeckPlayerId));
  const migrations: Array<{
    screenId: string; yodeckPlayerId: string; oldPlaylistId: string | null;
    newPlaylistId: string | null; action: string;
  }> = [];
  const errors: string[] = [];

  for (const screen of allScreens) {
    const playerId = screen.yodeckPlayerId!;
    const oldPlaylistId = screen.playlistId;

    try {
      const np = await getScreenNowPlayingSimple(screen.id);
      let livePlaylistId: string | null = null;

      if (np.actualSourceType === "playlist" && np.actualSourceId) {
        livePlaylistId = String(np.actualSourceId);
      }

      if (!livePlaylistId) {
        migrations.push({ screenId: screen.id, yodeckPlayerId: playerId, oldPlaylistId, newPlaylistId: oldPlaylistId, action: "NO_LIVE_PLAYLIST" });
        continue;
      }

      const changed = oldPlaylistId !== livePlaylistId;
      if (changed) {
        await db.update(screens).set({
          playlistId: livePlaylistId,
          updatedAt: new Date(),
        }).where(eq(screens.id, screen.id));
      }

      migrations.push({
        screenId: screen.id, yodeckPlayerId: playerId,
        oldPlaylistId, newPlaylistId: livePlaylistId,
        action: changed ? "UPDATED" : "UNCHANGED",
      });
      console.log(`${LOG} [${correlationId}] Screen ${playerId}: ${changed ? `${oldPlaylistId} -> ${livePlaylistId}` : "no change"}`);
    } catch (err: any) {
      errors.push(`Screen ${playerId}: ${err.message}`);
      migrations.push({ screenId: screen.id, yodeckPlayerId: playerId, oldPlaylistId, newPlaylistId: oldPlaylistId, action: "ERROR" });
    }
  }

  console.log(`${LOG} [${correlationId}] Migration complete: ${migrations.length} screens, ${errors.length} errors`);
  return { ok: errors.length === 0, correlationId, migrations, errors };
}
