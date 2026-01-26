/**
 * YodeckCanonicalService - Unified canonical playlist management
 * 
 * This service ensures every location has:
 * - BASE playlist: "Baseline | <locationName>" with at least 1 item (baseline media)
 * - ADS playlist: "Ads | <locationName>" with at least 1 item (self-ad placeholder)
 * - Layout bound to both playlists correctly
 * 
 * All screen content control MUST go through this service.
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { yodeckRequest, FEATURE_FLAGS, ELEVIZION_LAYOUT_SPEC, buildElevizionLayoutPayload } from "./yodeckLayoutService";
import { 
  getPlaylistById, 
  extractMediaId, 
  extractMediaName, 
  extractMediaType,
  PlaylistItem,
  Playlist 
} from "./yodeckPlaylistItemsService";

// ============================================================================
// CONSTANTS
// ============================================================================

export const CANONICAL_PLAYLIST_PREFIXES = {
  BASE: "Baseline | ",
  ADS: "Ads | ",
};

export const BASELINE_MEDIA_NAME = "Elevizion Baseline";
export const SELF_AD_MEDIA_NAME = "Elevizion Self-Ad";

// Feature flag to block non-canonical writes (enable when ready)
export const BLOCK_LEGACY_WRITES = process.env.BLOCK_LEGACY_WRITES === "true";

/**
 * Guard function to block non-canonical screen content writes
 * Call this before any PATCH /screens/:id that modifies screen_content outside canonical flow
 * @param context Description of where the write is happening
 * @param isCanonicalFlow Set to true if this is being called from within ensureLocationCompliance
 */
export function guardCanonicalWrite(context: string, isCanonicalFlow: boolean = false): void {
  if (isCanonicalFlow) {
    return; // Allow writes from canonical flow
  }
  if (BLOCK_LEGACY_WRITES) {
    const error = new Error(`NON_CANONICAL_WRITE_BLOCKED: ${context}. All screen content changes must go through ensureLocationCompliance().`);
    console.error(`[CanonicalGuard] ${error.message}`);
    throw error;
  }
  // Only log at debug level when flag is off (reduces noise)
}

/**
 * Check if a location is using canonical model
 */
export function isCanonicalLocation(location: { yodeckBaselinePlaylistId?: string | null; yodeckPlaylistId?: string | null; layoutMode?: string | null }): boolean {
  return !!(location.yodeckBaselinePlaylistId && location.yodeckPlaylistId && location.layoutMode === "LAYOUT");
}

// ============================================================================
// TYPES
// ============================================================================

export interface NormalizedPlaylistItem {
  id: number;
  mediaId: number;
  name: string;
  type: string;
  duration: number;
  order: number;
}

export interface CanonicalPlaylistResult {
  ok: boolean;
  playlistId: string;
  playlistName: string;
  isNew: boolean;
  itemCount: number;
  error?: string;
  logs: string[];
}

export interface EnsureComplianceResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  basePlaylist: {
    id: string | null;
    name: string | null;
    itemCount: number;
    isNew: boolean;
  };
  adsPlaylist: {
    id: string | null;
    name: string | null;
    itemCount: number;
    isNew: boolean;
  };
  layout: {
    id: string | null;
    isNew: boolean;
    bindingsVerified: boolean;
  };
  pushed: boolean;
  verified: boolean;
  logs: string[];
  error?: string;
}

// ============================================================================
// PLAYLIST ITEMS - Normalized Operations
// ============================================================================

/**
 * Get normalized playlist items (handles both Yodeck shapes)
 */
export async function getPlaylistItems(playlistId: string): Promise<{
  ok: boolean;
  items: NormalizedPlaylistItem[];
  error?: string;
}> {
  const result = await getPlaylistById(playlistId);
  
  if (!result.ok || !result.playlist) {
    return { ok: false, items: [], error: result.error };
  }
  
  const items = (result.playlist.items || []).map((item, index) => ({
    id: item.id,
    mediaId: extractMediaId(item) || 0,
    name: extractMediaName(item),
    type: extractMediaType(item),
    duration: item.duration || 10,
    order: item.order ?? index,
  })).filter(item => item.mediaId !== 0);
  
  return { ok: true, items };
}

/**
 * Set playlist items (replace entire items array)
 */
