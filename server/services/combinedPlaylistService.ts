/**
 * LEGACY SERVICE - DISABLED
 * 
 * This service used LOCATION-based "Elevizion | Loop |" playlists.
 * Replaced by yodeckBroadcast.ts which uses SCREEN-based playlists.
 * 
 * All functions throw LEGACY_DISABLED error.
 */

// KILL SWITCH - All legacy code disabled
const LEGACY_DISABLED = true;
const LEGACY_ERROR = "LEGACY_COMBINED_PLAYLIST_DISABLED: Use yodeckBroadcast.ts instead";

function throwLegacyError(): never {
  throw new Error(LEGACY_ERROR);
}

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
  ads?: {
    playlistId: string | null;
    desiredCount: number;
    currentCount: number;
    adsAdded: number;
    adsRemoved: number;
    adsRepaired: boolean;
    adsStatus: "OK" | "PATCHED" | "FALLBACK_ONLY" | "ERROR";
    source: "placements" | "global" | "none";
  };
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
const CONFIG_KEY_BASE_TEMPLATE = "autopilot.baseTemplatePlaylistId";
const BASE_TEMPLATE_NAME = "Elevizion - Basis";
const BASELINE_PLAYLIST_PREFIX = "Baseline | ";

/**
 * Get the configured base playlist ID from autopilot config
 */
export async function getBasePlaylistId(): Promise<string | null> {
  if (LEGACY_DISABLED) throwLegacyError();
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
 * Get the configured base TEMPLATE playlist ID (for copying items to per-location baselines)
 * If not set, automatically searches for "Elevizion - Basis" in Yodeck and caches it
 */
export async function getBaseTemplatePlaylistId(): Promise<string | null> {
  if (LEGACY_DISABLED) throwLegacyError();
  // Check database first
  const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, CONFIG_KEY_BASE_TEMPLATE));
  if (setting?.value) {
    return setting.value;
  }
  
  // Auto-discover by searching for template playlist by name
  console.log(`[CombinedPlaylist] No template ID configured, searching for "${BASE_TEMPLATE_NAME}"...`);
  const matches = await searchPlaylistsByName(BASE_TEMPLATE_NAME);
  
  if (matches.length > 0) {
    // Use the one with lowest ID (canonical)
    const sorted = [...matches].sort((a, b) => a.id - b.id);
    const templateId = String(sorted[0].id);
    
    // Cache in database for next time
    await setBaseTemplatePlaylistId(templateId);
    console.log(`[CombinedPlaylist] Auto-discovered and cached template ID: ${templateId}`);
    return templateId;
  }
  
  console.log(`[CombinedPlaylist] Template playlist "${BASE_TEMPLATE_NAME}" not found in Yodeck`);
  return null;
}

/**
 * Set the base template playlist ID in config
 */
export async function setBaseTemplatePlaylistId(playlistId: string): Promise<void> {
  if (LEGACY_DISABLED) throwLegacyError();
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, CONFIG_KEY_BASE_TEMPLATE));
  
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value: playlistId, updatedAt: new Date() })
      .where(eq(systemSettings.key, CONFIG_KEY_BASE_TEMPLATE));
  } else {
    await db.insert(systemSettings).values({
      key: CONFIG_KEY_BASE_TEMPLATE,
      value: playlistId,
      description: "Base TEMPLATE playlist ID - items are copied to per-location baseline playlists",
      category: "autopilot",
    });
  }
  console.log(`[CombinedPlaylist] Base template playlist ID set to: ${playlistId}`);
}

/**
 * Set the base playlist ID in autopilot config
 */
export async function setBasePlaylistId(playlistId: string): Promise<void> {
  if (LEGACY_DISABLED) throwLegacyError();
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
  if (LEGACY_DISABLED) throwLegacyError();
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
  if (LEGACY_DISABLED) throwLegacyError();
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
 * Get config setting for allowGlobalFallbackAds
 */
async function getAllowGlobalFallbackAds(): Promise<boolean> {
  const [setting] = await db.select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "autopilot.allowGlobalFallbackAds"));
  
  if (setting?.value) {
    return setting.value === "true";
  }
  return false; // Default: NO global fallback
}

/**
 * Get approved ads for a specific location
 * Chain: location → screens → placements → contracts → advertisers → approved assets
 * 
 * IMPORTANT: Does NOT fall back to global ads unless allowGlobalFallbackAds=true
 * If no placements exist, returns empty array (only fallback video will be used)
 */
