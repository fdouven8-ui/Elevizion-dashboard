/**
 * PublishNowService - Deterministic E2E publish flow for ads to Yodeck screens
 * 
 * Guarantees:
 * - If asset is READY_FOR_YODECK and Yodeck media is ready, ad appears in playlist
 * - Full trace logging with correlationId
 * - Never fails silently
 * - Respects playlist-only mode (no layouts)
 */

import { db } from "../db";
import { adAssets, screens, locations, placements, contracts } from "@shared/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import crypto from "crypto";
import { yodeckRequest } from "./yodeckLayoutService";
import { YodeckReadinessStatus } from "./yodeckMediaPipeline";

// ============================================================================
// TYPES
// ============================================================================

export interface PublishNowRequest {
  targetYodeckPlayerIds?: string[];
}

export interface PublishNowTrace {
  correlationId: string;
  timestamp: string;
  advertiserId: string;
  steps: PublishStep[];
  outcome: "SUCCESS" | "PARTIAL" | "FAILED" | "NO_TARGETS";
  summary: {
    targetsResolved: number;
    publishAttempts: number;
    successCount: number;
    failedCount: number;
    adsInPlaylists: number;
  };
  logs: string[];
}

export interface PublishStep {
  step: string;
  status: "success" | "failed" | "skipped";
  duration_ms: number;
  details: Record<string, any>;
  error?: string;
}

export interface EffectivePlaylistResult {
  ok: boolean;
  playlistId: number | null;
  playlistName: string | null;
  sourceUsed: "screen_content" | null;
  yodeckPlayerId: string;
  error?: {
    code: "SCREEN_NOT_FOUND" | "SCREEN_NOT_IN_PLAYLIST_MODE" | "YODECK_API_ERROR";
    message: string;
    instructions?: string;
  };
}

export interface PlayableAssetResult {
  ok: boolean;
  assetId: string | null;
  storageUrl: string | null;
  yodeckMediaId: number | null;
  status: YodeckReadinessStatus;
  error?: {
    code: "MEDIA_NOT_READY" | "NO_ASSET_FOUND";
    assetStatus: YodeckReadinessStatus;
    nextAction: "wait" | "normalize" | "retry" | "upload";
    message: string;
  };
}

export interface YodeckMediaCheckResult {
  ok: boolean;
  yodeckMediaId: number;
  status: string | null;
  fileSize: number | null;
  error?: {
    code: "YODECK_MEDIA_NOT_READY" | "YODECK_MEDIA_NOT_FOUND";
    status: string | null;
    fileSize: number | null;
    recommendation: string;
  };
}

export interface PlaylistUpdateResult {
  ok: boolean;
  playlistId: number;
  beforeCount: number;
  afterCount: number;
  removedDuplicates: number;
  inserted: boolean;
  error?: string;
}

// ============================================================================
// LOGGING HELPER
// ============================================================================

function log(correlationId: string, step: string, message: string, logs: string[]): void {
  const entry = `[PublishNow][${correlationId}] STEP=${step} ${message}`;
  console.log(entry);
  logs.push(entry);
}

// ============================================================================
// STEP A: RESOLVE EFFECTIVE PLAYLIST FOR SCREEN
// ============================================================================

export async function resolveEffectivePlaylistForScreen(
  yodeckPlayerId: string
): Promise<EffectivePlaylistResult> {
  const screenResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  
  if (!screenResult.ok || !screenResult.data) {
    return {
      ok: false,
      playlistId: null,
      playlistName: null,
      sourceUsed: null,
      yodeckPlayerId,
      error: {
        code: "YODECK_API_ERROR",
        message: `Failed to fetch screen: ${screenResult.error}`,
      },
    };
  }

  const screen = screenResult.data;
  const screenContent = screen.screen_content || screen;
  
  const sourceType = screenContent.source_type || screen.source_type;
  const sourceId = screenContent.source || screenContent.source_id || screen.source;

  if (sourceType !== "playlist") {
    return {
      ok: false,
      playlistId: null,
      playlistName: null,
      sourceUsed: null,
      yodeckPlayerId,
      error: {
        code: "SCREEN_NOT_IN_PLAYLIST_MODE",
        message: `Screen source_type is "${sourceType}", expected "playlist"`,
        instructions: "Switch screen to playlist mode first via POST /api/admin/screens/:id/switch-to-playlist",
      },
    };
  }

  const playlistId = typeof sourceId === "number" ? sourceId : parseInt(sourceId);
  
  let playlistName: string | null = null;
  const playlistResult = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  if (playlistResult.ok && playlistResult.data) {
    playlistName = playlistResult.data.name;
  }

  return {
    ok: true,
    playlistId,
    playlistName,
    sourceUsed: "screen_content",
    yodeckPlayerId,
  };
}

