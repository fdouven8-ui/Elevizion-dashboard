/**
 * Combined Playlist Service
 * 
 * Implements the "single playlist per location" architecture:
 * - Each location gets ONE combined playlist: "Elevizion | Loop | {LocationName}"
 * - This playlist contains: base items (news/weather) + ads + fallback if no ads
 * - Ads are interleaved with base items for balanced content display
 * - Screen content is set to this playlist (not a layout)
 * 
 * Key workflows:
 * 1. ensureCombinedPlaylistForLocation() - Main autopilot entry point
 * 2. syncCombinedPlaylistItems() - Merge base + ads into playlist
 * 3. assignPlaylistToScreen() - Set screen content to playlist
 */

import { db } from "../db";
import { locations, advertisers, contracts, placements, screens, adAssets } from "@shared/schema";
import { eq, and, inArray, sql, desc, isNull, ne } from "drizzle-orm";
import { yodeckRequest } from "./yodeckLayoutService";
import { 
  getPlaylistById, 
  PlaylistItem, 
  extractMediaId,
  extractMediaType 
} from "./yodeckPlaylistItemsService";
import { systemSettings } from "@shared/schema";

// ============================================================================
// TYPES
// ============================================================================

export interface CombinedPlaylistResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  combinedPlaylistId: string | null;
  combinedPlaylistName: string | null;
  itemCount: number;
  baseItemCount: number;
  adsCount: number;
  screenAssigned: boolean;
  logs: string[];
  error?: string;
}

export interface PlaylistSearchResult {
  id: number;
  name: string;
  items?: any[];
}

// ============================================================================
// CONFIG
// ============================================================================

const COMBINED_PLAYLIST_PREFIX = "Elevizion | Loop | ";
const DEFAULT_AD_DURATION = 15;
const BASE_ITEMS_BETWEEN_ADS = 2;

// ============================================================================
// CONFIG STORAGE
// ============================================================================

const CONFIG_KEY_BASE_PLAYLIST = "autopilot.basePlaylistId";

/**
 * Get the configured base playlist ID from autopilot config
 */
export async function getBasePlaylistId(): Promise<string | null> {
  // First check environment variable
  const envValue = process.env.AUTOPILOT_BASE_PLAYLIST_ID;
  if (envValue) {
    return envValue;
  }
  
  // Then check database
  const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, CONFIG_KEY_BASE_PLAYLIST));
  return setting?.value || null;
}

/**
 * Set the base playlist ID in autopilot config
 */
export async function setBasePlaylistId(playlistId: string): Promise<void> {
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, CONFIG_KEY_BASE_PLAYLIST));
  
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value: playlistId, updatedAt: new Date() })
      .where(eq(systemSettings.key, CONFIG_KEY_BASE_PLAYLIST));
  } else {
    await db.insert(systemSettings).values({
      key: CONFIG_KEY_BASE_PLAYLIST,
      value: playlistId,
      description: "Base playlist ID for combined playlist autopilot",
      category: "autopilot",
    });
  }
  console.log(`[CombinedPlaylist] Base playlist ID set to: ${playlistId}`);
}

/**
 * Generate canonical combined playlist name for a location
 */
export function getCombinedPlaylistName(locationName: string): string {
  return `${COMBINED_PLAYLIST_PREFIX}${locationName}`.trim();
}

/**
 * Search Yodeck for playlists by name (case-insensitive prefix match)
 * Returns all matching playlists for deduplication
 */
async function searchPlaylistsByName(name: string): Promise<PlaylistSearchResult[]> {
  console.log(`[CombinedPlaylist] Searching for playlists matching: "${name}"`);
  
  const result = await yodeckRequest<{ results: any[] }>(`/playlists/?q=${encodeURIComponent(name)}`);
  
  if (!result.ok || !result.data?.results) {
    console.log(`[CombinedPlaylist] Search failed or empty: ${result.error}`);
    return [];
  }
  
  // Filter for exact name match (case-insensitive)
  const matches = result.data.results.filter((p: any) => 
    p.name?.toLowerCase().trim() === name.toLowerCase().trim()
  );
  
  console.log(`[CombinedPlaylist] Found ${matches.length} matching playlists`);
  return matches.map((p: any) => ({ id: p.id, name: p.name, items: p.items }));
}

/**
 * Create a new Classic playlist in Yodeck
 */
