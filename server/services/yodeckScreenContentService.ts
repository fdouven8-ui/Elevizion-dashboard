/**
 * yodeckScreenContentService.ts
 * 
 * THE ONLY control path for screen content operations.
 * All code that needs to set screen content (layout/playlist/reset) MUST use this module.
 * 
 * RULES:
 * 1. All operations use Yodeck API v2 screen_content format
 * 2. Legacy PATCH formats (default_playlist_type/default_playlist) are ONLY allowed as 
 *    internal fallback if v2 returns 400/422, and must be logged as FALLBACK_USED
 * 3. Every operation includes: before state, action, after state, verify
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq } from "drizzle-orm";

// Import from existing services
import { 
  yodeckRequest, 
  ensureEmptyResetPlaylist,
  applyLayoutToLocation,
  probeLayoutsSupport 
} from "./yodeckLayoutService";
import { mapYodeckScreen } from "./yodeckScreenMapper";
import { guardCanonicalWrite } from "./yodeckCanonicalService";

export interface ComplianceResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  before: {
    sourceType: string;
    sourceName: string | null;
    isElevizion: boolean;
  };
  after: {
    sourceType: string;
    sourceName: string | null;
    isElevizion: boolean;
  };
  logs: string[];
  verifyAttempts: number;
  finalStatus: "PASS" | "FAIL";
  fallbackUsed: boolean;
  error?: string;
}

/**
 * Get current screen state from Yodeck API
 */
async function getCurrentScreenState(yodeckDeviceId: string): Promise<{
  sourceType: string;
  sourceName: string | null;
  isElevizion: boolean;
  isOnline: boolean | "unknown";
}> {
  const result = await yodeckRequest<any>(`/screens/${yodeckDeviceId}`);
  
  if (!result.ok) {
    return {
      sourceType: "unknown",
      sourceName: null,
      isElevizion: false,
      isOnline: "unknown",
    };
  }
  
  const mapped = mapYodeckScreen(result.data);
  const sourceName = mapped.layoutName || mapped.playlistName || null;
  
  return {
    sourceType: mapped.contentMode,
    sourceName,
    isElevizion: sourceName?.startsWith("Elevizion") || false,
    isOnline: mapped.isOnline,
  };
}

/**
 * ensureComplianceForLocation
 * Main compliance function: ensures baseline + ads + Elevizion layout
 * NOTE: This is a LEGACY path - use yodeckCanonicalService.ensureLocationCompliance instead
 */
export async function ensureComplianceForLocation(locationId: string): Promise<ComplianceResult> {
  const logs: string[] = [];
  let fallbackUsed = false;
  
  // Guard against legacy writes - use ensureLocationCompliance from yodeckCanonicalService instead
  guardCanonicalWrite(`ensureComplianceForLocation for location ${locationId} (legacy path)`);
  
  logs.push(`[Compliance] Starting for location: ${locationId}`);
  
  // Get location from DB
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    return {
      ok: false,
      locationId,
      locationName: "Unknown",
      before: { sourceType: "unknown", sourceName: null, isElevizion: false },
      after: { sourceType: "unknown", sourceName: null, isElevizion: false },
      logs: [...logs, `[Compliance] ERROR: Location not found`],
      verifyAttempts: 0,
      finalStatus: "FAIL",
      fallbackUsed: false,
      error: "Location not found",
    };
  }
  
  if (!location.yodeckDeviceId) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      before: { sourceType: "unknown", sourceName: null, isElevizion: false },
      after: { sourceType: "unknown", sourceName: null, isElevizion: false },
      logs: [...logs, `[Compliance] ERROR: No Yodeck device ID linked`],
      verifyAttempts: 0,
      finalStatus: "FAIL",
      fallbackUsed: false,
      error: "No Yodeck device ID linked",
    };
  }
  
  const yodeckDeviceId = location.yodeckDeviceId;
  logs.push(`[Compliance] Location: ${location.name}, YodeckID: ${yodeckDeviceId}`);
  
  // Get before state
  const beforeState = await getCurrentScreenState(yodeckDeviceId);
  logs.push(`[Compliance] BEFORE: sourceType=${beforeState.sourceType}, sourceName=${beforeState.sourceName}, isElevizion=${beforeState.isElevizion}`);
  
  // Check if layouts are supported
  const layoutsSupported = await probeLayoutsSupport();
  logs.push(`[Compliance] Layouts supported: ${layoutsSupported}`);
  
  if (!layoutsSupported) {
    logs.push(`[Compliance] FALLBACK_USED: Layouts API not available, using playlist mode`);
    fallbackUsed = true;
    return {
      ok: false,
      locationId,
      locationName: location.name,
      before: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
      after: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
      logs: [...logs, `[Compliance] Layouts API not available - cannot ensure compliance`],
      verifyAttempts: 0,
      finalStatus: "FAIL",
      fallbackUsed: true,
      error: "Layouts API not available",
    };
  }
  
  // Use existing applyLayoutToLocation which handles everything
  logs.push(`[Compliance] Applying Elevizion layout...`);
  const layoutResult = await applyLayoutToLocation(locationId);
  logs.push(...layoutResult.logs);
  
  if (!layoutResult.ok) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      before: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
      after: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
      logs,
      verifyAttempts: 0,
      finalStatus: "FAIL",
      fallbackUsed,
      error: layoutResult.error || "Failed to apply layout",
    };
  }
  
  // Verify final state
  await new Promise(r => setTimeout(r, 2000));
  const afterState = await getCurrentScreenState(yodeckDeviceId);
  logs.push(`[Compliance] AFTER: sourceType=${afterState.sourceType}, sourceName=${afterState.sourceName}, isElevizion=${afterState.isElevizion}`);
  
  const success = afterState.sourceType === "layout" && afterState.isElevizion;
  
  return {
    ok: success,
    locationId,
    locationName: location.name,
    before: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
    after: { sourceType: afterState.sourceType, sourceName: afterState.sourceName, isElevizion: afterState.isElevizion },
    logs,
    verifyAttempts: 1,
    finalStatus: success ? "PASS" : "FAIL",
    fallbackUsed,
  };
}