export async function setPlaylistItems(
  playlistId: string,
  items: Array<{ mediaId: number; duration?: number }>
): Promise<{ ok: boolean; itemCount: number; error?: string; logs: string[] }> {
  const logs: string[] = [];
  logs.push(`[SetItems] Setting ${items.length} items on playlist ${playlistId}`);
  
  // Build items array in Shape A format
  const itemsPayload = items.map((item, index) => ({
    order: index,
    item: { id: item.mediaId },
    duration: item.duration ?? 10,
  }));
  
  const patchResult = await yodeckRequest<Playlist>(`/playlists/${playlistId}/`, "PATCH", {
    items: itemsPayload,
  });
  
  if (!patchResult.ok) {
    logs.push(`[SetItems] Shape A failed: ${patchResult.error}`);
    
    // Try Shape B
    const shapeBPayload = items.map((item, index) => ({
      order: index,
      item: item.mediaId,
      duration: item.duration ?? 10,
    }));
    
    const shapeBResult = await yodeckRequest<Playlist>(`/playlists/${playlistId}/`, "PATCH", {
      items: shapeBPayload,
    });
    
    if (!shapeBResult.ok) {
      logs.push(`[SetItems] Shape B also failed: ${shapeBResult.error}`);
      return { ok: false, itemCount: 0, error: shapeBResult.error, logs };
    }
    
    logs.push(`[SetItems] Shape B succeeded`);
    return { ok: true, itemCount: items.length, logs };
  }
  
  logs.push(`[SetItems] Shape A succeeded`);
  return { ok: true, itemCount: items.length, logs };
}

/**
 * Append media to playlist if not already present (idempotent)
 */
export async function appendPlaylistItemIfMissing(
  playlistId: string,
  mediaId: number,
  duration: number = 10
): Promise<{ ok: boolean; alreadyExists: boolean; itemCount: number; error?: string; logs: string[] }> {
  const logs: string[] = [];
  logs.push(`[AppendIfMissing] Checking playlist ${playlistId} for media ${mediaId}`);
  
  // Get current items
  const currentResult = await getPlaylistItems(playlistId);
  if (!currentResult.ok) {
    return { ok: false, alreadyExists: false, itemCount: 0, error: currentResult.error, logs };
  }
  
  // Check if already exists
  const exists = currentResult.items.some(item => item.mediaId === mediaId);
  if (exists) {
    logs.push(`[AppendIfMissing] Media ${mediaId} already in playlist - skipping`);
    return { ok: true, alreadyExists: true, itemCount: currentResult.items.length, logs };
  }
  
  // Append new item
  const newItems = [
    ...currentResult.items.map(item => ({ mediaId: item.mediaId, duration: item.duration })),
    { mediaId, duration },
  ];
  
  const setResult = await setPlaylistItems(playlistId, newItems);
  logs.push(...setResult.logs);
  
  return { 
    ok: setResult.ok, 
    alreadyExists: false, 
    itemCount: setResult.itemCount,
    error: setResult.error,
    logs,
  };
}

// ============================================================================
// CANONICAL PLAYLIST NAMING
// ============================================================================

/**
 * Generate canonical playlist name
 */
export function getCanonicalPlaylistName(locationName: string, type: "BASE" | "ADS"): string {
  return type === "BASE" 
    ? `${CANONICAL_PLAYLIST_PREFIXES.BASE}${locationName}`
    : `${CANONICAL_PLAYLIST_PREFIXES.ADS}${locationName}`;
}

/**
 * Check if a playlist name is canonical
 */
export function isCanonicalPlaylistName(name: string): boolean {
  return name.startsWith(CANONICAL_PLAYLIST_PREFIXES.BASE) || 
         name.startsWith(CANONICAL_PLAYLIST_PREFIXES.ADS);
}

/**
 * Check if a playlist name is non-canonical (Test, auto-playlist, etc.)
 */
export function isNonCanonicalPlaylistName(name: string): boolean {
  const lowerName = name.toLowerCase();
  return lowerName === "test" || 
         lowerName.includes("auto-playlist") ||
         lowerName.includes("test playlist") ||
         lowerName.startsWith("playlist "); // Generic names
}

// ============================================================================
// CANONICAL PLAYLIST CREATION
// ============================================================================