export async function getAdsForLocation(locationId: string, logs: string[]): Promise<{
  mediaIds: number[];
  durations: number[];
  source: "placements" | "global" | "none";
}> {
  logs.push(`[AdsSync] Looking up ads for location ${locationId}`);
  
  // Step 1: Get screens for this location
  const locationScreens = await db.select({ id: screens.id })
    .from(screens)
    .where(eq(screens.locationId, locationId));
  
  if (locationScreens.length === 0) {
    logs.push(`[AdsSync] No screens linked to location`);
    return { mediaIds: [], durations: [], source: "none" };
  }
  
  const screenIds = locationScreens.map(s => s.id);
  logs.push(`[AdsSync] Found ${screenIds.length} screens`);
  
  // Step 2: Get placements for these screens
  const screenPlacements = await db.select({ contractId: placements.contractId })
    .from(placements)
    .where(and(
      inArray(placements.screenId, screenIds),
      eq(placements.isActive, true)
    ));
  
  if (screenPlacements.length === 0) {
    logs.push(`[AdsSync] No active placements for this location`);
    
    // Check if global fallback is allowed
    const allowGlobal = await getAllowGlobalFallbackAds();
    if (allowGlobal) {
      logs.push(`[AdsSync] allowGlobalFallbackAds=true - using global ads`);
      return getGlobalApprovedAds(logs);
    } else {
      logs.push(`[AdsSync] allowGlobalFallbackAds=false - returning empty (fallback only)`);
      return { mediaIds: [], durations: [], source: "none" };
    }
  }
  
  const contractIds = Array.from(new Set(screenPlacements.map(p => p.contractId)));
  logs.push(`[AdsSync] Found ${contractIds.length} contracts from placements`);
  
  // Step 3: Get advertisers from contracts
  const contractData = await db.select({ advertiserId: contracts.advertiserId })
    .from(contracts)
    .where(and(
      inArray(contracts.id, contractIds),
      eq(contracts.status, "active")
    ));
  
  const advertiserIds = Array.from(new Set(contractData.map(c => c.advertiserId)));
  logs.push(`[AdsSync] Found ${advertiserIds.length} advertisers`);
  
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
    logs.push(`[AdsSync] No approved assets for advertisers`);
    
    // Check if global fallback is allowed
    const allowGlobal = await getAllowGlobalFallbackAds();
    if (allowGlobal) {
      logs.push(`[AdsSync] allowGlobalFallbackAds=true - using global ads`);
      return getGlobalApprovedAds(logs);
    } else {
      logs.push(`[AdsSync] allowGlobalFallbackAds=false - returning empty (fallback only)`);
      return { mediaIds: [], durations: [], source: "none" };
    }
  }
  
  const mediaIds = approvedAssets
    .filter(a => a.yodeckMediaId !== null)
    .map(a => a.yodeckMediaId!);
  
  logs.push(`[AdsSync] ✓ Found ${mediaIds.length} approved ads from placements`);
  
  return { 
    mediaIds, 
    durations: mediaIds.map(() => DEFAULT_AD_DURATION),
    source: "placements"
  };
}

/**
 * Global fallback: get any recent approved ads
 * Only used when allowGlobalFallbackAds=true
 */