// ============================================================================
// STEP B: RESOLVE PLAYABLE ASSET + HARD GATE
// ============================================================================

export async function resolvePlayableAssetForAdvertiser(
  advertiserId: string
): Promise<PlayableAssetResult> {
  const assets = await db
    .select()
    .from(adAssets)
    .where(eq(adAssets.advertiserId, advertiserId))
    .orderBy(desc(adAssets.createdAt));

  if (assets.length === 0) {
    return {
      ok: false,
      assetId: null,
      storageUrl: null,
      yodeckMediaId: null,
      status: "PENDING" as YodeckReadinessStatus,
      error: {
        code: "NO_ASSET_FOUND",
        assetStatus: "PENDING" as YodeckReadinessStatus,
        nextAction: "upload",
        message: "No assets found for this advertiser",
      },
    };
  }

  const activeAssets = assets.filter(a => !a.isSuperseded);
  
  if (activeAssets.length === 0) {
    return {
      ok: false,
      assetId: null,
      storageUrl: null,
      yodeckMediaId: null,
      status: "PENDING" as YodeckReadinessStatus,
      error: {
        code: "NO_ASSET_FOUND",
        assetStatus: "PENDING" as YodeckReadinessStatus,
        nextAction: "upload",
        message: "All assets are superseded, upload new video",
      },
    };
  }

  const readyAssets = activeAssets.filter(
    (a) => a.yodeckReadinessStatus === "READY_FOR_YODECK"
  );
  
  const canonicalAsset = readyAssets
    .sort((a, b) => {
      const sizeA = a.sizeBytes || 0;
      const sizeB = b.sizeBytes || 0;
      if (sizeB !== sizeA) return sizeB - sizeA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    })[0];

  if (canonicalAsset && canonicalAsset.yodeckMediaId) {
    return {
      ok: true,
      assetId: canonicalAsset.id,
      storageUrl: canonicalAsset.normalizedStorageUrl || canonicalAsset.storageUrl,
      yodeckMediaId: canonicalAsset.yodeckMediaId,
      status: canonicalAsset.yodeckReadinessStatus as YodeckReadinessStatus,
    };
  }

  if (canonicalAsset && !canonicalAsset.yodeckMediaId) {
    return {
      ok: false,
      assetId: canonicalAsset.id,
      storageUrl: canonicalAsset.normalizedStorageUrl || canonicalAsset.storageUrl,
      yodeckMediaId: null,
      status: "READY_FOR_YODECK" as YodeckReadinessStatus,
      error: {
        code: "MEDIA_NOT_READY",
        assetStatus: "READY_FOR_YODECK" as YodeckReadinessStatus,
        nextAction: "upload",
        message: "Asset is READY_FOR_YODECK but missing yodeckMediaId - upload to Yodeck required",
      },
    };
  }

  const bestAsset = activeAssets[0];
  const status = (bestAsset.yodeckReadinessStatus || "PENDING") as YodeckReadinessStatus;
  
  let nextAction: "wait" | "normalize" | "retry" | "upload" = "wait";
  if (status === "PENDING") nextAction = "upload";
  else if (status === "NEEDS_NORMALIZATION") nextAction = "normalize";
  else if (status === "NORMALIZING" || status === "VALIDATING") nextAction = "wait";

  return {
    ok: false,
    assetId: bestAsset.id,
    storageUrl: bestAsset.storageUrl,
    yodeckMediaId: bestAsset.yodeckMediaId,
    status,
    error: {
      code: "MEDIA_NOT_READY",
      assetStatus: status,
      nextAction,
      message: `Asset status is ${status}, must be READY_FOR_YODECK with yodeckMediaId`,
    },
  };
}

