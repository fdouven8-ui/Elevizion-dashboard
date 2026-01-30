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
// STEP F: RESOLVE TARGET SCREENS FOR ADVERTISER (with TEST_MODE fallback)
// ============================================================================

export interface TargetResolutionResult {
  targets: string[];
  method: "placements" | "targeting" | "explicit" | "test_mode_all";
  placementsCount: number;
  fallbackReason?: string;
}

const TEST_MODE = process.env.TEST_MODE === "true" || process.env.NODE_ENV === "development";

async function resolveTargetScreensWithDetails(
  advertiserId: string,
  targetYodeckPlayerIds?: string[],
  logs?: string[]
): Promise<TargetResolutionResult> {
  if (targetYodeckPlayerIds && targetYodeckPlayerIds.length > 0) {
    logs?.push(`[ResolveTargets] Using explicit targetYodeckPlayerIds: ${targetYodeckPlayerIds.join(", ")}`);
    return {
      targets: targetYodeckPlayerIds,
      method: "explicit",
      placementsCount: 0,
    };
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

  if (activePlacements.length > 0) {
    const screenIds = Array.from(new Set(activePlacements.map((p) => p.screenId)));
    
    const allScreens = await db
      .select({ 
        id: screens.id,
        yodeckPlayerId: screens.yodeckPlayerId
      })
      .from(screens)
      .where(isNotNull(screens.yodeckPlayerId));

    const screenIdSet = new Set(screenIds);
    const targets = allScreens
      .filter((s) => screenIdSet.has(s.id) && s.yodeckPlayerId)
      .map((s) => s.yodeckPlayerId!)
      .filter(Boolean);

    logs?.push(`[ResolveTargets] Found ${activePlacements.length} placements -> ${targets.length} screens`);
    return {
      targets,
      method: "placements",
      placementsCount: activePlacements.length,
    };
  }

  logs?.push(`[ResolveTargets] No placements found for advertiser ${advertiserId}`);

  if (!TEST_MODE) {
    return {
      targets: [],
      method: "placements",
      placementsCount: 0,
      fallbackReason: "No placements and TEST_MODE is disabled",
    };
  }

  logs?.push(`[ResolveTargets] TEST_MODE enabled, trying targeting fallback...`);

  const advertiserRows = await db
    .select()
    .from((await import("@shared/schema")).advertisers)
    .where(eq((await import("@shared/schema")).advertisers.id, advertiserId));

  const advertiser = advertiserRows[0];

  if (advertiser) {
    const targetCities = advertiser.targetCities || [];
    const targetRegions = advertiser.targetRegionCodes || [];

    if (targetCities.length > 0 || targetRegions.length > 0) {
      const allLocations = await db
        .select()
        .from(locations)
        .where(eq(locations.readyForAds, true));

      const matchingLocationIds = allLocations
        .filter((loc) => {
          if (targetCities.length > 0 && loc.city && (targetCities as string[]).includes(loc.city)) return true;
          if (targetRegions.length > 0 && loc.city && (targetRegions as string[]).includes(loc.city)) return true;
          return false;
        })
        .map((loc) => loc.id);

      if (matchingLocationIds.length > 0) {
        const locationIdSet = new Set(matchingLocationIds);
        
        const matchingScreens = await db
          .select({ 
            yodeckPlayerId: screens.yodeckPlayerId,
            locationId: screens.locationId 
          })
          .from(screens)
          .where(
            and(
              isNotNull(screens.yodeckPlayerId),
              eq(screens.status, "active")
            )
          );

        const targets = matchingScreens
          .filter((s) => s.yodeckPlayerId && s.locationId && locationIdSet.has(s.locationId))
          .map((s) => s.yodeckPlayerId!)
          .slice(0, 5);

        if (targets.length > 0) {
          logs?.push(`[ResolveTargets] Targeting fallback found ${targets.length} screens in ${matchingLocationIds.length} matching locations`);
          return {
            targets,
            method: "targeting",
            placementsCount: 0,
            fallbackReason: `Matched ${matchingLocationIds.length} locations via targeting (cities: ${(targetCities as string[]).join(",")}, regions: ${(targetRegions as string[]).join(",")})`,
          };
        }
      }
      
      logs?.push(`[ResolveTargets] No screens found matching targeting criteria`);
    }
  }

  logs?.push(`[ResolveTargets] TEST_MODE: Using first available active screens as fallback`);
  
  const anyActiveScreens = await db
    .select({ yodeckPlayerId: screens.yodeckPlayerId })
    .from(screens)
    .where(
      and(
        isNotNull(screens.yodeckPlayerId),
        eq(screens.status, "active")
      )
    )
    .limit(3);

  const targets = anyActiveScreens
    .filter((s) => s.yodeckPlayerId)
    .map((s) => s.yodeckPlayerId!);

  return {
    targets,
    method: "test_mode_all",
    placementsCount: 0,
    fallbackReason: "TEST_MODE fallback to first 3 active screens",
  };
}

async function resolveTargetScreens(
  advertiserId: string,
  targetYodeckPlayerIds?: string[]
): Promise<string[]> {
  const result = await resolveTargetScreensWithDetails(advertiserId, targetYodeckPlayerIds);
  return result.targets;
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
  const targetResolution = await resolveTargetScreensWithDetails(
    advertiserId, 
    request.targetYodeckPlayerIds,
    logs
  );
  steps.push({
    step: "RESOLVE_TARGETS",
    status: targetResolution.targets.length > 0 ? "success" : "failed",
    duration_ms: Date.now() - stepStart,
    details: {
      count: targetResolution.targets.length,
      screens: targetResolution.targets,
      method: targetResolution.method,
      placementsCount: targetResolution.placementsCount,
      fallbackReason: targetResolution.fallbackReason,
      testModeEnabled: TEST_MODE,
    },
  });

  if (targetResolution.targets.length === 0) {
    log(correlationId, "RESOLVE_TARGETS", `No target screens found (method=${targetResolution.method}, fallback=${targetResolution.fallbackReason})`, logs);
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

  const targetScreens = targetResolution.targets;
  log(correlationId, "RESOLVE_TARGETS", `Found ${targetScreens.length} screens via ${targetResolution.method}: ${targetScreens.join(", ")}`, logs);

  let successCount = 0;
  let failedCount = 0;
  let totalAdsInPlaylists = 0;

  for (const screenId of targetScreens) {
    log(correlationId, "SCREEN", `Processing screen ${screenId}...`, logs);

    // STEP 0: Auto-heal screen if in layout mode (PLAYLIST_ONLY enforcement)
    stepStart = Date.now();
    const { resolveEffectiveScreenSource, ensurePlayerUsesExpectedPlaylist, PLAYLIST_ONLY_MODE } = await import("./playlistOnlyGuard");
    
    const yodeckPlayerId = parseInt(screenId, 10);
    const sourceCheck = await resolveEffectiveScreenSource(yodeckPlayerId);
    
    if (sourceCheck.actual.type !== "playlist") {
      log(correlationId, "AUTO_HEAL", `Screen ${screenId} is in ${sourceCheck.actual.type} mode (actual=${sourceCheck.actual.type}:${sourceCheck.actual.id}), attempting auto-heal...`, logs);
      
      const expectedPlaylistId = sourceCheck.expected?.id;
      if (!expectedPlaylistId) {
        steps.push({
          step: `AUTO_HEAL_${screenId}`,
          status: "failed",
          duration_ms: Date.now() - stepStart,
          details: {
            actualType: sourceCheck.actual.type,
            actualId: sourceCheck.actual.id,
            expectedPlaylistId: null,
            reason: "NO_EXPECTED_PLAYLIST",
          },
        });
        log(correlationId, "AUTO_HEAL", `FAILED: No expected playlist found for screen ${screenId}`, logs);
        failedCount++;
        continue;
      }
      
      const healResult = await ensurePlayerUsesExpectedPlaylist(yodeckPlayerId, expectedPlaylistId, correlationId);
      steps.push({
        step: `AUTO_HEAL_${screenId}`,
        status: healResult.outcome === "HEALED" ? "success" : "failed",
        duration_ms: Date.now() - stepStart,
        details: {
          beforeType: healResult.beforeSnapshot.actual.type,
          beforeId: healResult.beforeSnapshot.actual.id,
          afterType: healResult.afterSnapshot?.actual.type,
          afterId: healResult.afterSnapshot?.actual.id,
          outcome: healResult.outcome,
        },
        error: healResult.error,
      });
      
      if (healResult.outcome !== "HEALED" && healResult.outcome !== "ALREADY_OK") {
        log(correlationId, "AUTO_HEAL", `FAILED for ${screenId}: ${healResult.error}`, logs);
        failedCount++;
        continue;
      }
      log(correlationId, "AUTO_HEAL", `SUCCESS: Screen ${screenId} now in playlist mode`, logs);
    } else {
      log(correlationId, "AUTO_HEAL", `Screen ${screenId} already in playlist mode, skipping heal`, logs);
    }

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
      log(correlationId, "RESOLVE_PLAYLIST", `FAILED for ${screenId}: ${playlistResult.error?.message} (code=${playlistResult.error?.code})`, logs);
      
      // Return 422 with SCREEN_SOURCE_MISMATCH_UNFIXED if still not in playlist mode
      if (playlistResult.error?.code === "SCREEN_NOT_IN_PLAYLIST_MODE") {
        log(correlationId, "RESOLVE_PLAYLIST", `Screen ${screenId} still not in playlist mode after heal attempt`, logs);
      }
      
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

// ============================================================================
// MAPPING HEALTH CHECK
// ============================================================================

export type MappingHealth = "OK" | "INVALID_MAPPING" | "MISSING_MEDIA_ID" | "NEEDS_VALIDATION";

export interface MappingHealthResult {
  mappingHealth: MappingHealth;
  reason: string;
  suggestedAction: "NONE" | "REUPLOAD" | "WAIT_NORMALIZATION" | "VALIDATE";
  yodeckMediaId: number | null;
  assetId: string | null;
  assetStatus: string | null;
}

export async function checkMappingHealth(
  advertiserId: string,
  knownBaselineMediaIds?: number[]
): Promise<MappingHealthResult> {
  const assetResult = await resolvePlayableAssetForAdvertiser(advertiserId);
  
  if (!assetResult.assetId) {
    return {
      mappingHealth: "MISSING_MEDIA_ID",
      reason: "No asset found for advertiser",
      suggestedAction: "REUPLOAD",
      yodeckMediaId: null,
      assetId: null,
      assetStatus: null,
    };
  }

  if (!assetResult.yodeckMediaId) {
    if (assetResult.status === "READY_FOR_YODECK") {
      return {
        mappingHealth: "MISSING_MEDIA_ID",
        reason: "Asset is READY_FOR_YODECK but missing yodeckMediaId",
        suggestedAction: "REUPLOAD",
        yodeckMediaId: null,
        assetId: assetResult.assetId,
        assetStatus: assetResult.status,
      };
    }
    
    if (assetResult.status === "NEEDS_NORMALIZATION" || assetResult.status === "NORMALIZING") {
      return {
        mappingHealth: "NEEDS_VALIDATION",
        reason: `Asset status is ${assetResult.status}`,
        suggestedAction: "WAIT_NORMALIZATION",
        yodeckMediaId: null,
        assetId: assetResult.assetId,
        assetStatus: assetResult.status,
      };
    }

    return {
      mappingHealth: "NEEDS_VALIDATION",
      reason: `Asset status is ${assetResult.status}, needs validation`,
      suggestedAction: "VALIDATE",
      yodeckMediaId: null,
      assetId: assetResult.assetId,
      assetStatus: assetResult.status,
    };
  }

  if (knownBaselineMediaIds && knownBaselineMediaIds.includes(assetResult.yodeckMediaId)) {
    return {
      mappingHealth: "INVALID_MAPPING",
      reason: `yodeckMediaId ${assetResult.yodeckMediaId} matches baseline content - collision detected`,
      suggestedAction: "REUPLOAD",
      yodeckMediaId: assetResult.yodeckMediaId,
      assetId: assetResult.assetId,
      assetStatus: assetResult.status,
    };
  }

  const mediaCheck = await ensureYodeckMediaReady(assetResult.yodeckMediaId);
  
  if (!mediaCheck.ok) {
    return {
      mappingHealth: "INVALID_MAPPING",
      reason: mediaCheck.error?.recommendation || "Yodeck media not ready",
      suggestedAction: "REUPLOAD",
      yodeckMediaId: assetResult.yodeckMediaId,
      assetId: assetResult.assetId,
      assetStatus: assetResult.status,
    };
  }

  return {
    mappingHealth: "OK",
    reason: "Asset ready and yodeckMediaId valid",
    suggestedAction: "NONE",
    yodeckMediaId: assetResult.yodeckMediaId,
    assetId: assetResult.assetId,
    assetStatus: assetResult.status,
  };
}

// ============================================================================
// DRY RUN - NO MUTATIONS
// ============================================================================

export async function publishDryRun(
  advertiserId: string,
  request: PublishNowRequest
): Promise<PublishNowTrace> {
  const correlationId = `dry-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const timestamp = new Date().toISOString();
  const logs: string[] = [];
  const steps: PublishStep[] = [];

  log(correlationId, "DRY_RUN_START", `Dry run for advertiser ${advertiserId}`, logs);

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
      storageUrl: assetResult.storageUrl,
    },
    error: assetResult.error?.message,
  });

  const mappingHealth = await checkMappingHealth(advertiserId);
  steps.push({
    step: "CHECK_MAPPING_HEALTH",
    status: mappingHealth.mappingHealth === "OK" ? "success" : "failed",
    duration_ms: 0,
    details: {
      mappingHealth: mappingHealth.mappingHealth,
      reason: mappingHealth.reason,
      suggestedAction: mappingHealth.suggestedAction,
    },
  });

  if (assetResult.ok && assetResult.yodeckMediaId) {
    stepStart = Date.now();
    const mediaCheck = await ensureYodeckMediaReady(assetResult.yodeckMediaId);
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
  }

  stepStart = Date.now();
  const targetResolution = await resolveTargetScreensWithDetails(
    advertiserId, 
    request.targetYodeckPlayerIds,
    logs
  );
  steps.push({
    step: "RESOLVE_TARGETS",
    status: targetResolution.targets.length > 0 ? "success" : "failed",
    duration_ms: Date.now() - stepStart,
    details: {
      count: targetResolution.targets.length,
      screens: targetResolution.targets,
      method: targetResolution.method,
      placementsCount: targetResolution.placementsCount,
      fallbackReason: targetResolution.fallbackReason,
      testModeEnabled: TEST_MODE,
    },
  });

  for (const screenId of targetResolution.targets.slice(0, 3)) {
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
  }

  const wouldSucceed = 
    assetResult.ok && 
    mappingHealth.mappingHealth === "OK" && 
    targetResolution.targets.length > 0;

  log(correlationId, "DRY_RUN_COMPLETE", `Would succeed: ${wouldSucceed}`, logs);

  return {
    correlationId,
    timestamp,
    advertiserId,
    steps,
    outcome: wouldSucceed ? "SUCCESS" : "FAILED",
    summary: {
      targetsResolved: targetResolution.targets.length,
      publishAttempts: 0,
      successCount: 0,
      failedCount: 0,
      adsInPlaylists: 0,
    },
    logs,
  };
}