async function getGlobalApprovedAds(logs: string[]): Promise<{
  mediaIds: number[];
  durations: number[];
  source: "placements" | "global" | "none";
}> {
  logs.push(`[AdsSync] Fetching global approved ads (fallback)`);
  
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
    logs.push(`[AdsSync] ✓ Found ${mediaIds.length} global approved ads`);
    return { 
      mediaIds, 
      durations: mediaIds.map(() => DEFAULT_AD_DURATION),
      source: "global"
    };
  } else {
    logs.push(`[AdsSync] ⚠️ No approved ads found anywhere`);
    return { 
      mediaIds: [], 
      durations: [],
      source: "none"
    };
  }
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
  if (LEGACY_DISABLED) throwLegacyError();
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
  
  // 3B: Get ads for location (authoritative - only from placements unless config allows global)
  const adsResult = await getAdsForLocation(locationId, logs);
  const { mediaIds: adMediaIds, durations: adDurations, source: adsSource } = adsResult;
  
  logs.push(`[AdsSync] Ads bron: ${adsSource} (${adMediaIds.length} items)`);
  if (adMediaIds.length > 0) {
    logs.push(`[AdsSync] desiredMediaIds=[${adMediaIds.slice(0, 5).join(", ")}${adMediaIds.length > 5 ? "..." : ""}]`);
  }
  
  // 3C: Get fallback if no ads AND no base items
  let finalAdIds = adMediaIds;
  let finalAdDurations = adDurations;
  let adsStatus: "OK" | "FALLBACK_ONLY" | "PATCHED" = adMediaIds.length > 0 ? "OK" : "FALLBACK_ONLY";
  
  if (baseItems.length === 0 && adMediaIds.length === 0) {
    logs.push(`[AdsSync] ⚠️ Geen content - fallback video toevoegen`);
    const fallbackId = await getFallbackMedia(logs);
    if (fallbackId) {
      finalAdIds = [fallbackId];
      finalAdDurations = [DEFAULT_AD_DURATION];
      adsStatus = "FALLBACK_ONLY";
    }
  }
  
  // Also add fallback if we have base but no ads
  if (baseItems.length > 0 && adMediaIds.length === 0) {
    logs.push(`[AdsSync] ⚠️ Geen ads - fallback video toevoegen als ad`);
    const fallbackId = await getFallbackMedia(logs);
    if (fallbackId) {
      finalAdIds = [fallbackId];
      finalAdDurations = [DEFAULT_AD_DURATION];
      adsStatus = "FALLBACK_ONLY";
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
  logs.push(`[Autopilot]   Ads bron: ${adsSource}, status: ${adsStatus}`);
  logs.push(`[Autopilot]   Scherm: ${screenAssigned ? "toegewezen" : "niet toegewezen"}`);
  
  const isOk = combinedItems.length > 0;
  
  // Ads are "repaired" if playlist is in desired state (even if nothing was added)
  const adsRepaired = isOk;
  
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
    ads: {
      playlistId: playlistResult.playlistId,
      desiredCount: finalAdIds.length,
      currentCount: finalAdIds.length, // After sync, current = desired
      adsAdded: 0, // Combined playlist is always replaced, not incremental
      adsRemoved: 0,
      adsRepaired,
      adsStatus,
      source: adsSource,
    },
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

// ============================================================================
// BASELINE FROM TEMPLATE - Core feature for syncing template items to per-location baselines
// ============================================================================

export interface BaselineSyncResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  baselinePlaylistId: string | null;
  baselinePlaylistName: string;
  templatePlaylistId: string | null;
  templateItemCount: number;
  baselineItemCount: number;
  itemsSynced: boolean;
  logs: string[];
  error?: string;
}

/**
 * Get the canonical baseline playlist name for a location
 */
export function getBaselinePlaylistName(locationName: string): string {
  return `${BASELINE_PLAYLIST_PREFIX}${locationName}`.trim();
}

/**
 * Ensure a location's baseline playlist exists and is filled from the template
 * 
 * This is the KEY function that:
 * 1. Finds or creates the per-location baseline playlist (e.g. "Baseline | Bouwservice Douven")
 * 2. Checks if baseline is empty
 * 3. If empty, copies ALL items from the template playlist ("Elevizion - Basis")
 * 
 * IDEMPOTENT: Can be called multiple times safely
 */
export async function ensureBaselineFromTemplate(locationId: string): Promise<BaselineSyncResult> {
  if (LEGACY_DISABLED) throwLegacyError();
  const logs: string[] = [];
  logs.push(`[BaselineSync] ═══════════════════════════════════════`);
  logs.push(`[BaselineSync] Baseline-from-Template voor locatie ${locationId}`);
  
  // Step 0: Get location data
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    return {
      ok: false,
      locationId,
      locationName: "Onbekend",
      baselinePlaylistId: null,
      baselinePlaylistName: "",
      templatePlaylistId: null,
      templateItemCount: 0,
      baselineItemCount: 0,
      itemsSynced: false,
      logs,
      error: "LOCATION_NOT_FOUND",
    };
  }
  
  logs.push(`[BaselineSync] Locatie: ${location.name}`);
  const baselinePlaylistName = getBaselinePlaylistName(location.name);
  logs.push(`[BaselineSync] Baseline playlist naam: "${baselinePlaylistName}"`);
  
  // Step 1: Get the template playlist ID
  logs.push(`[BaselineSync] ─── STAP 1: Template ophalen ───`);
  const templateId = await getBaseTemplatePlaylistId();
  
  if (!templateId) {
    logs.push(`[BaselineSync] ❌ Geen template playlist gevonden`);
    logs.push(`[BaselineSync] Maak playlist "Elevizion - Basis" in Yodeck of configureer via admin`);
    return {
      ok: false,
      locationId,
      locationName: location.name,
      baselinePlaylistId: location.yodeckBaselinePlaylistId || null,
      baselinePlaylistName,
      templatePlaylistId: null,
      templateItemCount: 0,
      baselineItemCount: 0,
      itemsSynced: false,
      logs,
      error: "TEMPLATE_NOT_FOUND",
    };
  }
  logs.push(`[BaselineSync] ✓ Template playlist ID: ${templateId}`);
  
  // Step 2: Fetch template items
  logs.push(`[BaselineSync] ─── STAP 2: Template items ophalen ───`);
  const templateResult = await getPlaylistById(templateId);
  
  if (!templateResult.ok || !templateResult.playlist) {
    logs.push(`[BaselineSync] ❌ Kon template playlist niet ophalen: ${templateResult.error}`);
    return {
      ok: false,
      locationId,
      locationName: location.name,
      baselinePlaylistId: location.yodeckBaselinePlaylistId || null,
      baselinePlaylistName,
      templatePlaylistId: templateId,
      templateItemCount: 0,
      baselineItemCount: 0,
      itemsSynced: false,
      logs,
      error: "TEMPLATE_FETCH_FAILED",
    };
  }
  
  const templateItems = templateResult.playlist.items || [];
  logs.push(`[BaselineSync] ✓ Template heeft ${templateItems.length} items`);
  
  // Step 3: Find or create baseline playlist for this location
  logs.push(`[BaselineSync] ─── STAP 3: Baseline playlist zoeken/maken ───`);
  let baselinePlaylistId = location.yodeckBaselinePlaylistId;
  let baselineCreated = false;
  
  if (!baselinePlaylistId) {
    // Search for existing baseline playlist by name
    const existingBaselines = await searchPlaylistsByName(baselinePlaylistName);
    
    if (existingBaselines.length > 0) {
      // Use canonical (lowest ID)
      const sorted = [...existingBaselines].sort((a, b) => a.id - b.id);
      baselinePlaylistId = String(sorted[0].id);
      logs.push(`[BaselineSync] ✓ Bestaande baseline gevonden: ID ${baselinePlaylistId}`);
      
      if (sorted.length > 1) {
        logs.push(`[BaselineSync] ⚠️ ${sorted.length - 1} duplicate baselines genegeerd`);
      }
    } else {
      // Create new baseline playlist
      logs.push(`[BaselineSync] Creating baseline playlist: "${baselinePlaylistName}"`);
      const createResult = await createClassicPlaylist(baselinePlaylistName);
      
      if (!createResult.ok || !createResult.playlistId) {
        logs.push(`[BaselineSync] ❌ Baseline aanmaken mislukt: ${createResult.error}`);
        return {
          ok: false,
          locationId,
          locationName: location.name,
          baselinePlaylistId: null,
          baselinePlaylistName,
          templatePlaylistId: templateId,
          templateItemCount: templateItems.length,
          baselineItemCount: 0,
          itemsSynced: false,
          logs,
          error: "BASELINE_CREATE_FAILED",
        };
      }
      
      baselinePlaylistId = String(createResult.playlistId);
      baselineCreated = true;
      logs.push(`[BaselineSync] ✓ Baseline aangemaakt: ID ${baselinePlaylistId}`);
    }
    
    // Store baseline ID in location record
    await db.update(locations).set({
      yodeckBaselinePlaylistId: baselinePlaylistId,
    }).where(eq(locations.id, locationId));
    logs.push(`[BaselineSync] ✓ Baseline ID opgeslagen in DB`);
  } else {
    logs.push(`[BaselineSync] ✓ Baseline playlist ID uit DB: ${baselinePlaylistId}`);
  }
  
  // Step 4: Check current baseline items
  logs.push(`[BaselineSync] ─── STAP 4: Baseline items controleren ───`);
  const baselineResult = await getPlaylistById(baselinePlaylistId);
  
  if (!baselineResult.ok || !baselineResult.playlist) {
    logs.push(`[BaselineSync] ⚠️ Baseline playlist niet gevonden in Yodeck (mogelijk verwijderd)`);
    // Clear the stored ID and retry
    await db.update(locations).set({
      yodeckBaselinePlaylistId: null,
    }).where(eq(locations.id, locationId));
    
    return {
      ok: false,
      locationId,
      locationName: location.name,
      baselinePlaylistId: null,
      baselinePlaylistName,
      templatePlaylistId: templateId,
      templateItemCount: templateItems.length,
      baselineItemCount: 0,
      itemsSynced: false,
      logs,
      error: "BASELINE_NOT_FOUND_IN_YODECK",
    };
  }
  
  const currentBaselineItems = baselineResult.playlist.items || [];
  logs.push(`[BaselineSync] Baseline heeft ${currentBaselineItems.length} items`);
  
  // Step 5: Sync items if baseline is empty (or newly created)
  logs.push(`[BaselineSync] ─── STAP 5: Items synchroniseren ───`);
  let itemsSynced = false;
  
  if (currentBaselineItems.length === 0 && templateItems.length > 0) {
    logs.push(`[BaselineSync] Baseline is leeg - kopieer ${templateItems.length} items van template`);
    
    // Convert template items to the format needed for PATCH
    const itemsPayload = templateItems.map((item, index) => ({
      id: extractMediaId(item) || item.id,
      type: extractMediaType(item) || "media",
      priority: index + 1,
      duration: item.duration || 10,
    }));
    
    logs.push(`[BaselineSync] PATCH payload: ${itemsPayload.length} items`);
    
    const patchResult = await yodeckRequest<any>(`/playlists/${baselinePlaylistId}/`, "PATCH", { items: itemsPayload });
    
    if (!patchResult.ok) {
      logs.push(`[BaselineSync] ❌ PATCH mislukt: ${patchResult.error?.substring(0, 200)}`);
      return {
        ok: false,
        locationId,
        locationName: location.name,
        baselinePlaylistId,
        baselinePlaylistName,
        templatePlaylistId: templateId,
        templateItemCount: templateItems.length,
        baselineItemCount: currentBaselineItems.length,
        itemsSynced: false,
        logs,
        error: "BASELINE_PATCH_FAILED",
      };
    }
    
    logs.push(`[BaselineSync] ✓ Items gekopieerd naar baseline`);
    itemsSynced = true;
  } else if (currentBaselineItems.length > 0) {
    logs.push(`[BaselineSync] ✓ Baseline is al gevuld (${currentBaselineItems.length} items) - geen actie`);
  } else if (templateItems.length === 0) {
    logs.push(`[BaselineSync] ⚠️ Template is leeg - niets te kopiëren`);
  }
  
  // Verify final state
  const verifyResult = await getPlaylistById(baselinePlaylistId);
  const finalItemCount = verifyResult.ok ? (verifyResult.playlist?.items?.length || 0) : currentBaselineItems.length;
  
  logs.push(`[BaselineSync] ═══════════════════════════════════════`);
  logs.push(`[BaselineSync] ✓ Baseline sync voltooid`);
  logs.push(`[BaselineSync]   Baseline: ${baselinePlaylistName} (${baselinePlaylistId})`);
  logs.push(`[BaselineSync]   Template items: ${templateItems.length}`);
  logs.push(`[BaselineSync]   Baseline items: ${finalItemCount}`);
  logs.push(`[BaselineSync]   Items gesynct: ${itemsSynced ? "ja" : "nee"}`);
  
  return {
    ok: true,
    locationId,
    locationName: location.name,
    baselinePlaylistId,
    baselinePlaylistName,
    templatePlaylistId: templateId,
    templateItemCount: templateItems.length,
    baselineItemCount: finalItemCount,
    itemsSynced,
    logs,
  };
}

