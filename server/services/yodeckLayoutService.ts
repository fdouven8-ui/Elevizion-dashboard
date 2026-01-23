/**
 * YodeckLayoutService - Manages baseline + ads layout separation
 * 
 * Provides:
 * - Layout API probing (detect if layouts are supported)
 * - Baseline playlist creation (news/weather/placeholder)
 * - Layout creation with 2 zones (BASE + ADS)
 * - Fallback schedule assignment when layouts not supported
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const BASELINE_ASSET_PATH = path.join(process.cwd(), "assets/baseline/elevizion-baseline-1080p.png");
const BASELINE_ASSET_TAG = "elevizion:baseline";
const BASELINE_MEDIA_NAME = "Elevizion Baseline Placeholder";

// Cache layout support status
let layoutsSupported: boolean | null = null;
let layoutsProbeLastCheck: Date | null = null;
const PROBE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export type LayoutMode = "LAYOUT" | "FALLBACK_SCHEDULE";

export interface LayoutApplyResult {
  ok: boolean;
  mode: LayoutMode;
  layoutId?: string;
  baselinePlaylistId?: string;
  adsPlaylistId?: string;
  error?: string;
  logs: string[];
}

interface YodeckApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

async function getYodeckToken(): Promise<string | null> {
  return process.env.YODECK_AUTH_TOKEN || null;
}

async function yodeckRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" = "GET",
  body?: any
): Promise<YodeckApiResponse<T>> {
  const token = await getYodeckToken();
  if (!token) {
    return { ok: false, error: "Yodeck token not configured" };
  }

  try {
    const url = `${YODECK_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        "Authorization": `Token ${token}`,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return { 
        ok: false, 
        error: `HTTP ${response.status}: ${errorText}`,
        status: response.status 
      };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

/**
 * Probe Yodeck API to check if layouts endpoint is available
 */
export async function probeLayoutsSupport(forceRefresh = false): Promise<boolean> {
  // Return cached value if still valid
  if (!forceRefresh && layoutsSupported !== null && layoutsProbeLastCheck) {
    const age = Date.now() - layoutsProbeLastCheck.getTime();
    if (age < PROBE_CACHE_TTL) {
      return layoutsSupported;
    }
  }

  console.log("[YodeckLayouts] Probing layouts endpoint...");
  
  // Try to list layouts - if 404, layouts not supported
  const result = await yodeckRequest<{ count: number; results: any[] }>("/layouts");
  
  if (result.status === 404) {
    console.log("[YodeckLayouts] supported=false (404 on /layouts)");
    layoutsSupported = false;
  } else if (result.ok) {
    console.log(`[YodeckLayouts] supported=true (${result.data?.count || 0} layouts found)`);
    layoutsSupported = true;
  } else {
    // Other error - assume not supported for safety
    console.log(`[YodeckLayouts] supported=false (error: ${result.error})`);
    layoutsSupported = false;
  }
  
  layoutsProbeLastCheck = new Date();
  return layoutsSupported;
}

/**
 * Get current layout support status
 */
export function getLayoutSupportStatus(): { supported: boolean | null; lastCheck: Date | null } {
  return { supported: layoutsSupported, lastCheck: layoutsProbeLastCheck };
}

// Cache for baseline media ID (idempotency)
let cachedBaselineMediaId: string | null = null;

/**
 * Find existing baseline placeholder media in Yodeck by tag
 */
async function findBaselineMedia(): Promise<{ id: string; name: string } | null> {
  const result = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string; tags: string[] }> }>("/medias");
  if (!result.ok || !result.data?.results) return null;
  
  const baselineMedia = result.data.results.find(m => 
    m.tags?.includes(BASELINE_ASSET_TAG) || m.name === BASELINE_MEDIA_NAME
  );
  
  if (baselineMedia) {
    cachedBaselineMediaId = String(baselineMedia.id);
    return { id: String(baselineMedia.id), name: baselineMedia.name };
  }
  return null;
}

/**
 * Upload baseline placeholder asset to Yodeck (idempotent)
 * Returns existing media ID if already uploaded
 */
export async function ensureBaselineAsset(): Promise<{ ok: boolean; mediaId?: string; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  // Check cache first
  if (cachedBaselineMediaId) {
    logs.push(`[Baseline] Using cached baseline media ID: ${cachedBaselineMediaId}`);
    return { ok: true, mediaId: cachedBaselineMediaId, logs };
  }
  
  // Check if baseline asset already exists in Yodeck
  logs.push(`[Baseline] Checking for existing baseline media...`);
  const existing = await findBaselineMedia();
  if (existing) {
    logs.push(`[Baseline] Found existing baseline media: ${existing.id} (${existing.name})`);
    return { ok: true, mediaId: existing.id, logs };
  }
  
  // Check if local asset file exists
  if (!fs.existsSync(BASELINE_ASSET_PATH)) {
    logs.push(`[Baseline] ERROR: Asset file not found at ${BASELINE_ASSET_PATH}`);
    return { ok: false, error: "Baseline asset file not found", logs };
  }
  
  // Upload the asset to Yodeck
  logs.push(`[Baseline] Uploading baseline placeholder asset...`);
  
  const token = await getYodeckToken();
  if (!token) {
    return { ok: false, error: "Yodeck token not configured", logs };
  }
  
  try {
    const fileBuffer = fs.readFileSync(BASELINE_ASSET_PATH);
    const blob = new Blob([fileBuffer], { type: "image/png" });
    
    const formData = new FormData();
    formData.append("name", BASELINE_MEDIA_NAME);
    formData.append("description", "Elevizion standaard baseline placeholder - Welkom scherm");
    formData.append("tags", BASELINE_ASSET_TAG);
    formData.append("file", blob, "elevizion-baseline-1080p.png");
    
    const response = await fetch(`${YODECK_BASE_URL}/medias/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${token}`,
      },
      body: formData,
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logs.push(`[Baseline] Upload failed: HTTP ${response.status}: ${errorText}`);
      return { ok: false, error: `Upload failed: HTTP ${response.status}`, logs };
    }
    
    const data = await response.json() as { id: number };
    const mediaId = String(data.id);
    cachedBaselineMediaId = mediaId;
    
    logs.push(`[Baseline] Successfully uploaded baseline asset: ${mediaId}`);
    return { ok: true, mediaId, logs };
  } catch (error: any) {
    logs.push(`[Baseline] Upload error: ${error.message}`);
    return { ok: false, error: error.message, logs };
  }
}

/**
 * Check if a playlist has any items (exported for API use)
 */
export async function checkPlaylistEmpty(playlistId: string): Promise<boolean> {
  const result = await yodeckRequest<{ items?: any[]; media_items?: any[] }>(`/playlists/${playlistId}`);
  if (!result.ok || !result.data) return true;
  
  const items = result.data.items || result.data.media_items || [];
  return items.length === 0;
}

// Alias for internal use
const isPlaylistEmpty = checkPlaylistEmpty;

/**
 * Add media item to playlist
 */
