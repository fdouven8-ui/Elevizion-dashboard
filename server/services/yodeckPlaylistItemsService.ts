/**
 * YodeckPlaylistItemsService - Manages playlist items (media in playlists)
 * 
 * This is the CRITICAL service that ensures uploaded videos actually appear on screens.
 * 
 * Key operations:
 * - getPlaylistById: Fetch playlist with items[]
 * - appendMediaToPlaylist: Add media to playlist (idempotent)
 * - ensureMediaUsedByLocation: Add media to the ADS playlist for a location
 * 
 * IMPORTANT: Yodeck requires FULL items[] array when patching playlists.
 * We must GET current items, append new one, then PATCH full array.
 */

import { yodeckRequest, FEATURE_FLAGS } from "./yodeckLayoutService";
import { db } from "../db";
import { locations } from "@shared/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export interface PlaylistItem {
  id: number;
  order: number;
  item: {
    id: number;
    name: string;
    type: string;
  } | number; // Yodeck can return either Shape A (object) or Shape B (number)
  duration: number;
}

export interface Playlist {
  id: number;
  name: string;
  items: PlaylistItem[];
  created_at: string;
  updated_at: string;
}

// ============================================================================
// HELPERS - Safe extraction for both Yodeck item shapes
// ============================================================================

/**
 * Safely extract media ID from a playlist item
 * Handles both:
 * - Shape A: item.item = { id: 123, name: "...", type: "..." }
 * - Shape B: item.item = 123 (just the number)
 */
