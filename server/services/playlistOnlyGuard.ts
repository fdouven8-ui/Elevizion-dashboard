/**
 * PlaylistOnlyGuard - Enforces PLAYLIST-ONLY mode across all screens
 * 
 * HARD REQUIREMENT: No screen may ever have source_type="layout"
 * If detected, automatically revert to playlist mode and log audit event.
 * 
 * CONFIG FLAG: PLAYLIST_ONLY_MODE (default: true)
 * When true:
 * - Never set source_type=layout
 * - Never select layoutId as the effective source
 * - All screens must be driven by playlist source_id
 */

import { storage } from "../storage";
import { getYodeckToken } from "./yodeckClient";
import { db } from "../db";
import { screens, locations } from "@shared/schema";
import { eq } from "drizzle-orm";

// Global config flag - always ON to enforce playlist-only mode
export const PLAYLIST_ONLY_MODE = true;

// ============================================================================
// TYPES
// ============================================================================

export interface ScreenSourceResolution {
  expected: {
    type: "playlist";
    id: number;
    name?: string;
    source: "db_screen" | "db_location" | "fallback";
  } | null;
  actual: {
    type: "playlist" | "layout" | "schedule" | "unknown";
    id: number | null;
    name?: string;
  };
  mismatch: boolean;
  mismatchReason?: string;
}

export interface AutoHealTrace {
  correlationId: string;
  playerId: number;
  steps: {
    step: string;
    status: "success" | "failed" | "skipped";
    duration_ms: number;
    details: Record<string, any>;
  }[];
  beforeSnapshot: ScreenSourceResolution;
  afterSnapshot: ScreenSourceResolution | null;
  outcome: "HEALED" | "ALREADY_OK" | "HEAL_FAILED" | "NO_EXPECTED_PLAYLIST";
  error?: string;
}

export interface LayoutDetectionResult {
  screenId: number;
  wasLayout: boolean;
  revertedToPlaylist: boolean;
  playlistId: number | null;
  error?: string;
  auditLog: string[];
}

export interface GuardCheckResult {
  screensChecked: number;
  layoutsDetected: number;
  layoutsReverted: number;
  errors: number;
  details: LayoutDetectionResult[];
}