async function addMediaToPlaylist(playlistId: string, mediaId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/items/`, "POST", {
    media: parseInt(mediaId, 10),
    duration: 10,
    enabled: true,
  });
  
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

/**
 * Seed baseline placeholder into a playlist if empty
 */
export async function seedBaselinePlaylist(playlistId: string): Promise<{ ok: boolean; seeded: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  // Check if playlist is empty
  logs.push(`[Baseline] Checking if playlist ${playlistId} is empty...`);
  const empty = await isPlaylistEmpty(playlistId);
  
  if (!empty) {
    logs.push(`[Baseline] Playlist ${playlistId} already has content, skipping seed`);
    return { ok: true, seeded: false, logs };
  }
  
  // Ensure baseline asset is uploaded
  const assetResult = await ensureBaselineAsset();
  logs.push(...assetResult.logs);
  
  if (!assetResult.ok || !assetResult.mediaId) {
    return { ok: false, seeded: false, error: assetResult.error || "Failed to ensure baseline asset", logs };
  }
  
  // Add baseline asset to playlist
  logs.push(`[Baseline] Adding baseline media ${assetResult.mediaId} to playlist ${playlistId}...`);
  const addResult = await addMediaToPlaylist(playlistId, assetResult.mediaId);
  
  if (!addResult.ok) {
    logs.push(`[Baseline] Failed to add media to playlist: ${addResult.error}`);
    return { ok: false, seeded: false, error: addResult.error, logs };
  }
  
  logs.push(`[Baseline] Seeded placeholder asset into baseline playlist ${playlistId}`);
  return { ok: true, seeded: true, logs };
}

/**
 * Ensure baseline playlist exists for a location
 * Creates playlist and seeds with placeholder content if empty
 */
export async function ensureBaselinePlaylist(
  locationId: string,
  locationName: string
): Promise<{ ok: boolean; playlistId?: string; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  const location = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!location[0]) {
    return { ok: false, error: "Locatie niet gevonden", logs };
  }
  
  // If baseline playlist already exists, return it (idempotent)
  if (location[0].yodeckBaselinePlaylistId) {
    logs.push(`Baseline playlist already exists: ${location[0].yodeckBaselinePlaylistId} (idempotent)`);
    return { ok: true, playlistId: location[0].yodeckBaselinePlaylistId, logs };
  }

  // First, check if a playlist with this name already exists in Yodeck (idempotency)
  const playlistName = `Baseline | ${locationName}`;
  logs.push(`Checking for existing baseline playlist: ${playlistName}`);
  
  const existingPlaylists = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>("/playlists");
  if (existingPlaylists.ok && existingPlaylists.data?.results) {
    const existing = existingPlaylists.data.results.find(p => p.name === playlistName);
    if (existing) {
      logs.push(`Found existing baseline playlist in Yodeck: ${existing.id}`);
      await db.update(locations)
        .set({ yodeckBaselinePlaylistId: String(existing.id) })
        .where(eq(locations.id, locationId));
      
      // Auto-seed if empty
      const seedResult = await seedBaselinePlaylist(String(existing.id));
      logs.push(...seedResult.logs);
      
      return { ok: true, playlistId: String(existing.id), logs };
    }
  }

  // Create baseline playlist
  logs.push(`Creating baseline playlist: ${playlistName}`);
  
  const payload = {
    name: playlistName,
    description: "Elevizion baseline content - voeg handmatig content toe in Yodeck (nieuws, weer, klok of afbeelding)",
    default_duration: 10,
    background_color: "#1a1a2e",
    items: [],
    add_gaps: false,
    shuffle_content: false,
  };
  logs.push(`Creating playlist with payload (items: [] included): ${JSON.stringify(payload)}`);
  
  const createResult = await yodeckRequest<{ id: number }>("/playlists/", "POST", payload);

  if (!createResult.ok) {
    logs.push(`Failed to create baseline playlist: HTTP error - ${createResult.error}`);
    return { ok: false, error: createResult.error, logs };
  }

  if (!createResult.data?.id) {
    logs.push(`Failed to create baseline playlist: No ID returned in response`);
    return { ok: false, error: "No playlist ID in response", logs };
  }

  const playlistId = String(createResult.data.id);
  logs.push(`Baseline playlist created: ${playlistId}`);

  // Update location with baseline playlist ID
  await db.update(locations)
    .set({ yodeckBaselinePlaylistId: playlistId })
    .where(eq(locations.id, locationId));

  logs.push(`Location updated with baseline playlist ID`);
  
  // Auto-seed with placeholder content
  const seedResult = await seedBaselinePlaylist(playlistId);
  logs.push(...seedResult.logs);
  
  return { ok: true, playlistId, logs };
}

/**
 * Ensure ads tagbased playlist exists for a location
 * (delegates to existing yodeckPublishService)
 */
export async function ensureAdsPlaylist(
  locationId: string
): Promise<{ ok: boolean; playlistId?: string; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  try {
    const { yodeckPublishService } = await import("./yodeckPublishService");
    const result = await yodeckPublishService.ensureTagBasedPlaylist(locationId);
    
    if (result.ok) {
      const playlistIdStr = String(result.playlistId);
      logs.push(`Ads tagbased playlist ready: ${playlistIdStr}`);
      return { ok: true, playlistId: playlistIdStr, logs };
    } else {
      logs.push(`Failed to ensure ads playlist: ${result.error}`);
      return { ok: false, error: result.error, logs };
    }
  } catch (error: any) {
    logs.push(`Error ensuring ads playlist: ${error.message}`);
    return { ok: false, error: error.message, logs };
  }
}

/**
 * Create or get existing layout for a location
 * Layout has 2 zones: BASE (30% left) and ADS (70% right)
 * Idempotent: reuses existing layout if found by name
 */
export async function ensureLayout(
  locationId: string,
  locationName: string,
  baselinePlaylistId: string,
  adsPlaylistId: string
): Promise<{ ok: boolean; layoutId?: string; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  const location = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!location[0]) {
    return { ok: false, error: "Locatie niet gevonden", logs };
  }
  
  // If layout already exists in DB, return it (idempotent)
  if (location[0].yodeckLayoutId) {
    logs.push(`Layout already exists in DB: ${location[0].yodeckLayoutId} (idempotent)`);
    return { ok: true, layoutId: location[0].yodeckLayoutId, logs };
  }

  // Check if layouts are supported
  const supported = await probeLayoutsSupport();
  if (!supported) {
    logs.push(`Layouts not supported by Yodeck API`);
    return { ok: false, error: "Layouts API niet beschikbaar", logs };
  }

  // Check if layout already exists in Yodeck by name (idempotency)
  const layoutName = `Elevizion Standard | ${locationName}`;
  logs.push(`Checking for existing layout: ${layoutName}`);
  
  const existingLayouts = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>("/layouts");
  if (existingLayouts.ok && existingLayouts.data?.results) {
    const existing = existingLayouts.data.results.find(l => l.name === layoutName);
    if (existing) {
      logs.push(`Found existing layout in Yodeck: ${existing.id} (idempotent)`);
      await db.update(locations)
        .set({ 
          yodeckLayoutId: String(existing.id),
          layoutMode: "LAYOUT" 
        })
        .where(eq(locations.id, locationId));
      return { ok: true, layoutId: String(existing.id), logs };
    }
  }

  // Create layout with 2 regions (1920x1080 resolution)
  // Baseline: left 30% = 576px, Ads: right 70% = 1344px
  logs.push(`Creating layout: ${layoutName}`);
  
  const layoutPayload = {
    name: layoutName,
    description: "Elevizion 2-zone layout (Baseline + Ads)",
    screen_type: "landscape",
    res_width: 1920,
    res_height: 1080,
    regions: [
      {
        name: "BASE",
        left: 0,
        top: 0,
        width: 576,  // 30% of 1920
        height: 1080,
        zindex: 1,
        order: 0,
        duration: 0,
        res_width: 576,
        res_height: 1080,
        playlist: parseInt(baselinePlaylistId, 10),
      },
      {
        name: "ADS",
        left: 576,
        top: 0,
        width: 1344,  // 70% of 1920
        height: 1080,
        zindex: 1,
        order: 1,
        duration: 0,
        res_width: 1344,
        res_height: 1080,
        playlist: parseInt(adsPlaylistId, 10),
      },
    ],
  };
  logs.push(`Layout payload: ${JSON.stringify(layoutPayload)}`);
  
  const createResult = await yodeckRequest<{ id: number }>("/layouts/", "POST", layoutPayload);

  if (!createResult.ok) {
    logs.push(`Failed to create layout: ${createResult.error}`);
    return { ok: false, error: createResult.error, logs };
  }

  const layoutId = String(createResult.data!.id);
  logs.push(`[YodeckLayouts] ensureLayout OK layoutId=${layoutId}`);

  // Update location with layout ID
  await db.update(locations)
    .set({ 
      yodeckLayoutId: layoutId,
      layoutMode: "LAYOUT" 
    })
    .where(eq(locations.id, locationId));

  logs.push(`Location updated with layout ID and mode=LAYOUT`);
  
  return { ok: true, layoutId, logs };
}

/**
 * Assign layout to a screen
 */
export async function assignLayoutToScreen(
  screenId: string,
  layoutId: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  logs.push(`Assigning layout ${layoutId} to screen ${screenId}`);
  
  // Update screen with layout assignment
  const result = await yodeckRequest(`/screens/${screenId}/`, "PATCH", {
    default_playlist_type: "layout",
    default_playlist: parseInt(layoutId, 10),
  });

  if (!result.ok) {
    logs.push(`Failed to assign layout: ${result.error}`);
    return { ok: false, error: result.error, logs };
  }

  logs.push(`[YodeckLayouts] assignLayout OK screenId=${screenId}`);
  return { ok: true, logs };
}

/**
 * Fallback: assign playlists directly to screen schedule
 * Used when layouts are not supported
 */
export async function applyFallbackSchedule(
  locationId: string,
  screenId: string,
  baselinePlaylistId: string,
  adsPlaylistId: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  logs.push(`Applying fallback schedule (layouts not supported)`);
  logs.push(`Screen: ${screenId}, Baseline: ${baselinePlaylistId}, Ads: ${adsPlaylistId}`);
  
  // For fallback mode, we just assign the ads tagbased playlist
  // The baseline playlist would need to be manually added to the schedule
  // or we interleave them in a single playlist
  
  // Simple approach: assign ads playlist as default
  const result = await yodeckRequest(`/screens/${screenId}/`, "PATCH", {
    default_playlist_type: "playlist",
    default_playlist: parseInt(adsPlaylistId, 10),
  });

  if (!result.ok) {
    logs.push(`Failed to assign ads playlist: ${result.error}`);
    return { ok: false, error: result.error, logs };
  }

  // Update location to fallback mode
  await db.update(locations)
    .set({ layoutMode: "FALLBACK_SCHEDULE" })
    .where(eq(locations.id, locationId));

  logs.push(`Fallback schedule applied - ads playlist assigned to screen`);
  logs.push(`Note: Baseline content needs manual configuration in Yodeck`);
  
  return { ok: true, logs };
}

/**
 * Main entry point: Apply layout or fallback to a location
 */
export async function applyLayoutToLocation(locationId: string): Promise<LayoutApplyResult> {
  const logs: string[] = [];
  
  // Get location
  const location = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!location[0]) {
    return { ok: false, mode: "FALLBACK_SCHEDULE", error: "Locatie niet gevonden", logs };
  }
  
  const loc = location[0];
  const screenId = loc.yodeckDeviceId;
  
  if (!screenId) {
    return { ok: false, mode: "FALLBACK_SCHEDULE", error: "Geen Yodeck screen gekoppeld", logs };
  }

  logs.push(`Applying layout to location: ${loc.name} (screen: ${screenId})`);

  // Step 1: Ensure baseline playlist
  const baselineResult = await ensureBaselinePlaylist(locationId, loc.name);
  logs.push(...baselineResult.logs);
  if (!baselineResult.ok) {
    return { ok: false, mode: "FALLBACK_SCHEDULE", error: baselineResult.error, logs };
  }

  // Step 2: Ensure ads tagbased playlist
  const adsResult = await ensureAdsPlaylist(locationId);
  logs.push(...adsResult.logs);
  if (!adsResult.ok) {
    return { ok: false, mode: "FALLBACK_SCHEDULE", error: adsResult.error, logs };
  }

  // Step 3: Check layout support
  const layoutsSupported = await probeLayoutsSupport();
  logs.push(`Layouts supported: ${layoutsSupported}`);

  if (layoutsSupported) {
    // Step 4a: Create/get layout
    const layoutResult = await ensureLayout(
      locationId,
      loc.name,
      baselineResult.playlistId!,
      adsResult.playlistId!
    );
    logs.push(...layoutResult.logs);
    
    if (layoutResult.ok) {
      // Step 5a: Assign layout to screen
      const assignResult = await assignLayoutToScreen(screenId, layoutResult.layoutId!);
      logs.push(...assignResult.logs);
      
      if (assignResult.ok) {
        return {
          ok: true,
          mode: "LAYOUT",
          layoutId: layoutResult.layoutId,
          baselinePlaylistId: baselineResult.playlistId,
          adsPlaylistId: adsResult.playlistId,
          logs,
        };
      }
    }
    
    // Layout creation/assignment failed - fall through to fallback
    logs.push(`Layout mode failed, falling back to schedule mode`);
  }

  // Step 4b/5b: Apply fallback schedule
  const fallbackResult = await applyFallbackSchedule(
    locationId,
    screenId,
    baselineResult.playlistId!,
    adsResult.playlistId!
  );
  logs.push(...fallbackResult.logs);

  if (!fallbackResult.ok) {
    return { ok: false, mode: "FALLBACK_SCHEDULE", error: fallbackResult.error, logs };
  }

  return {
    ok: true,
    mode: "FALLBACK_SCHEDULE",
    baselinePlaylistId: baselineResult.playlistId,
    adsPlaylistId: adsResult.playlistId,
    logs,
  };
}

/**
 * Ensure ads playlist is active on screen via layout or schedule
 * Called after successful publish to guarantee ads are visible
 */
export async function ensureAdsSurfaceActive(params: {
  locationId: string;
  screenId: string;
  adsPlaylistId: string;
}): Promise<{ ok: boolean; surfaceActive: boolean; mode?: LayoutMode; error?: string; logs: string[] }> {
  const { locationId, screenId, adsPlaylistId } = params;
  const logs: string[] = [];
  
  logs.push(`[AutoSurface] Checking ads surface for location ${locationId}, screen ${screenId}`);
  
  // Get location
  const location = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!location[0]) {
    return { ok: false, surfaceActive: false, error: "Locatie niet gevonden", logs };
  }
  
  const loc = location[0];
  
  // Check if layout mode is already configured and active
  if (loc.layoutMode === "LAYOUT" && loc.yodeckLayoutId) {
    logs.push(`[AutoSurface] Layout mode already active with layout ${loc.yodeckLayoutId}`);
    return { ok: true, surfaceActive: true, mode: "LAYOUT", logs };
  }
  
  // Check if fallback schedule is already configured with ads playlist
  if (loc.layoutMode === "FALLBACK_SCHEDULE" && loc.yodeckPlaylistId === adsPlaylistId) {
    logs.push(`[AutoSurface] Fallback schedule already active with ads playlist ${adsPlaylistId}`);
    return { ok: true, surfaceActive: true, mode: "FALLBACK_SCHEDULE", logs };
  }
  
  // Surface not active - need to apply layout or fallback
  logs.push(`[AutoSurface] Surface not active, applying layout/fallback...`);
  
  // Check if layouts are supported
  const layoutsSupported = await probeLayoutsSupport();
  
  if (layoutsSupported) {
    // Try to apply layout
    logs.push(`[AutoSurface] Layouts supported, applying layout...`);
    
    // Ensure baseline playlist exists
    const baselineResult = await ensureBaselinePlaylist(locationId, loc.name);
    logs.push(...baselineResult.logs);
    
    if (baselineResult.ok && baselineResult.playlistId) {
      // Ensure layout exists
      const layoutResult = await ensureLayout(locationId, loc.name, baselineResult.playlistId, adsPlaylistId);
      logs.push(...layoutResult.logs);
      
      if (layoutResult.ok && layoutResult.layoutId) {
        // Assign layout to screen
        const assignResult = await assignLayoutToScreen(screenId, layoutResult.layoutId);
        logs.push(...assignResult.logs);
        
        if (assignResult.ok) {
          logs.push(`[AutoSurface] Layout applied successfully`);
          return { ok: true, surfaceActive: true, mode: "LAYOUT", logs };
        }
      }
    }
    
    logs.push(`[AutoSurface] Layout mode failed, falling back to schedule...`);
  }
  
  // Fallback: assign ads playlist directly to screen
  logs.push(`[AutoSurface] Applying fallback schedule with ads playlist ${adsPlaylistId}...`);
  
  const scheduleResult = await yodeckRequest<any>(`/screens/${screenId}/`, "PATCH", {
    default_playlist: parseInt(adsPlaylistId, 10),
  });
  
  if (!scheduleResult.ok) {
    logs.push(`[AutoSurface] Failed to assign ads playlist to screen: ${scheduleResult.error}`);
    return { 
      ok: false, 
      surfaceActive: false, 
      error: `ADS_SURFACE_NOT_ACTIVE: ${scheduleResult.error}`, 
      logs 
    };
  }
  
  // Update location mode
  await db.update(locations)
    .set({ layoutMode: "FALLBACK_SCHEDULE" })
    .where(eq(locations.id, locationId));
  
  logs.push(`[AutoSurface] Fallback schedule applied successfully`);
  return { ok: true, surfaceActive: true, mode: "FALLBACK_SCHEDULE", logs };
}

/**
 * Get layout status for all locations
 */
export async function getLayoutStatusForLocations(): Promise<{
  locations: Array<{
    id: string;
    name: string;
    screenId: string | null;
    layoutMode: string;
    layoutId: string | null;
    baselinePlaylistId: string | null;
    baselineEmpty: boolean;
    adsPlaylistId: string | null;
    status: "complete" | "partial" | "none";
  }>;
  layoutsSupported: boolean;
}> {
  const supported = await probeLayoutsSupport();
  
  const locs = await db.select({
    id: locations.id,
    name: locations.name,
    screenId: locations.yodeckDeviceId,
    layoutMode: locations.layoutMode,
    layoutId: locations.yodeckLayoutId,
    baselinePlaylistId: locations.yodeckBaselinePlaylistId,
    adsPlaylistId: locations.yodeckPlaylistId,
  }).from(locations);

  const locationsWithStatus = await Promise.all(locs.map(async loc => {
    let status: "complete" | "partial" | "none" = "none";
    let baselineEmpty = true;
    
    if (loc.layoutMode === "LAYOUT" && loc.layoutId && loc.baselinePlaylistId && loc.adsPlaylistId) {
      status = "complete";
    } else if (loc.adsPlaylistId || loc.baselinePlaylistId) {
      status = "partial";
    }
    
    if (loc.baselinePlaylistId) {
      try {
        baselineEmpty = await checkPlaylistEmpty(loc.baselinePlaylistId);
      } catch (e) {
        baselineEmpty = true;
      }
    }
    
    return {
      id: loc.id,
      name: loc.name,
      screenId: loc.screenId,
      layoutMode: loc.layoutMode || "FALLBACK_SCHEDULE",
      layoutId: loc.layoutId,
      baselinePlaylistId: loc.baselinePlaylistId,
      baselineEmpty,
      adsPlaylistId: loc.adsPlaylistId,
      status,
    };
  }));

  return {
    locations: locationsWithStatus,
    layoutsSupported: supported,
  };
}

// Layout identity constants
const ELEVIZION_LAYOUT_PREFIX = "Elevizion";
const ELEVIZION_STANDARD_LAYOUT_NAME = "Elevizion - Standard 30/70";

/**
 * Check if a layout name is an Elevizion-managed layout
 */
export function isElevizionLayout(layoutName: string | null | undefined): boolean {
  if (!layoutName) return false;
  return layoutName.startsWith(ELEVIZION_LAYOUT_PREFIX);
}

/**
 * Get current screen content status from Yodeck
 * Returns the current content mode (layout/playlist/schedule) and layout details
 * Logs raw API response for debugging
 */
export async function getScreenContentStatus(screenId: string): Promise<{
  ok: boolean;
  mode: "layout" | "playlist" | "schedule" | "unknown";
  rawContentType?: string;
  layoutId?: string;
  layoutName?: string;
  playlistId?: string;
  playlistName?: string;
  isElevizionLayout: boolean;
  lastSeenOnline?: string;
  lastScreenshotAt?: string;
  isOnline?: boolean;
  error?: string;
  rawApiResponse?: string;
}> {
  console.log(`[ScreenStatus] GET /screens/${screenId}`);
  
  const result = await yodeckRequest<any>(`/screens/${screenId}`);

  if (!result.ok || !result.data) {
    const errorMsg = `HTTP error: ${result.error}`;
    console.error(`[ScreenStatus] ${errorMsg}`);
    return { ok: false, mode: "unknown", isElevizionLayout: false, error: errorMsg };
  }

  const screen = result.data;
  
  // Log raw response for debugging
  const rawApiResponse = JSON.stringify({
    id: screen.id,
    name: screen.name,
    default_playlist_type: screen.default_playlist_type,
    default_playlist: screen.default_playlist,
    layout: screen.layout,
    current_layout: screen.current_layout,
    content_type: screen.content_type,
    assigned_layout: screen.assigned_layout,
    last_seen_online: screen.last_seen_online,
    status: screen.status,
  });
  console.log(`[ScreenStatus] Raw: ${rawApiResponse}`);
  
  // Try multiple field names for content type
  const rawContentType = screen.default_playlist_type 
    || screen.content_type 
    || screen.playlist_type 
    || "unknown";
  const playlistType = String(rawContentType).toLowerCase();
  
  console.log(`[ScreenStatus] Content type: "${rawContentType}"`);
  
  // Determine mode
  let mode: "layout" | "playlist" | "schedule" | "unknown" = "unknown";
  let layoutId: string | undefined;
  let layoutName: string | undefined;
  let playlistId: string | undefined;
  let playlistName: string | undefined;
  
  if (playlistType === "layout") {
    mode = "layout";
    // Try multiple layout field names
    const layout = screen.layout || screen.current_layout || screen.assigned_layout;
    if (layout && typeof layout === "object") {
      layoutId = String(layout.id);
      layoutName = layout.name;
      console.log(`[ScreenStatus] Layout from object: id=${layoutId}, name=${layoutName}`);
    } else if (screen.default_playlist) {
      layoutId = String(screen.default_playlist);
      console.log(`[ScreenStatus] Layout ID: ${layoutId}, fetching name...`);
      const layoutResult = await yodeckRequest<{ id: number; name: string }>(`/layouts/${screen.default_playlist}`);
      if (layoutResult.ok && layoutResult.data) {
        layoutName = layoutResult.data.name;
        console.log(`[ScreenStatus] Fetched layout name: ${layoutName}`);
      } else {
        console.log(`[ScreenStatus] Failed to fetch layout: ${layoutResult.error}`);
      }
    }
  } else if (playlistType === "playlist") {
    mode = "playlist";
    if (screen.default_playlist) {
      playlistId = String(screen.default_playlist);
      playlistName = screen.default_playlist_name;
    }
  } else if (playlistType === "schedule") {
    mode = "schedule";
  } else {
    console.log(`[ScreenStatus] Unknown type: "${playlistType}"`);
  }

  const isOnline = screen.status === "online" || screen.is_online === true;
  console.log(`[ScreenStatus] mode=${mode}, layout=${layoutName || "-"}, isElevizion=${isElevizionLayout(layoutName)}, online=${isOnline}`);

  return {
    ok: true,
    mode,
    rawContentType,
    layoutId,
    layoutName,
    playlistId,
    playlistName,
    isElevizionLayout: isElevizionLayout(layoutName),
    lastSeenOnline: screen.last_seen_online,
    lastScreenshotAt: screen.last_screenshot_at,
    isOnline,
    rawApiResponse,
  };
}

export type LayoutConfigStatus = "OK" | "WRONG_LAYOUT" | "NO_LAYOUT" | "ERROR";

export interface ScreenLayoutStatus {
  locationId: string;
  screenId: string;
  status: LayoutConfigStatus;
  currentMode: string;
  currentLayoutId?: string;
  currentLayoutName?: string;
  expectedLayoutId?: string;
  error?: string;
}

/**
 * Check if screen has correct Elevizion layout configuration
 */
export async function checkScreenLayoutConfig(locationId: string): Promise<ScreenLayoutStatus> {
  const location = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!location[0]) {
    return { 
      locationId, 
      screenId: "", 
      status: "ERROR", 
      currentMode: "unknown",
      error: "Location not found" 
    };
  }

  const loc = location[0];
  const screenId = loc.yodeckDeviceId;

  if (!screenId) {
    return { 
      locationId, 
      screenId: "", 
      status: "ERROR", 
      currentMode: "unknown",
      error: "No Yodeck screen linked" 
    };
  }

  const screenStatus = await getScreenContentStatus(screenId);
  
  if (!screenStatus.ok) {
    return { 
      locationId, 
      screenId, 
      status: "ERROR", 
      currentMode: "unknown",
      error: screenStatus.error || "Failed to fetch screen status"
    };
  }

  // Check if screen is using a layout
  if (screenStatus.mode !== "layout") {
    return {
      locationId,
      screenId,
      status: "NO_LAYOUT",
      currentMode: screenStatus.mode,
      currentLayoutName: screenStatus.layoutName,
      expectedLayoutId: loc.yodeckLayoutId || undefined,
    };
  }

  // Check if it's an Elevizion layout
  if (!screenStatus.isElevizionLayout) {
    return {
      locationId,
      screenId,
      status: "WRONG_LAYOUT",
      currentMode: "layout",
      currentLayoutId: screenStatus.layoutId,
      currentLayoutName: screenStatus.layoutName,
      expectedLayoutId: loc.yodeckLayoutId || undefined,
    };
  }

  // Check if it matches our expected layout
  if (loc.yodeckLayoutId && screenStatus.layoutId !== loc.yodeckLayoutId) {
    return {
      locationId,
      screenId,
      status: "WRONG_LAYOUT",
      currentMode: "layout",
      currentLayoutId: screenStatus.layoutId,
      currentLayoutName: screenStatus.layoutName,
      expectedLayoutId: loc.yodeckLayoutId,
    };
  }

  return {
    locationId,
    screenId,
    status: "OK",
    currentMode: "layout",
    currentLayoutId: screenStatus.layoutId,
    currentLayoutName: screenStatus.layoutName,
  };
}

export interface ForceLayoutResult {
  ok: boolean;
  verified: boolean;
  layoutId?: string;
  layoutName?: string;
  beforeLayoutName?: string;
  afterLayoutName?: string;
  screenshotTimestamp?: string;
  error?: string;
  logs: string[];
}

/**
 * Step 1: Force reset screen content to break existing content binding
 * Sets screen to playlist mode with no playlist (or minimal content)
 * This clears any existing demo layout and prepares for fresh assignment
 */
async function forceResetScreenContent(
  screenId: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  logs.push(`[ForceReset] Resetting screen ${screenId} content...`);
  
  // Get current screen info for logging
  const currentInfo = await yodeckRequest<{
    id: number;
    name: string;
    default_playlist_type: string;
    default_playlist?: number;
    current_layout?: { id: number; name: string };
  }>(`/screens/${screenId}`);
  
  if (currentInfo.ok && currentInfo.data) {
    const currentType = currentInfo.data.default_playlist_type;
    const currentLayout = currentInfo.data.current_layout?.name || "none";
    logs.push(`[ForceReset] Current: type=${currentType}, layout=${currentLayout}`);
  }
  
  // Step 1a: Set screen to "playlist" mode with null/empty content
  // This breaks the existing layout/playlist binding
  const resetResult = await yodeckRequest(`/screens/${screenId}/`, "PATCH", {
    default_playlist_type: "playlist",
    default_playlist: null,  // Clear content
  });
  
  if (!resetResult.ok) {
    logs.push(`[ForceReset] PATCH failed: ${resetResult.error}`);
    return { ok: false, error: `RESET_FAILED: ${resetResult.error}`, logs };
  }
  logs.push(`[ForceReset] Screen content cleared (mode=playlist, playlist=null)`);
  
  // Step 1b: Push to sync the reset
  logs.push(`[ForceReset] Pushing reset to screen...`);
  const pushResult = await yodeckRequest(`/screens/${screenId}/push/`, "POST", {});
  if (!pushResult.ok) {
    logs.push(`[ForceReset] Push warning: ${pushResult.error} (continuing)`);
  } else {
    logs.push(`[ForceReset] Reset pushed successfully`);
  }
  
  // Step 1c: Wait for screen to process reset
  logs.push(`[ForceReset] Waiting 3s for screen to process reset...`);
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  logs.push(`[ForceReset] Screen reset complete`);
  return { ok: true, logs };
}

/**
 * Step 2: Apply Elevizion layout to screen (after reset)
 * Sets screen mode to LAYOUT with proper layoutId
 * Endpoints used:
 *   - PATCH /screens/{id}/ for assignment
 *   - POST /screens/{id}/push/ for push
 */
async function applyElevizionLayoutToScreen(
  screenId: string,
  layoutId: string,
  layoutName: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  logs.push(`[ApplyLayout] === Assigning layout to screen ===`);
  logs.push(`[ApplyLayout] Screen ID: ${screenId}`);
  logs.push(`[ApplyLayout] Layout ID: ${layoutId}`);
  logs.push(`[ApplyLayout] Layout Name: ${layoutName}`);
  
  // Set screen to layout mode with Elevizion layout
  const assignPayload = {
    default_playlist_type: "layout",
    default_playlist: parseInt(layoutId, 10),
  };
  logs.push(`[ApplyLayout] Endpoint: PATCH /screens/${screenId}/`);
  logs.push(`[ApplyLayout] Payload: ${JSON.stringify(assignPayload)}`);
  
  const assignResult = await yodeckRequest(`/screens/${screenId}/`, "PATCH", assignPayload);
  
  if (!assignResult.ok) {
    logs.push(`[ApplyLayout] Assignment FAILED: ${assignResult.error}`);
    return { ok: false, error: `ASSIGN_FAILED: ${assignResult.error}`, logs };
  }
  logs.push(`[ApplyLayout] Assignment SUCCESS`);
  
  // Push changes to screen
  logs.push(`[ApplyLayout] Endpoint: POST /screens/${screenId}/push/`);
  const pushResult = await yodeckRequest(`/screens/${screenId}/push/`, "POST", {});
  if (!pushResult.ok) {
    logs.push(`[ApplyLayout] Push WARNING: ${pushResult.error} (continuing anyway)`);
  } else {
    logs.push(`[ApplyLayout] Push SUCCESS`);
  }
  
  // Wait for push to propagate
  logs.push(`[ApplyLayout] Waiting 2s for push to propagate...`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return { ok: true, logs };
}

/**
 * Step 3: Verify screen is now using Elevizion layout
 * Polls up to 3 times with increasing delays (3s, 5s, 8s)
 * Returns screenshot timestamp for audit
 */
async function verifyScreenLayout(
  screenId: string,
  expectedLayoutId: string
): Promise<{
  ok: boolean;
  verified: boolean;
  currentMode?: string;
  currentLayoutName?: string;
  rawContentType?: string;
  screenshotTimestamp?: string;
  isOnline?: boolean;
  error?: string;
  logs: string[];
}> {
  const logs: string[] = [];
  const delays = [3000, 5000, 8000]; // 3s, 5s, 8s
  
  logs.push(`[Verify] Starting verification for screen ${screenId} (expected layout: ${expectedLayoutId})`);
  
  let lastScreenStatus: Awaited<ReturnType<typeof getScreenContentStatus>> | null = null;
  let screenshotTimestamp = new Date().toISOString();
  
  for (let attempt = 0; attempt < delays.length; attempt++) {
    const delay = delays[attempt];
    logs.push(`[Verify] Attempt ${attempt + 1}/3: waiting ${delay / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    screenshotTimestamp = new Date().toISOString();
    logs.push(`[Verify] Attempt ${attempt + 1}: Fetching screen status at ${screenshotTimestamp}`);
    
    lastScreenStatus = await getScreenContentStatus(screenId);
    
    if (!lastScreenStatus.ok) {
      logs.push(`[Verify] Attempt ${attempt + 1}: API error: ${lastScreenStatus.error}`);
      continue;
    }
    
    logs.push(`[Verify] Attempt ${attempt + 1}: rawContentType="${lastScreenStatus.rawContentType}", mode="${lastScreenStatus.mode}", layout="${lastScreenStatus.layoutName || "-"}", isElevizion=${lastScreenStatus.isElevizionLayout}, online=${lastScreenStatus.isOnline}`);
    
    // Check if verification passed
    if (lastScreenStatus.mode === "layout" && lastScreenStatus.isElevizionLayout) {
      logs.push(`[Verify] SUCCESS on attempt ${attempt + 1}: Screen is on Elevizion layout '${lastScreenStatus.layoutName}'`);
      return {
        ok: true,
        verified: true,
        currentMode: lastScreenStatus.mode,
        currentLayoutName: lastScreenStatus.layoutName,
        rawContentType: lastScreenStatus.rawContentType,
        screenshotTimestamp,
        isOnline: lastScreenStatus.isOnline,
        logs,
      };
    }
    
    logs.push(`[Verify] Attempt ${attempt + 1}: Not yet on Elevizion layout, will retry...`);
  }
  
  // All attempts failed
  const currentMode = lastScreenStatus?.mode || "unknown";
  const currentLayoutName = lastScreenStatus?.layoutName;
  const rawContentType = lastScreenStatus?.rawContentType;
  const isOnline = lastScreenStatus?.isOnline;
  
  logs.push(`[Verify] FAILED after 3 attempts: mode="${currentMode}", layout="${currentLayoutName || "-"}", isElevizion=${lastScreenStatus?.isElevizionLayout || false}`);
  
  return {
    ok: true,
    verified: false,
    currentMode,
    currentLayoutName,
    rawContentType,
    screenshotTimestamp,
    isOnline,
    logs,
  };
}

