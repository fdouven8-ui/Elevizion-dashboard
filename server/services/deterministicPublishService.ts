/**
 * DeterministicPublishService - Production-ready E2E publish flow for Elevizion
 * 
 * HARD REQUIREMENTS:
 * - NEVER use Yodeck layout mode for ads
 * - ALL screens MUST run in PLAYLIST mode
 * - Ads are ONLY visible when physically present inside a playlist
 * - If publish is not visible → MUST fail
 * 
 * GOLDEN FLOW:
 * Upload video → validate → approve → publish → screen forced to PLAYLIST mode →
 * baseline playlist ensured → ad media inserted → screen verified → adsCount > 0 → VISIBLE
 */

import crypto from "crypto";
import { db } from "../db";
import { adAssets, screens, locations, placements, contracts } from "@shared/schema";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { yodeckRequest } from "./yodeckLayoutService";
import { storage } from "../storage";

// ============================================================================
// CONSTANTS
// ============================================================================

const PLAYLIST_NAME_PREFIX = "EVZ | SCREEN |";
const BASELINE_CONTENT_TAGS = ["elevizion:baseline", "elevizion:news", "elevizion:weather", "elevizion:info"];
const AD_CONTENT_TAG = "elevizion:ad";

// ============================================================================
// LAYOUT FORBIDDEN ERROR
// ============================================================================

export class LayoutForbiddenError extends Error {
  code = "LAYOUT_FORBIDDEN";
  constructor(message: string) {
    super(`[LAYOUT_FORBIDDEN] ${message}`);
    this.name = "LayoutForbiddenError";
  }
}