/**
 * Find or create canonical playlist for a location
 */
export async function ensureCanonicalPlaylist(
  locationName: string,
  type: "BASE" | "ADS",
  workspaceId?: number
): Promise<CanonicalPlaylistResult> {
  const logs: string[] = [];
  const canonicalName = getCanonicalPlaylistName(locationName, type);
  logs.push(`[EnsurePlaylist] Looking for: "${canonicalName}"`);
  
  // Search for existing playlist with canonical name
  const searchResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>(
    `/playlists/?search=${encodeURIComponent(canonicalName)}`
  );
  
  if (searchResult.ok && searchResult.data) {
    // Find all exact matches (handle duplicates deterministically)
    const exactMatches = searchResult.data.results.filter(p => p.name === canonicalName);
    
    if (exactMatches.length > 0) {
      // If duplicates exist, use the one with the lowest ID (first created)
      const chosen = exactMatches.sort((a, b) => a.id - b.id)[0];
      
      if (exactMatches.length > 1) {
        logs.push(`[EnsurePlaylist] WARNING: ${exactMatches.length} duplicates found! Using ID ${chosen.id} (lowest)`);
        logs.push(`[EnsurePlaylist] Duplicate IDs: ${exactMatches.map(p => p.id).join(", ")}`);
      } else {
        logs.push(`[EnsurePlaylist] Found existing: ID ${chosen.id}`);
      }
      
      // Get item count
      const itemsResult = await getPlaylistItems(String(chosen.id));
      
      return {
        ok: true,
        playlistId: String(chosen.id),
        playlistName: chosen.name,
        isNew: false,
        itemCount: itemsResult.items.length,
        logs,
      };
    }
  }
  
  // Create new playlist
  logs.push(`[EnsurePlaylist] Creating new playlist: "${canonicalName}"`);
  
  const createPayload: any = {
    name: canonicalName,
    description: `Elevizion canonical ${type} playlist`,
    items: [], // Always include items array
  };
  
  if (workspaceId) {
    createPayload.workspace = workspaceId;
  }
  
  const createResult = await yodeckRequest<{ id: number; name: string }>(
    "/playlists/",
    "POST",
    createPayload
  );
  
  if (!createResult.ok) {
    logs.push(`[EnsurePlaylist] Creation failed: ${createResult.error}`);
    return {
      ok: false,
      playlistId: "",
      playlistName: "",
      isNew: false,
      itemCount: 0,
      error: createResult.error,
      logs,
    };
  }
  
  logs.push(`[EnsurePlaylist] Created: ID ${createResult.data?.id}`);
  
  return {
    ok: true,
    playlistId: String(createResult.data?.id),
    playlistName: canonicalName,
    isNew: true,
    itemCount: 0,
    logs,
  };
}

// ============================================================================
// BASELINE & ADS SEEDING
// ============================================================================

/**
 * Find or create baseline media for seeding BASE playlists
 */
export async function findOrCreateBaselineMedia(): Promise<{
  ok: boolean;
  mediaId: number | null;
  error?: string;
  logs: string[];
}> {
  const logs: string[] = [];
  logs.push(`[BaselineMedia] Searching for existing baseline media...`);
  
  // Search for existing baseline media
  const searchResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>(
    `/medias/?search=${encodeURIComponent(BASELINE_MEDIA_NAME)}`
  );
  
  if (searchResult.ok && searchResult.data) {
    const match = searchResult.data.results.find(m => 
      m.name.toLowerCase().includes("elevizion") && m.name.toLowerCase().includes("baseline")
    );
    if (match) {
      logs.push(`[BaselineMedia] Found existing: ID ${match.id} - "${match.name}"`);
      return { ok: true, mediaId: match.id, logs };
    }
  }
  
  logs.push(`[BaselineMedia] No existing baseline media found`);
  logs.push(`[BaselineMedia] NOTE: Upload baseline media manually and name it "${BASELINE_MEDIA_NAME}"`);
  
  // Return null - we can't auto-create media, but BASE playlist can still be created
  return { ok: true, mediaId: null, logs };
}

/**
 * Find or create self-ad media for seeding ADS playlists
 */