async function createClassicPlaylist(name: string): Promise<{ ok: boolean; playlistId?: number; error?: string }> {
  console.log(`[CombinedPlaylist] Creating classic playlist: "${name}"`);
  
  const payload = {
    name,
    type: "classic",
    items: [],
    description: "Auto-managed by Elevizion Autopilot",
  };
  
  const result = await yodeckRequest<any>(`/playlists/`, "POST", payload);
  
  if (!result.ok) {
    console.error(`[CombinedPlaylist] Create failed: ${result.error}`);
    return { ok: false, error: result.error };
  }
  
  const playlistId = result.data?.id;
  if (!playlistId) {
    return { ok: false, error: "No playlist ID in response" };
  }
  
  console.log(`[CombinedPlaylist] Created playlist ID: ${playlistId}`);
  return { ok: true, playlistId };
}

/**
 * Find or create the combined playlist for a location
 * Implements deduplication: if multiple exist, use lowest ID
 */
export async function ensureCombinedPlaylist(
  locationId: string,
  locationName: string,
  logs: string[]
): Promise<{ ok: boolean; playlistId: string | null; playlistName: string; isNew: boolean; error?: string }> {
  const playlistName = getCombinedPlaylistName(locationName);
  logs.push(`[CombinedPlaylist] Ensuring playlist: "${playlistName}"`);
  
  // Check if we have a stored ID first
  const [location] = await db.select({ combinedPlaylistId: locations.combinedPlaylistId })
    .from(locations)
    .where(eq(locations.id, locationId));
  
  if (location?.combinedPlaylistId) {
    // Verify it still exists in Yodeck
    const verifyResult = await getPlaylistById(location.combinedPlaylistId);
    if (verifyResult.ok && verifyResult.playlist) {
      logs.push(`[CombinedPlaylist] ✓ Using stored playlist ID: ${location.combinedPlaylistId}`);
      return { ok: true, playlistId: location.combinedPlaylistId, playlistName, isNew: false };
    }
    logs.push(`[CombinedPlaylist] ⚠️ Stored playlist ${location.combinedPlaylistId} not found in Yodeck`);
  }
  
  // Search for existing playlists with this name
  const matches = await searchPlaylistsByName(playlistName);
  
  if (matches.length > 0) {
    // Deduplication: use lowest ID as canonical
    const sortedMatches = [...matches].sort((a, b) => a.id - b.id);
    const canonical = sortedMatches[0];
    
    if (matches.length > 1) {
      logs.push(`[CombinedPlaylist] ⚠️ Found ${matches.length} duplicates - using canonical ID ${canonical.id}`);
      logs.push(`[CombinedPlaylist] Duplicate IDs: ${sortedMatches.slice(1).map(m => m.id).join(", ")}`);
    } else {
      logs.push(`[CombinedPlaylist] ✓ Found existing playlist: ID ${canonical.id}`);
    }
    
    // Store the canonical ID
    await db.update(locations).set({
      combinedPlaylistId: String(canonical.id),
    }).where(eq(locations.id, locationId));
    
    return { ok: true, playlistId: String(canonical.id), playlistName, isNew: false };
  }
  
  // Create new playlist
  logs.push(`[CombinedPlaylist] Creating new playlist: "${playlistName}"`);
  const createResult = await createClassicPlaylist(playlistName);
  
  if (!createResult.ok || !createResult.playlistId) {
    logs.push(`[CombinedPlaylist] ❌ Create failed: ${createResult.error}`);
    return { ok: false, playlistId: null, playlistName, isNew: false, error: createResult.error };
  }
  
  // Store the new ID
  await db.update(locations).set({
    combinedPlaylistId: String(createResult.playlistId),
  }).where(eq(locations.id, locationId));
  
  logs.push(`[CombinedPlaylist] ✓ Created new playlist: ID ${createResult.playlistId}`);
  return { ok: true, playlistId: String(createResult.playlistId), playlistName, isNew: true };
}

/**
 * Fetch items from the base playlist
 */
export async function getBasePlaylistItems(logs: string[]): Promise<PlaylistItem[]> {
  const basePlaylistId = await getBasePlaylistId();
  
  if (!basePlaylistId) {
    logs.push(`[CombinedPlaylist] ⚠️ No base playlist configured`);
    return [];
  }
  
  logs.push(`[CombinedPlaylist] Fetching base playlist items from ID: ${basePlaylistId}`);
  const result = await getPlaylistById(basePlaylistId);
  
  if (!result.ok || !result.playlist) {
    logs.push(`[CombinedPlaylist] ❌ Failed to fetch base playlist: ${result.error}`);
    return [];
  }
  
  logs.push(`[CombinedPlaylist] ✓ Base playlist has ${result.playlist.items.length} items`);
  return result.playlist.items;
}

