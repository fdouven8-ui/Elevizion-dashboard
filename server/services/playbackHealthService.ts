/**
 * Playback Health Service - Comprehensive diagnostics and repair for screens
 * 
 * Provides:
 * - Detailed playback health diagnostics per screen
 * - Self-healing repair functionality
 * - Hard gate enforcement for media readiness
 * - Playlist deduplication and validation
 */

import { db } from "../db";
import { screens, locations, adAssets, placements, contracts } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import crypto from "crypto";
import { getCanonicalAssetForAdvertiser, YodeckReadinessStatus } from "./yodeckMediaPipeline";

// ============================================================================
// TYPES
// ============================================================================

export interface MediaNotReadyError {
  code: "MEDIA_NOT_READY";
  status: YodeckReadinessStatus;
  assetId: string | null;
  reason: string;
  nextAction: "validate" | "retry_normalization" | "wait" | "upload";
}

export interface PlayableAssetResult {
  ok: boolean;
  storageKey: string | null;
  storagePath: string | null;
  storageUrl: string | null;
  isNormalized: boolean;
  assetId: string | null;
  status: YodeckReadinessStatus;
  yodeckMediaId: number | null;
  validationSummary: {
    isYodeckCompatible: boolean;
    reasons: string[];
  };
  error?: MediaNotReadyError;
}

export interface PlaylistItem {
  id: number;
  mediaId: number | null;
  name: string;
  type: string;
  duration: number;
  category: "baseline" | "ad" | "unknown";
}

export interface PlaybackHealthResult {
  correlationId: string;
  timestamp: string;
  buildInfo: {
    env: string;
    contentPipelineMode: string;
  };
  screen: {
    id: string;
    name: string;
    yodeckPlayerId: string | null;
    yodeckUuid: string | null;
    lastSeenAt: string | null;
    status: string;
    locationId: string | null;
    locationName: string | null;
  };
  expectedContent: {
    sourceType: "playlist" | "layout" | "schedule" | "none";
    sourceId: string | null;
    sourceName: string | null;
  };
  actualContent: {
    sourceType: string | null;
    sourceId: string | null;
    mismatch: boolean;
    fetchedAt: string | null;
  };
  playlist: {
    playlistId: string | null;
    itemCount: number;
    items: PlaylistItem[];
    lastFetchedAt: string | null;
  };
  classification: {
    baselineCount: number;
    adsCount: number;
    unknownCount: number;
  };
  mediaReadiness: {
    adsReady: number;
    adsNotReady: number;
    blockingReasons: Array<{
      assetId: string;
      status: YodeckReadinessStatus;
      reason: string;
    }>;
  };
  flags: {
    isPlaylistEmpty: boolean;
    hasInvalidAd: boolean;
    hasDuplicateAd: boolean;
    hasMismatch: boolean;
    POSSIBLE_BLACK_SCREEN: boolean;
  };
  recommendedActions: string[];
  logs: string[];
}

export interface RepairResult {
  correlationId: string;
  timestamp: string;
  screenId: string;
  actions: Array<{
    action: string;
    outcome: "success" | "failed" | "skipped";
    details: string;
    durationMs: number;
  }>;
  finalState: {
    playlistItemCount: number;
    baselineCount: number;
    adsCount: number;
    POSSIBLE_BLACK_SCREEN: boolean;
  };
  logs: string[];
}

// ============================================================================
// CORRELATION ID
// ============================================================================