// ============================================================================
// STEP C: ENSURE YODECK MEDIA IS READY
// ============================================================================

export async function ensureYodeckMediaReady(
  yodeckMediaId: number
): Promise<YodeckMediaCheckResult> {
  const mediaResult = await yodeckRequest<any>(`/media/${yodeckMediaId}/`);

  if (!mediaResult.ok || !mediaResult.data) {
    return {
      ok: false,
      yodeckMediaId,
      status: null,
      fileSize: null,
      error: {
        code: "YODECK_MEDIA_NOT_FOUND",
        status: null,
        fileSize: null,
        recommendation: "Re-upload the media to Yodeck",
      },
    };
  }

  const media = mediaResult.data;
  const status = media.status || media.state || "unknown";
  const fileSize = media.file_size || media.fileSize || 0;

  const readyStatuses = ["Live", "Ready", "Available", "live", "ready", "available", "active"];
  const isReady = readyStatuses.some((s) => status.toLowerCase().includes(s.toLowerCase()));

  if (!isReady || fileSize === 0) {
    return {
      ok: false,
      yodeckMediaId,
      status,
      fileSize,
      error: {
        code: "YODECK_MEDIA_NOT_READY",
        status,
        fileSize,
        recommendation: fileSize === 0 
          ? "Media file has no content, re-upload required"
          : `Media status is "${status}", wait for processing to complete`,
      },
    };
  }

  return {
    ok: true,
    yodeckMediaId,
    status,
    fileSize,
  };
}

// ============================================================================
// STEP D: ADD OR REPLACE AD IN PLAYLIST
// ============================================================================

export async function addOrReplaceAdInPlaylist(
  playlistId: number,
  yodeckMediaId: number
): Promise<PlaylistUpdateResult> {
  const playlistResult = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  
  if (!playlistResult.ok || !playlistResult.data) {
    return {
      ok: false,
      playlistId,
      beforeCount: 0,
      afterCount: 0,
      removedDuplicates: 0,
      inserted: false,
      error: `Failed to fetch playlist: ${playlistResult.error}`,
    };
  }

  const playlist = playlistResult.data;
  const currentItems: any[] = playlist.items || [];
  const beforeCount = currentItems.length;

  const mediaIdSet = new Map<number, boolean>();
  const dedupedItems: any[] = [];
  let removedDuplicates = 0;

  for (const item of currentItems) {
    const itemMediaId = item.media || item.item?.id || item.id;
    if (itemMediaId === yodeckMediaId) {
      removedDuplicates++;
      continue;
    }
    if (!mediaIdSet.has(itemMediaId)) {
      mediaIdSet.set(itemMediaId, true);
      dedupedItems.push(item);
    } else {
      removedDuplicates++;
    }
  }

  const newItem = {
    id: yodeckMediaId,
    type: "media",
    priority: 1,
    duration: 15,
  };
  dedupedItems.push(newItem);

  const updateResult = await yodeckRequest<any>(`/playlists/${playlistId}/`, "PATCH", { items: dedupedItems });

  if (!updateResult.ok) {
    return {
      ok: false,
      playlistId,
      beforeCount,
      afterCount: beforeCount,
      removedDuplicates: 0,
      inserted: false,
      error: `Failed to update playlist: ${updateResult.error}`,
    };
  }

  return {
    ok: true,
    playlistId,
    beforeCount,
    afterCount: dedupedItems.length,
    removedDuplicates,
    inserted: true,
  };
}

// ============================================================================
// STEP E: PUSH SCREEN AND VERIFY
// ============================================================================

