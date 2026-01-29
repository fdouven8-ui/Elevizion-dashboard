/**
 * PlaylistOnlyGuard - Enforces PLAYLIST-ONLY mode across all screens
 * 
 * HARD REQUIREMENT: No screen may ever have source_type="layout"
 * If detected, automatically revert to playlist mode and log audit event.
 */

import { storage } from "../storage";
import { getYodeckToken } from "./yodeckClient";

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