/**
 * Debug function: Get template vs baseline comparison for a location
 */
export async function getTemplateBaselineDiff(locationId: string): Promise<{
  ok: boolean;
  locationName: string;
  templatePlaylistId: string | null;
  templatePlaylistName: string | null;
  templateItems: Array<{ id: number; type: string; duration: number }>;
  baselinePlaylistId: string | null;
  baselinePlaylistName: string | null;
  baselineItems: Array<{ id: number; type: string; duration: number }>;
  baselineSynced: boolean;
  diff: {
    missingInBaseline: number[];
    extraInBaseline: number[];
  };
  error?: string;
}> {
  // Get location
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    return {
      ok: false,
      locationName: "Onbekend",
      templatePlaylistId: null,
      templatePlaylistName: null,
      templateItems: [],
      baselinePlaylistId: null,
      baselinePlaylistName: null,
      baselineItems: [],
      baselineSynced: false,
      diff: { missingInBaseline: [], extraInBaseline: [] },
      error: "LOCATION_NOT_FOUND",
    };
  }
  
  // Get template
  const templateId = await getBaseTemplatePlaylistId();
  let templateItems: Array<{ id: number; type: string; duration: number }> = [];
  let templateName: string | null = null;
  
  if (templateId) {
    const templateResult = await getPlaylistById(templateId);
    if (templateResult.ok && templateResult.playlist) {
      templateName = templateResult.playlist.name;
      templateItems = (templateResult.playlist.items || []).map(item => ({
        id: extractMediaId(item) || 0,
        type: extractMediaType(item) || "media",
        duration: item.duration || 10,
      })).filter(i => i.id > 0);
    }
  }
  
  // Get baseline
  let baselineItems: Array<{ id: number; type: string; duration: number }> = [];
  let baselineName: string | null = null;
  
  if (location.yodeckBaselinePlaylistId) {
    const baselineResult = await getPlaylistById(location.yodeckBaselinePlaylistId);
    if (baselineResult.ok && baselineResult.playlist) {
      baselineName = baselineResult.playlist.name;
      baselineItems = (baselineResult.playlist.items || []).map(item => ({
        id: extractMediaId(item) || 0,
        type: extractMediaType(item) || "media",
        duration: item.duration || 10,
      })).filter(i => i.id > 0);
    }
  }
  
  // Calculate diff
  const templateIds = new Set(templateItems.map(i => i.id));
  const baselineIds = new Set(baselineItems.map(i => i.id));
  
  const missingInBaseline = Array.from(templateIds).filter(id => !baselineIds.has(id));
  const extraInBaseline = Array.from(baselineIds).filter(id => !templateIds.has(id));
  
  const baselineSynced = missingInBaseline.length === 0 && templateItems.length > 0;
  
  return {
    ok: true,
    locationName: location.name,
    templatePlaylistId: templateId,
    templatePlaylistName: templateName,
    templateItems,
    baselinePlaylistId: location.yodeckBaselinePlaylistId || null,
    baselinePlaylistName: baselineName,
    baselineItems,
    baselineSynced,
    diff: {
      missingInBaseline,
      extraInBaseline,
    },
  };
}

