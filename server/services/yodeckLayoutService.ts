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

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

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

/**
 * Ensure baseline playlist exists for a location
 * Creates a simple playlist with placeholder content
 * Note: Baseline playlist starts empty - admin should add content in Yodeck UI
 * (news/weather widgets, clock, or custom placeholder images)
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
      return { ok: true, playlistId: String(existing.id), logs };
    }
  }

  // Create baseline playlist
  logs.push(`Creating baseline playlist: ${playlistName}`);
  
  const createResult = await yodeckRequest<{ id: number }>("/playlists/", "POST", {
    name: playlistName,
    description: "Elevizion baseline content - voeg handmatig content toe in Yodeck (nieuws, weer, klok of afbeelding)",
    default_duration: 10,
    background_color: "#1a1a2e",
  });

  if (!createResult.ok) {
    logs.push(`Failed to create baseline playlist: ${createResult.error}`);
    return { ok: false, error: createResult.error, logs };
  }

  const playlistId = String(createResult.data!.id);
  logs.push(`Baseline playlist created: ${playlistId}`);
  logs.push(`NOTE: Voeg handmatig content toe aan deze playlist in Yodeck (nieuws, weer, klok, of placeholder afbeelding)`);

  // Update location with baseline playlist ID
  await db.update(locations)
    .set({ yodeckBaselinePlaylistId: playlistId })
    .where(eq(locations.id, locationId));

  logs.push(`Location updated with baseline playlist ID`);
  
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
      logs.push(`Ads tagbased playlist ready: ${result.playlistId}`);
      return { ok: true, playlistId: result.playlistId, logs };
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

  // Create layout with 2 regions
  logs.push(`Creating layout: ${layoutName}`);
  
  const createResult = await yodeckRequest<{ id: number }>("/layouts/", "POST", {
    name: layoutName,
    description: "Elevizion 2-zone layout (Baseline + Ads)",
    screen_type: "landscape", // 16:9
    regions: [
      {
        name: "BASE",
        x: 0,
        y: 0,
        width: 30, // 30% width
        height: 100,
        z_index: 1,
        item: {
          type: "playlist",
          id: parseInt(baselinePlaylistId, 10),
        },
      },
      {
        name: "ADS",
        x: 30,
        y: 0,
        width: 70, // 70% width
        height: 100,
        z_index: 1,
        item: {
          type: "playlist",
          id: parseInt(adsPlaylistId, 10),
        },
      },
    ],
  });

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

  return {
    locations: locs.map(loc => {
      let status: "complete" | "partial" | "none" = "none";
      
      if (loc.layoutMode === "LAYOUT" && loc.layoutId && loc.baselinePlaylistId && loc.adsPlaylistId) {
        status = "complete";
      } else if (loc.adsPlaylistId || loc.baselinePlaylistId) {
        status = "partial";
      }
      
      return {
        id: loc.id,
        name: loc.name,
        screenId: loc.screenId,
        layoutMode: loc.layoutMode || "FALLBACK_SCHEDULE",
        layoutId: loc.layoutId,
        baselinePlaylistId: loc.baselinePlaylistId,
        adsPlaylistId: loc.adsPlaylistId,
        status,
      };
    }),
    layoutsSupported: supported,
  };
}

export const yodeckLayoutService = {
  probeLayoutsSupport,
  getLayoutSupportStatus,
  ensureBaselinePlaylist,
  ensureAdsPlaylist,
  ensureLayout,
  assignLayoutToScreen,
  applyFallbackSchedule,
  applyLayoutToLocation,
  getLayoutStatusForLocations,
};