export function extractMediaId(item: PlaylistItem): number | null {
  try {
    if (item.item === null || item.item === undefined) {
      return null;
    }
    if (typeof item.item === 'number') {
      return item.item; // Shape B
    }
    if (typeof item.item === 'object' && (item.item as any)?.id !== undefined) {
      return Number((item.item as any).id); // Shape A
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Safely extract media name from a playlist item
 * Returns "Media [id]" for Shape B items
 */
export function extractMediaName(item: PlaylistItem): string {
  try {
    if (typeof item.item === 'number') {
      return `Media ${item.item}`; // Shape B - no name available
    }
    if (typeof item.item === 'object' && (item.item as any)?.name) {
      return (item.item as any).name;
    }
    return "Unknown";
  } catch {
    return "Unknown";
  }
}

/**
 * Safely extract media type from a playlist item
 * Returns "unknown" for Shape B items
 */
export function extractMediaType(item: PlaylistItem): string {
  try {
    if (typeof item.item === 'number') {
      return "unknown"; // Shape B - no type available
    }
    if (typeof item.item === 'object' && (item.item as any)?.type) {
      return (item.item as any).type;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export interface AppendMediaResult {
  ok: boolean;
  alreadyExists: boolean;
  playlistId: string;
  mediaId: string;
  itemCount: number;
  error?: string;
  logs: string[];
  formatUsed?: "shape_A" | "shape_B";
}

export interface EnsureMediaResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  adsPlaylistId: string | null;
  mediaId: string;
  appended: boolean;
  pushed: boolean;
  verified: boolean;
  logs: string[];
  error?: string;
}

// ============================================================================
// PLAYLIST OPERATIONS
// ============================================================================

/**
 * Get playlist by ID, including items array
 */
export async function getPlaylistById(playlistId: string): Promise<{
  ok: boolean;
  playlist?: Playlist;
  error?: string;
}> {
  console.log(`[PlaylistItems] Fetching playlist ${playlistId}...`);
  
  const result = await yodeckRequest<Playlist>(`/playlists/${playlistId}/`);
  
  if (!result.ok) {
    console.error(`[PlaylistItems] Failed to fetch playlist ${playlistId}: ${result.error}`);
    return { ok: false, error: result.error };
  }
  
  console.log(`[PlaylistItems] Playlist ${playlistId} has ${result.data?.items?.length || 0} items`);
  return { ok: true, playlist: result.data };
}

/**
 * Append media to playlist (idempotent)
 * 
 * IMPORTANT: Yodeck expects items[] in specific format.
 * We try Shape A first, then Shape B if 400 error.
 */
export async function appendMediaToPlaylist(
  playlistId: string,
  mediaId: string,
  opts: { duration?: number } = {}
): Promise<AppendMediaResult> {
  const logs: string[] = [];
  const duration = opts.duration ?? 10; // Default 10 seconds
  
  logs.push(`[AppendMedia] Starting: playlist=${playlistId}, media=${mediaId}`);
  
  // Step 1: Get current playlist
  const fetchResult = await getPlaylistById(playlistId);
  if (!fetchResult.ok || !fetchResult.playlist) {
    return {
      ok: false,
      alreadyExists: false,
      playlistId,
      mediaId,
      itemCount: 0,
      error: fetchResult.error || "Failed to fetch playlist",
      logs,
    };
  }
  
  const playlist = fetchResult.playlist;
  const currentItems = playlist.items || [];
  logs.push(`[AppendMedia] Current item count: ${currentItems.length}`);
  
  // Step 2: Check if media already exists (idempotency)
  const mediaIdNum = parseInt(mediaId);
  if (isNaN(mediaIdNum)) {
    return {
      ok: false,
      alreadyExists: false,
      playlistId,
      mediaId,
      itemCount: 0,
      error: `Invalid media ID: ${mediaId}`,
      logs,
    };
  }
  
  const alreadyExists = currentItems.some(item => extractMediaId(item) === mediaIdNum);
  
  if (alreadyExists) {
    logs.push(`[AppendMedia] Media ${mediaId} already exists in playlist - skipping`);
    return {
      ok: true,
      alreadyExists: true,
      playlistId,
      mediaId,
      itemCount: currentItems.length,
      logs,
    };
  }
  
  // Step 3: Try Shape A: { "item": { "id": mediaId } }
  const nextOrder = currentItems.length;
  
  // Build items array using Shape A format
  const buildShapeAItems = () => {
    return currentItems.map(item => {
      const id = extractMediaId(item);
      if (id === null) {
        throw new Error(`Cannot extract media ID from item: ${JSON.stringify(item)}`);
      }
      return {
        id: item.id,
        order: item.order,
        item: { id },
        duration: item.duration,
      };
    });
  };
  
  // Build items array using Shape B format
  const buildShapeBItems = () => {
    return currentItems.map(item => {
      const id = extractMediaId(item);
      if (id === null) {
        throw new Error(`Cannot extract media ID from item: ${JSON.stringify(item)}`);
      }
      return {
        id: item.id,
        order: item.order,
        item: id,
        duration: item.duration,
      };
    });
  };
  
  let shapeAItems;
  try {
    shapeAItems = buildShapeAItems();
  } catch (e: any) {
    logs.push(`[AppendMedia] Failed to build Shape A items: ${e.message}`);
    return {
      ok: false,
      alreadyExists: false,
      playlistId,
      mediaId,
      itemCount: 0,
      error: e.message,
      logs,
    };
  }
  
  const shapeA = {
    items: [
      ...shapeAItems,
      {
        order: nextOrder,
        item: { id: mediaIdNum },
        duration: duration,
      },
    ],
  };
  
  logs.push(`[AppendMedia] Trying Shape A: item.id = ${mediaIdNum}`);
  let patchResult = await yodeckRequest<Playlist>(`/playlists/${playlistId}/`, "PATCH", shapeA);
  
  if (patchResult.ok) {
    logs.push(`[AppendMedia] Shape A succeeded!`);
    return {
      ok: true,
      alreadyExists: false,
      playlistId,
      mediaId,
      itemCount: patchResult.data?.items?.length || currentItems.length + 1,
      logs,
      formatUsed: "shape_A",
    };
  }
  
  // Step 4: Try Shape B: { "item": mediaId } (direct ID)
  logs.push(`[AppendMedia] Shape A failed (${patchResult.status}): ${patchResult.error}`);
  logs.push(`[AppendMedia] Trying Shape B: item = ${mediaIdNum}`);
  
  let shapeBItems;
  try {
    shapeBItems = buildShapeBItems();
  } catch (e: any) {
    logs.push(`[AppendMedia] Failed to build Shape B items: ${e.message}`);
    return {
      ok: false,
      alreadyExists: false,
      playlistId,
      mediaId,
      itemCount: 0,
      error: e.message,
      logs,
    };
  }
  
  const shapeB = {
    items: [
      ...shapeBItems,
      {
        order: nextOrder,
        item: mediaIdNum,
        duration: duration,
      },
    ],
  };
  
  patchResult = await yodeckRequest<Playlist>(`/playlists/${playlistId}/`, "PATCH", shapeB);
  
  if (patchResult.ok) {
    logs.push(`[AppendMedia] Shape B succeeded!`);
    return {
      ok: true,
      alreadyExists: false,
      playlistId,
      mediaId,
      itemCount: patchResult.data?.items?.length || currentItems.length + 1,
      logs,
      formatUsed: "shape_B",
    };
  }
  
  // Step 5: Both failed - PLAYLIST_ITEM_FORMAT_UNKNOWN
  logs.push(`[AppendMedia] PLAYLIST_ITEM_FORMAT_UNKNOWN: Both shapes failed`);
  logs.push(`[AppendMedia] Shape B error: ${patchResult.error}`);
  
  return {
    ok: false,
    alreadyExists: false,
    playlistId,
    mediaId,
    itemCount: currentItems.length,
    error: `PLAYLIST_ITEM_FORMAT_UNKNOWN: Shape A and B both failed. Last error: ${patchResult.error}`,
    logs,
  };
}

/**
 * Push screen content (trigger screen to reload)
 */
export async function pushScreen(yodeckDeviceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  console.log(`[PlaylistItems] Pushing screen ${yodeckDeviceId}...`);
  
  const result = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/push/`, "POST");
  
  if (!result.ok) {
    console.error(`[PlaylistItems] Push failed: ${result.error}`);
    return { ok: false, error: result.error };
  }
  
  console.log(`[PlaylistItems] Push succeeded for screen ${yodeckDeviceId}`);
  return { ok: true };
}

/**
 * Verify media exists in playlist items
 * Uses extractMediaId to safely handle both Yodeck item shapes
 */
export async function verifyMediaInPlaylist(
  playlistId: string,
  mediaId: string
): Promise<{ ok: boolean; found: boolean; itemCount: number }> {
  const fetchResult = await getPlaylistById(playlistId);
  
  if (!fetchResult.ok || !fetchResult.playlist) {
    return { ok: false, found: false, itemCount: 0 };
  }
  
  const mediaIdNum = parseInt(mediaId);
  if (isNaN(mediaIdNum)) {
    return { ok: false, found: false, itemCount: 0 };
  }
  
  // Use shared helper to safely extract media ID from either shape
  const found = fetchResult.playlist.items.some(item => extractMediaId(item) === mediaIdNum);
  
  return { 
    ok: true, 
    found, 
    itemCount: fetchResult.playlist.items.length 
  };
}

// ============================================================================
// LOCATION-BASED OPERATIONS
// ============================================================================

/**
 * Ensure media is used by a location's ADS playlist
 * This is the key function that makes uploaded videos visible on screens.
 * 
 * Flow:
 * 1. Get location from DB (need adsPlaylistId and yodeckDeviceId)
 * 2. Append media to ADS playlist (idempotent)
 * 3. Push screen to reload
 * 4. Verify media is in playlist
 */
export async function ensureMediaUsedByLocation(
  locationId: string,
  mediaId: string,
  opts: { skipPush?: boolean; skipVerify?: boolean } = {}
): Promise<EnsureMediaResult> {
  const logs: string[] = [];
  logs.push(`[EnsureMediaUsed] Starting: location=${locationId}, media=${mediaId}`);
  
  // Step 1: Get location from DB
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    logs.push(`[EnsureMediaUsed] ERROR: Location not found`);
    return {
      ok: false,
      locationId,
      locationName: "Unknown",
      adsPlaylistId: null,
      mediaId,
      appended: false,
      pushed: false,
      verified: false,
      logs,
      error: "Location not found",
    };
  }
  
  logs.push(`[EnsureMediaUsed] Location: ${location.name}`);
  
  // Check if location has ADS playlist (stored as yodeckPlaylistId)
  if (!location.yodeckPlaylistId) {
    logs.push(`[EnsureMediaUsed] ERROR: Location has no ADS playlist`);
    return {
      ok: false,
      locationId,
      locationName: location.name,
      adsPlaylistId: null,
      mediaId,
      appended: false,
      pushed: false,
      verified: false,
      logs,
      error: "Location has no ADS playlist configured",
    };
  }
  
  const adsPlaylistId = location.yodeckPlaylistId;
  logs.push(`[EnsureMediaUsed] ADS playlist: ${adsPlaylistId}`);
  
  // Step 2: Append media to ADS playlist
  const appendResult = await appendMediaToPlaylist(adsPlaylistId, mediaId);
  logs.push(...appendResult.logs);
  
  if (!appendResult.ok) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      adsPlaylistId,
      mediaId,
      appended: false,
      pushed: false,
      verified: false,
      logs,
      error: appendResult.error,
    };
  }
  
  const appended = !appendResult.alreadyExists;
  logs.push(`[EnsureMediaUsed] Appended: ${appended} (alreadyExists: ${appendResult.alreadyExists})`);
  
  // Step 3: Push screen (if not skipped and we have device ID)
  let pushed = false;
  if (!opts.skipPush && location.yodeckDeviceId) {
    logs.push(`[EnsureMediaUsed] Pushing screen ${location.yodeckDeviceId}...`);
    const pushResult = await pushScreen(location.yodeckDeviceId);
    pushed = pushResult.ok;
    logs.push(`[EnsureMediaUsed] Push result: ${pushed ? "OK" : pushResult.error}`);
  } else if (!location.yodeckDeviceId) {
    logs.push(`[EnsureMediaUsed] No device ID - skipping push`);
  } else {
    logs.push(`[EnsureMediaUsed] Push skipped (opts.skipPush=true)`);
  }
  
  // Step 4: Verify (if not skipped)
  let verified = false;
  if (!opts.skipVerify) {
    logs.push(`[EnsureMediaUsed] Verifying media in playlist...`);
    const verifyResult = await verifyMediaInPlaylist(adsPlaylistId, mediaId);
    verified = verifyResult.found;
    logs.push(`[EnsureMediaUsed] Verify: found=${verified}, itemCount=${verifyResult.itemCount}`);
  } else {
    logs.push(`[EnsureMediaUsed] Verification skipped`);
    verified = true; // Assume success if skipped
  }
  
  return {
    ok: verified,
    locationId,
    locationName: location.name,
    adsPlaylistId,
    mediaId,
    appended,
    pushed,
    verified,
    logs,
  };
}

/**
 * Get playlist items summary for a location's playlists
 * Used by UI to show what's in BASE and ADS playlists
 */
export async function getLocationPlaylistsSummary(locationId: string): Promise<{
  ok: boolean;
  locationId: string;
  locationName: string;
  base: {
    playlistId: string | null;
    playlistName: string | null;
    itemCount: number;
    items: { id: number; name: string; type: string }[];
  };
  ads: {
    playlistId: string | null;
    playlistName: string | null;
    itemCount: number;
    items: { id: number; name: string; type: string }[];
  };
  error?: string;
}> {
  // Get location from DB
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    return {
      ok: false,
      locationId,
      locationName: "Unknown",
      base: { playlistId: null, playlistName: null, itemCount: 0, items: [] },
      ads: { playlistId: null, playlistName: null, itemCount: 0, items: [] },
      error: "Location not found",
    };
  }
  
  // Fetch both playlists (using correct field names from schema)
  const baseResult = location.yodeckBaselinePlaylistId 
    ? await getPlaylistById(location.yodeckBaselinePlaylistId)
    : null;
  
  const adsResult = location.yodeckPlaylistId
    ? await getPlaylistById(location.yodeckPlaylistId)
    : null;
  
  // Use shared helpers to safely extract item info from either Yodeck shape
  const mapPlaylistItems = (items: PlaylistItem[]) => 
    items.slice(0, 10).map(item => ({
      id: extractMediaId(item) || 0,
      name: extractMediaName(item),
      type: extractMediaType(item),
    })).filter(item => item.id !== 0);
  
  return {
    ok: true,
    locationId,
    locationName: location.name,
    base: {
      playlistId: location.yodeckBaselinePlaylistId || null,
      playlistName: baseResult?.playlist?.name || null,
      itemCount: baseResult?.playlist?.items?.length || 0,
      items: mapPlaylistItems(baseResult?.playlist?.items || []),
    },
    ads: {
      playlistId: location.yodeckPlaylistId || null,
      playlistName: adsResult?.playlist?.name || null,
      itemCount: adsResult?.playlist?.items?.length || 0,
      items: mapPlaylistItems(adsResult?.playlist?.items || []),
    },
  };
}