export function generateCorrelationId(): string {
  return `pbh-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

// ============================================================================
// STRUCTURED LOGGING
// ============================================================================

function log(correlationId: string, message: string, logs: string[]): void {
  const entry = `[${new Date().toISOString()}] [${correlationId}] ${message}`;
  console.log(entry);
  logs.push(entry);
}

// ============================================================================
// RESOLVE PLAYABLE ASSET - SINGLE SOURCE OF TRUTH
// ============================================================================

export async function resolvePlayableAsset(advertiserId: string): Promise<PlayableAssetResult> {
  const canonical = await getCanonicalAssetForAdvertiser(advertiserId);
  
  if (!canonical.asset) {
    return {
      ok: false,
      storageKey: null,
      storagePath: null,
      storageUrl: null,
      isNormalized: false,
      assetId: null,
      status: "PENDING",
      yodeckMediaId: null,
      validationSummary: { isYodeckCompatible: false, reasons: ["Geen video geüpload"] },
      error: {
        code: "MEDIA_NOT_READY",
        status: "PENDING",
        assetId: null,
        reason: "Geen video geüpload voor deze adverteerder",
        nextAction: "upload",
      },
    };
  }

  const asset = canonical.asset;
  const status = canonical.status;

  if (status !== "READY_FOR_YODECK") {
    let nextAction: "validate" | "retry_normalization" | "wait" | "upload" = "wait";
    if (status === "PENDING") nextAction = "validate";
    if (status === "REJECTED" || status === "NEEDS_NORMALIZATION") nextAction = "retry_normalization";

    return {
      ok: false,
      storageKey: null,
      storagePath: null,
      storageUrl: null,
      isNormalized: false,
      assetId: asset.id,
      status,
      yodeckMediaId: asset.yodeckMediaId || null,
      validationSummary: {
        isYodeckCompatible: false,
        reasons: [canonical.reason || `Status: ${status}`],
      },
      error: {
        code: "MEDIA_NOT_READY",
        status,
        assetId: asset.id,
        reason: canonical.reason || `Media heeft status ${status}`,
        nextAction,
      },
    };
  }

  // READY_FOR_YODECK - return canonical file
  const isNormalized = !!asset.normalizedStoragePath;
  const storagePath = asset.normalizedStoragePath || asset.convertedStoragePath || asset.storagePath;
  const storageUrl = asset.normalizedStorageUrl || asset.convertedStorageUrl || asset.storageUrl;

  const metadata = asset.yodeckMetadataJson as any;

  return {
    ok: true,
    storageKey: storagePath?.split("/").pop() || null,
    storagePath,
    storageUrl,
    isNormalized,
    assetId: asset.id,
    status: "READY_FOR_YODECK",
    yodeckMediaId: asset.yodeckMediaId || null,
    validationSummary: {
      isYodeckCompatible: true,
      reasons: metadata?.compatibilityReasons || [],
    },
  };
}

// ============================================================================
// HARD GATE - CHECK BEFORE PUBLISH
// ============================================================================

export async function checkMediaReadyForPublish(advertiserId: string): Promise<{
  ready: boolean;
  error?: MediaNotReadyError;
  asset?: PlayableAssetResult;
}> {
  const result = await resolvePlayableAsset(advertiserId);
  
  if (!result.ok) {
    return {
      ready: false,
      error: result.error,
      asset: result,
    };
  }

  return {
    ready: true,
    asset: result,
  };
}

/**
 * Check if a specific adAsset is READY_FOR_YODECK
 * Use this in publish paths that have an assetId instead of advertiserId
 */
export async function checkAssetReadyForPublish(assetId: string): Promise<{
  ready: boolean;
  status: YodeckReadinessStatus;
  error?: MediaNotReadyError;
}> {
  const [asset] = await db.select().from(adAssets).where(eq(adAssets.id, assetId));
  
  if (!asset) {
    return {
      ready: false,
      status: "PENDING",
      error: {
        code: "MEDIA_NOT_READY",
        status: "PENDING",
        assetId,
        reason: "Asset niet gevonden",
        nextAction: "upload",
      },
    };
  }

  const status = (asset.yodeckReadinessStatus as YodeckReadinessStatus) || "PENDING";
  
  if (status !== "READY_FOR_YODECK") {
    let nextAction: "validate" | "retry_normalization" | "wait" | "upload" = "wait";
    if (status === "PENDING") nextAction = "validate";
    if (status === "REJECTED" || status === "NEEDS_NORMALIZATION") nextAction = "retry_normalization";

    return {
      ready: false,
      status,
      error: {
        code: "MEDIA_NOT_READY",
        status,
        assetId,
        reason: asset.yodeckRejectReason || `Media heeft status ${status}`,
        nextAction,
      },
    };
  }

  return { ready: true, status };
}

/**
 * GATE ENFORCEMENT DOCUMENTATION
 * 
 * The READY_FOR_YODECK hard gate is enforced at these entry points:
 * 
 * 1. linkAdToLocation() in yodeckCanonicalService.ts
 *    - UI "Plaats Ad" button → POST /api/admin/locations/:id/link-ad
 *    - Returns 422 with MEDIA_NOT_READY if not ready
 * 
 * 2. resolvePlayableAsset() in playbackHealthService.ts
 *    - Called before any playlist publish operation
 *    - Returns error with nextAction if not ready
 * 
 * 3. checkAssetReadyForPublish() in playbackHealthService.ts
 *    - Called by appendMediaToPlaylist and similar functions
 *    - Can be used when assetId is known instead of advertiserId
 * 
 * All downstream functions (appendMediaToPlaylist, setPlaylistItemsExactly, etc.)
 * should be called ONLY after gate check passes at entry points above.
 */

// ============================================================================
// CLASSIFY PLAYLIST ITEMS
// ============================================================================

export function classifyPlaylistItem(item: { name: string; id?: number }): "baseline" | "ad" | "unknown" {
  const name = (item.name || "").toLowerCase();
  
  // Baseline content patterns
  if (name.includes("elevizion") && (name.includes("loop") || name.includes("fallback"))) {
    return "baseline";
  }
  if (name.includes("baseline") || name.includes("filler") || name.includes("default")) {
    return "baseline";
  }
  
  // Ad patterns
  if (name.startsWith("adv-") || name.includes("_ad_")) {
    return "ad";
  }
  if (/^[a-z0-9]{8,}$/i.test(name.replace(/[^a-z0-9]/gi, ""))) {
    return "ad"; // Likely advertiser upload with hash
  }
  
  return "unknown";
}

export function classifyPlaylistItems(items: Array<{ id?: number; name: string; duration?: number }>): {
  items: PlaylistItem[];
  baselineCount: number;
  adsCount: number;
  unknownCount: number;
} {
  let baselineCount = 0;
  let adsCount = 0;
  let unknownCount = 0;

  const classified: PlaylistItem[] = items.map((item, idx) => {
    const category = classifyPlaylistItem(item);
    if (category === "baseline") baselineCount++;
    else if (category === "ad") adsCount++;
    else unknownCount++;

    return {
      id: item.id || idx,
      mediaId: null,
      name: item.name,
      type: "media",
      duration: item.duration || 15,
      category,
    };
  });

  return { items: classified, baselineCount, adsCount, unknownCount };
}

// ============================================================================
// YODECK API HELPERS
// ============================================================================

async function yodeckRequest<T>(endpoint: string, options?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = process.env.YODECK_AUTH_TOKEN;
  if (!token) {
    return { ok: false, error: "YODECK_AUTH_TOKEN niet geconfigureerd" };
  }

  try {
    const response = await fetch(`https://app.yodeck.com/api/v2${endpoint}`, {
      ...options,
      headers: {
        "Authorization": `Api-Key ${token}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      return { ok: false, error: `Yodeck API ${response.status}: ${response.statusText}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function getYodeckPlaylistItems(playlistId: string): Promise<{ ok: boolean; items: any[]; error?: string }> {
  const result = await yodeckRequest<{ items?: any[]; playlist_items?: any[] }>(`/playlists/${playlistId}/`);
  if (!result.ok) {
    return { ok: false, items: [], error: result.error };
  }
  
  const items = result.data?.items || result.data?.playlist_items || [];
  return { ok: true, items };
}

async function getYodeckScreenInfo(playerId: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  return yodeckRequest(`/screens/${playerId}/`);
}

// ============================================================================
// PLAYBACK HEALTH - MAIN DIAGNOSTIC
// ============================================================================

export async function getPlaybackHealth(screenId: string): Promise<PlaybackHealthResult> {
  const correlationId = generateCorrelationId();
  const logs: string[] = [];
  const timestamp = new Date().toISOString();

  log(correlationId, `Starting playback health check for screen ${screenId}`, logs);

  // Get screen from DB
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  
  if (!screen) {
    log(correlationId, `Screen ${screenId} not found`, logs);
    return {
      correlationId,
      timestamp,
      buildInfo: { env: process.env.NODE_ENV || "development", contentPipelineMode: "SCREEN_PLAYLIST_ONLY" },
      screen: { id: screenId, name: "Unknown", yodeckPlayerId: null, yodeckUuid: null, lastSeenAt: null, status: "NOT_FOUND", locationId: null, locationName: null },
      expectedContent: { sourceType: "none", sourceId: null, sourceName: null },
      actualContent: { sourceType: null, sourceId: null, mismatch: false, fetchedAt: null },
      playlist: { playlistId: null, itemCount: 0, items: [], lastFetchedAt: null },
      classification: { baselineCount: 0, adsCount: 0, unknownCount: 0 },
      mediaReadiness: { adsReady: 0, adsNotReady: 0, blockingReasons: [] },
      flags: { isPlaylistEmpty: true, hasInvalidAd: false, hasDuplicateAd: false, hasMismatch: false, POSSIBLE_BLACK_SCREEN: true },
      recommendedActions: ["SCREEN_NOT_FOUND"],
      logs,
    };
  }

  log(correlationId, `Screen found: ${screen.name} (player=${screen.yodeckPlayerId})`, logs);

  // Get location
  let location: any = null;
  let locationName = "Geen locatie";
  if (screen.locationId) {
    const [loc] = await db.select().from(locations).where(eq(locations.id, screen.locationId));
    location = loc;
    locationName = loc?.name || "Onbekende locatie";
  }

  // Build result
  const result: PlaybackHealthResult = {
    correlationId,
    timestamp,
    buildInfo: {
      env: process.env.NODE_ENV || "development",
      contentPipelineMode: "SCREEN_PLAYLIST_ONLY",
    },
    screen: {
      id: screen.id,
      name: screen.name || "Naamloos scherm",
      yodeckPlayerId: screen.yodeckPlayerId || null,
      yodeckUuid: screen.yodeckUuid || null,
      lastSeenAt: screen.lastSeenAt?.toISOString() || null,
      status: screen.status || "unknown",
      locationId: screen.locationId || null,
      locationName,
    },
    expectedContent: {
      sourceType: "playlist",
      sourceId: location?.yodeckPlaylistId || null,
      sourceName: location ? `Elevizion | Loop | ${location.name}` : null,
    },
    actualContent: {
      sourceType: null,
      sourceId: null,
      mismatch: false,
      fetchedAt: null,
    },
    playlist: {
      playlistId: location?.yodeckPlaylistId || null,
      itemCount: 0,
      items: [],
      lastFetchedAt: null,
    },
    classification: { baselineCount: 0, adsCount: 0, unknownCount: 0 },
    mediaReadiness: { adsReady: 0, adsNotReady: 0, blockingReasons: [] },
    flags: {
      isPlaylistEmpty: true,
      hasInvalidAd: false,
      hasDuplicateAd: false,
      hasMismatch: false,
      POSSIBLE_BLACK_SCREEN: true,
    },
    recommendedActions: [],
    logs,
  };

  // Fetch actual screen content from Yodeck
  if (screen.yodeckPlayerId) {
    log(correlationId, `Fetching Yodeck screen info for player ${screen.yodeckPlayerId}`, logs);
    const screenInfo = await getYodeckScreenInfo(screen.yodeckPlayerId);
    if (screenInfo.ok && screenInfo.data) {
      result.actualContent = {
        sourceType: screenInfo.data.source_type || null,
        sourceId: screenInfo.data.source?.toString() || null,
        mismatch: false,
        fetchedAt: new Date().toISOString(),
      };

      // Check for mismatch
      if (result.expectedContent.sourceId && result.actualContent.sourceId) {
        result.actualContent.mismatch = result.expectedContent.sourceId !== result.actualContent.sourceId;
        result.flags.hasMismatch = result.actualContent.mismatch;
      }
      
      log(correlationId, `Yodeck screen info: sourceType=${result.actualContent.sourceType} sourceId=${result.actualContent.sourceId} mismatch=${result.actualContent.mismatch}`, logs);
    } else {
      log(correlationId, `Failed to fetch Yodeck screen info: ${screenInfo.error}`, logs);
    }
  }

  // Fetch playlist items
  if (location?.yodeckPlaylistId) {
    log(correlationId, `Fetching playlist items for playlist ${location.yodeckPlaylistId}`, logs);
    const playlistResult = await getYodeckPlaylistItems(location.yodeckPlaylistId);
    if (playlistResult.ok) {
      const classification = classifyPlaylistItems(playlistResult.items.map((i: any) => ({
        id: i.id || i.media,
        name: i.name || i.media_name || `Item ${i.id}`,
        duration: i.duration || 15,
      })));

      result.playlist = {
        playlistId: location.yodeckPlaylistId,
        itemCount: playlistResult.items.length,
        items: classification.items,
        lastFetchedAt: new Date().toISOString(),
      };
      result.classification = {
        baselineCount: classification.baselineCount,
        adsCount: classification.adsCount,
        unknownCount: classification.unknownCount,
      };
      result.flags.isPlaylistEmpty = playlistResult.items.length === 0;

      // Check for duplicates
      const mediaIds = playlistResult.items.map((i: any) => i.media || i.id).filter(Boolean);
      const uniqueIds = new Set(mediaIds);
      result.flags.hasDuplicateAd = mediaIds.length !== uniqueIds.size;

      log(correlationId, `Playlist has ${playlistResult.items.length} items (baseline=${classification.baselineCount}, ads=${classification.adsCount})`, logs);
    } else {
      log(correlationId, `Failed to fetch playlist items: ${playlistResult.error}`, logs);
    }
  }

  // Check media readiness for ads linked to this screen
  // Placements are linked via screenId -> contracts -> advertiserId
  const screenPlacements = await db.select({
    placement: placements,
    contract: contracts,
  }).from(placements)
    .innerJoin(contracts, eq(placements.contractId, contracts.id))
    .where(
      and(
        eq(placements.screenId, screen.id),
        eq(placements.isActive, true)
      )
    );

  for (const { placement, contract } of screenPlacements) {
    const readyCheck = await checkMediaReadyForPublish(contract.advertiserId);
    if (readyCheck.ready) {
      result.mediaReadiness.adsReady++;
    } else {
      result.mediaReadiness.adsNotReady++;
      if (readyCheck.error) {
        result.mediaReadiness.blockingReasons.push({
          assetId: readyCheck.error.assetId || "unknown",
          status: readyCheck.error.status,
          reason: readyCheck.error.reason,
        });
      }
      result.flags.hasInvalidAd = true;
    }
  }

  log(correlationId, `Media readiness: ${result.mediaReadiness.adsReady} ready, ${result.mediaReadiness.adsNotReady} not ready`, logs);

  // Determine POSSIBLE_BLACK_SCREEN
  result.flags.POSSIBLE_BLACK_SCREEN = 
    result.flags.isPlaylistEmpty || 
    (result.classification.baselineCount === 0 && result.classification.adsCount === 0);

  // Generate recommended actions
  if (!screen.yodeckPlayerId) {
    result.recommendedActions.push("LINK_YODECK_PLAYER");
  }
  if (!screen.locationId) {
    result.recommendedActions.push("ASSIGN_LOCATION");
  }
  if (!location?.yodeckPlaylistId) {
    result.recommendedActions.push("CREATE_PLAYLIST");
  }
  if (result.flags.isPlaylistEmpty) {
    result.recommendedActions.push("RESEED_BASELINE");
  }
  if (result.flags.hasMismatch) {
    result.recommendedActions.push("REASSIGN_PLAYLIST");
  }
  if (result.flags.hasDuplicateAd) {
    result.recommendedActions.push("DEDUP_PLAYLIST");
  }
  if (result.mediaReadiness.adsNotReady > 0) {
    result.recommendedActions.push("VALIDATE_ADS");
  }
  if (result.flags.POSSIBLE_BLACK_SCREEN) {
    result.recommendedActions.push("URGENT_FIX_BLACK_SCREEN");
  }

  log(correlationId, `Recommended actions: ${result.recommendedActions.join(", ") || "none"}`, logs);
  log(correlationId, `Playback health check complete`, logs);

  return result;
}

// ============================================================================
// REPAIR - SELF-HEAL SCREEN
// ============================================================================

export async function repairScreen(screenId: string): Promise<RepairResult> {
  const correlationId = generateCorrelationId();
  const logs: string[] = [];
  const actions: RepairResult["actions"] = [];
  const timestamp = new Date().toISOString();

  log(correlationId, `Starting repair for screen ${screenId}`, logs);

  // Get current health status first
  const health = await getPlaybackHealth(screenId);

  // Repair actions based on health
  for (const actionName of health.recommendedActions) {
    const startTime = Date.now();
    let outcome: "success" | "failed" | "skipped" = "skipped";
    let details = "";

    try {
      switch (actionName) {
        case "DEDUP_PLAYLIST":
          if (health.playlist.playlistId) {
            log(correlationId, `Deduplicating playlist ${health.playlist.playlistId}`, logs);
            try {
              const playlistItems = await getYodeckPlaylistItems(health.playlist.playlistId);
              if (playlistItems.ok && playlistItems.items.length > 0) {
                const mediaIdCounts = new Map<number, number[]>();
                for (const item of playlistItems.items) {
                  const mediaId = item.media || item.id;
                  if (mediaId) {
                    if (!mediaIdCounts.has(mediaId)) {
                      mediaIdCounts.set(mediaId, []);
                    }
                    mediaIdCounts.get(mediaId)!.push(item.id);
                  }
                }
                
                let removedCount = 0;
                for (const [mediaId, itemIds] of Array.from(mediaIdCounts.entries())) {
                  if (itemIds.length > 1) {
                    const duplicateIds = itemIds.slice(1);
                    for (const itemId of duplicateIds) {
                      const deleteResult = await yodeckRequest(`/playlists/${health.playlist.playlistId}/items/${itemId}/`, { method: "DELETE" });
                      if (deleteResult.ok) removedCount++;
                    }
                  }
                }
                
                outcome = removedCount > 0 ? "success" : "skipped";
                details = removedCount > 0 ? `Removed ${removedCount} duplicate items` : "No duplicates found";
              } else {
                outcome = "skipped";
                details = "Playlist empty or fetch failed";
              }
            } catch (dedupError: any) {
              outcome = "failed";
              details = `Dedup error: ${dedupError.message}`;
            }
          }
          break;

        case "REASSIGN_PLAYLIST":
          if (health.screen.yodeckPlayerId && health.expectedContent.sourceId) {
            log(correlationId, `Reassigning playlist ${health.expectedContent.sourceId} to screen`, logs);
            // Assign playlist to screen via Yodeck API
            const assignResult = await yodeckRequest(`/screens/${health.screen.yodeckPlayerId}/`, {
              method: "PATCH",
              body: JSON.stringify({
                source_type: "playlist",
                source: parseInt(health.expectedContent.sourceId),
              }),
            });
            
            if (assignResult.ok) {
              outcome = "success";
              details = `Playlist ${health.expectedContent.sourceId} assigned to screen`;
            } else {
              outcome = "failed";
              details = `Failed: ${assignResult.error}`;
            }
          }
          break;

        case "RESEED_BASELINE":
          if (health.playlist.playlistId) {
            log(correlationId, `Reseeding baseline content to playlist ${health.playlist.playlistId}`, logs);
            try {
              const { ensureAdsPlaylistSeeded } = await import("./yodeckAutopilotHelpers");
              const seedResult = await ensureAdsPlaylistSeeded(parseInt(health.playlist.playlistId));
              logs.push(...seedResult.logs);
              
              if (seedResult.ok) {
                outcome = "success";
                details = `Baseline seeded: ${seedResult.action}`;
              } else {
                outcome = "failed";
                details = `Baseline seed failed: ${seedResult.error}`;
              }
            } catch (seedError: any) {
              outcome = "failed";
              details = `Baseline seed error: ${seedError.message}`;
            }
          } else {
            details = "No playlist ID available for baseline seeding";
            outcome = "skipped";
          }
          break;

        default:
          details = `Action ${actionName} not implemented in repair`;
          outcome = "skipped";
      }
    } catch (error: any) {
      outcome = "failed";
      details = error.message;
    }

    actions.push({
      action: actionName,
      outcome,
      details,
      durationMs: Date.now() - startTime,
    });

    log(correlationId, `Action ${actionName}: ${outcome} - ${details}`, logs);
  }

  // Get final state
  const finalHealth = await getPlaybackHealth(screenId);

  log(correlationId, `Repair complete`, logs);

  return {
    correlationId,
    timestamp,
    screenId,
    actions,
    finalState: {
      playlistItemCount: finalHealth.playlist.itemCount,
      baselineCount: finalHealth.classification.baselineCount,
      adsCount: finalHealth.classification.adsCount,
      POSSIBLE_BLACK_SCREEN: finalHealth.flags.POSSIBLE_BLACK_SCREEN,
    },
    logs,
  };
}

// ============================================================================
// REPLACE AD IN PLAYLIST - SAFE + IDEMPOTENT
// ============================================================================

export interface ReplaceAdResult {
  ok: boolean;
  correlationId: string;
  playlistId: string;
  addedMediaId: number | null;
  removedMediaIds: number[];
  duplicatesRemoved: number;
  finalItemCount: number;
  pushed: boolean;
  error?: string;
  logs: string[];
}

export async function replaceAdInPlaylist(options: {
  playlistId: string;
  newMediaId: number;
  oldMediaIds?: number[];
  screenId?: string;
}): Promise<ReplaceAdResult> {
  const correlationId = generateCorrelationId();
  const logs: string[] = [];
  
  log(correlationId, `Replace ad in playlist ${options.playlistId}: add=${options.newMediaId} remove=${options.oldMediaIds?.join(",") || "none"}`, logs);

  const result: ReplaceAdResult = {
    ok: false,
    correlationId,
    playlistId: options.playlistId,
    addedMediaId: null,
    removedMediaIds: [],
    duplicatesRemoved: 0,
    finalItemCount: 0,
    pushed: false,
    logs,
  };

  // 1. Fetch current playlist items
  const playlistResult = await getYodeckPlaylistItems(options.playlistId);
  if (!playlistResult.ok) {
    result.error = `Failed to fetch playlist: ${playlistResult.error}`;
    return result;
  }

  const currentItems = playlistResult.items;
  log(correlationId, `Current playlist has ${currentItems.length} items`, logs);

  // 2. Check if newMediaId already exists
  const existingNew = currentItems.find((i: any) => i.media === options.newMediaId);
  if (existingNew) {
    log(correlationId, `Media ${options.newMediaId} already in playlist - skipping add`, logs);
  } else {
    // Add new media
    log(correlationId, `Adding media ${options.newMediaId} to playlist`, logs);
    const addResult = await yodeckRequest(`/playlists/${options.playlistId}/items/`, {
      method: "POST",
      body: JSON.stringify({
        media: options.newMediaId,
        duration: 15,
        type: "media",
      }),
    });

    if (addResult.ok) {
      result.addedMediaId = options.newMediaId;
      log(correlationId, `Media ${options.newMediaId} added successfully`, logs);
    } else {
      log(correlationId, `Failed to add media: ${addResult.error}`, logs);
    }
  }

  // 3. Identify duplicates of same media ID
  const mediaIdCounts = new Map<number, number[]>();
  for (const item of currentItems) {
    const mediaId = item.media;
    if (mediaId) {
      if (!mediaIdCounts.has(mediaId)) {
        mediaIdCounts.set(mediaId, []);
      }
      mediaIdCounts.get(mediaId)!.push(item.id);
    }
  }

  // Remove duplicate items (keep first, remove rest)
  for (const [mediaId, itemIds] of Array.from(mediaIdCounts.entries())) {
    if (itemIds.length > 1) {
      const duplicateIds = itemIds.slice(1);
      log(correlationId, `Found ${duplicateIds.length} duplicates of media ${mediaId} - removing`, logs);
      
      for (const itemId of duplicateIds) {
        const deleteResult = await yodeckRequest(`/playlists/${options.playlistId}/items/${itemId}/`, {
          method: "DELETE",
        });
        if (deleteResult.ok) {
          result.duplicatesRemoved++;
        }
      }
    }
  }

  // 4. Remove old media IDs if specified
  if (options.oldMediaIds && options.oldMediaIds.length > 0) {
    for (const oldMediaId of options.oldMediaIds) {
      if (oldMediaId === options.newMediaId) continue; // Don't remove the one we just added
      
      const itemsToRemove = currentItems.filter((i: any) => i.media === oldMediaId);
      for (const item of itemsToRemove) {
        log(correlationId, `Removing old media ${oldMediaId} (item ${item.id})`, logs);
        const deleteResult = await yodeckRequest(`/playlists/${options.playlistId}/items/${item.id}/`, {
          method: "DELETE",
        });
        if (deleteResult.ok) {
          result.removedMediaIds.push(oldMediaId);
        }
      }
    }
  }

  // 5. Verify playlist is non-empty
  const verifyResult = await getYodeckPlaylistItems(options.playlistId);
  result.finalItemCount = verifyResult.items?.length || 0;
  
  if (result.finalItemCount === 0) {
    log(correlationId, `WARNING: Playlist is now empty!`, logs);
    result.error = "Playlist zou leeg zijn - actie afgebroken";
    return result;
  }

  // 6. Push to screen if specified
  if (options.screenId) {
    log(correlationId, `Pushing to screen ${options.screenId}`, logs);
    const pushResult = await yodeckRequest(`/screens/${options.screenId}/push_to_screen/`, {
      method: "POST",
    });
    result.pushed = pushResult.ok;
  }

  result.ok = true;
  log(correlationId, `Replace complete: added=${result.addedMediaId} removed=${result.removedMediaIds.length} deduped=${result.duplicatesRemoved} final=${result.finalItemCount}`, logs);
  
  return result;
}