export async function findOrCreateSelfAdMedia(): Promise<{
  ok: boolean;
  mediaId: number | null;
  error?: string;
  logs: string[];
}> {
  const logs: string[] = [];
  logs.push(`[SelfAdMedia] Searching for existing self-ad media...`);
  
  // Search for existing self-ad media
  const searchResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>(
    `/medias/?search=${encodeURIComponent(SELF_AD_MEDIA_NAME)}`
  );
  
  if (searchResult.ok && searchResult.data) {
    const match = searchResult.data.results.find(m => 
      m.name.toLowerCase().includes("elevizion") && 
      (m.name.toLowerCase().includes("self-ad") || m.name.toLowerCase().includes("zelf"))
    );
    if (match) {
      logs.push(`[SelfAdMedia] Found existing: ID ${match.id} - "${match.name}"`);
      return { ok: true, mediaId: match.id, logs };
    }
  }
  
  logs.push(`[SelfAdMedia] No existing self-ad media found`);
  logs.push(`[SelfAdMedia] NOTE: Upload self-ad media manually and name it "${SELF_AD_MEDIA_NAME}"`);
  
  return { ok: true, mediaId: null, logs };
}

/**
 * Seed BASE playlist with baseline content
 */
export async function seedBaselinePlaylist(playlistId: string): Promise<{
  ok: boolean;
  seeded: boolean;
  itemCount: number;
  logs: string[];
}> {
  const logs: string[] = [];
  logs.push(`[SeedBaseline] Checking playlist ${playlistId}...`);
  
  // Check if already has items
  const itemsResult = await getPlaylistItems(playlistId);
  if (itemsResult.ok && itemsResult.items.length > 0) {
    logs.push(`[SeedBaseline] Playlist already has ${itemsResult.items.length} items - skipping seed`);
    return { ok: true, seeded: false, itemCount: itemsResult.items.length, logs };
  }
  
  // Find baseline media
  const mediaResult = await findOrCreateBaselineMedia();
  logs.push(...mediaResult.logs);
  
  if (!mediaResult.mediaId) {
    logs.push(`[SeedBaseline] WARNING: No baseline media available - playlist will be empty`);
    return { ok: true, seeded: false, itemCount: 0, logs };
  }
  
  // Append baseline media
  const appendResult = await appendPlaylistItemIfMissing(playlistId, mediaResult.mediaId, 30);
  logs.push(...appendResult.logs);
  
  return { 
    ok: appendResult.ok, 
    seeded: !appendResult.alreadyExists, 
    itemCount: appendResult.itemCount,
    logs,
  };
}

/**
 * Seed ADS playlist with self-ad content
 */
export async function seedAdsPlaylist(playlistId: string): Promise<{
  ok: boolean;
  seeded: boolean;
  itemCount: number;
  logs: string[];
}> {
  const logs: string[] = [];
  logs.push(`[SeedAds] Checking playlist ${playlistId}...`);
  
  // Check if already has items
  const itemsResult = await getPlaylistItems(playlistId);
  if (itemsResult.ok && itemsResult.items.length > 0) {
    logs.push(`[SeedAds] Playlist already has ${itemsResult.items.length} items - skipping seed`);
    return { ok: true, seeded: false, itemCount: itemsResult.items.length, logs };
  }
  
  // Find self-ad media
  const mediaResult = await findOrCreateSelfAdMedia();
  logs.push(...mediaResult.logs);
  
  if (!mediaResult.mediaId) {
    logs.push(`[SeedAds] WARNING: No self-ad media available - playlist will be empty`);
    return { ok: true, seeded: false, itemCount: 0, logs };
  }
  
  // Append self-ad media
  const appendResult = await appendPlaylistItemIfMissing(playlistId, mediaResult.mediaId, 15);
  logs.push(...appendResult.logs);
  
  return { 
    ok: appendResult.ok, 
    seeded: !appendResult.alreadyExists, 
    itemCount: appendResult.itemCount,
    logs,
  };
}

// ============================================================================
// LAYOUT BINDING VERIFICATION
// ============================================================================

/**
 * Verify layout has correct playlist bindings
 */