/**
 * Get full autopilot config status for admin dashboard
 */
export async function getAutopilotConfigStatus(): Promise<{
  basePlaylistId: string | null;
  baseTemplatePlaylistId: string | null;
  baseTemplateName: string | null;
  baseTemplateItemCount: number;
  configuredViaDatabaseOrEnv: "database" | "env" | "auto-discovered" | "not_set";
}> {
  if (LEGACY_DISABLED) throwLegacyError();
  // Check base playlist (for combined mode)
  const basePlaylistId = await getBasePlaylistId();
  
  // Check template playlist
  const [templateSetting] = await db.select().from(systemSettings).where(eq(systemSettings.key, CONFIG_KEY_BASE_TEMPLATE));
  const storedTemplateId = templateSetting?.value;
  
  // Get template info if we have an ID
  let templateName: string | null = null;
  let templateItemCount = 0;
  let configSource: "database" | "env" | "auto-discovered" | "not_set" = "not_set";
  
  if (storedTemplateId) {
    configSource = "database";
    const templateResult = await getPlaylistById(storedTemplateId);
    if (templateResult.ok && templateResult.playlist) {
      templateName = templateResult.playlist.name;
      templateItemCount = templateResult.playlist.items?.length || 0;
    }
  } else {
    // Try auto-discovery (this will also cache the result)
    const autoId = await getBaseTemplatePlaylistId();
    if (autoId) {
      configSource = "auto-discovered";
      const templateResult = await getPlaylistById(autoId);
      if (templateResult.ok && templateResult.playlist) {
        templateName = templateResult.playlist.name;
        templateItemCount = templateResult.playlist.items?.length || 0;
      }
    }
  }
  
  return {
    basePlaylistId,
    baseTemplatePlaylistId: storedTemplateId || null,
    baseTemplateName: templateName,
    baseTemplateItemCount: templateItemCount,
    configuredViaDatabaseOrEnv: configSource,
  };
}