export function guardNoLayout(sourceType: string | undefined, context: string): void {
  if (sourceType === "layout") {
    throw new LayoutForbiddenError(
      `${context}: source_type="layout" detected but layouts are permanently forbidden. ` +
      `All screens MUST use playlist mode. Auto-heal required.`
    );
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface PublishTrace {
  correlationId: string;
  timestamp: string;
  advertiserId: string;
  screenId: string;
  sourceTypeBefore: string;
  sourceTypeAfter: string;
  enforcedPlaylistId: number | null;
  playlistMutation: PlaylistMutationResult | null;
  verificationSnapshot: VerificationSnapshot | null;
  outcome: "SUCCESS" | "FAILED" | "PARTIAL";
  failureReason?: string;
  logs: string[];
}

export interface PlaylistMutationResult {
  playlistId: number;
  playlistName: string;
  baselineCount: number;
  adsBefore: number;
  adsAfter: number;
  inserted: string[];
  alreadyPresent: string[];
  totalItems: number;
}

export interface VerificationSnapshot {
  sourceType: string;
  playlistId: number | null;
  adsCount: number;
  containsExpectedMedia: boolean;
  expectedMediaId: number;
  playlistItems: number[];
}

export interface ScreenPublishTarget {
  screenId: string;
  yodeckPlayerId: number;
  locationId: string | null;
  locationName: string | null;
  expectedPlaylistId: number | null;
}

export interface BulkPublishResult {
  correlationId: string;
  timestamp: string;
  advertiserId: string;
  yodeckMediaId: number;
  targetsResolved: number;
  traces: PublishTrace[];
  summary: {
    success: number;
    failed: number;
    screensInPlaylistMode: number;
    adsInserted: number;
  };
  outcome: "SUCCESS" | "PARTIAL" | "FAILED" | "NO_TARGETS";
}

// ============================================================================
// LOGGING
// ============================================================================

function logStep(correlationId: string, step: string, msg: string, logs: string[]): void {
  const entry = `[DeterministicPublish][${correlationId}] ${step}: ${msg}`;
  console.log(entry);
  logs.push(entry);
}

// ============================================================================
// STEP 1: RESOLVE CANONICAL PLAYLIST FOR LOCATION
// ============================================================================

export async function resolveOrCreateCanonicalPlaylist(
  locationId: string,
  locationName: string,
  logs: string[]
): Promise<{ ok: boolean; playlistId: number; playlistName: string; wasCreated: boolean; error?: string }> {
  const expectedName = `${PLAYLIST_NAME_PREFIX} ${locationName}`;
  
  // Check if location already has a canonical playlist ID
  const loc = await storage.getLocation(locationId);
  if (loc?.yodeckPlaylistId) {
    const playlistId = typeof loc.yodeckPlaylistId === "number" 
      ? loc.yodeckPlaylistId 
      : parseInt(String(loc.yodeckPlaylistId), 10);
    
    logs.push(`[CanonicalPlaylist] Location already has playlist ID: ${playlistId}`);
    
    // Verify it exists in Yodeck
    const verifyResult = await yodeckRequest<any>(`/playlists/${playlistId}/`);
    if (verifyResult.ok && verifyResult.data) {
      return { ok: true, playlistId, playlistName: verifyResult.data.name || expectedName, wasCreated: false };
    }
    
    logs.push(`[CanonicalPlaylist] WARNING: Stored playlist ${playlistId} not found in Yodeck, will create new`);
  }
  
  // Search for existing playlist by name
  const searchResult = await yodeckRequest<any[]>(`/playlists/?search=${encodeURIComponent(expectedName)}`);
  if (searchResult.ok && searchResult.data) {
    const match = searchResult.data.find((p: any) => p.name === expectedName);
    if (match) {
      logs.push(`[CanonicalPlaylist] Found existing playlist: ${match.id} "${match.name}"`);
      
      // Update location with this playlist ID
      await db.update(locations)
        .set({ yodeckPlaylistId: match.id })
        .where(eq(locations.id, locationId));
      
      return { ok: true, playlistId: match.id, playlistName: match.name, wasCreated: false };
    }
  }
  
  // Create new canonical playlist
  logs.push(`[CanonicalPlaylist] Creating new playlist: "${expectedName}"`);
  const createResult = await yodeckRequest<any>("/playlists/", "POST", {
    name: expectedName,
    items: [],
  });
  
  if (!createResult.ok || !createResult.data?.id) {
    return { ok: false, playlistId: 0, playlistName: "", wasCreated: false, error: createResult.error || "Failed to create playlist" };
  }
  
  const newPlaylistId = createResult.data.id;
  logs.push(`[CanonicalPlaylist] Created playlist: ${newPlaylistId}`);
  
  // Store in location
  await db.update(locations)
    .set({ yodeckPlaylistId: newPlaylistId })
    .where(eq(locations.id, locationId));
  
  return { ok: true, playlistId: newPlaylistId, playlistName: expectedName, wasCreated: true };
}

// ============================================================================
// STEP 2: PLAYLIST ENFORCER (FORCE SCREEN TO PLAYLIST MODE)
// ============================================================================

export interface ForcePlaylistResult {
  ok: boolean;
  playerId: number;
  desiredPlaylistId: number;
  screenBefore: { source_type: string; source_id: number | null };
  screenAfter: { source_type: string; source_id: number | null };
  wasInLayoutMode: boolean;
  patched: boolean;
  pushed: boolean;
  error?: string;
  logs: string[];
}

/**
 * forceScreenToPlaylistMode - THE PRIMARY FUNCTION FOR ENFORCING PLAYLIST MODE
 * 
 * This function MUST be called at the START of every publish flow.
 * It forces the screen out of layout mode and into playlist mode.
 * 
 * Behavior:
 * 1. GET /screens/{playerId} to read current state
 * 2. If source_type != "playlist" OR source_id != desiredPlaylistId:
 *    - PATCH /screens/{playerId} with {screen_content: {source_type: "playlist", source_id: desiredPlaylistId}}
 *    - POST /screens/{playerId}/push/ to apply changes
 * 3. Log before/after state for audit trail
 */
export async function forceScreenToPlaylistMode(
  yodeckPlayerId: number,
  desiredPlaylistId: number
): Promise<ForcePlaylistResult> {
  const logs: string[] = [];
  const startTime = Date.now();
  
  logs.push(`[PlaylistEnforcer] START forceScreenToPlaylistMode player=${yodeckPlayerId} desiredPlaylist=${desiredPlaylistId}`);
  
  // Step 1: GET current screen state
  const screenResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  if (!screenResult.ok || !screenResult.data) {
    logs.push(`[PlaylistEnforcer] FAILED: Could not fetch screen: ${screenResult.error}`);
    return {
      ok: false,
      playerId: yodeckPlayerId,
      desiredPlaylistId,
      screenBefore: { source_type: "unknown", source_id: null },
      screenAfter: { source_type: "unknown", source_id: null },
      wasInLayoutMode: false,
      patched: false,
      pushed: false,
      error: screenResult.error,
      logs,
    };
  }
  
  const content = screenResult.data.screen_content || {};
  const sourceTypeBefore = content.source_type || "unknown";
  const sourceIdBefore = content.source_id || null;
  const wasInLayoutMode = sourceTypeBefore === "layout";
  
  logs.push(`[PlaylistEnforcer] before={source_type:${sourceTypeBefore}, source_id:${sourceIdBefore}}`);
  
  // Step 2: Check if already correct
  if (sourceTypeBefore === "playlist" && sourceIdBefore === desiredPlaylistId) {
    logs.push(`[PlaylistEnforcer] ALREADY_OK: Screen is already on playlist ${desiredPlaylistId}`);
    return {
      ok: true,
      playerId: yodeckPlayerId,
      desiredPlaylistId,
      screenBefore: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
      screenAfter: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
      wasInLayoutMode: false,
      patched: false,
      pushed: false,
      logs,
    };
  }
  
  // Step 3: LAYOUT DETECTED or wrong playlist - MUST PATCH
  if (wasInLayoutMode) {
    logs.push(`[PlaylistEnforcer] LAYOUT_DETECTED_AND_REMOVING: Screen in FORBIDDEN layout mode, forcing to playlist`);
  } else {
    logs.push(`[PlaylistEnforcer] WRONG_PLAYLIST: Screen on ${sourceTypeBefore}:${sourceIdBefore}, switching to playlist:${desiredPlaylistId}`);
  }
  
  // PATCH to playlist mode with correct ID
  logs.push(`[PlaylistEnforcer] PATCH /screens/${yodeckPlayerId}/ -> {source_type:playlist, source_id:${desiredPlaylistId}}`);
  const patchResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`, "PATCH", {
    screen_content: {
      source_type: "playlist",
      source_id: desiredPlaylistId,
    },
  });
  
  if (!patchResult.ok) {
    logs.push(`[PlaylistEnforcer] PATCH_FAILED: ${patchResult.error}`);
    return {
      ok: false,
      playerId: yodeckPlayerId,
      desiredPlaylistId,
      screenBefore: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
      screenAfter: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
      wasInLayoutMode,
      patched: false,
      pushed: false,
      error: patchResult.error,
      logs,
    };
  }
  
  logs.push(`[PlaylistEnforcer] PATCH_OK`);
  
  // Step 4: Push to apply changes
  logs.push(`[PlaylistEnforcer] POST /screens/${yodeckPlayerId}/push/`);
  const pushResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/push/`, "POST");
  const pushed = pushResult.ok;
  
  if (!pushed) {
    logs.push(`[PlaylistEnforcer] PUSH_WARNING: ${pushResult.error} (continuing anyway)`);
  } else {
    logs.push(`[PlaylistEnforcer] PUSH_OK`);
  }
  
  // Step 5: HARD VERIFICATION - GET again to confirm state change
  logs.push(`[PlaylistEnforcer] VERIFY: GET /screens/${yodeckPlayerId}/ to confirm playlist mode`);
  const verifyResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  
  if (!verifyResult.ok || !verifyResult.data) {
    logs.push(`[PlaylistEnforcer] VERIFY_FAILED: Could not fetch screen for verification`);
    return {
      ok: false,
      playerId: yodeckPlayerId,
      desiredPlaylistId,
      screenBefore: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
      screenAfter: { source_type: "unknown", source_id: null },
      wasInLayoutMode,
      patched: true,
      pushed,
      error: "VERIFY_FAILED: Could not fetch screen for verification",
      logs,
    };
  }
  
  const verifyContent = verifyResult.data.screen_content || {};
  const sourceTypeAfter = verifyContent.source_type || "unknown";
  const sourceIdAfter = verifyContent.source_id || null;
  
  logs.push(`[PlaylistEnforcer] VERIFY: after={source_type:${sourceTypeAfter}, source_id:${sourceIdAfter}}`);
  
  // HARD CHECK: Must be playlist mode with correct ID
  if (sourceTypeAfter !== "playlist") {
    logs.push(`[PlaylistEnforcer] HARD_FAIL: source_type=${sourceTypeAfter} but expected "playlist"`);
    return {
      ok: false,
      playerId: yodeckPlayerId,
      desiredPlaylistId,
      screenBefore: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
      screenAfter: { source_type: sourceTypeAfter, source_id: sourceIdAfter },
      wasInLayoutMode,
      patched: true,
      pushed,
      error: `HARD_FAIL: Screen still in ${sourceTypeAfter} mode after PATCH`,
      logs,
    };
  }
  
  if (sourceIdAfter !== desiredPlaylistId) {
    logs.push(`[PlaylistEnforcer] HARD_FAIL: source_id=${sourceIdAfter} but expected ${desiredPlaylistId}`);
    return {
      ok: false,
      playerId: yodeckPlayerId,
      desiredPlaylistId,
      screenBefore: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
      screenAfter: { source_type: sourceTypeAfter, source_id: sourceIdAfter },
      wasInLayoutMode,
      patched: true,
      pushed,
      error: `HARD_FAIL: Screen on wrong playlist ${sourceIdAfter} instead of ${desiredPlaylistId}`,
      logs,
    };
  }
  
  logs.push(`[PlaylistEnforcer] VERIFY_OK: Screen confirmed on playlist:${desiredPlaylistId}`);
  logs.push(`[PlaylistEnforcer] ${wasInLayoutMode ? "layout → playlist enforced" : "playlist source updated"} (${Date.now() - startTime}ms)`);
  
  return {
    ok: true,
    playerId: yodeckPlayerId,
    desiredPlaylistId,
    screenBefore: { source_type: sourceTypeBefore, source_id: sourceIdBefore },
    screenAfter: { source_type: sourceTypeAfter, source_id: sourceIdAfter },
    wasInLayoutMode,
    patched: true,
    pushed,
    logs,
  };
}

/**
 * enforcePlaylistMode - Wrapper for publishToScreen that returns simple format
 */
export async function enforcePlaylistMode(
  yodeckPlayerId: number,
  expectedPlaylistId: number,
  logs: string[]
): Promise<{ ok: boolean; sourceTypeBefore: string; sourceTypeAfter: string; error?: string }> {
  const result = await forceScreenToPlaylistMode(yodeckPlayerId, expectedPlaylistId);
  
  // Add all logs from the enforcer
  result.logs.forEach(log => logs.push(log));
  
  return {
    ok: result.ok,
    sourceTypeBefore: result.screenBefore.source_type,
    sourceTypeAfter: result.screenAfter.source_type,
    error: result.error,
  };
}

// ============================================================================
// STEP 3: DETERMINISTIC PLAYLIST MUTATION
// ============================================================================

function extractMediaId(item: any): number | null {
  const id = item.media || item.item?.id || item.id;
  return typeof id === "number" ? id : null;
}

export async function updatePlaylistWithAd(
  playlistId: number,
  adMediaId: number,
  logs: string[]
): Promise<PlaylistMutationResult> {
  // Fetch current playlist
  const playlistResult = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  if (!playlistResult.ok || !playlistResult.data) {
    throw new Error(`Failed to fetch playlist ${playlistId}: ${playlistResult.error}`);
  }
  
  const playlist = playlistResult.data;
  const playlistName = playlist.name || `Playlist ${playlistId}`;
  const currentItems: any[] = playlist.items || [];
  
  logs.push(`[PlaylistUpdate] Playlist "${playlistName}" has ${currentItems.length} items`);
  
  // Track existing media IDs for deduplication
  const seenMediaIds = new Set<number>();
  const alreadyPresent: string[] = [];
  const inserted: string[] = [];
  let adAlreadyExists = false;
  
  // Build deduplicated list preserving all existing items
  const dedupedItems: { id: number; type: string; priority: number; duration: number }[] = [];
  let priority = 1;
  
  for (const item of currentItems) {
    const mediaId = extractMediaId(item);
    if (mediaId === null) continue;
    
    // Skip duplicates
    if (seenMediaIds.has(mediaId)) {
      logs.push(`[PlaylistUpdate] Skipping duplicate mediaId=${mediaId}`);
      continue;
    }
    seenMediaIds.add(mediaId);
    
    // Check if this is the ad we're trying to add
    if (mediaId === adMediaId) {
      logs.push(`[PlaylistUpdate] Ad mediaId=${adMediaId} alreadyPresent`);
      alreadyPresent.push(String(adMediaId));
      adAlreadyExists = true;
    }
    
    // Build normalized item using Yodeck v2 format
    dedupedItems.push({
      id: mediaId,
      type: "media",
      priority: priority++,
      duration: item.duration || 15,
    });
  }
  
  // If ad not already present, append it
  if (!adAlreadyExists) {
    logs.push(`[PlaylistUpdate] Ad mediaId=${adMediaId} NOT in playlist, inserting`);
    inserted.push(String(adMediaId));
    dedupedItems.push({
      id: adMediaId,
      type: "media",
      priority: priority++,
      duration: 15,
    });
  }
  
  logs.push(`[PlaylistUpdate] Final: total=${dedupedItems.length} items, inserted=${inserted.length}, alreadyPresent=${alreadyPresent.length}`);
  
  // PATCH playlist with new items if we inserted something
  if (inserted.length > 0) {
    const updateResult = await yodeckRequest<any>(`/playlists/${playlistId}/`, "PATCH", {
      items: dedupedItems,
    });
    
    if (!updateResult.ok) {
      throw new Error(`Failed to update playlist: ${updateResult.error}`);
    }
    
    logs.push(`[PlaylistUpdate] ad inserted`);
  }
  
  return {
    playlistId,
    playlistName,
    baselineCount: dedupedItems.length - (adAlreadyExists ? 1 : inserted.length),
    adsBefore: adAlreadyExists ? 1 : 0,
    adsAfter: 1, // We always have exactly 1 ad (the one we're publishing)
    inserted,
    alreadyPresent,
    totalItems: dedupedItems.length,
  };
}

// ============================================================================
// STEP 4: HARD VERIFICATION (NO SOFT SUCCESS)
// ============================================================================

export async function verifyAdInPlaylist(
  yodeckPlayerId: number,
  expectedPlaylistId: number,
  expectedMediaId: number,
  logs: string[]
): Promise<{ ok: boolean; snapshot: VerificationSnapshot; error?: string }> {
  // Check screen source
  const screenResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  if (!screenResult.ok || !screenResult.data) {
    return {
      ok: false,
      snapshot: {
        sourceType: "unknown",
        playlistId: null,
        adsCount: 0,
        containsExpectedMedia: false,
        expectedMediaId,
        playlistItems: [],
      },
      error: screenResult.error,
    };
  }
  
  const content = screenResult.data.screen_content || {};
  const sourceType = content.source_type || "unknown";
  const sourceId = content.source_id;
  
  // LAYOUT FORBIDDEN GUARD - hard fail on layout detection
  try {
    guardNoLayout(sourceType, `verifyAdInPlaylist screen=${yodeckPlayerId}`);
  } catch (e) {
    logs.push(`[Verify] LAYOUT_FORBIDDEN: ${(e as Error).message}`);
    return {
      ok: false,
      snapshot: {
        sourceType,
        playlistId: sourceId || null,
        adsCount: 0,
        containsExpectedMedia: false,
        expectedMediaId,
        playlistItems: [],
      },
      error: `LAYOUT_FORBIDDEN: Screen ${yodeckPlayerId} in layout mode - ads cannot be visible`,
    };
  }
  
  // VERIFICATION CHECK 1: Must be in playlist mode
  if (sourceType !== "playlist") {
    logs.push(`[Verify] FAILED: source_type="${sourceType}" is not "playlist"`);
    return {
      ok: false,
      snapshot: {
        sourceType,
        playlistId: sourceId || null,
        adsCount: 0,
        containsExpectedMedia: false,
        expectedMediaId,
        playlistItems: [],
      },
      error: `Screen is in ${sourceType} mode, not playlist`,
    };
  }
  
  // VERIFICATION CHECK 2: Must be on expected playlist
  if (sourceId !== expectedPlaylistId) {
    logs.push(`[Verify] FAILED: playlistId=${sourceId} != expected=${expectedPlaylistId}`);
    return {
      ok: false,
      snapshot: {
        sourceType,
        playlistId: sourceId,
        adsCount: 0,
        containsExpectedMedia: false,
        expectedMediaId,
        playlistItems: [],
      },
      error: `Screen on wrong playlist: ${sourceId} vs expected ${expectedPlaylistId}`,
    };
  }
  
  // Fetch playlist items
  const playlistResult = await yodeckRequest<any>(`/playlists/${expectedPlaylistId}/`);
  if (!playlistResult.ok || !playlistResult.data) {
    return {
      ok: false,
      snapshot: {
        sourceType,
        playlistId: expectedPlaylistId,
        adsCount: 0,
        containsExpectedMedia: false,
        expectedMediaId,
        playlistItems: [],
      },
      error: `Failed to fetch playlist items`,
    };
  }
  
  const items = playlistResult.data.items || [];
  const playlistItems: number[] = [];
  let containsExpectedMedia = false;
  
  for (const item of items) {
    const mediaId = extractMediaId(item);
    if (mediaId !== null) {
      playlistItems.push(mediaId);
      if (mediaId === expectedMediaId) {
        containsExpectedMedia = true;
      }
    }
  }
  
  // VERIFICATION CHECK 3: Our specific ad must be in playlist (this is what matters)
  if (!containsExpectedMedia) {
    logs.push(`[Verify] FAILED: mediaId=${expectedMediaId} NOT in playlist items [${playlistItems.join(", ")}]`);
    return {
      ok: false,
      snapshot: {
        sourceType,
        playlistId: expectedPlaylistId,
        adsCount: containsExpectedMedia ? 1 : 0, // Only count the expected ad
        containsExpectedMedia: false,
        expectedMediaId,
        playlistItems,
      },
      error: `Media ${expectedMediaId} not found in playlist`,
    };
  }
  
  // VERIFICATION CHECK 4: Playlist must have at least 1 item (guaranteed if check 3 passed)
  if (playlistItems.length < 1) {
    logs.push(`[Verify] FAILED: playlist is empty`);
    return {
      ok: false,
      snapshot: {
        sourceType,
        playlistId: expectedPlaylistId,
        adsCount: 0,
        containsExpectedMedia,
        expectedMediaId,
        playlistItems,
      },
      error: `Playlist is empty`,
    };
  }
  
  logs.push(`[Verify] SUCCESS: mediaId=${expectedMediaId} found in playlist, totalItems=${playlistItems.length}`);
  
  return {
    ok: true,
    snapshot: {
      sourceType,
      playlistId: expectedPlaylistId,
      adsCount: 1, // We verified 1 ad (the expected one)
      containsExpectedMedia: true,
      expectedMediaId,
      playlistItems,
    },
  };
}

// ============================================================================
// STEP 5: RESOLVE TARGETS AND PLAYABLE ASSET
// ============================================================================

export async function resolveTargetScreens(
  advertiserId: string,
  explicitTargets?: string[]
): Promise<ScreenPublishTarget[]> {
  if (explicitTargets && explicitTargets.length > 0) {
    const targets: ScreenPublishTarget[] = [];
    for (const yodeckPlayerId of explicitTargets) {
      const dbScreens = await db.select().from(screens).where(eq(screens.yodeckPlayerId, yodeckPlayerId));
      const dbScreen = dbScreens[0];
      
      let locationName: string | null = null;
      let expectedPlaylistId: number | null = null;
      
      if (dbScreen?.locationId) {
        const loc = await storage.getLocation(dbScreen.locationId);
        locationName = loc?.name || null;
        if (loc?.yodeckPlaylistId) {
          expectedPlaylistId = typeof loc.yodeckPlaylistId === "number" 
            ? loc.yodeckPlaylistId 
            : parseInt(String(loc.yodeckPlaylistId), 10);
        }
      }
      
      targets.push({
        screenId: dbScreen?.id || yodeckPlayerId,
        yodeckPlayerId: parseInt(yodeckPlayerId, 10),
        locationId: dbScreen?.locationId || null,
        locationName,
        expectedPlaylistId,
      });
    }
    return targets;
  }
  
  // Resolve from placements
  const activePlacements = await db
    .select({ screenId: placements.screenId })
    .from(placements)
    .innerJoin(contracts, eq(placements.contractId, contracts.id))
    .where(and(
      eq(contracts.advertiserId, advertiserId),
      eq(placements.isActive, true)
    ));
  
  if (activePlacements.length === 0) {
    return [];
  }
  
  const screenIds = Array.from(new Set(activePlacements.map(p => p.screenId)));
  const targets: ScreenPublishTarget[] = [];
  
  for (const screenId of screenIds) {
    const dbScreens = await db.select().from(screens).where(eq(screens.id, screenId));
    const dbScreen = dbScreens[0];
    
    if (!dbScreen?.yodeckPlayerId) continue;
    
    let locationName: string | null = null;
    let expectedPlaylistId: number | null = null;
    
    if (dbScreen.locationId) {
      const loc = await storage.getLocation(dbScreen.locationId);
      locationName = loc?.name || null;
      if (loc?.yodeckPlaylistId) {
        expectedPlaylistId = typeof loc.yodeckPlaylistId === "number" 
          ? loc.yodeckPlaylistId 
          : parseInt(String(loc.yodeckPlaylistId), 10);
      }
    }
    
    targets.push({
      screenId: dbScreen.id,
      yodeckPlayerId: parseInt(dbScreen.yodeckPlayerId, 10),
      locationId: dbScreen.locationId,
      locationName,
      expectedPlaylistId,
    });
  }
  
  return targets;
}

export async function resolvePlayableAsset(
  advertiserId: string
): Promise<{ ok: boolean; assetId: string; yodeckMediaId: number; error?: string }> {
  const assets = await db
    .select()
    .from(adAssets)
    .where(eq(adAssets.advertiserId, advertiserId))
    .orderBy(desc(adAssets.createdAt));
  
  if (assets.length === 0) {
    return { ok: false, assetId: "", yodeckMediaId: 0, error: "No assets found for advertiser" };
  }
  
  const readyAsset = assets.find(a => 
    a.yodeckReadinessStatus === "READY_FOR_YODECK" && 
    a.yodeckMediaId && 
    !a.isSuperseded
  );
  
  if (!readyAsset || !readyAsset.yodeckMediaId) {
    return { ok: false, assetId: assets[0].id, yodeckMediaId: 0, error: "No READY_FOR_YODECK asset with yodeckMediaId" };
  }
  
  return { ok: true, assetId: readyAsset.id, yodeckMediaId: readyAsset.yodeckMediaId };
}

// ============================================================================
// MAIN: DETERMINISTIC PUBLISH FOR SINGLE SCREEN
// ============================================================================

export async function publishToScreen(
  advertiserId: string,
  target: ScreenPublishTarget,
  yodeckMediaId: number,
  correlationId: string
): Promise<PublishTrace> {
  const logs: string[] = [];
  const timestamp = new Date().toISOString();
  
  logStep(correlationId, "START", `screen=${target.screenId} player=${target.yodeckPlayerId}`, logs);
  
  // Step 1: Resolve or create canonical playlist for location
  let playlistId = target.expectedPlaylistId;
  let playlistName = "";
  
  if (!playlistId && target.locationId && target.locationName) {
    const playlistResult = await resolveOrCreateCanonicalPlaylist(
      target.locationId,
      target.locationName,
      logs
    );
    
    if (!playlistResult.ok) {
      return {
        correlationId,
        timestamp,
        advertiserId,
        screenId: target.screenId,
        sourceTypeBefore: "unknown",
        sourceTypeAfter: "unknown",
        enforcedPlaylistId: null,
        playlistMutation: null,
        verificationSnapshot: null,
        outcome: "FAILED",
        failureReason: `Failed to resolve canonical playlist: ${playlistResult.error}`,
        logs,
      };
    }
    
    playlistId = playlistResult.playlistId;
    playlistName = playlistResult.playlistName;
  }
  
  if (!playlistId) {
    return {
      correlationId,
      timestamp,
      advertiserId,
      screenId: target.screenId,
      sourceTypeBefore: "unknown",
      sourceTypeAfter: "unknown",
      enforcedPlaylistId: null,
      playlistMutation: null,
      verificationSnapshot: null,
      outcome: "FAILED",
      failureReason: "No canonical playlist found for screen location",
      logs,
    };
  }
  
  // Step 2: Enforce playlist mode
  const enforceResult = await enforcePlaylistMode(target.yodeckPlayerId, playlistId, logs);
  
  if (!enforceResult.ok) {
    return {
      correlationId,
      timestamp,
      advertiserId,
      screenId: target.screenId,
      sourceTypeBefore: enforceResult.sourceTypeBefore,
      sourceTypeAfter: enforceResult.sourceTypeAfter,
      enforcedPlaylistId: playlistId,
      playlistMutation: null,
      verificationSnapshot: null,
      outcome: "FAILED",
      failureReason: `Playlist enforcement failed: ${enforceResult.error}`,
      logs,
    };
  }
  
  // Step 3: Update playlist with ad
  let playlistMutation: PlaylistMutationResult | null = null;
  try {
    playlistMutation = await updatePlaylistWithAd(playlistId, yodeckMediaId, logs);
  } catch (error: any) {
    return {
      correlationId,
      timestamp,
      advertiserId,
      screenId: target.screenId,
      sourceTypeBefore: enforceResult.sourceTypeBefore,
      sourceTypeAfter: enforceResult.sourceTypeAfter,
      enforcedPlaylistId: playlistId,
      playlistMutation: null,
      verificationSnapshot: null,
      outcome: "FAILED",
      failureReason: `Playlist update failed: ${error.message}`,
      logs,
    };
  }
  
  // Step 4: Push screen
  logStep(correlationId, "PUSH", `POST /screens/${target.yodeckPlayerId}/push/`, logs);
  await yodeckRequest<any>(`/screens/${target.yodeckPlayerId}/push/`, "POST");
  
  // Wait for Yodeck to apply
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 5: Hard verification
  const verifyResult = await verifyAdInPlaylist(
    target.yodeckPlayerId,
    playlistId,
    yodeckMediaId,
    logs
  );
  
  if (!verifyResult.ok) {
    // Retry once
    logStep(correlationId, "RETRY", "First verification failed, retrying...", logs);
    await yodeckRequest<any>(`/screens/${target.yodeckPlayerId}/push/`, "POST");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const retryResult = await verifyAdInPlaylist(
      target.yodeckPlayerId,
      playlistId,
      yodeckMediaId,
      logs
    );
    
    if (!retryResult.ok) {
      return {
        correlationId,
        timestamp,
        advertiserId,
        screenId: target.screenId,
        sourceTypeBefore: enforceResult.sourceTypeBefore,
        sourceTypeAfter: enforceResult.sourceTypeAfter,
        enforcedPlaylistId: playlistId,
        playlistMutation,
        verificationSnapshot: retryResult.snapshot,
        outcome: "FAILED",
        failureReason: `Verification failed after retry: ${retryResult.error}`,
        logs,
      };
    }
    
    logStep(correlationId, "SUCCESS", `Retry succeeded, adsCount=${retryResult.snapshot.adsCount}`, logs);
    
    return {
      correlationId,
      timestamp,
      advertiserId,
      screenId: target.screenId,
      sourceTypeBefore: enforceResult.sourceTypeBefore,
      sourceTypeAfter: enforceResult.sourceTypeAfter,
      enforcedPlaylistId: playlistId,
      playlistMutation,
      verificationSnapshot: retryResult.snapshot,
      outcome: "SUCCESS",
      logs,
    };
  }
  
  logStep(correlationId, "SUCCESS", `adsCount=${verifyResult.snapshot.adsCount}, mediaPresent=true`, logs);
  
  return {
    correlationId,
    timestamp,
    advertiserId,
    screenId: target.screenId,
    sourceTypeBefore: enforceResult.sourceTypeBefore,
    sourceTypeAfter: enforceResult.sourceTypeAfter,
    enforcedPlaylistId: playlistId,
    playlistMutation,
    verificationSnapshot: verifyResult.snapshot,
    outcome: "SUCCESS",
    logs,
  };
}

// ============================================================================
// MAIN: BULK PUBLISH TO ALL TARGETS
// ============================================================================

export async function deterministicPublish(
  advertiserId: string,
  targetYodeckPlayerIds?: string[]
): Promise<BulkPublishResult> {
  const correlationId = `dpub-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const timestamp = new Date().toISOString();
  
  console.log(`[DeterministicPublish] ${correlationId} START advertiserId=${advertiserId}`);
  
  // Step 1: Resolve playable asset
  const assetResult = await resolvePlayableAsset(advertiserId);
  if (!assetResult.ok) {
    console.log(`[DeterministicPublish] ${correlationId} FAILED: ${assetResult.error}`);
    return {
      correlationId,
      timestamp,
      advertiserId,
      yodeckMediaId: 0,
      targetsResolved: 0,
      traces: [],
      summary: { success: 0, failed: 0, screensInPlaylistMode: 0, adsInserted: 0 },
      outcome: "FAILED",
    };
  }
  
  const yodeckMediaId = assetResult.yodeckMediaId;
  console.log(`[DeterministicPublish] ${correlationId} asset=${assetResult.assetId} yodeckMediaId=${yodeckMediaId}`);
  
  // Step 2: Resolve target screens
  const targets = await resolveTargetScreens(advertiserId, targetYodeckPlayerIds);
  
  if (targets.length === 0) {
    console.log(`[DeterministicPublish] ${correlationId} NO_TARGETS`);
    return {
      correlationId,
      timestamp,
      advertiserId,
      yodeckMediaId,
      targetsResolved: 0,
      traces: [],
      summary: { success: 0, failed: 0, screensInPlaylistMode: 0, adsInserted: 0 },
      outcome: "NO_TARGETS",
    };
  }
  
  console.log(`[DeterministicPublish] ${correlationId} targets=${targets.length}`);
  
  // Step 3: Publish to each screen
  const traces: PublishTrace[] = [];
  let success = 0;
  let failed = 0;
  let screensInPlaylistMode = 0;
  let adsInserted = 0;
  
  for (const target of targets) {
    const trace = await publishToScreen(advertiserId, target, yodeckMediaId, correlationId);
    traces.push(trace);
    
    if (trace.outcome === "SUCCESS") {
      success++;
      if (trace.sourceTypeAfter === "playlist") screensInPlaylistMode++;
      if (trace.playlistMutation?.inserted.length) adsInserted += trace.playlistMutation.inserted.length;
    } else {
      failed++;
    }
  }
  
  const outcome = success === targets.length ? "SUCCESS" : success > 0 ? "PARTIAL" : "FAILED";
  
  console.log(`[DeterministicPublish] ${correlationId} DONE success=${success} failed=${failed} outcome=${outcome}`);
  
  return {
    correlationId,
    timestamp,
    advertiserId,
    yodeckMediaId,
    targetsResolved: targets.length,
    traces,
    summary: {
      success,
      failed,
      screensInPlaylistMode,
      adsInserted,
    },
    outcome,
  };
}