export async function pushScreenAndVerify(
  yodeckPlayerId: string,
  expectedMediaId: number,
  logs: string[],
  correlationId: string
): Promise<{ ok: boolean; adsCount: number; error?: string }> {
  log(correlationId, "PUSH", `Pushing screen ${yodeckPlayerId}...`, logs);
  
  const pushResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/push/`, "POST");

  if (!pushResult.ok) {
    log(correlationId, "PUSH", `Push failed: ${pushResult.error}`, logs);
  } else {
    log(correlationId, "PUSH", `Push initiated`, logs);
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const verifyResult = await verifyAdsInPlaylist(yodeckPlayerId, expectedMediaId);
  
  if (verifyResult.adsCount > 0) {
    log(correlationId, "VERIFY", `SUCCESS: adsCount=${verifyResult.adsCount}`, logs);
    return { ok: true, adsCount: verifyResult.adsCount };
  }

  log(correlationId, "VERIFY", `First verify: adsCount=0, retrying...`, logs);
  
  await yodeckRequest<any>(`/screens/${yodeckPlayerId}/push/`, "POST");
  await new Promise((resolve) => setTimeout(resolve, 3000));
  
  const retryResult = await verifyAdsInPlaylist(yodeckPlayerId, expectedMediaId);
  
  if (retryResult.adsCount > 0) {
    log(correlationId, "VERIFY", `Retry SUCCESS: adsCount=${retryResult.adsCount}`, logs);
    return { ok: true, adsCount: retryResult.adsCount };
  }

  log(correlationId, "VERIFY", `FAILED: adsCount still 0 after retry`, logs);
  return {
    ok: false,
    adsCount: 0,
    error: "PUBLISH_VERIFY_FAILED: adsCount=0 after push+retry",
  };
}

async function verifyAdsInPlaylist(
  yodeckPlayerId: string,
  expectedMediaId: number
): Promise<{ adsCount: number; containsExpected: boolean }> {
  const playlistResult = await resolveEffectivePlaylistForScreen(yodeckPlayerId);
  
  if (!playlistResult.ok || !playlistResult.playlistId) {
    return { adsCount: 0, containsExpected: false };
  }

  const itemsResult = await yodeckRequest<any>(`/playlists/${playlistResult.playlistId}/`);
  
  if (!itemsResult.ok || !itemsResult.data?.items) {
    return { adsCount: 0, containsExpected: false };
  }

  const items = itemsResult.data.items || [];
  let adsCount = 0;
  let containsExpected = false;

  for (const item of items) {
    const mediaId = item.media || item.item?.id || item.id;
    if (mediaId === expectedMediaId) {
      containsExpected = true;
    }
    if (typeof mediaId === "number") {
      adsCount++;
    }
  }

  return { adsCount, containsExpected };
}

async function verifyNowPlaying(
  yodeckPlayerId: string
): Promise<{ adsCount: number; totalCount: number }> {
  const screenResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  
  if (!screenResult.ok || !screenResult.data) {
    return { adsCount: 0, totalCount: 0 };
  }

  const screenContent = screenResult.data.screen_content || screenResult.data;
  const sourceId = screenContent.source || screenContent.source_id;
  
  if (!sourceId) {
    return { adsCount: 0, totalCount: 0 };
  }

  const playlistResult = await yodeckRequest<any>(`/playlists/${sourceId}/`);
  
  if (!playlistResult.ok || !playlistResult.data?.items) {
    return { adsCount: 0, totalCount: 0 };
  }

  const items = playlistResult.data.items || [];
  const adsCount = items.filter((item: any) => {
    const mediaId = item.media || item.item?.id || item.id;
    return typeof mediaId === "number";
  }).length;

  return { adsCount, totalCount: items.length };
}

// ============================================================================
// STEP F: RESOLVE TARGET SCREENS FOR ADVERTISER
// ============================================================================

async function resolveTargetScreens(
  advertiserId: string,
  targetYodeckPlayerIds?: string[]
): Promise<string[]> {
  if (targetYodeckPlayerIds && targetYodeckPlayerIds.length > 0) {
    return targetYodeckPlayerIds;
  }

  const activePlacements = await db
    .select({
      screenId: placements.screenId,
    })
    .from(placements)
    .innerJoin(contracts, eq(placements.contractId, contracts.id))
    .where(
      and(
        eq(contracts.advertiserId, advertiserId),
        eq(placements.isActive, true)
      )
    );

  if (activePlacements.length === 0) {
    return [];
  }

  const screenIds = Array.from(new Set(activePlacements.map((p) => p.screenId)));

  const targetScreens = await db
    .select({ 
      yodeckPlayerId: screens.yodeckPlayerId 
    })
    .from(screens)
    .where(
      and(
        isNotNull(screens.yodeckPlayerId),
        eq(screens.status, "active")
      )
    );

  const screenIdSet = new Set(screenIds);
  
  const allScreens = await db
    .select({ 
      id: screens.id,
      yodeckPlayerId: screens.yodeckPlayerId
    })
    .from(screens)
    .where(isNotNull(screens.yodeckPlayerId));

  return allScreens
    .filter((s) => screenIdSet.has(s.id) && s.yodeckPlayerId)
    .map((s) => s.yodeckPlayerId!)
    .filter(Boolean);
}

// ============================================================================
// MAIN: PUBLISH NOW
// ============================================================================

export async function publishNow(
  advertiserId: string,
  request: PublishNowRequest
): Promise<PublishNowTrace> {
  const correlationId = `pub-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const timestamp = new Date().toISOString();
  const logs: string[] = [];
  const steps: PublishStep[] = [];

  log(correlationId, "START", `Publishing for advertiser ${advertiserId}`, logs);

  let stepStart = Date.now();
  const assetResult = await resolvePlayableAssetForAdvertiser(advertiserId);
  steps.push({
    step: "RESOLVE_ASSET",
    status: assetResult.ok ? "success" : "failed",
    duration_ms: Date.now() - stepStart,
    details: {
      assetId: assetResult.assetId,
      yodeckMediaId: assetResult.yodeckMediaId,
      status: assetResult.status,
    },
    error: assetResult.error?.message,
  });

  if (!assetResult.ok) {
    log(correlationId, "RESOLVE_ASSET", `FAILED: ${assetResult.error?.message}`, logs);
    return {
      correlationId,
      timestamp,
      advertiserId,
      steps,
      outcome: "FAILED",
      summary: {
        targetsResolved: 0,
        publishAttempts: 0,
        successCount: 0,
        failedCount: 1,
        adsInPlaylists: 0,
      },
      logs,
    };
  }

  log(correlationId, "RESOLVE_ASSET", `OK: assetId=${assetResult.assetId}, yodeckMediaId=${assetResult.yodeckMediaId}`, logs);

  stepStart = Date.now();
  const mediaCheck = await ensureYodeckMediaReady(assetResult.yodeckMediaId!);
  steps.push({
    step: "CHECK_YODECK_MEDIA",
    status: mediaCheck.ok ? "success" : "failed",
    duration_ms: Date.now() - stepStart,
    details: {
      yodeckMediaId: mediaCheck.yodeckMediaId,
      status: mediaCheck.status,
      fileSize: mediaCheck.fileSize,
    },
    error: mediaCheck.error?.recommendation,
  });

  if (!mediaCheck.ok) {
    log(correlationId, "CHECK_YODECK_MEDIA", `FAILED: ${mediaCheck.error?.recommendation}`, logs);
    return {
      correlationId,
      timestamp,
      advertiserId,
      steps,
      outcome: "FAILED",
      summary: {
        targetsResolved: 0,
        publishAttempts: 0,
        successCount: 0,
        failedCount: 1,
        adsInPlaylists: 0,
      },
      logs,
    };
  }

  log(correlationId, "CHECK_YODECK_MEDIA", `OK: status=${mediaCheck.status}, fileSize=${mediaCheck.fileSize}`, logs);

  stepStart = Date.now();
  const targetScreens = await resolveTargetScreens(advertiserId, request.targetYodeckPlayerIds);
  steps.push({
    step: "RESOLVE_TARGETS",
    status: targetScreens.length > 0 ? "success" : "failed",
    duration_ms: Date.now() - stepStart,
    details: {
      count: targetScreens.length,
      screens: targetScreens,
    },
  });

  if (targetScreens.length === 0) {
    log(correlationId, "RESOLVE_TARGETS", `No target screens found`, logs);
    return {
      correlationId,
      timestamp,
      advertiserId,
      steps,
      outcome: "NO_TARGETS",
      summary: {
        targetsResolved: 0,
        publishAttempts: 0,
        successCount: 0,
        failedCount: 0,
        adsInPlaylists: 0,
      },
      logs,
    };
  }

  log(correlationId, "RESOLVE_TARGETS", `Found ${targetScreens.length} screens: ${targetScreens.join(", ")}`, logs);

  let successCount = 0;
  let failedCount = 0;
  let totalAdsInPlaylists = 0;

  for (const screenId of targetScreens) {
    log(correlationId, "SCREEN", `Processing screen ${screenId}...`, logs);

    stepStart = Date.now();
    const playlistResult = await resolveEffectivePlaylistForScreen(screenId);
    steps.push({
      step: `RESOLVE_PLAYLIST_${screenId}`,
      status: playlistResult.ok ? "success" : "failed",
      duration_ms: Date.now() - stepStart,
      details: {
        playlistId: playlistResult.playlistId,
        playlistName: playlistResult.playlistName,
        sourceUsed: playlistResult.sourceUsed,
      },
      error: playlistResult.error?.message,
    });

    if (!playlistResult.ok) {
      log(correlationId, "RESOLVE_PLAYLIST", `FAILED for ${screenId}: ${playlistResult.error?.message}`, logs);
      failedCount++;
      continue;
    }

    log(correlationId, "RESOLVE_PLAYLIST", `OK: playlistId=${playlistResult.playlistId}`, logs);

    stepStart = Date.now();
    const updateResult = await addOrReplaceAdInPlaylist(
      playlistResult.playlistId!,
      assetResult.yodeckMediaId!
    );
    steps.push({
      step: `UPDATE_PLAYLIST_${screenId}`,
      status: updateResult.ok ? "success" : "failed",
      duration_ms: Date.now() - stepStart,
      details: {
        playlistId: updateResult.playlistId,
        beforeCount: updateResult.beforeCount,
        afterCount: updateResult.afterCount,
        removedDuplicates: updateResult.removedDuplicates,
        inserted: updateResult.inserted,
      },
      error: updateResult.error,
    });

    if (!updateResult.ok) {
      log(correlationId, "UPDATE_PLAYLIST", `FAILED: ${updateResult.error}`, logs);
      failedCount++;
      continue;
    }

    log(correlationId, "UPDATE_PLAYLIST", `OK: before=${updateResult.beforeCount}, after=${updateResult.afterCount}, inserted=${updateResult.inserted}`, logs);

    stepStart = Date.now();
    const pushResult = await pushScreenAndVerify(
      screenId,
      assetResult.yodeckMediaId!,
      logs,
      correlationId
    );
    steps.push({
      step: `PUSH_VERIFY_${screenId}`,
      status: pushResult.ok ? "success" : "failed",
      duration_ms: Date.now() - stepStart,
      details: {
        adsCount: pushResult.adsCount,
      },
      error: pushResult.error,
    });

    if (pushResult.ok) {
      successCount++;
      totalAdsInPlaylists += pushResult.adsCount;
      log(correlationId, "SCREEN_DONE", `SUCCESS for ${screenId}`, logs);
    } else {
      failedCount++;
      log(correlationId, "SCREEN_DONE", `FAILED for ${screenId}: ${pushResult.error}`, logs);
    }
  }

  const outcome = 
    successCount === targetScreens.length ? "SUCCESS" :
    successCount > 0 ? "PARTIAL" : "FAILED";

  log(correlationId, "COMPLETE", `Outcome=${outcome}, success=${successCount}, failed=${failedCount}`, logs);

  return {
    correlationId,
    timestamp,
    advertiserId,
    steps,
    outcome,
    summary: {
      targetsResolved: targetScreens.length,
      publishAttempts: targetScreens.length,
      successCount,
      failedCount,
      adsInPlaylists: totalAdsInPlaylists,
    },
    logs,
  };
}