/**
 * forceResetScreen
 * Reset screen to empty playlist
 * NOTE: This is an intentional reset path - allowed before canonical repair
 */
export async function forceResetScreen(locationId: string): Promise<ComplianceResult> {
  const logs: string[] = [];
  let fallbackUsed = false;
  
  // Note: forceReset is allowed because it's called as part of the reset-then-repair flow
  // The guard is here to log when it's called outside canonical context
  guardCanonicalWrite(`forceResetScreen for location ${locationId}`);
  
  logs.push(`[ForceReset] Starting for location: ${locationId}`);
  
  // Get location from DB
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location || !location.yodeckDeviceId) {
    return {
      ok: false,
      locationId,
      locationName: location?.name || "Unknown",
      before: { sourceType: "unknown", sourceName: null, isElevizion: false },
      after: { sourceType: "unknown", sourceName: null, isElevizion: false },
      logs: [...logs, `[ForceReset] ERROR: Location or device not found`],
      verifyAttempts: 0,
      finalStatus: "FAIL",
      fallbackUsed: false,
      error: "Location or device not found",
    };
  }
  
  const yodeckDeviceId = location.yodeckDeviceId;
  
  // Get before state
  const beforeState = await getCurrentScreenState(yodeckDeviceId);
  logs.push(`[ForceReset] BEFORE: sourceType=${beforeState.sourceType}, sourceName=${beforeState.sourceName}`);
  
  // Ensure empty reset playlist exists
  const resetPlaylistResult = await ensureEmptyResetPlaylist();
  logs.push(...resetPlaylistResult.logs);
  
  if (!resetPlaylistResult.ok || !resetPlaylistResult.playlistId) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      before: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
      after: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
      logs,
      verifyAttempts: 0,
      finalStatus: "FAIL",
      fallbackUsed: false,
      error: "Failed to ensure reset playlist",
    };
  }
  
  // Assign reset playlist using v2 format
  logs.push(`[ForceReset] Assigning reset playlist: ${resetPlaylistResult.playlistId}`);
  const patchResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}`, "PATCH", {
    screen_content: {
      source_type: "playlist",
      source_id: parseInt(resetPlaylistResult.playlistId),
    },
  });
  
  if (!patchResult.ok) {
    // Try fallback
    logs.push(`[ForceReset] FALLBACK_USED: v2 failed, trying legacy format`);
    fallbackUsed = true;
    
    const fallbackResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}`, "PATCH", {
      default_playlist_type: "playlist",
      default_playlist: parseInt(resetPlaylistResult.playlistId),
    });
    
    if (!fallbackResult.ok) {
      return {
        ok: false,
        locationId,
        locationName: location.name,
        before: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
        after: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
        logs,
        verifyAttempts: 0,
        finalStatus: "FAIL",
        fallbackUsed: true,
        error: "Failed to assign reset playlist (v2 and legacy both failed)",
      };
    }
    logs.push(`[ForceReset] FALLBACK succeeded`);
  }
  
  // Wait and verify
  await new Promise(r => setTimeout(r, 2000));
  const afterState = await getCurrentScreenState(yodeckDeviceId);
  logs.push(`[ForceReset] AFTER: sourceType=${afterState.sourceType}, sourceName=${afterState.sourceName}`);
  
  const success = afterState.sourceType === "playlist" && (afterState.sourceName?.includes("EMPTY") ?? false);
  
  return {
    ok: success,
    locationId,
    locationName: location.name,
    before: { sourceType: beforeState.sourceType, sourceName: beforeState.sourceName, isElevizion: beforeState.isElevizion },
    after: { sourceType: afterState.sourceType, sourceName: afterState.sourceName, isElevizion: afterState.isElevizion },
    logs,
    verifyAttempts: 1,
    finalStatus: success ? "PASS" : "FAIL",
    fallbackUsed,
  };
}

/**
 * verifyLocation
 * Read current screen state from canonical mapper
 */
export async function verifyLocation(locationId: string): Promise<{
  ok: boolean;
  sourceType: string;
  sourceName: string | null;
  isElevizion: boolean;
  isOnline: boolean | "unknown";
}> {
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location || !location.yodeckDeviceId) {
    return {
      ok: false,
      sourceType: "unknown",
      sourceName: null,
      isElevizion: false,
      isOnline: "unknown",
    };
  }
  
  const state = await getCurrentScreenState(location.yodeckDeviceId);
  return {
    ok: true,
    ...state,
  };
}