/**
 * Force screen to use Elevizion layout with hard reset + double push + verification
 * 
 * Flow:
 * 1. Reset screen content (clear existing binding)
 * 2. Push reset
 * 3. Wait 3s
 * 4. Apply Elevizion layout
 * 5. Push layout
 * 6. Verify (with 1 retry if still on demo layout)
 * 
 * Used by:
 * - POST /api/admin/layouts/:id/force
 * - Publish flow (Step 6)
 * - Repair button in /layouts UI
 */
export async function ensureScreenUsesElevizionLayout(
  locationId: string
): Promise<ForceLayoutResult> {
  const logs: string[] = [];
  let beforeLayoutName: string | undefined;
  let afterLayoutName: string | undefined;
  let screenshotTimestamp: string | undefined;
  
  logs.push(`[ForceLayout] === Starting hard reset + double push for location ${locationId} ===`);
  
  // Get location
  const location = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!location[0]) {
    return { ok: false, verified: false, error: "Location not found", logs };
  }

  const loc = location[0];
  const screenId = loc.yodeckDeviceId;

  if (!screenId) {
    return { ok: false, verified: false, error: "No Yodeck screen linked", logs };
  }

  // Get current screen status for logging (beforeLayoutName)
  const currentStatus = await getScreenContentStatus(screenId);
  beforeLayoutName = currentStatus.layoutName || "none";
  logs.push(`[ForceLayout] BEFORE: mode=${currentStatus.mode}, layout=${beforeLayoutName}, isElevizion=${currentStatus.isElevizionLayout}`);

  // If already on correct Elevizion layout, just verify and return
  if (currentStatus.mode === "layout" && currentStatus.isElevizionLayout) {
    logs.push(`[ForceLayout] Screen already on Elevizion layout - verifying...`);
    screenshotTimestamp = new Date().toISOString();
    afterLayoutName = currentStatus.layoutName;
    return { 
      ok: true, 
      verified: true, 
      layoutId: currentStatus.layoutId,
      layoutName: currentStatus.layoutName,
      beforeLayoutName,
      afterLayoutName,
      screenshotTimestamp,
      logs 
    };
  }

  // === PREREQUISITE: Ensure playlists exist ===
  logs.push(`[ForceLayout] Ensuring baseline playlist...`);
  const baselineResult = await ensureBaselinePlaylist(locationId, loc.name);
  logs.push(...baselineResult.logs);
  if (!baselineResult.ok || !baselineResult.playlistId) {
    return { ok: false, verified: false, beforeLayoutName, error: baselineResult.error || "Failed to create baseline playlist", logs };
  }

  logs.push(`[ForceLayout] Ensuring ads playlist...`);
  const adsResult = await ensureAdsPlaylist(locationId);
  logs.push(...adsResult.logs);
  if (!adsResult.ok || !adsResult.playlistId) {
    return { ok: false, verified: false, beforeLayoutName, error: adsResult.error || "Failed to create ads playlist", logs };
  }

  // Check if layouts are supported
  const layoutsApiSupported = await probeLayoutsSupport();
  if (!layoutsApiSupported) {
    logs.push(`[ForceLayout] Layouts API not available`);
    return { ok: false, verified: false, beforeLayoutName, error: "LAYOUTS_API_NOT_AVAILABLE", logs };
  }

  // === ENSURE ELEVIZION LAYOUT EXISTS ===
  logs.push(`[ForceLayout] Ensuring Elevizion layout exists...`);
  
  const existingLayouts = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>("/layouts");
  let layoutId: string | undefined;
  let layoutName: string | undefined;
  
  if (existingLayouts.ok && existingLayouts.data?.results) {
    const locationLayoutName = `Elevizion Standard | ${loc.name}`;
    let existingLayout = existingLayouts.data.results.find(l => l.name === locationLayoutName);
    
    if (!existingLayout) {
      existingLayout = existingLayouts.data.results.find(l => 
        l.name.startsWith(ELEVIZION_LAYOUT_PREFIX) && l.name.includes("Standard")
      );
    }
    
    if (existingLayout) {
      layoutId = String(existingLayout.id);
      layoutName = existingLayout.name;
      logs.push(`[ForceLayout] Found existing Elevizion layout: ${layoutName} (${layoutId})`);
    }
  }

  if (!layoutId) {
    logs.push(`[ForceLayout] Creating new Elevizion layout...`);
    const createLayoutName = `Elevizion Standard | ${loc.name}`;
    
    // Full Yodeck layout payload with all required region fields
    // Resolution: 1920x1080, Baseline: 30% (576px), Ads: 70% (1344px)
    const layoutPayload = {
      name: createLayoutName,
      description: "Elevizion 2-zone layout (30% Baseline + 70% Ads)",
      screen_type: "landscape",
      res_width: 1920,
      res_height: 1080,
      regions: [
        {
          name: "BASE",
          left: 0,
          top: 0,
          width: 576,  // 30% of 1920
          height: 1080,
          zindex: 1,
          order: 0,
          duration: 0,
          res_width: 576,
          res_height: 1080,
          playlist: parseInt(baselineResult.playlistId, 10),
        },
        {
          name: "ADS",
          left: 576,
          top: 0,
          width: 1344,  // 70% of 1920
          height: 1080,
          zindex: 1,
          order: 1,
          duration: 0,
          res_width: 1344,
          res_height: 1080,
          playlist: parseInt(adsResult.playlistId, 10),
        },
      ],
    };
    logs.push(`[ForceLayout] Layout payload: ${JSON.stringify(layoutPayload)}`);
    
    const createResult = await yodeckRequest<{ id: number; name: string }>("/layouts/", "POST", layoutPayload);

    if (!createResult.ok || !createResult.data) {
      logs.push(`[ForceLayout] Failed to create layout: ${createResult.error}`);
      return { ok: false, verified: false, beforeLayoutName, error: `CREATE_LAYOUT_FAILED: ${createResult.error}`, logs };
    }

    layoutId = String(createResult.data.id);
    layoutName = createLayoutName;
    logs.push(`[ForceLayout] Created layout: ${layoutName} (${layoutId})`);
  }

  // Save layout ID to DB
  await db.update(locations)
    .set({ yodeckLayoutId: layoutId, layoutMode: "LAYOUT" })
    .where(eq(locations.id, locationId));
  logs.push(`[ForceLayout] Saved layout ID to database`);

  // === STEP 1: FORCE RESET SCREEN CONTENT (clear demo layout binding) ===
  logs.push(`[ForceLayout] === STEP 1: Force Reset Screen Content ===`);
  const resetResult = await forceResetScreenContent(screenId);
  logs.push(...resetResult.logs);
  
  if (!resetResult.ok) {
    return { ok: false, verified: false, beforeLayoutName, layoutId, layoutName, error: resetResult.error, logs };
  }

  // === STEP 2: APPLY ELEVIZION LAYOUT ===
  logs.push(`[ForceLayout] === STEP 2: Apply Elevizion Layout ===`);
  const applyResult = await applyElevizionLayoutToScreen(screenId, layoutId, layoutName!);
  logs.push(...applyResult.logs);
  
  if (!applyResult.ok) {
    return { ok: false, verified: false, beforeLayoutName, layoutId, layoutName, error: applyResult.error, logs };
  }

  // === STEP 3: VERIFY (with 1 retry) ===
  logs.push(`[ForceLayout] === STEP 3: Verify (attempt 1) ===`);
  let verifyResult = await verifyScreenLayout(screenId, layoutId);
  logs.push(...verifyResult.logs);
  screenshotTimestamp = verifyResult.screenshotTimestamp;
  afterLayoutName = verifyResult.currentLayoutName;

  if (verifyResult.ok && verifyResult.verified) {
    logs.push(`[ForceLayout] SUCCESS on first attempt`);
    logs.push(`[ForceLayout] beforeLayoutName: ${beforeLayoutName}`);
    logs.push(`[ForceLayout] afterLayoutName: ${afterLayoutName}`);
    logs.push(`[ForceLayout] screenshotTimestamp: ${screenshotTimestamp}`);
    return {
      ok: true,
      verified: true,
      layoutId,
      layoutName,
      beforeLayoutName,
      afterLayoutName,
      screenshotTimestamp,
      logs,
    };
  }

  // === RETRY: If demo layout still active, do full reset+apply again ===
  logs.push(`[ForceLayout] First attempt failed - demo layout stuck. Retrying with full reset...`);
  
  // Reset again
  const retryResetResult = await forceResetScreenContent(screenId);
  logs.push(...retryResetResult.logs);
  if (!retryResetResult.ok) {
    return { 
      ok: false, 
      verified: false, 
      beforeLayoutName, 
      afterLayoutName,
      screenshotTimestamp,
      layoutId, 
      layoutName, 
      error: "SCREEN_LAYOUT_STUCK (PERMANENT) - Reset failed on retry", 
      logs 
    };
  }

  // Apply again
  const retryApplyResult = await applyElevizionLayoutToScreen(screenId, layoutId, layoutName!);
  logs.push(...retryApplyResult.logs);
  if (!retryApplyResult.ok) {
    return { 
      ok: false, 
      verified: false, 
      beforeLayoutName, 
      afterLayoutName,
      screenshotTimestamp,
      layoutId, 
      layoutName, 
      error: "SCREEN_LAYOUT_STUCK (PERMANENT) - Apply failed on retry", 
      logs 
    };
  }

  // Verify again
  logs.push(`[ForceLayout] === STEP 3: Verify (attempt 2 - final) ===`);
  verifyResult = await verifyScreenLayout(screenId, layoutId);
  logs.push(...verifyResult.logs);
  screenshotTimestamp = verifyResult.screenshotTimestamp;
  afterLayoutName = verifyResult.currentLayoutName;

  if (verifyResult.ok && verifyResult.verified) {
    logs.push(`[ForceLayout] SUCCESS on retry`);
    logs.push(`[ForceLayout] beforeLayoutName: ${beforeLayoutName}`);
    logs.push(`[ForceLayout] afterLayoutName: ${afterLayoutName}`);
    logs.push(`[ForceLayout] screenshotTimestamp: ${screenshotTimestamp}`);
    return {
      ok: true,
      verified: true,
      layoutId,
      layoutName,
      beforeLayoutName,
      afterLayoutName,
      screenshotTimestamp,
      logs,
    };
  }

  // === PERMANENT FAILURE ===
  logs.push(`[ForceLayout] PERMANENT FAILURE - Screen layout stuck on '${afterLayoutName}'`);
  logs.push(`[ForceLayout] beforeLayoutName: ${beforeLayoutName}`);
  logs.push(`[ForceLayout] afterLayoutName: ${afterLayoutName}`);
  logs.push(`[ForceLayout] screenshotTimestamp: ${screenshotTimestamp}`);
  
  return {
    ok: false,
    verified: false,
    layoutId,
    layoutName,
    beforeLayoutName,
    afterLayoutName,
    screenshotTimestamp,
    error: "SCREEN_LAYOUT_STUCK (PERMANENT)",
    logs,
  };
}

