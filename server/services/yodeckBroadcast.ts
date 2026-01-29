/**
 * YODECK BROADCAST SERVICE
 * 
 * PLAYLIST-ONLY ARCHITECTURE
 * Each screen has exactly 1 playlist. This is the SINGLE SOURCE OF TRUTH.
 * No layouts, no schedules, no tags.
 * 
 * Template: YODECK_TEMPLATE_PLAYLIST_ID contains the 4 base items.
 * New screens clone this template and get their own dedicated playlist.
 */

import { db } from "../db";
import { screens } from "@shared/schema";
import { eq, isNotNull } from "drizzle-orm";
import { getYodeckToken } from "./yodeckClient";
import { 
  BASELINE_PLAYLIST_NAME, 
  BASELINE_MEDIA_IDS, 
  MIN_BASELINE_COUNT,
  getScreenPlaylistName
} from "../config/contentPipeline";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

async function yodeckRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = await getYodeckToken();
  if (!token.isValid || !token.value) {
    return { ok: false, error: token.error || "YODECK_AUTH_TOKEN not configured" };
  }

  try {
    const response = await fetch(`${YODECK_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Authorization": `Token ${token.value}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    
    // Detect HTML responses (auth failure, session expired, etc.)
    if (!contentType.includes("application/json") || text.trim().startsWith("<")) {
      const preview = text.substring(0, 200);
      console.error(`[YodeckAPI] Non-JSON response: status=${response.status}, contentType=${contentType}, preview=${preview}`);
      return { 
        ok: false, 
        error: `Yodeck returned HTML instead of JSON (status ${response.status}). This may indicate auth failure or session expiry.` 
      };
    }

    if (!response.ok) {
      return { ok: false, error: `Yodeck API error ${response.status}: ${text}` };
    }

    try {
      const data = JSON.parse(text);
      return { ok: true, data };
    } catch (parseError) {
      console.error(`[YodeckAPI] JSON parse error: ${text.substring(0, 200)}`);
      return { ok: false, error: "Yodeck returned invalid JSON" };
    }
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

// =============================================================================
// YODECK HELPERS
// =============================================================================

export interface ScreenSource {
  sourceType: string;
  sourceId: string | null;
  sourceName: string | null;
}

/**
 * Get the current content source of a Yodeck screen
 */
export async function yodeckGetScreenSource(yodeckPlayerId: string): Promise<{ ok: boolean; source?: ScreenSource; error?: string }> {
  const result = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  const content = result.data.screen_content;
  return {
    ok: true,
    source: {
      sourceType: content?.source_type || "unknown",
      sourceId: content?.source_id ? String(content.source_id) : null,
      sourceName: content?.source_name || null,
    },
  };
}

/**
 * Set a Yodeck screen to play a specific playlist
 */
export async function yodeckSetScreenPlaylist(
  yodeckPlayerId: string,
  playlistId: string
): Promise<{ ok: boolean; verified: boolean; error?: string }> {
  console.log(`[YodeckBroadcast] Setting screen ${yodeckPlayerId} to playlist ${playlistId}`);

  const patchResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`, {
    method: "PATCH",
    body: JSON.stringify({
      screen_content: {
        source_type: "playlist",
        source_id: Number(playlistId),
      },
    }),
  });

  if (!patchResult.ok) {
    return { ok: false, verified: false, error: patchResult.error };
  }

  // Verify the change
  const verifyResult = await yodeckGetScreenSource(yodeckPlayerId);
  if (!verifyResult.ok || !verifyResult.source) {
    return { ok: true, verified: false, error: "Could not verify after PATCH" };
  }

  const verified =
    verifyResult.source.sourceType === "playlist" &&
    verifyResult.source.sourceId === playlistId;

  if (!verified) {
    console.warn(`[YodeckBroadcast] Verification failed: expected playlist/${playlistId}, got ${verifyResult.source.sourceType}/${verifyResult.source.sourceId}`);
  }

  return { ok: true, verified };
}

/**
 * Get items from a Yodeck playlist
 */
export async function yodeckGetPlaylistItems(playlistId: string): Promise<{ ok: boolean; items?: number[]; error?: string }> {
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  const items = result.data.items || [];
  const mediaIds = items.map((item: any) => {
    if (typeof item === "number") return item;
    if (item?.id) return item.id;
    if (item?.media_id) return item.media_id;
    return null;
  }).filter((id: number | null) => id !== null);

  return { ok: true, items: mediaIds };
}

/**
 * Add a media item to a playlist
 */
export async function yodeckAddMediaToPlaylist(
  playlistId: string,
  mediaId: number
): Promise<{ ok: boolean; error?: string }> {
  console.log(`[YodeckBroadcast] Adding media ${mediaId} to playlist ${playlistId}`);

  // First get current items
  const current = await yodeckGetPlaylistItems(playlistId);
  if (!current.ok) {
    console.warn(`[YodeckBroadcast] Failed to get current items: ${current.error}`);
    return { ok: false, error: current.error };
  }

  const currentItems = current.items || [];
  
  // Check for duplicates
  if (currentItems.includes(mediaId)) {
    console.log(`[YodeckBroadcast] Media ${mediaId} already in playlist ${playlistId}, skipping`);
    return { ok: true };
  }

  // Add the new item - Yodeck API requires "id" and "type": "media" fields
  const newItems = [...currentItems, mediaId];
  
  const patchPayload = {
    items: newItems.map((id, index) => ({ id, type: "media", priority: index + 1 })),
  };
  
  console.log(`[YodeckBroadcast] PATCH payload: ${JSON.stringify(patchPayload)}`);
  
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`, {
    method: "PATCH",
    body: JSON.stringify(patchPayload),
  });

  if (!result.ok) {
    console.warn(`[YodeckBroadcast] PATCH failed: ${result.error}`);
    return { ok: false, error: result.error };
  }

  console.log(`[YodeckBroadcast] Successfully added media ${mediaId} to playlist ${playlistId}`);
  return { ok: true };
}

/**
 * Clone a playlist from template
 */
export async function yodeckClonePlaylistFromTemplate(
  templatePlaylistId: string,
  newName: string
): Promise<{ ok: boolean; playlistId?: string; error?: string }> {
  console.log(`[YodeckBroadcast] Cloning template ${templatePlaylistId} as "${newName}"`);

  // Get template items
  const templateItems = await yodeckGetPlaylistItems(templatePlaylistId);
  if (!templateItems.ok || !templateItems.items) {
    return { ok: false, error: `Failed to get template items: ${templateItems.error}` };
  }

  // Step 1: Create empty playlist first
  const createPayload = {
    name: newName,
    type: "regular",
    items: [] as any[],
    add_gaps: false,
    shuffle_content: false,
  };
  
  console.log(`[YodeckBroadcast] Creating playlist with payload: ${JSON.stringify(createPayload)}`);
  
  const createResult = await yodeckRequest<any>("/playlists/", {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  if (!createResult.ok || !createResult.data?.id) {
    return { ok: false, error: `Failed to create playlist: ${createResult.error}` };
  }

  const newPlaylistId = String(createResult.data.id);
  console.log(`[YodeckBroadcast] Created empty playlist ${newPlaylistId}`);

  // Step 2: Add items via PATCH (format: id, type, priority)
  if (templateItems.items.length > 0) {
    const patchPayload = {
      items: templateItems.items.map((id, index) => ({ id, type: "media", priority: index + 1 })),
    };
    
    console.log(`[YodeckBroadcast] Adding ${templateItems.items.length} items to playlist ${newPlaylistId}`);
    
    const patchResult = await yodeckRequest<any>(`/playlists/${newPlaylistId}/`, {
      method: "PATCH",
      body: JSON.stringify(patchPayload),
    });
    
    if (!patchResult.ok) {
      console.warn(`[YodeckBroadcast] Failed to add items to playlist: ${patchResult.error}`);
      // Continue anyway - empty playlist is better than nothing
    } else {
      console.log(`[YodeckBroadcast] Added ${templateItems.items.length} items successfully`);
    }
  }

  return { ok: true, playlistId: newPlaylistId };
}

// =============================================================================
// CORE LOGIC
// =============================================================================

export interface EnsurePlaylistResult {
  ok: boolean;
  playlistId: string | null;
  created: boolean;
  itemCount: number;
  error?: string;
}

/**
 * Ensure a screen has a playlist assigned.
 * If not, clone from template and assign.
 */
export async function ensureScreenPlaylist(screenId: string): Promise<EnsurePlaylistResult> {
  const templateId = process.env.YODECK_TEMPLATE_PLAYLIST_ID;
  if (!templateId) {
    return { ok: false, playlistId: null, created: false, itemCount: 0, error: "YODECK_TEMPLATE_PLAYLIST_ID not configured" };
  }

  // Get screen from DB
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  if (!screen) {
    return { ok: false, playlistId: null, created: false, itemCount: 0, error: "Screen not found" };
  }

  let playlistId = screen.playlistId;
  let created = false;

  // If no playlist, clone from template
  if (!playlistId) {
    const playlistName = `Elevizion | Screen | ${screen.yodeckPlayerId || screen.screenId}`;
    const cloneResult = await yodeckClonePlaylistFromTemplate(templateId, playlistName);
    
    if (!cloneResult.ok || !cloneResult.playlistId) {
      return { ok: false, playlistId: null, created: false, itemCount: 0, error: cloneResult.error };
    }

    playlistId = cloneResult.playlistId;
    created = true;

    // Save to DB including sync status
    await db.update(screens).set({
      playlistId,
      playlistName,
      yodeckSyncStatus: screen.yodeckPlayerId ? "linked" : "not_linked",
      updatedAt: new Date(),
    }).where(eq(screens.id, screenId));

    console.log(`[YodeckBroadcast] Created playlist ${playlistId} for screen ${screenId}`);
  }

  // Verify playlist has items
  const items = await yodeckGetPlaylistItems(playlistId);
  const itemCount = items.items?.length || 0;

  let finalItemCount = itemCount;
  
  if (itemCount === 0) {
    console.warn(`[YodeckBroadcast] Playlist ${playlistId} is empty, re-seeding from template`);
    const templateItems = await yodeckGetPlaylistItems(templateId);
    if (templateItems.ok && templateItems.items && templateItems.items.length > 0) {
      let addedCount = 0;
      for (const mediaId of templateItems.items) {
        const addResult = await yodeckAddMediaToPlaylist(playlistId, mediaId);
        if (addResult.ok) addedCount++;
      }
      console.log(`[YodeckBroadcast] Re-seeded ${addedCount}/${templateItems.items.length} items to playlist ${playlistId}`);
      
      // Re-fetch to get actual count
      const refetch = await yodeckGetPlaylistItems(playlistId);
      finalItemCount = refetch.items?.length || addedCount;
    }
  }

  return { ok: true, playlistId, created, itemCount: finalItemCount };
}

export interface PushResult {
  ok: boolean;
  playlistId: string | null;
  verified: boolean;
  actualSource?: ScreenSource;
  error?: string;
  logs: string[];
}

/**
 * Push a screen's playlist to Yodeck and verify
 */
export async function pushScreen(screenId: string): Promise<PushResult> {
  const logs: string[] = [];
  logs.push(`[PushScreen] Starting for ${screenId}`);

  // Ensure playlist exists
  const ensureResult = await ensureScreenPlaylist(screenId);
  if (!ensureResult.ok || !ensureResult.playlistId) {
    logs.push(`[PushScreen] Failed to ensure playlist: ${ensureResult.error}`);
    return { ok: false, playlistId: null, verified: false, logs, error: ensureResult.error };
  }

  const playlistId = ensureResult.playlistId;
  logs.push(`[PushScreen] Using playlist ${playlistId} (created=${ensureResult.created}, items=${ensureResult.itemCount})`);

  // Get screen from DB
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  if (!screen?.yodeckPlayerId) {
    logs.push(`[PushScreen] Screen has no yodeckPlayerId`);
    return { ok: false, playlistId, verified: false, logs, error: "Screen has no Yodeck player ID" };
  }

  // Set screen to playlist
  const setResult = await yodeckSetScreenPlaylist(screen.yodeckPlayerId, playlistId);
  if (!setResult.ok) {
    logs.push(`[PushScreen] Failed to set playlist: ${setResult.error}`);
    await db.update(screens).set({
      lastPushAt: new Date(),
      lastPushResult: "failed",
      lastPushError: setResult.error,
    }).where(eq(screens.id, screenId));
    return { ok: false, playlistId, verified: false, logs, error: setResult.error };
  }

  logs.push(`[PushScreen] PATCH successful, verified=${setResult.verified}`);

  // Get actual source for response
  const actualResult = await yodeckGetScreenSource(screen.yodeckPlayerId);
  const actualSource = actualResult.source;

  // Update DB
  const now = new Date();
  await db.update(screens).set({
    lastPushAt: now,
    lastPushResult: setResult.verified ? "ok" : "unverified",
    lastPushError: null,
    lastVerifyAt: now,
    lastVerifyResult: setResult.verified ? "ok" : "mismatch",
    lastVerifyError: setResult.verified ? null : `Expected playlist/${playlistId}, got ${actualSource?.sourceType}/${actualSource?.sourceId}`,
  }).where(eq(screens.id, screenId));

  if (!setResult.verified) {
    logs.push(`[PushScreen] VERIFICATION FAILED: expected playlist/${playlistId}, got ${actualSource?.sourceType}/${actualSource?.sourceId}`);
    return { ok: false, playlistId, verified: false, actualSource, logs, error: "Verification failed after push" };
  }

  logs.push(`[PushScreen] SUCCESS: screen ${screenId} now playing playlist ${playlistId}`);
  return { ok: true, playlistId, verified: true, actualSource, logs };
}

/**
 * Called when an approved video is assigned to a screen
 */
export async function onApprovedVideoAssignedToScreen(
  screenId: string,
  yodeckMediaId: number
): Promise<{ ok: boolean; playlistId: string | null; pushed: boolean; error?: string }> {
  console.log(`[VideoAssign] Assigning media ${yodeckMediaId} to screen ${screenId}`);

  // Ensure playlist
  const ensureResult = await ensureScreenPlaylist(screenId);
  if (!ensureResult.ok || !ensureResult.playlistId) {
    return { ok: false, playlistId: null, pushed: false, error: ensureResult.error };
  }

  const playlistId = ensureResult.playlistId;

  // Add media to playlist (handles dedup internally)
  const addResult = await yodeckAddMediaToPlaylist(playlistId, yodeckMediaId);
  if (!addResult.ok) {
    return { ok: false, playlistId, pushed: false, error: addResult.error };
  }

  // Force push
  const pushResult = await pushScreen(screenId);
  if (!pushResult.ok) {
    return { ok: false, playlistId, pushed: false, error: pushResult.error };
  }

  console.log(`[VideoAssign] SUCCESS: media ${yodeckMediaId} added to playlist ${playlistId}, screen pushed`);
  return { ok: true, playlistId, pushed: true };
}

// =============================================================================
// CANONICAL SCREEN PLAYBACK - SINGLE UNIFORM STRATEGY
// =============================================================================

export interface CanonicalPlaybackResult {
  ok: boolean;
  selfHealed: boolean;
  actions: string[];
  errors: string[];
  playlistId: string | null;
  playlistName: string | null;
  itemCount: number;
  verified: boolean;
}

/**
 * Search for playlists by name in Yodeck
 */
async function yodeckSearchPlaylistsByName(searchName: string): Promise<{ ok: boolean; playlists?: any[]; error?: string }> {
  const result = await yodeckRequest<any>(`/playlists/?search=${encodeURIComponent(searchName)}`);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  const playlists = result.data.results || [];
  return { ok: true, playlists };
}

/**
 * Rename a playlist in Yodeck
 */
async function yodeckRenamePlaylist(playlistId: string, newName: string): Promise<{ ok: boolean; error?: string }> {
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`, {
    method: "PATCH",
    body: JSON.stringify({ name: newName }),
  });
  return { ok: result.ok, error: result.error };
}

/**
 * CANONICAL SCREEN PLAYBACK
 * 
 * Ensures every screen has exactly ONE canonical playlist assigned:
 * "Elevizion | Screen | {yodeckPlayerId}"
 * 
 * This playlist always contains baseline items so screens never show "No content to play".
 */
export async function ensureCanonicalScreenPlayback(screenId: string): Promise<CanonicalPlaybackResult> {
  const actions: string[] = [];
  const errors: string[] = [];
  let selfHealed = false;

  const templateId = process.env.YODECK_TEMPLATE_PLAYLIST_ID || "30400683";

  // 1. Get screen from DB
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  if (!screen) {
    return {
      ok: false, selfHealed: false, actions: [], errors: ["Screen not found"],
      playlistId: null, playlistName: null, itemCount: 0, verified: false,
    };
  }

  if (!screen.yodeckPlayerId) {
    return {
      ok: false, selfHealed: false, actions: [], errors: ["Screen has no Yodeck player ID"],
      playlistId: null, playlistName: null, itemCount: 0, verified: false,
    };
  }

  // 2. Compute canonical playlist name
  const canonicalName = `Elevizion | Screen | ${screen.yodeckPlayerId}`;
  actions.push(`Looking for playlist: "${canonicalName}"`);

  // 3. Search for existing playlists with this name
  const searchResult = await yodeckSearchPlaylistsByName(canonicalName);
  if (!searchResult.ok) {
    errors.push(`Failed to search playlists: ${searchResult.error}`);
    return {
      ok: false, selfHealed: false, actions, errors,
      playlistId: screen.playlistId, playlistName: screen.playlistName, itemCount: 0, verified: false,
    };
  }

  const matchingPlaylists = (searchResult.playlists || []).filter(
    (p: any) => p.name === canonicalName
  );

  let targetPlaylistId: string | null = null;

  // 4. Handle multiple playlists with same name (pick newest, mark others as legacy)
  if (matchingPlaylists.length > 1) {
    actions.push(`Found ${matchingPlaylists.length} playlists with canonical name - deduplicating`);
    const sorted = [...matchingPlaylists].sort((a: any, b: any) => b.id - a.id);
    targetPlaylistId = String(sorted[0].id);
    
    // Rename older ones to LEGACY
    for (let i = 1; i < sorted.length; i++) {
      const oldPlaylist = sorted[i];
      const legacyName = `LEGACY ${canonicalName} (${oldPlaylist.id})`;
      const renameResult = await yodeckRenamePlaylist(String(oldPlaylist.id), legacyName);
      if (renameResult.ok) {
        actions.push(`Renamed old playlist ${oldPlaylist.id} to "${legacyName}"`);
        selfHealed = true;
      } else {
        errors.push(`Failed to rename playlist ${oldPlaylist.id}: ${renameResult.error}`);
      }
    }
  } else if (matchingPlaylists.length === 1) {
    targetPlaylistId = String(matchingPlaylists[0].id);
    actions.push(`Found existing canonical playlist: ${targetPlaylistId}`);
  }

  // 5. If no matching playlist, create one from template
  if (!targetPlaylistId) {
    actions.push(`No canonical playlist found, creating from template ${templateId}`);
    const cloneResult = await yodeckClonePlaylistFromTemplate(templateId, canonicalName);
    
    if (!cloneResult.ok || !cloneResult.playlistId) {
      errors.push(`Failed to create playlist: ${cloneResult.error}`);
      return {
        ok: false, selfHealed: false, actions, errors,
        playlistId: null, playlistName: null, itemCount: 0, verified: false,
      };
    }

    targetPlaylistId = cloneResult.playlistId;
    selfHealed = true;
    actions.push(`Created new canonical playlist: ${targetPlaylistId}`);
  }

  // 6. Ensure playlist has baseline items (minimum count)
  const currentItems = await yodeckGetPlaylistItems(targetPlaylistId);
  let itemCount = currentItems.items?.length || 0;

  if (itemCount < MIN_BASELINE_COUNT) {
    actions.push(`Playlist has only ${itemCount} items, seeding baseline from template`);
    const templateItems = await yodeckGetPlaylistItems(templateId);
    
    if (templateItems.ok && templateItems.items && templateItems.items.length > 0) {
      // Add missing baseline items
      for (const mediaId of templateItems.items) {
        if (!currentItems.items?.includes(mediaId)) {
          const addResult = await yodeckAddMediaToPlaylist(targetPlaylistId, mediaId);
          if (addResult.ok) {
            actions.push(`Added baseline media ${mediaId}`);
            selfHealed = true;
          }
        }
      }
      
      // Re-fetch count
      const refetch = await yodeckGetPlaylistItems(targetPlaylistId);
      itemCount = refetch.items?.length || itemCount;
    }
  }

  // 7. Assign playlist to screen
  const setResult = await yodeckSetScreenPlaylist(screen.yodeckPlayerId, targetPlaylistId);
  if (!setResult.ok) {
    errors.push(`Failed to assign playlist to screen: ${setResult.error}`);
  } else {
    actions.push(`Assigned playlist ${targetPlaylistId} to screen ${screen.yodeckPlayerId}`);
    if (!setResult.verified) {
      actions.push(`Warning: Assignment verification pending`);
    }
  }

  // 8. Update DB with canonical playlist info
  await db.update(screens).set({
    playlistId: targetPlaylistId,
    playlistName: canonicalName,
    yodeckSyncStatus: "linked",
    yodeckContentCount: itemCount,
    lastVerifyAt: new Date(),
    lastVerifyResult: setResult.verified ? "ok" : "pending",
    updatedAt: new Date(),
  }).where(eq(screens.id, screenId));

  actions.push(`Updated DB: playlistId=${targetPlaylistId}, itemCount=${itemCount}`);

  // 9. Verify by checking now-playing
  const verifyResult = await yodeckGetScreenSource(screen.yodeckPlayerId);
  const verified = 
    verifyResult.ok && 
    verifyResult.source?.sourceType === "playlist" &&
    verifyResult.source?.sourceId === targetPlaylistId;

  if (verified) {
    actions.push(`Verified: screen is now playing canonical playlist`);
  } else {
    actions.push(`Verification: screen source is ${verifyResult.source?.sourceType}/${verifyResult.source?.sourceId}`);
  }

  return {
    ok: errors.length === 0,
    selfHealed,
    actions,
    errors,
    playlistId: targetPlaylistId,
    playlistName: canonicalName,
    itemCount,
    verified,
  };
}

/**
 * Repair all screens with Yodeck players - ensure canonical playlist setup
 */
export async function repairAllScreensCanonical(): Promise<{
  total: number;
  repairedCount: number;
  alreadyOkCount: number;
  failedCount: number;
  results: Array<{ screenId: string; yodeckPlayerId: string; result: CanonicalPlaybackResult }>;
}> {
  const linkedScreens = await db.select({
    id: screens.id,
    screenId: screens.screenId,
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(isNotNull(screens.yodeckPlayerId));

  const results: Array<{ screenId: string; yodeckPlayerId: string; result: CanonicalPlaybackResult }> = [];
  let repairedCount = 0;
  let alreadyOkCount = 0;
  let failedCount = 0;

  for (const screen of linkedScreens) {
    if (!screen.yodeckPlayerId) continue;
    
    const result = await ensureCanonicalScreenPlayback(screen.id);
    results.push({
      screenId: screen.screenId,
      yodeckPlayerId: screen.yodeckPlayerId,
      result,
    });

    if (!result.ok) {
      failedCount++;
    } else if (result.selfHealed) {
      repairedCount++;
    } else {
      alreadyOkCount++;
    }
  }

  return {
    total: linkedScreens.length,
    repairedCount,
    alreadyOkCount,
    failedCount,
    results,
  };
}

/**
 * Get the current playback status for a screen
 */
export async function getScreenNowPlaying(screenId: string): Promise<{
  ok: boolean;
  screenId: string;
  yodeckPlayerId: string | null;
  isOnline: boolean;
  expectedPlaylistId: string | null;
  actualSourceType: string;
  actualSourceId: string | null;
  mismatch: boolean;
  verificationOk: boolean;
  selfHealed?: boolean;
  error?: string;
  // UI-facing fields (match what frontend expects)
  playlistId: string | null;
  playlistName: string | null;
  expectedPlaylistName: string | null;
  itemCount: number | null;
  baselineCount: number | null;
  adsCount: number;
  lastPushAt: string | null;
  lastPushResult: string | null;
  deviceStatus: {
    status: "ONLINE" | "OFFLINE" | "UNLINKED";
    isOnline: boolean;
    lastSeenAt: string | null;
    lastScreenshotAt: string | null;
    yodeckDeviceId: string | null;
    yodeckDeviceName: string | null;
    source: string;
    fetchedAt: string;
  };
}> {
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  
  const makeDeviceStatus = (status: "ONLINE" | "OFFLINE" | "UNLINKED", screen: any) => ({
    status,
    isOnline: status === "ONLINE",
    lastSeenAt: screen?.lastSeenAt?.toISOString() || null,
    lastScreenshotAt: screen?.yodeckScreenshotLastOkAt?.toISOString() || null,
    yodeckDeviceId: screen?.yodeckPlayerId || null,
    yodeckDeviceName: screen?.yodeckPlayerName || null,
    source: "yodeck",
    fetchedAt: new Date().toISOString(),
  });
  
  if (!screen) {
    return {
      ok: false,
      screenId,
      yodeckPlayerId: null,
      isOnline: false,
      expectedPlaylistId: null,
      actualSourceType: "unknown",
      actualSourceId: null,
      mismatch: false,
      verificationOk: false,
      error: "Screen not found",
      playlistId: null,
      playlistName: null,
      expectedPlaylistName: null,
      itemCount: null,
      baselineCount: null,
      adsCount: 0,
      lastPushAt: null,
      lastPushResult: null,
      deviceStatus: makeDeviceStatus("UNLINKED", null),
    };
  }

  if (!screen.yodeckPlayerId) {
    return {
      ok: false,
      screenId,
      yodeckPlayerId: null,
      isOnline: false,
      expectedPlaylistId: screen.playlistId,
      actualSourceType: "unknown",
      actualSourceId: null,
      mismatch: true,
      verificationOk: false,
      error: "Screen has no Yodeck player ID",
      playlistId: screen.playlistId,
      playlistName: screen.playlistName,
      expectedPlaylistName: screen.playlistName,
      itemCount: screen.yodeckContentCount,
      baselineCount: null,
      adsCount: 0,
      lastPushAt: screen.lastPushAt?.toISOString() || null,
      lastPushResult: screen.lastPushResult,
      deviceStatus: makeDeviceStatus("UNLINKED", screen),
    };
  }

  const actualResult = await yodeckGetScreenSource(screen.yodeckPlayerId);
  if (!actualResult.ok || !actualResult.source) {
    return {
      ok: false,
      screenId,
      yodeckPlayerId: screen.yodeckPlayerId,
      isOnline: false,
      expectedPlaylistId: screen.playlistId,
      actualSourceType: "unknown",
      actualSourceId: null,
      mismatch: true,
      verificationOk: false,
      error: actualResult.error,
      playlistId: screen.playlistId,
      playlistName: screen.playlistName,
      expectedPlaylistName: screen.playlistName,
      itemCount: screen.yodeckContentCount,
      baselineCount: null,
      adsCount: 0,
      lastPushAt: screen.lastPushAt?.toISOString() || null,
      lastPushResult: screen.lastPushResult,
      deviceStatus: makeDeviceStatus("OFFLINE", screen),
    };
  }

  let expected = screen.playlistId;
  const actual = actualResult.source;
  let selfHealed = false;
  
  // SELF-HEAL: If expected is empty but Yodeck is playing a playlist, save it to DB
  if (!expected && actual.sourceType === "playlist" && actual.sourceId) {
    console.log(`[NowPlaying] Self-heal: screen ${screenId} has no playlistId in DB but Yodeck plays ${actual.sourceId}`);
    
    await db.update(screens).set({
      playlistId: actual.sourceId,
      playlistName: actual.sourceName || `Playlist ${actual.sourceId}`,
      yodeckSyncStatus: "linked",
      lastVerifyAt: new Date(),
      lastVerifyResult: "ok",
      updatedAt: new Date(),
    }).where(eq(screens.id, screenId));
    
    expected = actual.sourceId;
    selfHealed = true;
    console.log(`[NowPlaying] Self-healed: playlistId=${expected} saved to screen ${screenId}`);
  }
  
  // Update sync status if device is linked but status says not_linked
  if (screen.yodeckSyncStatus === "not_linked" && screen.yodeckPlayerId) {
    await db.update(screens).set({
      yodeckSyncStatus: "linked",
      updatedAt: new Date(),
    }).where(eq(screens.id, screenId));
  }
  
  const mismatch = 
    actual.sourceType !== "playlist" || 
    actual.sourceId !== expected;

  const verificationOk = !mismatch && expected !== null;
  
  // Derive playlist name: use actual playing name, fallback to DB name
  const playlistName = actual.sourceName || screen.playlistName || `Playlist ${expected}`;
  const isOnline = screen.status === "online";
  
  // Calculate baseline vs ads count from playlist items
  let baselineCount = 0;
  let adsCount = 0;
  const playlistId = actual.sourceId || expected;
  
  if (playlistId) {
    const items = await yodeckGetPlaylistItems(playlistId);
    if (items.ok && items.items) {
      const baselineSet = new Set(BASELINE_MEDIA_IDS);
      for (const id of items.items) {
        if (baselineSet.has(id)) {
          baselineCount++;
        } else {
          adsCount++;
        }
      }
    } else {
      // Fallback: use stored count to avoid showing 0 items when API fails
      const fallbackCount = screen.yodeckContentCount ?? 0;
      baselineCount = Math.min(fallbackCount, BASELINE_MEDIA_IDS.length);
      adsCount = Math.max(0, fallbackCount - baselineCount);
    }
  }

  return {
    ok: true,
    screenId,
    yodeckPlayerId: screen.yodeckPlayerId,
    isOnline,
    expectedPlaylistId: expected,
    actualSourceType: actual.sourceType,
    actualSourceId: actual.sourceId,
    mismatch,
    verificationOk,
    selfHealed,
    // UI-facing fields
    playlistId,
    playlistName,
    expectedPlaylistName: screen.playlistName,
    itemCount: baselineCount + adsCount,
    baselineCount,
    adsCount,
    lastPushAt: screen.lastPushAt?.toISOString() || null,
    lastPushResult: screen.lastPushResult,
    deviceStatus: makeDeviceStatus(isOnline ? "ONLINE" : "OFFLINE", screen),
  };
}

// =============================================================================
// BACKFILL / MIGRATION
// =============================================================================

/**
 * Backfill all screens with Yodeck devices - ensure they have playlists
 * This is a one-time migration to fix legacy data
 */
export async function backfillScreenPlaylists(): Promise<{
  total: number;
  success: number;
  failed: number;
  logs: string[];
}> {
  const logs: string[] = [];
  logs.push(`[Backfill] Starting screen playlist backfill...`);
  
  const linkedScreens = await db.select({
    id: screens.id,
    screenId: screens.screenId,
    name: screens.name,
    yodeckPlayerId: screens.yodeckPlayerId,
    playlistId: screens.playlistId,
  }).from(screens).where(isNotNull(screens.yodeckPlayerId));
  
  logs.push(`[Backfill] Found ${linkedScreens.length} screens with Yodeck devices`);
  
  let success = 0;
  let failed = 0;
  
  for (const screen of linkedScreens) {
    try {
      // Ensure playlist exists
      const ensureResult = await ensureScreenPlaylist(screen.id);
      if (!ensureResult.ok) {
        logs.push(`[Backfill] ✗ ${screen.screenId}: ${ensureResult.error}`);
        failed++;
        continue;
      }
      
      // Push to Yodeck
      const pushResult = await pushScreen(screen.id);
      if (!pushResult.ok) {
        logs.push(`[Backfill] ✗ ${screen.screenId}: push failed - ${pushResult.error}`);
        failed++;
        continue;
      }
      
      logs.push(`[Backfill] ✓ ${screen.screenId}: playlist=${ensureResult.playlistId}, items=${ensureResult.itemCount}`);
      success++;
    } catch (error: any) {
      logs.push(`[Backfill] ✗ ${screen.screenId}: ${error.message}`);
      failed++;
    }
  }
  
  logs.push(`[Backfill] Complete: ${success} success, ${failed} failed, ${linkedScreens.length} total`);
  
  return {
    total: linkedScreens.length,
    success,
    failed,
    logs,
  };
}

// =============================================================================
// BASELINE ARCHITECTURE - Central source of truth for all screens
// =============================================================================

export interface BaselinePlaylistInfo {
  ok: boolean;
  playlistId: string | null;
  name: string;
  mediaIds: number[];
  error?: string;
}

// Cache baseline info to avoid repeated API calls
let baselineCache: { info: BaselinePlaylistInfo; timestamp: number } | null = null;
const BASELINE_CACHE_TTL = 60 * 1000; // 1 minute

// Mutex to prevent concurrent baseline operations
let baselineOperationInProgress = false;

/**
 * Find or create the central baseline playlist "EVZ | BASELINE"
 * Uses search API for exact name match + pagination fallback
 */
export async function ensureBaselinePlaylist(): Promise<BaselinePlaylistInfo> {
  // Check cache first
  if (baselineCache && Date.now() - baselineCache.timestamp < BASELINE_CACHE_TTL) {
    return baselineCache.info;
  }
  
  // Simple mutex to prevent concurrent operations
  if (baselineOperationInProgress) {
    console.log("[BaselineSync] Waiting for concurrent operation...");
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (baselineCache) return baselineCache.info;
  }
  
  baselineOperationInProgress = true;
  
  try {
    console.log(`[BaselineSync] Ensuring baseline playlist exists: "${BASELINE_PLAYLIST_NAME}"`);
    
    // Use search API for exact name match (more efficient than pagination)
    const searchResult = await yodeckRequest<{ results: any[] }>(`/playlists/?search=${encodeURIComponent("EVZ | BASELINE")}&page_size=50`);
    
    let existing: any = null;
    
    if (searchResult.ok && searchResult.data?.results) {
      existing = searchResult.data.results.find(p => p.name === BASELINE_PLAYLIST_NAME);
    }
    
    // Fallback: paginate through all playlists if search didn't find it
    if (!existing) {
      type PlaylistPage = { results: Array<{ id: number; name: string }>; next: string | null };
      let nextUrl: string | null = "/playlists/?page_size=100";
      while (nextUrl && !existing) {
        const pageResult: Awaited<ReturnType<typeof yodeckRequest<PlaylistPage>>> = await yodeckRequest<PlaylistPage>(nextUrl);
        if (!pageResult.ok) break;
        existing = pageResult.data?.results?.find((p) => p.name === BASELINE_PLAYLIST_NAME);
        nextUrl = pageResult.data?.next ? pageResult.data.next.replace("https://app.yodeck.com/api/v2", "") : null;
      }
    }
  
    if (existing) {
      // Get current items
      const items = await yodeckGetPlaylistItems(String(existing.id));
      const mediaIds = items.items || [];
      
      // Check if baseline needs seeding
      if (mediaIds.length < MIN_BASELINE_COUNT) {
        console.log(`[BaselineSync] Baseline has only ${mediaIds.length} items, seeding with defaults`);
        for (const id of BASELINE_MEDIA_IDS) {
          if (!mediaIds.includes(id)) {
            await yodeckAddMediaToPlaylist(String(existing.id), id);
          }
        }
        const refetch = await yodeckGetPlaylistItems(String(existing.id));
        const result: BaselinePlaylistInfo = { ok: true, playlistId: String(existing.id), name: BASELINE_PLAYLIST_NAME, mediaIds: refetch.items || [] };
        baselineCache = { info: result, timestamp: Date.now() };
        return result;
      }
      
      console.log(`[BaselineSync] Found baseline playlist ${existing.id} with ${mediaIds.length} items`);
      const result: BaselinePlaylistInfo = { ok: true, playlistId: String(existing.id), name: BASELINE_PLAYLIST_NAME, mediaIds };
      baselineCache = { info: result, timestamp: Date.now() };
      return result;
    }
    
    // Create new baseline playlist
    console.log(`[BaselineSync] Creating baseline playlist "${BASELINE_PLAYLIST_NAME}"`);
    const createResult = await yodeckRequest<any>("/playlists/", {
      method: "POST",
      body: JSON.stringify({
        name: BASELINE_PLAYLIST_NAME,
        type: "regular",
        items: [],
      }),
    });
    
    if (!createResult.ok || !createResult.data?.id) {
      return { ok: false, playlistId: null, name: BASELINE_PLAYLIST_NAME, mediaIds: [], error: `Failed to create baseline: ${createResult.error}` };
    }
    
    const newPlaylistId = String(createResult.data.id);
    
    // Seed with baseline items
    for (const id of BASELINE_MEDIA_IDS) {
      await yodeckAddMediaToPlaylist(newPlaylistId, id);
    }
    
    const items = await yodeckGetPlaylistItems(newPlaylistId);
    console.log(`[BaselineSync] Created baseline playlist ${newPlaylistId} with ${items.items?.length || 0} items`);
    
    const result: BaselinePlaylistInfo = { ok: true, playlistId: newPlaylistId, name: BASELINE_PLAYLIST_NAME, mediaIds: items.items || [] };
    baselineCache = { info: result, timestamp: Date.now() };
    return result;
  } finally {
    baselineOperationInProgress = false;
  }
}

/**
 * Set playlist items exactly to the desired list (idempotent)
 */
export async function setPlaylistItemsExactly(
  playlistId: string,
  desiredMediaIds: number[]
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  const current = await yodeckGetPlaylistItems(playlistId);
  if (!current.ok) {
    return { ok: false, changed: false, error: current.error };
  }
  
  const currentIds = current.items || [];
  
  // Check if already equal
  if (currentIds.length === desiredMediaIds.length && 
      currentIds.every((id, i) => id === desiredMediaIds[i])) {
    return { ok: true, changed: false };
  }
  
  // Build new items list
  const patchPayload = {
    items: desiredMediaIds.map((id, index) => ({ id, type: "media", priority: index + 1 })),
  };
  
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`, {
    method: "PATCH",
    body: JSON.stringify(patchPayload),
  });
  
  if (!result.ok) {
    return { ok: false, changed: false, error: result.error };
  }
  
  return { ok: true, changed: true };
}

export interface ScreenCanonicalResult {
  ok: boolean;
  screenId: string;
  yodeckPlayerId: string;
  playlistId: string | null;
  playlistName: string | null;
  baselineCount: number;
  adsCount: number;
  actions: string[];
  error?: string;
}

/**
 * Ensure a screen has the canonical playlist setup: baseline + ads
 */
export async function ensureCanonicalScreenWithBaseline(screenId: string): Promise<ScreenCanonicalResult> {
  const actions: string[] = [];
  
  // Get screen from DB
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  if (!screen || !screen.yodeckPlayerId) {
    return { 
      ok: false, screenId, yodeckPlayerId: "", playlistId: null, playlistName: null,
      baselineCount: 0, adsCount: 0, actions, error: "Screen not found or no Yodeck player" 
    };
  }
  
  const yodeckPlayerId = screen.yodeckPlayerId;
  const canonicalName = getScreenPlaylistName(yodeckPlayerId);
  actions.push(`Ensuring canonical playlist: "${canonicalName}"`);
  
  // Step 1: Ensure baseline playlist exists
  const baseline = await ensureBaselinePlaylist();
  if (!baseline.ok) {
    return {
      ok: false, screenId, yodeckPlayerId, playlistId: null, playlistName: null,
      baselineCount: 0, adsCount: 0, actions, error: `Baseline error: ${baseline.error}`
    };
  }
  actions.push(`Baseline playlist: ${baseline.playlistId} with ${baseline.mediaIds.length} items`);
  
  // Step 2: Find or create screen playlist
  const searchResult = await yodeckRequest<{ results: any[] }>(`/playlists/?search=${encodeURIComponent(canonicalName)}`);
  let screenPlaylistId: string | null = null;
  
  if (searchResult.ok && searchResult.data?.results) {
    const existing = searchResult.data.results.find(p => p.name === canonicalName);
    if (existing) {
      screenPlaylistId = String(existing.id);
      actions.push(`Found existing screen playlist: ${screenPlaylistId}`);
    }
  }
  
  if (!screenPlaylistId) {
    // Create new screen playlist
    const createResult = await yodeckRequest<any>("/playlists/", {
      method: "POST",
      body: JSON.stringify({
        name: canonicalName,
        type: "regular",
        items: [],
      }),
    });
    
    if (!createResult.ok || !createResult.data?.id) {
      return {
        ok: false, screenId, yodeckPlayerId, playlistId: null, playlistName: null,
        baselineCount: 0, adsCount: 0, actions, error: `Failed to create screen playlist: ${createResult.error}`
      };
    }
    
    screenPlaylistId = String(createResult.data.id);
    actions.push(`Created screen playlist: ${screenPlaylistId}`);
  }
  
  // Step 3: Get ads for this screen (approved ads from placements)
  // For now, we use the baseline items only - ads will be added via separate flow
  const adsMediaIds: number[] = [];
  
  // Step 4: Build desired playlist: baseline first, then ads
  const desiredMediaIds = [...baseline.mediaIds, ...adsMediaIds];
  
  // Step 5: Apply items
  const setResult = await setPlaylistItemsExactly(screenPlaylistId, desiredMediaIds);
  if (!setResult.ok) {
    return {
      ok: false, screenId, yodeckPlayerId, playlistId: screenPlaylistId, playlistName: canonicalName,
      baselineCount: baseline.mediaIds.length, adsCount: 0, actions, error: setResult.error
    };
  }
  actions.push(setResult.changed ? "Updated playlist items" : "Playlist items already correct");
  
  // Step 6: Assign screen content to this playlist
  const assignResult = await yodeckSetScreenPlaylist(yodeckPlayerId, screenPlaylistId);
  if (!assignResult.ok) {
    actions.push(`Warning: Failed to assign playlist to screen: ${assignResult.error}`);
  } else {
    actions.push("Assigned screen to playlist");
  }
  
  // Step 7: Update DB
  await db.update(screens).set({
    playlistId: screenPlaylistId,
    playlistName: canonicalName,
    yodeckSyncStatus: "synced",
    updatedAt: new Date(),
  }).where(eq(screens.id, screenId));
  actions.push("Updated database");
  
  return {
    ok: true, screenId, yodeckPlayerId, playlistId: screenPlaylistId, playlistName: canonicalName,
    baselineCount: baseline.mediaIds.length, adsCount: adsMediaIds.length, actions
  };
}

export interface RepairAllResult {
  total: number;
  success: number;
  failed: number;
  screens: ScreenCanonicalResult[];
}

/**
 * Repair all screens: ensure canonical playlist architecture
 */
export async function repairAllScreens(): Promise<RepairAllResult> {
  console.log(`[CanonicalRepair] Starting repair-all-screens...`);
  
  const linkedScreens = await db.select({
    id: screens.id,
    screenId: screens.screenId,
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(isNotNull(screens.yodeckPlayerId));
  
  console.log(`[CanonicalRepair] Found ${linkedScreens.length} screens with Yodeck devices`);
  
  const results: ScreenCanonicalResult[] = [];
  let success = 0;
  let failed = 0;
  
  for (const screen of linkedScreens) {
    try {
      const result = await ensureCanonicalScreenWithBaseline(screen.id);
      results.push(result);
      
      if (result.ok) {
        console.log(`[CanonicalRepair] ✓ ${screen.screenId}: ${result.playlistName} (baseline=${result.baselineCount}, ads=${result.adsCount})`);
        success++;
      } else {
        console.log(`[CanonicalRepair] ✗ ${screen.screenId}: ${result.error}`);
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      console.error(`[CanonicalRepair] ✗ ${screen.screenId}: ${error.message}`);
      results.push({
        ok: false, screenId: screen.id, yodeckPlayerId: screen.yodeckPlayerId || "",
        playlistId: null, playlistName: null, baselineCount: 0, adsCount: 0,
        actions: [], error: error.message
      });
      failed++;
    }
  }
  
  console.log(`[CanonicalRepair] Complete: ${success}/${linkedScreens.length} success`);
  
  return { total: linkedScreens.length, success, failed, screens: results };
}

/**
 * Publish baseline: propagate baseline items to all screen playlists
 */
export async function publishBaseline(): Promise<{
  ok: boolean;
  baselinePlaylistId: string | null;
  baselineItems: number[];
  screensUpdated: number;
  errors: string[];
}> {
  console.log(`[BaselineSync] Publishing baseline to all screens...`);
  
  const errors: string[] = [];
  
  // Step 1: Get/create baseline playlist
  const baseline = await ensureBaselinePlaylist();
  if (!baseline.ok) {
    return { ok: false, baselinePlaylistId: null, baselineItems: [], screensUpdated: 0, errors: [baseline.error || "Baseline error"] };
  }
  
  // Step 2: Get all screens with Yodeck devices
  const linkedScreens = await db.select({
    id: screens.id,
    screenId: screens.screenId,
    playlistId: screens.playlistId,
  }).from(screens).where(isNotNull(screens.yodeckPlayerId));
  
  let updated = 0;
  
  for (const screen of linkedScreens) {
    if (!screen.playlistId) {
      errors.push(`${screen.screenId}: no playlist assigned`);
      continue;
    }
    
    try {
      // Get current items in screen playlist
      const current = await yodeckGetPlaylistItems(screen.playlistId);
      const currentIds = current.items || [];
      
      // Extract ads (items not in baseline)
      const adsIds = currentIds.filter(id => !baseline.mediaIds.includes(id));
      
      // Build new playlist: baseline + ads
      const desiredIds = [...baseline.mediaIds, ...adsIds];
      
      const setResult = await setPlaylistItemsExactly(screen.playlistId, desiredIds);
      if (setResult.ok) {
        if (setResult.changed) {
          console.log(`[BaselineSync] Updated ${screen.screenId}`);
        }
        updated++;
      } else {
        errors.push(`${screen.screenId}: ${setResult.error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error: any) {
      errors.push(`${screen.screenId}: ${error.message}`);
    }
  }
  
  console.log(`[BaselineSync] Published baseline to ${updated}/${linkedScreens.length} screens`);
  
  return {
    ok: errors.length === 0,
    baselinePlaylistId: baseline.playlistId,
    baselineItems: baseline.mediaIds,
    screensUpdated: updated,
    errors,
  };
}

/**
 * List all Yodeck playlists for cleanup inventory
 */
export async function listAllPlaylists(): Promise<{ ok: boolean; playlists: any[]; error?: string }> {
  const result = await yodeckRequest<{ results: any[] }>("/playlists/?page_size=100");
  if (!result.ok) {
    return { ok: false, playlists: [], error: result.error };
  }
  return { ok: true, playlists: result.data?.results || [] };
}

/**
 * List all Yodeck layouts for cleanup inventory
 */
export async function listAllLayouts(): Promise<{ ok: boolean; layouts: any[]; error?: string }> {
  const result = await yodeckRequest<{ results: any[] }>("/layouts/?page_size=100");
  if (!result.ok) {
    return { ok: false, layouts: [], error: result.error };
  }
  return { ok: true, layouts: result.data?.results || [] };
}

export interface LegacyCleanupResult {
  ok: boolean;
  dryRun: boolean;
  protectedPlaylists: string[];
  legacyPlaylists: { id: string; name: string; action: string }[];
  legacyLayouts: { id: string; name: string; action: string }[];
  errors: string[];
}

/**
 * Quarantine legacy playlists and layouts
 */
export async function quarantineLegacy(dryRun: boolean = true): Promise<LegacyCleanupResult> {
  console.log(`[LegacyCleanup] Starting cleanup (dryRun=${dryRun})...`);
  
  const errors: string[] = [];
  const protectedPlaylists: string[] = [];
  const legacyPlaylists: { id: string; name: string; action: string }[] = [];
  const legacyLayouts: { id: string; name: string; action: string }[] = [];
  
  // Get active screens to identify protected playlists
  const activeScreens = await db.select({
    playlistId: screens.playlistId,
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(isNotNull(screens.yodeckPlayerId));
  
  const protectedIds = new Set<string>();
  for (const s of activeScreens) {
    if (s.playlistId) protectedIds.add(s.playlistId);
    if (s.yodeckPlayerId) {
      protectedPlaylists.push(`EVZ | SCREEN | ${s.yodeckPlayerId}`);
    }
  }
  protectedPlaylists.push(BASELINE_PLAYLIST_NAME);
  
  // Get all playlists
  const playlists = await listAllPlaylists();
  if (playlists.ok) {
    for (const p of playlists.playlists) {
      const name = p.name || "";
      const id = String(p.id);
      
      // Check if protected
      if (protectedIds.has(id) || name === BASELINE_PLAYLIST_NAME || name.startsWith("EVZ | SCREEN |")) {
        continue;
      }
      
      // Check if legacy (Elevizion/EVZ/Loop patterns)
      if (name.includes("Elevizion") || name.includes("Loop") || name.includes("auto-playlist")) {
        const newName = `LEGACY | ${name} | ${new Date().toISOString().split("T")[0]}`;
        legacyPlaylists.push({ id, name, action: dryRun ? `Would rename to: ${newName}` : `Renamed to: ${newName}` });
        
        if (!dryRun) {
          const renameResult = await yodeckRequest<any>(`/playlists/${id}/`, {
            method: "PATCH",
            body: JSON.stringify({ name: newName }),
          });
          if (!renameResult.ok) {
            errors.push(`Failed to rename playlist ${id}: ${renameResult.error}`);
          }
        }
      }
    }
  }
  
  // Get all layouts
  const layouts = await listAllLayouts();
  if (layouts.ok) {
    for (const l of layouts.layouts) {
      const name = l.name || "";
      const id = String(l.id);
      
      if (name.includes("Elevizion") || name.includes("EVZ")) {
        const newName = `LEGACY | ${name} | ${new Date().toISOString().split("T")[0]}`;
        legacyLayouts.push({ id, name, action: dryRun ? `Would rename to: ${newName}` : `Renamed to: ${newName}` });
        
        if (!dryRun) {
          const renameResult = await yodeckRequest<any>(`/layouts/${id}/`, {
            method: "PATCH",
            body: JSON.stringify({ name: newName }),
          });
          if (!renameResult.ok) {
            errors.push(`Failed to rename layout ${id}: ${renameResult.error}`);
          }
        }
      }
    }
  }
  
  console.log(`[LegacyCleanup] Found ${legacyPlaylists.length} legacy playlists, ${legacyLayouts.length} legacy layouts`);
  
  return {
    ok: errors.length === 0,
    dryRun,
    protectedPlaylists,
    legacyPlaylists,
    legacyLayouts,
    errors,
  };
}

// =============================================================================
// A) RECONCILE SCREEN PLAYLIST IDS
// =============================================================================

export interface ReconcileResult {
  screenId: string;
  yodeckPlayerId: string;
  expected: string | null;
  actual: string | null;
  action: "unchanged" | "updated" | "error";
  error?: string;
}

/**
 * Reconcile DB playlistId with actual Yodeck source_id
 * This ensures verification works correctly
 */
export async function reconcileScreenPlaylistIds(): Promise<{
  ok: boolean;
  results: ReconcileResult[];
}> {
  console.log("[Reconcile] Starting screen playlist ID reconciliation...");
  
  const allScreens = await db.select().from(screens).where(isNotNull(screens.yodeckPlayerId));
  const results: ReconcileResult[] = [];
  
  // Fetch all Yodeck screens
  const yodeckScreens = await yodeckRequest<{ results: any[] }>("/screens/?page_size=100");
  if (!yodeckScreens.ok || !yodeckScreens.data?.results) {
    console.error("[Reconcile] Failed to fetch Yodeck screens");
    return { ok: false, results: [] };
  }
  
  for (const screen of allScreens) {
    const playerId = screen.yodeckPlayerId;
    if (!playerId || playerId.startsWith("yd_player_")) continue;
    
    const yodeckScreen = yodeckScreens.data.results.find((s: any) => String(s.id) === playerId);
    if (!yodeckScreen) {
      results.push({
        screenId: screen.id,
        yodeckPlayerId: playerId,
        expected: screen.playlistId,
        actual: null,
        action: "error",
        error: "Player not found in Yodeck",
      });
      continue;
    }
    
    // Parse screen_content to find actual source
    const screenContent = yodeckScreen.screen_content;
    let actualSourceId: string | null = null;
    let actualSourceName: string | null = null;
    
    if (screenContent?.source_type === "playlist" && screenContent?.source_id) {
      actualSourceId = String(screenContent.source_id);
      actualSourceName = screenContent.source_name || null;
    }
    
    if (!actualSourceId) {
      results.push({
        screenId: screen.id,
        yodeckPlayerId: playerId,
        expected: screen.playlistId,
        actual: null,
        action: "error",
        error: "No playlist source found",
      });
      continue;
    }
    
    // Check if DB matches
    if (screen.playlistId === actualSourceId) {
      results.push({
        screenId: screen.id,
        yodeckPlayerId: playerId,
        expected: screen.playlistId,
        actual: actualSourceId,
        action: "unchanged",
      });
      continue;
    }
    
    // Update DB to match actual
    console.log(`[Reconcile] screenId=${screen.id} expected=${screen.playlistId} actual=${actualSourceId} updatedTo=${actualSourceId}`);
    
    await db.update(screens)
      .set({ 
        playlistId: actualSourceId,
        playlistName: actualSourceName || screen.playlistName,
      })
      .where(eq(screens.id, screen.id));
    
    results.push({
      screenId: screen.id,
      yodeckPlayerId: playerId,
      expected: screen.playlistId,
      actual: actualSourceId,
      action: "updated",
    });
  }
  
  console.log(`[Reconcile] Complete: ${results.filter(r => r.action === "updated").length} updated, ${results.filter(r => r.action === "unchanged").length} unchanged`);
  
  return { ok: true, results };
}

// =============================================================================
// B) BASELINE SYNC
// =============================================================================

/**
 * Get all items from the baseline playlist
 */
export async function getBaselinePlaylistItems(): Promise<{
  ok: boolean;
  playlistId: string | null;
  items: number[];
  error?: string;
}> {
  const baseline = await ensureBaselinePlaylist();
  if (!baseline.ok || !baseline.playlistId) {
    return { ok: false, playlistId: null, items: [], error: baseline.error };
  }
  
  const items = await yodeckGetPlaylistItems(baseline.playlistId);
  return {
    ok: items.ok,
    playlistId: baseline.playlistId,
    items: items.items || [],
    error: items.error,
  };
}

/**
 * Sync a screen playlist from baseline
 * Structure: [baseline items] + [ad items]
 */
export async function syncScreenPlaylistFromBaseline(screenPlaylistId: string): Promise<{
  ok: boolean;
  baselineCount: number;
  adsCount: number;
  changed: boolean;
  error?: string;
}> {
  // Get baseline items
  const baseline = await getBaselinePlaylistItems();
  if (!baseline.ok) {
    return { ok: false, baselineCount: 0, adsCount: 0, changed: false, error: baseline.error };
  }
  
  const baselineIds = new Set(baseline.items);
  
  // Get current screen playlist items
  const current = await yodeckGetPlaylistItems(screenPlaylistId);
  if (!current.ok) {
    return { ok: false, baselineCount: 0, adsCount: 0, changed: false, error: current.error };
  }
  
  const currentIds = current.items || [];
  
  // Separate current items into baseline and ads
  const currentBaseline: number[] = [];
  const currentAds: number[] = [];
  
  for (const id of currentIds) {
    if (baselineIds.has(id)) {
      if (!currentBaseline.includes(id)) {
        currentBaseline.push(id);
      }
    } else {
      if (!currentAds.includes(id)) {
        currentAds.push(id);
      }
    }
  }
  
  // Build desired order: baseline first (in original order), then ads
  const desired = [...baseline.items, ...currentAds];
  
  // Check if already correct
  if (JSON.stringify(currentIds) === JSON.stringify(desired)) {
    return { 
      ok: true, 
      baselineCount: baseline.items.length, 
      adsCount: currentAds.length, 
      changed: false 
    };
  }
  
  // Update playlist items
  const result = await setPlaylistItemsExactly(screenPlaylistId, desired);
  
  return {
    ok: result.ok,
    baselineCount: baseline.items.length,
    adsCount: currentAds.length,
    changed: result.changed,
    error: result.error,
  };
}

/**
 * Sync all screen playlists from baseline
 */
export async function syncAllScreensFromBaseline(): Promise<{
  ok: boolean;
  results: Array<{
    screenId: string;
    playlistId: string;
    baselineCount: number;
    adsCount: number;
    changed: boolean;
    error?: string;
  }>;
}> {
  console.log("[BaselineSync] Syncing all screen playlists from baseline...");
  
  const allScreens = await db.select().from(screens).where(isNotNull(screens.yodeckPlayerId));
  const results: Array<{
    screenId: string;
    playlistId: string;
    baselineCount: number;
    adsCount: number;
    changed: boolean;
    error?: string;
  }> = [];
  
  for (const screen of allScreens) {
    if (!screen.playlistId || screen.yodeckPlayerId?.startsWith("yd_player_")) continue;
    
    const result = await syncScreenPlaylistFromBaseline(screen.playlistId);
    results.push({
      screenId: screen.id,
      playlistId: screen.playlistId,
      ...result,
    });
    
    console.log(`[BaselineSync] screen=${screen.id} baselineCount=${result.baselineCount} adsCount=${result.adsCount} changed=${result.changed}`);
  }
  
  return { ok: true, results };
}

// =============================================================================
// C) PUBLISH ADS
// =============================================================================

/**
 * Add an ad media item to a screen playlist (after baseline)
 */
export async function addAdToScreenPlaylist(
  screenPlaylistId: string, 
  mediaId: number
): Promise<{ ok: boolean; inserted: boolean; position: number; error?: string }> {
  // First sync baseline
  const syncResult = await syncScreenPlaylistFromBaseline(screenPlaylistId);
  if (!syncResult.ok) {
    return { ok: false, inserted: false, position: -1, error: syncResult.error };
  }
  
  // Get current items
  const current = await yodeckGetPlaylistItems(screenPlaylistId);
  if (!current.ok) {
    return { ok: false, inserted: false, position: -1, error: current.error };
  }
  
  const currentIds = current.items || [];
  
  // Check if already present
  if (currentIds.includes(mediaId)) {
    const position = currentIds.indexOf(mediaId);
    return { ok: true, inserted: false, position };
  }
  
  // Add at the end (after baseline + existing ads)
  const result = await yodeckAddMediaToPlaylist(screenPlaylistId, mediaId);
  if (!result.ok) {
    return { ok: false, inserted: false, position: -1, error: result.error };
  }
  
  const position = currentIds.length;
  console.log(`[PublishAd] mediaId=${mediaId} screen=${screenPlaylistId} inserted=true position=${position}`);
  
  return { ok: true, inserted: true, position };
}

// =============================================================================
// SCAN & PUBLISH APPROVED ADS (TEST_MODE compatible - no contracts required)
// =============================================================================

export interface AdvertiserMediaMatch {
  advertiserId: string;
  advertiserName: string;
  linkKey: string;
  yodeckMediaId: number;
  yodeckMediaName: string;
  targetRegionCodes: string[];
}

/**
 * Scan Yodeck media and match with advertiser linkKeys
 * This discovers approved ads by matching media names with ADV-xxx patterns
 */
export async function scanYodeckMediaForAdvertisers(advertisers: Array<{
  id: string;
  companyName?: string | null;
  linkKey?: string | null;
  targetRegionCodes?: string[] | null;
}>): Promise<{ ok: boolean; matches: AdvertiserMediaMatch[]; error?: string }> {
  console.log(`[AdPublish] Scanning Yodeck media for ${advertisers.length} advertisers...`);
  
  const token = await getYodeckToken();
  if (!token.isValid || !token.value) {
    return { ok: false, matches: [], error: "Yodeck token not configured" };
  }
  
  // Fetch all media from Yodeck
  const mediaResult = await yodeckRequest<{ results: any[] }>("/media/?limit=500");
  if (!mediaResult.ok || !mediaResult.data?.results) {
    return { ok: false, matches: [], error: mediaResult.error || "Failed to fetch media" };
  }
  
  const allMedia = mediaResult.data.results;
  console.log(`[AdPublish] Found ${allMedia.length} media items in Yodeck`);
  
  const matches: AdvertiserMediaMatch[] = [];
  
  for (const advertiser of advertisers) {
    if (!advertiser.linkKey) continue;
    
    // Extract advertiser prefix from linkKey (e.g., ADV-BOUWSERVICEDOUVEN from ADV-BOUWSERVICEDOUVEN-6E43D3)
    const linkKeyParts = advertiser.linkKey.split("-");
    const advertiserPrefix = linkKeyParts.length >= 2 
      ? `${linkKeyParts[0]}-${linkKeyParts[1]}` 
      : advertiser.linkKey;
    
    // Find media that contains the advertiser prefix in the name
    // This allows matching ADV-BOUWSERVICEDOUVEN-756846 with linkKey ADV-BOUWSERVICEDOUVEN-6E43D3
    const matchingMedia = allMedia.filter((m: any) => 
      m.name && (
        m.name.includes(advertiser.linkKey) || // Exact linkKey match
        m.name.includes(advertiserPrefix)       // Prefix match (ADV-COMPANYNAME)
      )
    );
    
    for (const media of matchingMedia) {
      matches.push({
        advertiserId: advertiser.id,
        advertiserName: advertiser.companyName || "Unknown",
        linkKey: advertiser.linkKey,
        yodeckMediaId: media.id,
        yodeckMediaName: media.name,
        targetRegionCodes: advertiser.targetRegionCodes || [],
      });
      console.log(`[AdPublish] Match: ${advertiser.companyName} (prefix=${advertiserPrefix}) -> mediaId=${media.id} "${media.name}"`);
    }
  }
  
  console.log(`[AdPublish] Found ${matches.length} advertiser-media matches`);
  return { ok: true, matches };
}

export interface PublishApprovedAdsResult {
  ok: boolean;
  scanned: number;
  published: number;
  alreadyPresent: number;
  skipped: number;
  errors: number;
  details: Array<{
    advertiserId: string;
    advertiserName: string;
    mediaId: number;
    screenId: string;
    playlistId: string;
    action: "published" | "already_present" | "skipped" | "error";
    reason?: string;
  }>;
}

/**
 * Publish approved ads to correct screen playlists
 * Works without contracts in TEST_MODE - uses targeting rules only
 */
export async function publishApprovedAdsToScreens(options: {
  dryRun?: boolean;
  advertiserId?: string;
  screenId?: string;
}, advertisers: Array<{
  id: string;
  companyName?: string | null;
  linkKey?: string | null;
  targetRegionCodes?: string[] | null;
  targetCities?: string[] | null;
  assetStatus?: string | null;
  yodeckMediaId?: number | null;
}>, dbScreens: Array<{
  id: string;
  name: string;
  yodeckPlayerId?: string | null;
  playlistId?: string | null;
  city?: string | null;
  region?: string | null;
}>): Promise<PublishApprovedAdsResult> {
  const { dryRun = false, advertiserId, screenId } = options;
  
  console.log(`[AdPublish] Starting publish run (dryRun=${dryRun}, advertiserId=${advertiserId || "all"}, screenId=${screenId || "all"})`);
  
  const result: PublishApprovedAdsResult = {
    ok: true,
    scanned: 0,
    published: 0,
    alreadyPresent: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };
  
  // Filter advertisers if specific one requested
  let targetAdvertisers = advertisers.filter(a => a.linkKey);
  if (advertiserId) {
    targetAdvertisers = targetAdvertisers.filter(a => a.id === advertiserId);
  }
  
  if (targetAdvertisers.length === 0) {
    console.log("[AdPublish] No advertisers with linkKey found");
    return result;
  }
  
  // Scan Yodeck media for matches
  const scanResult = await scanYodeckMediaForAdvertisers(targetAdvertisers);
  if (!scanResult.ok) {
    result.ok = false;
    (result as any).error = scanResult.error || "Media scan failed";
    return result;
  }
  
  result.scanned = scanResult.matches.length;
  
  // Filter screens if specific one requested
  let targetScreens = dbScreens.filter(s => s.yodeckPlayerId && s.playlistId);
  if (screenId) {
    targetScreens = targetScreens.filter(s => s.id === screenId);
  }
  
  console.log(`[AdPublish] Processing ${scanResult.matches.length} matches for ${targetScreens.length} screens`);
  
  for (const match of scanResult.matches) {
    // Find matching screens based on targeting
    for (const screen of targetScreens) {
      // Check targeting match (region/city)
      const screenCity = screen.city?.toLowerCase() || "";
      const screenRegion = screen.region?.toLowerCase() || "";
      
      const targetRegions = match.targetRegionCodes.map(r => r.toLowerCase());
      
      // Match if screen city/region matches any target
      const targetMatch = targetRegions.length === 0 || 
        targetRegions.some(t => 
          screenCity.includes(t) || 
          screenRegion.includes(t) ||
          t.includes(screenCity) ||
          t.includes(screenRegion)
        );
      
      if (!targetMatch) {
        result.details.push({
          advertiserId: match.advertiserId,
          advertiserName: match.advertiserName,
          mediaId: match.yodeckMediaId,
          screenId: screen.id,
          playlistId: screen.playlistId!,
          action: "skipped",
          reason: `Targeting mismatch: screen=${screenCity}/${screenRegion}, target=${targetRegions.join(",")}`,
        });
        result.skipped++;
        continue;
      }
      
      if (dryRun) {
        result.details.push({
          advertiserId: match.advertiserId,
          advertiserName: match.advertiserName,
          mediaId: match.yodeckMediaId,
          screenId: screen.id,
          playlistId: screen.playlistId!,
          action: "published",
          reason: "dry_run",
        });
        result.published++;
        continue;
      }
      
      // Actually insert into playlist
      const insertResult = await addAdToScreenPlaylist(screen.playlistId!, match.yodeckMediaId);
      
      if (!insertResult.ok) {
        result.details.push({
          advertiserId: match.advertiserId,
          advertiserName: match.advertiserName,
          mediaId: match.yodeckMediaId,
          screenId: screen.id,
          playlistId: screen.playlistId!,
          action: "error",
          reason: insertResult.error,
        });
        result.errors++;
      } else if (insertResult.inserted) {
        result.details.push({
          advertiserId: match.advertiserId,
          advertiserName: match.advertiserName,
          mediaId: match.yodeckMediaId,
          screenId: screen.id,
          playlistId: screen.playlistId!,
          action: "published",
        });
        result.published++;
        console.log(`[AdPublish] Published: advertiser=${match.advertiserName} media=${match.yodeckMediaId} -> screen=${screen.name} playlist=${screen.playlistId}`);
      } else {
        result.details.push({
          advertiserId: match.advertiserId,
          advertiserName: match.advertiserName,
          mediaId: match.yodeckMediaId,
          screenId: screen.id,
          playlistId: screen.playlistId!,
          action: "already_present",
        });
        result.alreadyPresent++;
      }
    }
  }
  
  console.log(`[AdPublish] Complete: scanned=${result.scanned} published=${result.published} already=${result.alreadyPresent} skipped=${result.skipped} errors=${result.errors}`);
  return result;
}
