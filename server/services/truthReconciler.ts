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
import {
  buildScreenPlaylistItems,
  getPlaylistItems,
  replacePlaylistItems,
} from "./baselineSyncService";

const LOG = "[TruthReconciler]";

interface PlaylistItem {
  id: number;
  name?: string;
  type?: string;
  duration?: number;
  priority?: number;
}

export interface ReconcileScreenReport {
  screenId: string;
  yodeckPlayerId: string;
  playlistId: number | null;
  desiredCount: number;
  desiredKeys: string[];
  beforeKeys?: string[];
  afterKeys?: string[];
  pushed: boolean;
  pushProof?: { ok: boolean; actualSourceId: number | null; actualSourceType: string | null };
  verified: boolean;
  isCorrect: boolean;
  sharedPlaylistFixed: boolean;
  errors: string[];
}

export interface ReconcileResult {
  ok: boolean;
  correlationId: string;
  reason: string;
  locationId: string | null;
  baselineId: number | null;
  baselineMediaIds: number[];
  screens: ReconcileScreenReport[];
  errors: string[];
  durationMs: number;
}

export async function reconcileLocationTruth(opts: {
  locationId?: string | null;
  push?: boolean;
  reason: string;
  correlationId?: string;
}): Promise<ReconcileResult> {
  const startTime = Date.now();
  const correlationId = opts.correlationId || `reconcile-${Date.now().toString(16)}`;
  const push = opts.push ?? true;
  const locationId = opts.locationId || null;

  console.log(`${LOG} [${correlationId}] START reason="${opts.reason}" locationId=${locationId || "ALL"} push=${push}`);

  const errors: string[] = [];
  const screenReports: ReconcileScreenReport[] = [];

  const baseResult = await getBasePlaylistId();
  if (!baseResult.ok || !baseResult.basePlaylistId) {
    const msg = `Baseline playlist niet gevonden: ${baseResult.error || "Maak 'Basis playlist' in Yodeck"}`;
    console.error(`${LOG} [${correlationId}] ${msg}`);
    return {
      ok: false, correlationId, reason: opts.reason, locationId,
      baselineId: null, baselineMediaIds: [], screens: [], errors: [msg],
      durationMs: Date.now() - startTime,
    };
  }

  const baselineId = baseResult.basePlaylistId;
  const basePl = await getPlaylistItems(baselineId);
  if (!basePl.ok) {
    const msg = basePl.error || "Failed to fetch baseline items";
    return {
      ok: false, correlationId, reason: opts.reason, locationId,
      baselineId, baselineMediaIds: [], screens: [], errors: [msg],
      durationMs: Date.now() - startTime,
    };
  }

  const baselineItems = basePl.items;
  const baselineMediaIds = baselineItems.map(i => i.id);
  console.log(`${LOG} [${correlationId}] Baseline ${baselineId}: ${baselineItems.length} items [${baselineMediaIds.join(",")}]`);

  let targetScreens = await db.select().from(screens).where(isNotNull(screens.yodeckPlayerId));
  if (locationId) {
    targetScreens = targetScreens.filter(s => s.locationId === locationId);
  }

  if (targetScreens.length === 0) {
    console.log(`${LOG} [${correlationId}] No screens with yodeckPlayerId${locationId ? ` for location ${locationId}` : ""}`);
    return {
      ok: true, correlationId, reason: opts.reason, locationId,
      baselineId, baselineMediaIds, screens: [], errors: [],
      durationMs: Date.now() - startTime,
    };
  }

  // Shared playlist guard: detect duplicate playlistId mappings across screens
  const playlistIdMap = new Map<string, string[]>();
  for (const s of targetScreens) {
    if (s.playlistId) {
      const existing = playlistIdMap.get(s.playlistId) || [];
      existing.push(s.id);
      playlistIdMap.set(s.playlistId, existing);
    }
  }

  const sharedPlaylistScreens = new Set<string>();
  for (const [plId, screenIds] of Array.from(playlistIdMap.entries())) {
    if (screenIds.length > 1) {
      console.warn(`${LOG} [${correlationId}] SHARED_PLAYLIST_GUARD: playlistId=${plId} shared by screens [${screenIds.join(",")}]`);
      // Keep the first screen, clear the rest so they get new playlists
      for (let i = 1; i < screenIds.length; i++) {
        sharedPlaylistScreens.add(screenIds[i]);
        await db.update(screens).set({ playlistId: null, updatedAt: new Date() }).where(eq(screens.id, screenIds[i]));
        console.warn(`${LOG} [${correlationId}] SHARED_PLAYLIST_FIXED: cleared playlistId for screen ${screenIds[i]} (was ${plId})`);
      }
    }
  }

  for (const screen of targetScreens) {
    const playerId = screen.yodeckPlayerId!;
    const report: ReconcileScreenReport = {
      screenId: screen.id, yodeckPlayerId: playerId,
      playlistId: null, desiredCount: 0, desiredKeys: [],
      pushed: false, verified: false, isCorrect: false,
      sharedPlaylistFixed: sharedPlaylistScreens.has(screen.id),
      errors: [],
    };

    try {
      // Step 1: Ensure unique screen playlist
      const ensureResult = await ensureScreenPlaylist(screen);
      if (!ensureResult.ok || !ensureResult.screenPlaylistId) {
        report.errors.push(ensureResult.error || "Failed to ensure screen playlist");
        errors.push(`Screen ${playerId}: ${ensureResult.error}`);
        screenReports.push(report);
        continue;
      }

      const screenPlaylistId = ensureResult.screenPlaylistId;
      report.playlistId = screenPlaylistId;

      // Step 2: Fetch current state for logging
      const beforePl = await getPlaylistItems(screenPlaylistId);
      const beforeKeys = beforePl.ok ? beforePl.items.map(i => `${i.type || "media"}:${i.id}`) : [];
      report.beforeKeys = beforeKeys;
      console.log(`${LOG} [${correlationId}] Screen ${playerId} BEFORE: [${beforeKeys.join(",")}]`);

      // Step 3: Compute desired items = baseline + DB-selected ads
      const adsResult = await collectAdsForScreen(screen);
      const adItems: PlaylistItem[] = adsResult.adMediaIds.map(id => ({ id, type: "media", duration: 15 }));
      const desiredItems = buildScreenPlaylistItems({ baselineItems, extraItems: adItems });
      const desiredKeys = desiredItems.map(i => `${i.type}:${i.id}`);
      report.desiredCount = desiredItems.length;
      report.desiredKeys = desiredKeys;
      console.log(`${LOG} [${correlationId}] Screen ${playerId} DESIRED: [${desiredKeys.join(",")}] (${baselineItems.length} baseline + ${adsResult.adMediaIds.length} ads)`);

      // Step 4: REPLACE playlist items
      const updateResult = await replacePlaylistItems(screenPlaylistId, desiredItems);
      if (!updateResult.ok) {
        report.errors.push(updateResult.error || "REPLACE failed");
        errors.push(`Screen ${playerId}: REPLACE failed: ${updateResult.error}`);
        screenReports.push(report);
        continue;
      }

      // Step 5: Verify after REPLACE
      const afterPl = await getPlaylistItems(screenPlaylistId);
      const afterKeys = afterPl.ok ? afterPl.items.map(i => `${i.type || "media"}:${i.id}`) : [];
      report.afterKeys = afterKeys;
      console.log(`${LOG} [${correlationId}] Screen ${playerId} AFTER: [${afterKeys.join(",")}]`);

      const desiredKeySet = new Set(desiredKeys);
      const afterKeySet = new Set(afterKeys);
      const missing = desiredKeys.filter(k => !afterKeySet.has(k));
      const unexpected = afterKeys.filter(k => !desiredKeySet.has(k));

      if (missing.length > 0 || unexpected.length > 0) {
        const msg = `VERIFY_MISMATCH: missing=[${missing.join(",")}] unexpected=[${unexpected.join(",")}]`;
        console.error(`${LOG} [${correlationId}] Screen ${playerId} ${msg}`);
        report.errors.push(msg);
        errors.push(`Screen ${playerId}: ${msg}`);
        report.verified = true;
        report.isCorrect = false;
        screenReports.push(report);
        continue;
      }

      report.verified = true;
      console.log(`${LOG} [${correlationId}] Screen ${playerId} VERIFIED OK`);

      // Step 6: Push if requested
      if (push) {
        const assignResult = await applyPlayerSourceAndPush(playerId, screenPlaylistId);
        report.pushed = assignResult.pushed;
        report.pushProof = {
          ok: assignResult.ok,
          actualSourceId: assignResult.actualSourceId,
          actualSourceType: assignResult.actualSourceType,
        };

        if (!assignResult.ok) {
          report.errors.push(assignResult.error || "Push failed");
          errors.push(`Screen ${playerId}: push failed: ${assignResult.error}`);
        }

        await db.update(screens).set({
          playlistId: String(screenPlaylistId),
          lastPushAt: new Date(),
          lastPushResult: assignResult.ok ? "ok" : "failed",
          lastPushError: assignResult.error || null,
          updatedAt: new Date(),
        }).where(eq(screens.id, screen.id));

        // Brief wait then verify now-playing
        await new Promise(r => setTimeout(r, 1000));
        const np = await getScreenNowPlayingSimple(screen.id);
        report.isCorrect = np.isCorrect;

        await db.update(screens).set({
          lastVerifyAt: new Date(),
          lastVerifyResult: np.isCorrect ? "ok" : "mismatch",
          lastVerifyError: np.isCorrect ? null : `expected=${screenPlaylistId} actual=${np.actualSourceId}`,
        }).where(eq(screens.id, screen.id));
      } else {
        // No push: just update DB mapping
        await db.update(screens).set({
          playlistId: String(screenPlaylistId),
          updatedAt: new Date(),
        }).where(eq(screens.id, screen.id));
        report.isCorrect = true;
      }
    } catch (err: any) {
      report.errors.push(err.message);
      errors.push(`Screen ${playerId}: ${err.message}`);
    }

    screenReports.push(report);
  }

  const allOk = errors.length === 0 && screenReports.every(r => r.errors.length === 0);
  const durationMs = Date.now() - startTime;
  console.log(`${LOG} [${correlationId}] DONE reason="${opts.reason}" ${screenReports.length} screens, ${errors.length} errors, ok=${allOk} (${durationMs}ms)`);

  return {
    ok: allOk, correlationId, reason: opts.reason, locationId,
    baselineId, baselineMediaIds, screens: screenReports, errors, durationMs,
  };
}

