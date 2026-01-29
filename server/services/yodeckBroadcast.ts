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
import { eq } from "drizzle-orm";
import { getYodeckToken } from "./yodeckClient";

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

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Yodeck API error ${response.status}: ${text}` };
    }

    const data = await response.json();
    return { ok: true, data };
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

const MIN_BASELINE_COUNT = 4;

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
  const isOnline = screen.status === "online" || actualResult.isOnline === true;

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
    playlistId: actual.sourceId || expected,
    playlistName,
    expectedPlaylistName: screen.playlistName,
    itemCount: screen.yodeckContentCount ?? actual.itemCount ?? null,
    baselineCount: null,
    adsCount: 0,
    lastPushAt: screen.lastPushAt?.toISOString() || null,
    lastPushResult: screen.lastPushResult,
    deviceStatus: makeDeviceStatus(isOnline ? "ONLINE" : "OFFLINE", screen),
  };
}

// =============================================================================
// BACKFILL / MIGRATION
// =============================================================================

import { isNotNull } from "drizzle-orm";

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