/**
 * Get approved ads for a specific location
 * Chain: location → screens → placements → contracts → advertisers → approved assets
 */
export async function getAdsForLocation(locationId: string, logs: string[]): Promise<{
  mediaIds: number[];
  durations: number[];
}> {
  logs.push(`[CombinedPlaylist] Looking up ads for location ${locationId}`);
  
  // Step 1: Get screens for this location
  const locationScreens = await db.select({ id: screens.id })
    .from(screens)
    .where(eq(screens.locationId, locationId));
  
  if (locationScreens.length === 0) {
    logs.push(`[CombinedPlaylist] No screens linked to location`);
    return { mediaIds: [], durations: [] };
  }
  
  const screenIds = locationScreens.map(s => s.id);
  logs.push(`[CombinedPlaylist] Found ${screenIds.length} screens`);
  
  // Step 2: Get placements for these screens
  const screenPlacements = await db.select({ contractId: placements.contractId })
    .from(placements)
    .where(and(
      inArray(placements.screenId, screenIds),
      eq(placements.isActive, true)
    ));
  
  if (screenPlacements.length === 0) {
    logs.push(`[CombinedPlaylist] No active placements - trying global fallback`);
    return getGlobalApprovedAds(logs);
  }
  
  const contractIds = Array.from(new Set(screenPlacements.map(p => p.contractId)));
  logs.push(`[CombinedPlaylist] Found ${contractIds.length} contracts`);
  
  // Step 3: Get advertisers from contracts
  const contractData = await db.select({ advertiserId: contracts.advertiserId })
    .from(contracts)
    .where(and(
      inArray(contracts.id, contractIds),
      eq(contracts.status, "active")
    ));
  
  const advertiserIds = Array.from(new Set(contractData.map(c => c.advertiserId)));
  logs.push(`[CombinedPlaylist] Found ${advertiserIds.length} advertisers`);
  
  // Step 4: Get approved assets for these advertisers (using adAssets table)
  const approvedAssets = await db.select({
    yodeckMediaId: adAssets.yodeckMediaId,
  })
    .from(adAssets)
    .where(and(
      inArray(adAssets.advertiserId, advertiserIds),
      eq(adAssets.approvalStatus, "APPROVED")
    ));
  
  if (approvedAssets.length === 0) {
    logs.push(`[CombinedPlaylist] No approved assets for advertisers - trying global fallback`);
    return getGlobalApprovedAds(logs);
  }
  
  const mediaIds = approvedAssets
    .filter(a => a.yodeckMediaId !== null)
    .map(a => a.yodeckMediaId!);
  
  logs.push(`[CombinedPlaylist] ✓ Found ${mediaIds.length} approved ads`);
  
  return { 
    mediaIds, 
    durations: mediaIds.map(() => DEFAULT_AD_DURATION) 
  };
}

/**
 * Global fallback: get any recent approved ads
 */
async function getGlobalApprovedAds(logs: string[]): Promise<{
  mediaIds: number[];
  durations: number[];
}> {
  logs.push(`[CombinedPlaylist] Fetching global approved ads (fallback)`);
  
  const recentAds = await db.select({
    yodeckMediaId: adAssets.yodeckMediaId,
  })
    .from(adAssets)
    .where(eq(adAssets.approvalStatus, "APPROVED"))
    .orderBy(desc(adAssets.approvedAt))
    .limit(10);
  
  const mediaIds = recentAds
    .filter(a => a.yodeckMediaId !== null)
    .map(a => a.yodeckMediaId!);
  
  if (mediaIds.length > 0) {
    logs.push(`[CombinedPlaylist] ✓ Found ${mediaIds.length} global approved ads`);
  } else {
    logs.push(`[CombinedPlaylist] ⚠️ No approved ads found anywhere`);
  }
  
  return { 
    mediaIds, 
    durations: mediaIds.map(() => DEFAULT_AD_DURATION) 
  };
}

/**
 * Get a fallback media item from Yodeck (first available video)
 */