export async function verifyLayoutBindings(
  layoutId: string,
  basePlaylistId: string,
  adsPlaylistId: string
): Promise<{
  ok: boolean;
  verified: boolean;
  needsFix: boolean;
  issues: string[];
  logs: string[];
}> {
  const logs: string[] = [];
  logs.push(`[VerifyBindings] Checking layout ${layoutId}...`);
  
  const layoutResult = await yodeckRequest<any>(`/layouts/${layoutId}/`);
  
  if (!layoutResult.ok || !layoutResult.data) {
    return { ok: false, verified: false, needsFix: false, issues: [], logs };
  }
  
  const layout = layoutResult.data;
  const regions = layout.regions || [];
  const issues: string[] = [];
  
  // Find BASE and ADS regions
  const baseRegion = regions.find((r: any) => r.name === "BASE");
  const adsRegion = regions.find((r: any) => r.name === "ADS");
  
  if (!baseRegion) {
    issues.push("Missing BASE region");
  } else {
    const basePlaylistBound = String(baseRegion.playlist) === basePlaylistId ||
      (typeof baseRegion.playlist === 'object' && String(baseRegion.playlist?.id) === basePlaylistId);
    if (!basePlaylistBound) {
      issues.push(`BASE region bound to ${baseRegion.playlist}, expected ${basePlaylistId}`);
    }
  }
  
  if (!adsRegion) {
    issues.push("Missing ADS region");
  } else {
    const adsPlaylistBound = String(adsRegion.playlist) === adsPlaylistId ||
      (typeof adsRegion.playlist === 'object' && String(adsRegion.playlist?.id) === adsPlaylistId);
    if (!adsPlaylistBound) {
      issues.push(`ADS region bound to ${adsRegion.playlist}, expected ${adsPlaylistId}`);
    }
  }
  
  if (issues.length > 0) {
    logs.push(`[VerifyBindings] Issues found: ${issues.join(", ")}`);
  } else {
    logs.push(`[VerifyBindings] All bindings correct`);
  }
  
  return {
    ok: true,
    verified: issues.length === 0,
    needsFix: issues.length > 0,
    issues,
    logs,
  };
}

/**
 * Fix layout bindings to use correct playlists
 */
export async function fixLayoutBindings(
  layoutId: string,
  basePlaylistId: string,
  adsPlaylistId: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  logs.push(`[FixBindings] Patching layout ${layoutId}...`);
  
  const payload = buildElevizionLayoutPayload(
    "", // Name will be preserved
    basePlaylistId,
    adsPlaylistId
  );
  
  // Only patch regions, not name
  const patchResult = await yodeckRequest<any>(`/layouts/${layoutId}/`, "PATCH", {
    regions: payload.regions,
  });
  
  if (!patchResult.ok) {
    logs.push(`[FixBindings] PATCH failed: ${patchResult.error}`);
    return { ok: false, error: patchResult.error, logs };
  }
  
  logs.push(`[FixBindings] Layout patched successfully`);
  return { ok: true, logs };
}

// ============================================================================
// PUSH SCREEN
// ============================================================================

/**
 * Push screen to reload content
 */
