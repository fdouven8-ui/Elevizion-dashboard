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

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

async function yodeckRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = process.env.YODECK_AUTH_TOKEN;
  if (!token) {
    return { ok: false, error: "YODECK_AUTH_TOKEN not configured" };
  }

  try {
    const response = await fetch(`${YODECK_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Authorization": `Bearer ${token}`,
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
    return { ok: false, error: current.error };
  }

  const currentItems = current.items || [];
  
  // Check for duplicates
  if (currentItems.includes(mediaId)) {
    console.log(`[YodeckBroadcast] Media ${mediaId} already in playlist ${playlistId}, skipping`);
    return { ok: true };
  }

  // Add the new item
  const newItems = [...currentItems, mediaId];
  
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`, {
    method: "PATCH",
    body: JSON.stringify({
      items: newItems.map(id => ({ media_id: id })),
    }),
  });

  if (!result.ok) {
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

  // Create new playlist
  const createResult = await yodeckRequest<any>("/playlists/", {
    method: "POST",
    body: JSON.stringify({
      name: newName,
      items: templateItems.items.map(id => ({ media_id: id })),
    }),
  });

  if (!createResult.ok || !createResult.data?.id) {
    return { ok: false, error: `Failed to create playlist: ${createResult.error}` };
  }

  const newPlaylistId = String(createResult.data.id);
  console.log(`[YodeckBroadcast] Created playlist ${newPlaylistId} with ${templateItems.items.length} items`);

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

    // Save to DB
    await db.update(screens).set({
      playlistId,
      playlistName,
      updatedAt: new Date(),
    }).where(eq(screens.id, screenId));

    console.log(`[YodeckBroadcast] Created playlist ${playlistId} for screen ${screenId}`);
  }

  // Verify playlist has items
  const items = await yodeckGetPlaylistItems(playlistId);
  const itemCount = items.items?.length || 0;

  if (itemCount === 0) {
    console.warn(`[YodeckBroadcast] Playlist ${playlistId} is empty, re-seeding from template`);
    const templateItems = await yodeckGetPlaylistItems(templateId);
    if (templateItems.ok && templateItems.items && templateItems.items.length > 0) {
      for (const mediaId of templateItems.items) {
        await yodeckAddMediaToPlaylist(playlistId, mediaId);
      }
    }
  }

  return { ok: true, playlistId, created, itemCount };
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
  error?: string;
}> {
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
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
    };
  }

  const expected = screen.playlistId;
  const actual = actualResult.source;
  
  const mismatch = 
    actual.sourceType !== "playlist" || 
    actual.sourceId !== expected;

  const verificationOk = !mismatch && expected !== null;

  return {
    ok: true,
    screenId,
    yodeckPlayerId: screen.yodeckPlayerId,
    isOnline: screen.status === "online",
    expectedPlaylistId: expected,
    actualSourceType: actual.sourceType,
    actualSourceId: actual.sourceId,
    mismatch,
    verificationOk,
  };
}