async function getFallbackMedia(logs: string[]): Promise<number | null> {
  logs.push(`[CombinedPlaylist] Finding fallback media...`);
  
  const result = await yodeckRequest<{ results: any[] }>(`/media/?type=video&limit=1`);
  
  if (!result.ok || !result.data?.results?.length) {
    logs.push(`[CombinedPlaylist] ⚠️ No fallback media found`);
    return null;
  }
  
  const fallbackId = result.data.results[0].id;
  logs.push(`[CombinedPlaylist] ✓ Using fallback media ID: ${fallbackId}`);
  return fallbackId;
}

/**
 * Build combined items array by interleaving base items with ads
 * Pattern: [base, base, ad, base, base, ad, ...]
 */
export function buildCombinedItems(
  baseItems: PlaylistItem[],
  adMediaIds: number[],
  adDurations: number[],
  logs: string[]
): any[] {
  logs.push(`[CombinedPlaylist] Building combined items: ${baseItems.length} base + ${adMediaIds.length} ads`);
  
  const combined: any[] = [];
  let priority = 1;
  let adIndex = 0;
  
  for (let i = 0; i < baseItems.length; i++) {
    const baseItem = baseItems[i];
    
    // Add base item - preserve its original structure
    combined.push({
      id: extractMediaId(baseItem) || baseItem.id,
      type: extractMediaType(baseItem) || "media",
      priority: priority++,
      duration: baseItem.duration || 10,
    });
    
    // After every N base items, insert an ad (if available)
    if ((i + 1) % BASE_ITEMS_BETWEEN_ADS === 0 && adIndex < adMediaIds.length) {
      combined.push({
        id: adMediaIds[adIndex],
        type: "media",
        priority: priority++,
        duration: adDurations[adIndex] || DEFAULT_AD_DURATION,
      });
      adIndex++;
    }
  }
  
  // Add remaining ads at the end
  while (adIndex < adMediaIds.length) {
    combined.push({
      id: adMediaIds[adIndex],
      type: "media",
      priority: priority++,
      duration: adDurations[adIndex] || DEFAULT_AD_DURATION,
    });
    adIndex++;
  }
  
  logs.push(`[CombinedPlaylist] ✓ Built ${combined.length} total items`);
  return combined;
}

/**
 * Sync combined playlist items via PATCH
 */
async function patchPlaylistItems(
  playlistId: string,
  items: any[],
  logs: string[]
): Promise<{ ok: boolean; error?: string }> {
  logs.push(`[CombinedPlaylist] PATCH /playlists/${playlistId}/ with ${items.length} items`);
  
  const payload = { items };
  
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`, "PATCH", payload);
  
  if (!result.ok) {
    // Check for HTML error response
    if (result.error?.includes("<!DOCTYPE") || result.error?.includes("Not Found")) {
      logs.push(`[CombinedPlaylist] ❌ PATCH failed: HTML response (wrong endpoint?)`);
      return { ok: false, error: "YODECK_API_HTML_RESPONSE" };
    }
    logs.push(`[CombinedPlaylist] ❌ PATCH failed: ${result.error?.substring(0, 200)}`);
    return { ok: false, error: result.error };
  }
  
  logs.push(`[CombinedPlaylist] ✓ PATCH succeeded`);
  return { ok: true };
}

/**
 * Assign playlist to screen content
 */
async function assignPlaylistToScreen(
  yodeckDeviceId: string,
  playlistId: string,
  logs: string[]
): Promise<{ ok: boolean; error?: string }> {
  logs.push(`[CombinedPlaylist] Assigning playlist ${playlistId} to screen ${yodeckDeviceId}`);
  
  // First verify the screen exists
  const getResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`);
  if (!getResult.ok) {
    logs.push(`[CombinedPlaylist] ❌ Screen ${yodeckDeviceId} not found`);
    return { ok: false, error: "SCREEN_NOT_FOUND" };
  }
  
  // Set screen content to playlist
  const payload = {
    screen_content: {
      source_type: "playlist",
      source_id: parseInt(playlistId),
    }
  };
  
  const patchResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`, "PATCH", payload);
  
  if (!patchResult.ok) {
    logs.push(`[CombinedPlaylist] ❌ Screen PATCH failed: ${patchResult.error?.substring(0, 200)}`);
    return { ok: false, error: patchResult.error };
  }
  
  // Verify the assignment
  const verifyResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`);
  if (verifyResult.ok) {
    const content = verifyResult.data?.screen_content;
    if (content?.source_type === "playlist" && String(content?.source_id) === playlistId) {
      logs.push(`[CombinedPlaylist] ✓ Screen content verified: playlist ${playlistId}`);
      return { ok: true };
    }
    logs.push(`[CombinedPlaylist] ⚠️ Screen content mismatch: ${JSON.stringify(content)}`);
  }
  
  return { ok: true }; // Assume success if PATCH worked
}