export async function pushScreen(yodeckDeviceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  console.log(`[PushScreen] Pushing screen ${yodeckDeviceId}...`);
  
  const result = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/push/`, "POST", {});
  
  if (!result.ok) {
    console.error(`[PushScreen] Failed: ${result.error}`);
    return { ok: false, error: result.error };
  }
  
  console.log(`[PushScreen] Success`);
  return { ok: true };
}

// ============================================================================
// MAIN: ENSURE COMPLIANCE
// ============================================================================

/**
 * Ensure a location is fully compliant with canonical model:
 * 1. Create/verify canonical BASE playlist with items
 * 2. Create/verify canonical ADS playlist with items
 * 3. Create/verify layout with correct bindings
 * 4. Assign layout to screen
 * 5. Push screen
 * 6. Update DB with playlist/layout IDs
 */
export async function ensureLocationCompliance(locationId: string): Promise<EnsureComplianceResult> {
  const logs: string[] = [];
  logs.push(`[Compliance] Starting for location ${locationId}...`);
  
  // Get location from DB
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    return {
      ok: false,
      locationId,
      locationName: "Unknown",
      basePlaylist: { id: null, name: null, itemCount: 0, isNew: false },
      adsPlaylist: { id: null, name: null, itemCount: 0, isNew: false },
      layout: { id: null, isNew: false, bindingsVerified: false },
      pushed: false,
      verified: false,
      logs,
      error: "Location not found",
    };
  }
  
  logs.push(`[Compliance] Location: ${location.name}`);
  
  if (!location.yodeckDeviceId) {
    logs.push(`[Compliance] WARNING: No yodeckDeviceId - cannot manage screen`);
  }
  
  // Step 1: Ensure canonical BASE playlist
  logs.push(`[Compliance] Step 1: Ensuring BASE playlist...`);
  const baseResult = await ensureCanonicalPlaylist(location.name, "BASE");
  logs.push(...baseResult.logs);
  
  if (!baseResult.ok) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      basePlaylist: { id: null, name: null, itemCount: 0, isNew: false },
      adsPlaylist: { id: null, name: null, itemCount: 0, isNew: false },
      layout: { id: null, isNew: false, bindingsVerified: false },
      pushed: false,
      verified: false,
      logs,
      error: `BASE playlist creation failed: ${baseResult.error}`,
    };
  }
  
  // Step 2: Seed BASE playlist
  logs.push(`[Compliance] Step 2: Seeding BASE playlist...`);
  const baseSeedResult = await seedBaselinePlaylist(baseResult.playlistId);
  logs.push(...baseSeedResult.logs);
  
  // Step 3: Ensure canonical ADS playlist
  logs.push(`[Compliance] Step 3: Ensuring ADS playlist...`);
  const adsResult = await ensureCanonicalPlaylist(location.name, "ADS");
  logs.push(...adsResult.logs);
  
  if (!adsResult.ok) {
    return {
      ok: false,
      locationId,
      locationName: location.name,
      basePlaylist: { 
        id: baseResult.playlistId, 
        name: baseResult.playlistName, 
        itemCount: baseSeedResult.itemCount,
        isNew: baseResult.isNew,
      },
      adsPlaylist: { id: null, name: null, itemCount: 0, isNew: false },
      layout: { id: null, isNew: false, bindingsVerified: false },
      pushed: false,
      verified: false,
      logs,
      error: `ADS playlist creation failed: ${adsResult.error}`,
    };
  }
  
  // Step 4: Seed ADS playlist
  logs.push(`[Compliance] Step 4: Seeding ADS playlist...`);
  const adsSeedResult = await seedAdsPlaylist(adsResult.playlistId);
  logs.push(...adsSeedResult.logs);
  
  // Step 5: Ensure layout exists with correct bindings
  logs.push(`[Compliance] Step 5: Ensuring layout...`);
  let layoutId = location.yodeckLayoutId;
  let layoutIsNew = false;
  let bindingsVerified = false;
  
  if (layoutId) {
    // Verify existing layout bindings
    const verifyResult = await verifyLayoutBindings(layoutId, baseResult.playlistId, adsResult.playlistId);
    logs.push(...verifyResult.logs);
    
    if (verifyResult.needsFix) {
      const fixResult = await fixLayoutBindings(layoutId, baseResult.playlistId, adsResult.playlistId);
      logs.push(...fixResult.logs);
      bindingsVerified = fixResult.ok;
    } else {
      bindingsVerified = verifyResult.verified;
    }
  } else {
    // Create new layout
    const layoutName = `Elevizion | ${location.name}`;
    logs.push(`[Compliance] Creating layout: "${layoutName}"`);
    
    const layoutPayload = buildElevizionLayoutPayload(layoutName, baseResult.playlistId, adsResult.playlistId);
    const createResult = await yodeckRequest<{ id: number }>("/layouts/", "POST", layoutPayload);
    
    if (!createResult.ok) {
      logs.push(`[Compliance] Layout creation failed: ${createResult.error}`);
    } else {
      layoutId = String(createResult.data?.id);
      layoutIsNew = true;
      bindingsVerified = true;
      logs.push(`[Compliance] Layout created: ID ${layoutId}`);
    }
  }
  
  // Step 6: Assign layout to screen (if we have a device)
  let pushed = false;
  if (location.yodeckDeviceId && layoutId) {
    logs.push(`[Compliance] Step 6: Assigning layout to screen...`);
    
    const assignResult = await yodeckRequest<any>(
      `/screens/${location.yodeckDeviceId}/`,
      "PATCH",
      { default_layout: parseInt(layoutId) }
    );
    
    if (assignResult.ok) {
      logs.push(`[Compliance] Layout assigned successfully`);
      
      // Push screen
      const pushResult = await pushScreen(location.yodeckDeviceId);
      pushed = pushResult.ok;
      logs.push(`[Compliance] Push: ${pushed ? "SUCCESS" : pushResult.error}`);
    } else {
      logs.push(`[Compliance] Layout assignment failed: ${assignResult.error}`);
    }
  }
  
  // Step 7: Update DB with canonical playlist/layout IDs
  logs.push(`[Compliance] Step 7: Updating database...`);
  try {
    await db.update(locations).set({
      yodeckBaselinePlaylistId: baseResult.playlistId,
      yodeckPlaylistId: adsResult.playlistId,
      yodeckLayoutId: layoutId || null,
      layoutMode: "LAYOUT",
    }).where(eq(locations.id, locationId));
    logs.push(`[Compliance] Database updated`);
  } catch (dbError: any) {
    logs.push(`[Compliance] DB update error: ${dbError.message}`);
  }
  
  return {
    ok: true,
    locationId,
    locationName: location.name,
    basePlaylist: {
      id: baseResult.playlistId,
      name: baseResult.playlistName,
      itemCount: baseSeedResult.itemCount,
      isNew: baseResult.isNew,
    },
    adsPlaylist: {
      id: adsResult.playlistId,
      name: adsResult.playlistName,
      itemCount: adsSeedResult.itemCount,
      isNew: adsResult.isNew,
    },
    layout: {
      id: layoutId || null,
      isNew: layoutIsNew,
      bindingsVerified,
    },
    pushed,
    verified: bindingsVerified && pushed,
    logs,
  };
}

// ============================================================================
// MIGRATION
// ============================================================================

export interface MigrationResult {
  locationId: string;
  locationName: string;
  oldBasePlaylistId: string | null;
  oldAdsPlaylistId: string | null;
  newBasePlaylistId: string | null;
  newAdsPlaylistId: string | null;
  layoutId: string | null;
  pushStatus: "SUCCESS" | "FAILED" | "SKIPPED";
  verifyStatus: "PASS" | "FAIL" | "SKIPPED";
  error?: string;
}

/**
 * Migrate all linked locations to canonical model
 */
export async function migrateAllToCanonical(): Promise<{
  ok: boolean;
  total: number;
  successful: number;
  failed: number;
  results: MigrationResult[];
}> {
  console.log(`[Migration] Starting canonical migration...`);
  
  // Get all locations with yodeckDeviceId
  const linkedLocations = await db.select().from(locations)
    .where(eq(locations.status, "active"));
  
  console.log(`[Migration] Found ${linkedLocations.length} active locations`);
  
  const results: MigrationResult[] = [];
  let successful = 0;
  let failed = 0;
  
  for (const loc of linkedLocations) {
    console.log(`[Migration] Processing: ${loc.name} (${loc.id})`);
    
    const oldBaseId = loc.yodeckBaselinePlaylistId;
    const oldAdsId = loc.yodeckPlaylistId;
    
    const result = await ensureLocationCompliance(loc.id);
    
    if (result.ok) {
      successful++;
      results.push({
        locationId: loc.id,
        locationName: loc.name,
        oldBasePlaylistId: oldBaseId,
        oldAdsPlaylistId: oldAdsId,
        newBasePlaylistId: result.basePlaylist.id,
        newAdsPlaylistId: result.adsPlaylist.id,
        layoutId: result.layout.id,
        pushStatus: result.pushed ? "SUCCESS" : "FAILED",
        verifyStatus: result.verified ? "PASS" : "FAIL",
      });
    } else {
      failed++;
      results.push({
        locationId: loc.id,
        locationName: loc.name,
        oldBasePlaylistId: oldBaseId,
        oldAdsPlaylistId: oldAdsId,
        newBasePlaylistId: result.basePlaylist.id,
        newAdsPlaylistId: result.adsPlaylist.id,
        layoutId: result.layout.id,
        pushStatus: "SKIPPED",
        verifyStatus: "SKIPPED",
        error: result.error,
      });
    }
  }
  
  console.log(`[Migration] Complete: ${successful} successful, ${failed} failed`);
  
  return {
    ok: failed === 0,
    total: linkedLocations.length,
    successful,
    failed,
    results,
  };
}