export async function reconcileAfterMutation(opts: {
  locationId?: string | null;
  reason: string;
  push?: boolean;
}): Promise<void> {
  const token = process.env.YODECK_AUTH_TOKEN?.trim();
  if (!token) {
    console.log(`${LOG} [reconcileAfterMutation] Skipped: no YODECK_AUTH_TOKEN`);
    return;
  }

  try {
    const result = await reconcileLocationTruth({
      locationId: opts.locationId,
      push: opts.push ?? true,
      reason: opts.reason,
    });
    if (!result.ok) {
      console.warn(`${LOG} [reconcileAfterMutation] Reconcile finished with errors: ${result.errors.join("; ")}`);
    }
  } catch (err: any) {
    console.error(`${LOG} [reconcileAfterMutation] Error: ${err.message}`);
  }
}

export async function verifyLocationTruth(locationId?: string): Promise<{
  ok: boolean;
  correlationId: string;
  baselineId: number | null;
  baselineMediaIds: number[];
  screens: Array<{
    screenId: string;
    yodeckPlayerId: string;
    dbPlaylistId: string | null;
    livePlaylistId: number | null;
    livePlaylistName: string | null;
    playlistMatch: boolean;
    desiredMediaIds: number[];
    liveMediaIds: number[];
    itemsMatch: boolean;
    missingItems: string[];
    unexpectedItems: string[];
    lastPushAt: Date | null;
    lastPushResult: string | null;
    lastVerifyResult: string | null;
  }>;
  mismatches: string[];
}> {
  const correlationId = `verify-${Date.now().toString(16)}`;
  console.log(`${LOG} [${correlationId}] Verify truth${locationId ? ` for location ${locationId}` : ""}...`);

  const mismatches: string[] = [];

  const baseResult = await getBasePlaylistId();
  const baselineId = baseResult.basePlaylistId || null;
  let baselineItems: PlaylistItem[] = [];
  let baselineMediaIds: number[] = [];

  if (baselineId) {
    const basePl = await getPlaylistItems(baselineId);
    if (basePl.ok) {
      baselineItems = basePl.items;
      baselineMediaIds = baselineItems.map(i => i.id);
    }
  }

  let targetScreens = await db.select().from(screens).where(isNotNull(screens.yodeckPlayerId));
  if (locationId) {
    targetScreens = targetScreens.filter(s => s.locationId === locationId);
  }

  const screenResults: Array<{
    screenId: string; yodeckPlayerId: string; dbPlaylistId: string | null;
    livePlaylistId: number | null; livePlaylistName: string | null;
    playlistMatch: boolean; desiredMediaIds: number[]; liveMediaIds: number[];
    itemsMatch: boolean; missingItems: string[]; unexpectedItems: string[];
    lastPushAt: Date | null; lastPushResult: string | null; lastVerifyResult: string | null;
  }> = [];

  for (const screen of targetScreens) {
    const playerId = screen.yodeckPlayerId!;
    const dbPlaylistId = screen.playlistId;

    // Compute desired items (read-only, no mutation)
    const adsResult = await collectAdsForScreen(screen);
    const adItems: PlaylistItem[] = adsResult.adMediaIds.map(id => ({ id, type: "media", duration: 15 }));
    const desiredItems = buildScreenPlaylistItems({ baselineItems, extraItems: adItems });
    const desiredMediaIds = desiredItems.map(i => i.id);
    const desiredKeySet = new Set(desiredItems.map(i => `${i.type}:${i.id}`));

    // Fetch live state from Yodeck
    let livePlaylistId: number | null = null;
    let livePlaylistName: string | null = null;
    let liveMediaIds: number[] = [];
    let liveKeys: string[] = [];

    const playerResult = await yodeckRequest<{
      screen_content?: { source_type: string | null; source_id: number | null; source_name: string | null };
    }>(`/screens/${playerId}/`);

    if (playerResult.ok && playerResult.data?.screen_content?.source_type === "playlist") {
      livePlaylistId = playerResult.data.screen_content.source_id;
      livePlaylistName = playerResult.data.screen_content.source_name || null;

      if (livePlaylistId) {
        const plItems = await getPlaylistItems(livePlaylistId);
        if (plItems.ok) {
          liveMediaIds = plItems.items.map(i => i.id);
          liveKeys = plItems.items.map(i => `${i.type || "media"}:${i.id}`);
        }
      }
    }

    const playlistMatch = dbPlaylistId != null && livePlaylistId != null && String(livePlaylistId) === dbPlaylistId;
    if (!playlistMatch) {
      mismatches.push(`Screen ${playerId}: DB playlistId=${dbPlaylistId} vs live=${livePlaylistId}`);
    }

    const liveKeySet = new Set(liveKeys);
    const missingItems = Array.from(desiredKeySet).filter(k => !liveKeySet.has(k));
    const unexpectedItems = liveKeys.filter(k => !desiredKeySet.has(k));
    const itemsMatch = missingItems.length === 0 && unexpectedItems.length === 0;

    if (!itemsMatch) {
      mismatches.push(`Screen ${playerId}: items mismatch - missing=[${missingItems.join(",")}] unexpected=[${unexpectedItems.join(",")}]`);
    }

    screenResults.push({
      screenId: screen.id, yodeckPlayerId: playerId, dbPlaylistId,
      livePlaylistId, livePlaylistName, playlistMatch,
      desiredMediaIds, liveMediaIds, itemsMatch, missingItems, unexpectedItems,
      lastPushAt: screen.lastPushAt, lastPushResult: screen.lastPushResult,
      lastVerifyResult: screen.lastVerifyResult,
    });
  }

  return {
    ok: mismatches.length === 0,
    correlationId, baselineId, baselineMediaIds, screens: screenResults, mismatches,
  };
}