/**
 * Main autopilot entry point: ensure combined playlist for location
 */
export async function ensureCombinedPlaylistForLocation(locationId: string): Promise<CombinedPlaylistResult> {
  const logs: string[] = [];
  logs.push(`[Autopilot] ═══════════════════════════════════════`);
  logs.push(`[Autopilot] Combined Playlist Mode voor ${locationId}`);
  
  // Step 0: Get location data
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    return {
      ok: false,
      locationId,
      locationName: "Onbekend",
      combinedPlaylistId: null,
      combinedPlaylistName: null,
      itemCount: 0,
      baseItemCount: 0,
      adsCount: 0,
      screenAssigned: false,
      logs,
      error: "LOCATION_NOT_FOUND",
    };
  }
  
  logs.push(`[Autopilot] Locatie: ${location.name}`);
  
  // Step 1: Check base playlist config
  logs.push(`[Autopilot] ─── STAP 1: Basis playlist ───`);
  const basePlaylistId = await getBasePlaylistId();
  if (!basePlaylistId) {
    logs.push(`[Autopilot] ❌ Geen basis playlist geconfigureerd`);
    logs.push(`[Autopilot] Configureer AUTOPILOT_BASE_PLAYLIST_ID via admin`);
    return {
      ok: false,
      locationId,
      locationName: location.name,
      combinedPlaylistId: null,
      combinedPlaylistName: null,
      itemCount: 0,
      baseItemCount: 0,
      adsCount: 0,
      screenAssigned: false,
      logs,
      error: "MISSING_BASE_PLAYLIST_CONFIG",
    };
  }
  logs.push(`[Autopilot] ✓ Basis playlist ID: ${basePlaylistId}`);
  
  // Step 2: Ensure combined playlist exists
  logs.push(`[Autopilot] ─── STAP 2: Combined playlist ───`);
  const playlistResult = await ensureCombinedPlaylist(locationId, location.name, logs);
  
  if (!playlistResult.ok || !playlistResult.playlistId) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      combinedPlaylistId: null,
      combinedPlaylistName: playlistResult.playlistName,
      itemCount: 0,
      baseItemCount: 0,
      adsCount: 0,
      screenAssigned: false,
      logs,
      error: playlistResult.error || "COMBINED_PLAYLIST_CREATE_FAILED",
    };
  }
  
  // Step 3: Sync combined items
  logs.push(`[Autopilot] ─── STAP 3: Items synchroniseren ───`);
  
  // 3A: Get base items
  const baseItems = await getBasePlaylistItems(logs);
  
  // 3B: Get ads for location
  const { mediaIds: adMediaIds, durations: adDurations } = await getAdsForLocation(locationId, logs);
  
  // 3C: Get fallback if no ads AND no base items
  let finalAdIds = adMediaIds;
  let finalAdDurations = adDurations;
  
  if (baseItems.length === 0 && adMediaIds.length === 0) {
    logs.push(`[Autopilot] ⚠️ Geen content - fallback video toevoegen`);
    const fallbackId = await getFallbackMedia(logs);
    if (fallbackId) {
      finalAdIds = [fallbackId];
      finalAdDurations = [DEFAULT_AD_DURATION];
    }
  }
  
  // Also add fallback if we have base but no ads
  if (baseItems.length > 0 && adMediaIds.length === 0) {
    logs.push(`[Autopilot] ⚠️ Geen ads - fallback video toevoegen als ad`);
    const fallbackId = await getFallbackMedia(logs);
    if (fallbackId) {
      finalAdIds = [fallbackId];
      finalAdDurations = [DEFAULT_AD_DURATION];
    }
  }
  
  // 3D: Build combined items
  const combinedItems = buildCombinedItems(baseItems, finalAdIds, finalAdDurations, logs);
  
  // 3E: PATCH the playlist
  const patchResult = await patchPlaylistItems(playlistResult.playlistId, combinedItems, logs);
  
  if (!patchResult.ok) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      combinedPlaylistId: playlistResult.playlistId,
      combinedPlaylistName: playlistResult.playlistName,
      itemCount: 0,
      baseItemCount: baseItems.length,
      adsCount: finalAdIds.length,
      screenAssigned: false,
      logs,
      error: patchResult.error,
    };
  }
  
  // Step 4: Assign playlist to screen
  logs.push(`[Autopilot] ─── STAP 4: Scherm toewijzen ───`);
  
  let screenAssigned = false;
  
  // Get Yodeck device ID from location or linked screens
  let yodeckDeviceId = location.yodeckDeviceId;
  
  if (!yodeckDeviceId) {
    // Try to find from screens table
    const locationScreens = await db.select({ yodeckPlayerId: screens.yodeckPlayerId })
      .from(screens)
      .where(eq(screens.locationId, locationId));
    
    if (locationScreens.length > 0 && locationScreens[0].yodeckPlayerId) {
      yodeckDeviceId = locationScreens[0].yodeckPlayerId;
      logs.push(`[Autopilot] ✓ yodeckPlayerId gevonden via screens: ${yodeckDeviceId}`);
    }
  }
  
  if (yodeckDeviceId) {
    const assignResult = await assignPlaylistToScreen(yodeckDeviceId, playlistResult.playlistId, logs);
    screenAssigned = assignResult.ok;
    
    if (!screenAssigned) {
      logs.push(`[Autopilot] ⚠️ Scherm toewijzing mislukt: ${assignResult.error}`);
    }
  } else {
    logs.push(`[Autopilot] ⚠️ Geen Yodeck scherm gekoppeld - content klaar maar niet toegewezen`);
  }
  
  // Step 5: Update location record
  await db.update(locations).set({
    combinedPlaylistId: playlistResult.playlistId,
    combinedPlaylistVerifiedAt: new Date(),
    combinedPlaylistItemCount: combinedItems.length,
    lastYodeckVerifyError: null,
  }).where(eq(locations.id, locationId));
  
  logs.push(`[Autopilot] ═══════════════════════════════════════`);
  logs.push(`[Autopilot] ✓ Combined playlist sync voltooid`);
  logs.push(`[Autopilot]   Playlist: ${playlistResult.playlistName}`);
  logs.push(`[Autopilot]   Items: ${combinedItems.length} (${baseItems.length} base + ${finalAdIds.length} ads)`);
  logs.push(`[Autopilot]   Scherm: ${screenAssigned ? "toegewezen" : "niet toegewezen"}`);
  
  const isOk = combinedItems.length > 0;
  
  return {
    ok: isOk,
    locationId,
    locationName: location.name,
    combinedPlaylistId: playlistResult.playlistId,
    combinedPlaylistName: playlistResult.playlistName,
    itemCount: combinedItems.length,
    baseItemCount: baseItems.length,
    adsCount: finalAdIds.length,
    screenAssigned,
    logs,
    error: isOk ? undefined : "NO_CONTENT",
  };
}