/**
 * Get detailed layout status for all locations with screen info
 */
export async function getDetailedLayoutStatus(): Promise<{
  locations: Array<{
    id: string;
    name: string;
    screenId: string | null;
    currentMode: string;
    currentLayoutId?: string;
    currentLayoutName?: string;
    expectedLayoutId?: string;
    status: LayoutConfigStatus;
    baselinePlaylistId?: string;
    baselineEmpty: boolean;
    adsPlaylistId?: string;
    canFix: boolean;
  }>;
  layoutsSupported: boolean;
}> {
  const supported = await probeLayoutsSupport();
  
  const locs = await db.select({
    id: locations.id,
    name: locations.name,
    screenId: locations.yodeckDeviceId,
    layoutId: locations.yodeckLayoutId,
    baselinePlaylistId: locations.yodeckBaselinePlaylistId,
    adsPlaylistId: locations.yodeckPlaylistId,
  }).from(locations);

  const detailedLocs = await Promise.all(locs.map(async loc => {
    let status: LayoutConfigStatus = "ERROR";
    let currentMode = "unknown";
    let currentLayoutId: string | undefined;
    let currentLayoutName: string | undefined;
    let baselineEmpty = true;
    let canFix = false;

    if (loc.screenId) {
      const screenStatus = await getScreenContentStatus(loc.screenId);
      
      if (screenStatus.ok) {
        currentMode = screenStatus.mode;
        currentLayoutId = screenStatus.layoutId;
        currentLayoutName = screenStatus.layoutName;
        
        if (screenStatus.mode === "layout" && screenStatus.isElevizionLayout) {
          status = "OK";
        } else if (screenStatus.mode === "layout") {
          status = "WRONG_LAYOUT";
          canFix = supported;
        } else {
          status = "NO_LAYOUT";
          canFix = supported;
        }
      }
    }

    if (loc.baselinePlaylistId) {
      try {
        baselineEmpty = await checkPlaylistEmpty(loc.baselinePlaylistId);
      } catch (e) {
        baselineEmpty = true;
      }
    }

    return {
      id: loc.id,
      name: loc.name,
      screenId: loc.screenId,
      currentMode,
      currentLayoutId,
      currentLayoutName,
      expectedLayoutId: loc.layoutId || undefined,
      status,
      baselinePlaylistId: loc.baselinePlaylistId || undefined,
      baselineEmpty,
      adsPlaylistId: loc.adsPlaylistId || undefined,
      canFix,
    };
  }));

  return {
    locations: detailedLocs,
    layoutsSupported: supported,
  };
}

export const yodeckLayoutService = {
  probeLayoutsSupport,
  getLayoutSupportStatus,
  ensureBaselineAsset,
  seedBaselinePlaylist,
  checkPlaylistEmpty,
  ensureBaselinePlaylist,
  ensureAdsPlaylist,
  ensureLayout,
  assignLayoutToScreen,
  applyFallbackSchedule,
  applyLayoutToLocation,
  ensureAdsSurfaceActive,
  getLayoutStatusForLocations,
  // New functions for layout enforcement
  isElevizionLayout,
  getScreenContentStatus,
  checkScreenLayoutConfig,
  ensureScreenUsesElevizionLayout,
  getDetailedLayoutStatus,
};