async function yodeckGet(endpoint: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const token = await getYodeckToken();
    if (!token.isValid || !token.value) {
      return { ok: false, error: "Invalid Yodeck token" };
    }
    
    const response = await fetch(`https://app.yodeck.com/api/v2${endpoint}`, {
      method: "GET",
      headers: {
        "Authorization": `Token ${token.label}:${token.value}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function yodeckPatch(endpoint: string, payload: any): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const token = await getYodeckToken();
    if (!token.isValid || !token.value) {
      return { ok: false, error: "Invalid Yodeck token" };
    }
    
    const response = await fetch(`https://app.yodeck.com/api/v2${endpoint}`, {
      method: "PATCH",
      headers: {
        "Authorization": `Token ${token.label}:${token.value}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${text}` };
    }
    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

async function yodeckPost(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = await getYodeckToken();
    if (!token.isValid || !token.value) {
      return { ok: false, error: "Invalid Yodeck token" };
    }
    
    const response = await fetch(`https://app.yodeck.com/api/v2${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${token.label}:${token.value}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

export async function checkAndRevertLayoutMode(yodeckScreenId: number, expectedPlaylistId?: number): Promise<LayoutDetectionResult> {
  const auditLog: string[] = [];
  auditLog.push(`[PlaylistGuard] Checking screen ${yodeckScreenId}`);
  
  const screenResult = await yodeckGet(`/screens/${yodeckScreenId}/`);
  if (!screenResult.ok) {
    auditLog.push(`[PlaylistGuard] ERROR: Failed to fetch screen: ${screenResult.error}`);
    return {
      screenId: yodeckScreenId,
      wasLayout: false,
      revertedToPlaylist: false,
      playlistId: null,
      error: screenResult.error,
      auditLog,
    };
  }

  const screen = screenResult.data;
  const content = screen.screen_content || {};
  const sourceType = content.source_type;
  const sourceId = content.source_id;

  auditLog.push(`[PlaylistGuard] Current source_type=${sourceType}, source_id=${sourceId}`);

  if (sourceType !== "layout") {
    auditLog.push(`[PlaylistGuard] OK: Screen is not in layout mode`);
    return {
      screenId: yodeckScreenId,
      wasLayout: false,
      revertedToPlaylist: false,
      playlistId: sourceType === "playlist" ? sourceId : null,
      auditLog,
    };
  }

  auditLog.push(`[PlaylistGuard] LAYOUT_DETECTED_AND_REMOVING - reverting to playlist mode`);

  const targetPlaylistId = expectedPlaylistId || await findCanonicalPlaylist(yodeckScreenId);
  
  if (!targetPlaylistId) {
    auditLog.push(`[PlaylistGuard] ERROR: No canonical playlist found for screen`);
    return {
      screenId: yodeckScreenId,
      wasLayout: true,
      revertedToPlaylist: false,
      playlistId: null,
      error: "No canonical playlist found",
      auditLog,
    };
  }

  const patchPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: targetPlaylistId,
    },
  };

  auditLog.push(`[PlaylistGuard] PATCH /screens/${yodeckScreenId}/ with playlist ${targetPlaylistId}`);
  const patchResult = await yodeckPatch(`/screens/${yodeckScreenId}/`, patchPayload);
  
  if (!patchResult.ok) {
    auditLog.push(`[PlaylistGuard] ERROR: Failed to revert: ${patchResult.error}`);
    return {
      screenId: yodeckScreenId,
      wasLayout: true,
      revertedToPlaylist: false,
      playlistId: null,
      error: patchResult.error,
      auditLog,
    };
  }

  auditLog.push(`[PlaylistGuard] POST /screens/${yodeckScreenId}/push/ to apply changes`);
  const pushResult = await yodeckPost(`/screens/${yodeckScreenId}/push/`);
  
  if (!pushResult.ok) {
    auditLog.push(`[PlaylistGuard] WARNING: Push failed: ${pushResult.error}`);
  } else {
    auditLog.push(`[PlaylistGuard] Push successful`);
  }

  auditLog.push(`[PlaylistGuard] LAYOUT_DETECTED_AND_REMOVED - screen now on playlist ${targetPlaylistId}`);
  
  return {
    screenId: yodeckScreenId,
    wasLayout: true,
    revertedToPlaylist: true,
    playlistId: targetPlaylistId,
    auditLog,
  };
}

async function findCanonicalPlaylist(yodeckScreenId: number): Promise<number | null> {
  const screens = await storage.getAllScreens();
  const screen = screens.find(s => s.yodeckPlayerId === String(yodeckScreenId));
  
  if (screen?.playlistId) {
    return parseInt(screen.playlistId, 10);
  }

  if (screen?.locationId) {
    const location = await storage.getLocation(screen.locationId);
    if (location?.yodeckPlaylistId) {
      return location.yodeckPlaylistId;
    }
  }

  return null;
}

export async function runPlaylistGuardForAllScreens(): Promise<GuardCheckResult> {
  const screens = await storage.getScreens();
  const results: LayoutDetectionResult[] = [];
  let layoutsDetected = 0;
  let layoutsReverted = 0;
  let errors = 0;

  for (const screen of screens) {
    if (!screen.yodeckPlayerId) continue;
    
    const yodeckId = parseInt(screen.yodeckPlayerId, 10);
    if (isNaN(yodeckId)) continue;

    const expectedPlaylistId = screen.playlistId ? parseInt(screen.playlistId, 10) : undefined;
    const result = await checkAndRevertLayoutMode(yodeckId, expectedPlaylistId);
    results.push(result);

    if (result.wasLayout) layoutsDetected++;
    if (result.revertedToPlaylist) layoutsReverted++;
    if (result.error) errors++;
  }

  return {
    screensChecked: results.length,
    layoutsDetected,
    layoutsReverted,
    errors,
    details: results,
  };
}

export async function ensurePlaylistMode(yodeckScreenId: number, playlistId: number): Promise<{ ok: boolean; pushed: boolean; error?: string }> {
  const patchPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: playlistId,
    },
  };

  console.log(`[PlaylistGuard] Ensuring screen ${yodeckScreenId} is on playlist ${playlistId}`);
  
  const patchResult = await yodeckPatch(`/screens/${yodeckScreenId}/`, patchPayload);
  if (!patchResult.ok) {
    console.error(`[PlaylistGuard] Failed to set playlist: ${patchResult.error}`);
    return { ok: false, pushed: false, error: patchResult.error };
  }

  const pushResult = await yodeckPost(`/screens/${yodeckScreenId}/push/`);
  if (!pushResult.ok) {
    console.warn(`[PlaylistGuard] Push warning: ${pushResult.error}`);
    return { ok: true, pushed: false, error: pushResult.error };
  }

  console.log(`[PlaylistGuard] Screen ${yodeckScreenId} now playing playlist ${playlistId}`);
  return { ok: true, pushed: true };
}

export function isLayoutSourceType(sourceType: string | null | undefined): boolean {
  return sourceType === "layout";
}

// ============================================================================
// CORE: SINGLE SOURCE OF TRUTH RESOLVER
// ============================================================================

/**
 * resolveEffectiveScreenSource - Single source of truth for screen content source
 * 
 * Returns:
 * - expected: What the screen SHOULD be playing (always playlist if PLAYLIST_ONLY_MODE)
 * - actual: What the screen is ACTUALLY playing (from Yodeck API)
 * - mismatch: true if actual != expected
 */
export async function resolveEffectiveScreenSource(
  yodeckPlayerId: number
): Promise<ScreenSourceResolution> {
  // 1. Get actual source from Yodeck
  const screenResult = await yodeckGet(`/screens/${yodeckPlayerId}/`);
  
  let actual: ScreenSourceResolution["actual"] = {
    type: "unknown",
    id: null,
  };
  
  if (screenResult.ok && screenResult.data) {
    const content = screenResult.data.screen_content || {};
    const sourceType = content.source_type || "unknown";
    const sourceId = content.source_id;
    const sourceName = content.source_name;
    
    actual = {
      type: sourceType as any,
      id: typeof sourceId === "number" ? sourceId : (sourceId ? parseInt(sourceId, 10) : null),
      name: sourceName,
    };
  }
  
  // 2. Determine expected source (always playlist in PLAYLIST_ONLY_MODE)
  let expected: ScreenSourceResolution["expected"] = null;
  
  // First check our DB for screen.playlistId
  const dbScreens = await db
    .select()
    .from(screens)
    .where(eq(screens.yodeckPlayerId, String(yodeckPlayerId)));
  
  const dbScreen = dbScreens[0];
  
  if (dbScreen?.playlistId) {
    expected = {
      type: "playlist",
      id: parseInt(dbScreen.playlistId, 10),
      source: "db_screen",
    };
  } else if (dbScreen?.locationId) {
    // Fallback to location's canonical playlist
    const locs = await db
      .select()
      .from(locations)
      .where(eq(locations.id, dbScreen.locationId));
    
    const loc = locs[0];
    if (loc?.yodeckPlaylistId) {
      expected = {
        type: "playlist",
        id: loc.yodeckPlaylistId,
        source: "db_location",
      };
    }
  }
  
  // 3. Compute mismatch
  let mismatch = false;
  let mismatchReason: string | undefined;
  
  if (PLAYLIST_ONLY_MODE) {
    if (actual.type !== "playlist") {
      mismatch = true;
      mismatchReason = `actual.type="${actual.type}" but PLAYLIST_ONLY_MODE requires "playlist"`;
    } else if (expected && actual.id !== expected.id) {
      mismatch = true;
      mismatchReason = `actual.id=${actual.id} != expected.id=${expected.id}`;
    }
  }
  
  return {
    expected,
    actual,
    mismatch,
    mismatchReason,
  };
}

// ============================================================================
// CORE: AUTO-HEAL MISMATCH (layout -> playlist)
// ============================================================================

/**
 * ensurePlayerUsesExpectedPlaylist - Auto-heal screen to use expected playlist
 * 
 * If actual.type != "playlist" OR actual.id != expectedPlaylistId:
 * 1. PATCH screen to use playlist source
 * 2. Push to screen
 * 3. Re-fetch and verify mismatch=false
 * 
 * Returns detailed trace for debugging
 */
export async function ensurePlayerUsesExpectedPlaylist(
  yodeckPlayerId: number,
  expectedPlaylistId: number,
  correlationId: string
): Promise<AutoHealTrace> {
  const startTime = Date.now();
  const steps: AutoHealTrace["steps"] = [];
  
  console.log(`[EnforcePlaylist] ${correlationId} player=${yodeckPlayerId} expectedPlaylist=${expectedPlaylistId}`);
  
  // Step 1: Get current state (before snapshot)
  const step1Start = Date.now();
  const beforeSnapshot = await resolveEffectiveScreenSource(yodeckPlayerId);
  steps.push({
    step: "resolve_before",
    status: "success",
    duration_ms: Date.now() - step1Start,
    details: {
      actualType: beforeSnapshot.actual.type,
      actualId: beforeSnapshot.actual.id,
      expectedId: expectedPlaylistId,
      mismatch: beforeSnapshot.mismatch,
    },
  });
  
  console.log(`[EnforcePlaylist] ${correlationId} actual=${beforeSnapshot.actual.type}:${beforeSnapshot.actual.id} expected=playlist:${expectedPlaylistId} -> ${beforeSnapshot.mismatch ? "MISMATCH" : "OK"}`);
  
  // Check if already OK
  if (beforeSnapshot.actual.type === "playlist" && beforeSnapshot.actual.id === expectedPlaylistId) {
    console.log(`[EnforcePlaylist] ${correlationId} outcome=ALREADY_OK`);
    return {
      correlationId,
      playerId: yodeckPlayerId,
      steps,
      beforeSnapshot,
      afterSnapshot: beforeSnapshot,
      outcome: "ALREADY_OK",
    };
  }
  
  // Step 2: PATCH to playlist mode
  const step2Start = Date.now();
  const patchPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: expectedPlaylistId,
    },
  };
  
  console.log(`[EnforcePlaylist] ${correlationId} PATCH /screens/${yodeckPlayerId}/ with playlist ${expectedPlaylistId}`);
  const patchResult = await yodeckPatch(`/screens/${yodeckPlayerId}/`, patchPayload);
  
  if (!patchResult.ok) {
    steps.push({
      step: "patch_playlist",
      status: "failed",
      duration_ms: Date.now() - step2Start,
      details: { error: patchResult.error },
    });
    console.error(`[EnforcePlaylist] ${correlationId} outcome=HEAL_FAILED error=${patchResult.error}`);
    return {
      correlationId,
      playerId: yodeckPlayerId,
      steps,
      beforeSnapshot,
      afterSnapshot: null,
      outcome: "HEAL_FAILED",
      error: patchResult.error,
    };
  }
  
  steps.push({
    step: "patch_playlist",
    status: "success",
    duration_ms: Date.now() - step2Start,
    details: { playlistId: expectedPlaylistId },
  });
  
  // Step 3: Push to screen
  const step3Start = Date.now();
  const pushResult = await yodeckPost(`/screens/${yodeckPlayerId}/push/`);
  steps.push({
    step: "push_screen",
    status: pushResult.ok ? "success" : "failed",
    duration_ms: Date.now() - step3Start,
    details: { error: pushResult.error },
  });
  
  if (!pushResult.ok) {
    console.warn(`[EnforcePlaylist] ${correlationId} push_warning=${pushResult.error}`);
  }
  
  // Step 4: Verify after snapshot
  const step4Start = Date.now();
  await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for Yodeck to update
  const afterSnapshot = await resolveEffectiveScreenSource(yodeckPlayerId);
  
  const healed = afterSnapshot.actual.type === "playlist" && afterSnapshot.actual.id === expectedPlaylistId;
  steps.push({
    step: "verify_after",
    status: healed ? "success" : "failed",
    duration_ms: Date.now() - step4Start,
    details: {
      actualType: afterSnapshot.actual.type,
      actualId: afterSnapshot.actual.id,
      healed,
    },
  });
  
  if (healed) {
    console.log(`[EnforcePlaylist] ${correlationId} outcome=HEALED from=${beforeSnapshot.actual.type}:${beforeSnapshot.actual.id} to=playlist:${expectedPlaylistId}`);
    return {
      correlationId,
      playerId: yodeckPlayerId,
      steps,
      beforeSnapshot,
      afterSnapshot,
      outcome: "HEALED",
    };
  } else {
    console.error(`[EnforcePlaylist] ${correlationId} outcome=HEAL_FAILED verify_failed actual=${afterSnapshot.actual.type}:${afterSnapshot.actual.id}`);
    return {
      correlationId,
      playerId: yodeckPlayerId,
      steps,
      beforeSnapshot,
      afterSnapshot,
      outcome: "HEAL_FAILED",
      error: `Verification failed: expected playlist:${expectedPlaylistId}, got ${afterSnapshot.actual.type}:${afterSnapshot.actual.id}`,
    };
  }
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * healAllMismatchedScreens - Run auto-heal on all screens with mismatches
 */
export async function healAllMismatchedScreens(): Promise<{
  screensChecked: number;
  mismatchesFound: number;
  healed: number;
  failed: number;
  traces: AutoHealTrace[];
}> {
  const allScreens = await storage.getScreens();
  const traces: AutoHealTrace[] = [];
  let mismatchesFound = 0;
  let healed = 0;
  let failed = 0;
  
  for (const screen of allScreens) {
    if (!screen.yodeckPlayerId) continue;
    
    const yodeckId = parseInt(screen.yodeckPlayerId, 10);
    if (isNaN(yodeckId)) continue;
    
    const resolution = await resolveEffectiveScreenSource(yodeckId);
    
    if (resolution.mismatch && resolution.expected) {
      mismatchesFound++;
      const correlationId = `heal-${Date.now()}-${yodeckId}`;
      const trace = await ensurePlayerUsesExpectedPlaylist(yodeckId, resolution.expected.id, correlationId);
      traces.push(trace);
      
      if (trace.outcome === "HEALED") healed++;
      else failed++;
    }
  }
  
  return {
    screensChecked: allScreens.filter(s => s.yodeckPlayerId).length,
    mismatchesFound,
    healed,
    failed,
    traces,
  };
}