/**
 * Get content status for a location (for admin dashboard)
 */
export async function getLocationContentStatus(locationId: string): Promise<{
  combinedPlaylistId: string | null;
  combinedPlaylistItemCount: number;
  screenContentMode: "playlist" | "layout" | "unknown";
  lastSyncAt: Date | null;
  needsRepair: boolean;
  error?: string;
}> {
  const [location] = await db.select({
    combinedPlaylistId: locations.combinedPlaylistId,
    combinedPlaylistItemCount: locations.combinedPlaylistItemCount,
    combinedPlaylistVerifiedAt: locations.combinedPlaylistVerifiedAt,
    yodeckDeviceId: locations.yodeckDeviceId,
    lastYodeckVerifyError: locations.lastYodeckVerifyError,
  }).from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    return {
      combinedPlaylistId: null,
      combinedPlaylistItemCount: 0,
      screenContentMode: "unknown",
      lastSyncAt: null,
      needsRepair: true,
      error: "LOCATION_NOT_FOUND",
    };
  }
  
  const needsRepair = !location.combinedPlaylistId || 
                      (location.combinedPlaylistItemCount || 0) === 0 ||
                      !!location.lastYodeckVerifyError;
  
  return {
    combinedPlaylistId: location.combinedPlaylistId,
    combinedPlaylistItemCount: location.combinedPlaylistItemCount || 0,
    screenContentMode: "playlist",
    lastSyncAt: location.combinedPlaylistVerifiedAt,
    needsRepair,
    error: location.lastYodeckVerifyError || undefined,
  };
}
