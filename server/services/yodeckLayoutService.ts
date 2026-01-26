/**
 * YodeckLayoutService - Manages baseline + ads layout separation
 * 
 * Provides:
 * - Layout API probing (detect if layouts are supported)
 * - Baseline playlist creation (news/weather/placeholder)
 * - Layout creation with 2 zones (BASE + ADS)
 * - Fallback schedule assignment when layouts not supported
 * 
 * Guardrails:
 * - Feature flags control experimental features
 * - No PERMANENT operations on screens with unknown status
 * - Health checks before destructive operations
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { guardCanonicalWrite, BLOCK_LEGACY_WRITES } from "./yodeckCanonicalService";

// ============================================================================
// FEATURE FLAGS - Control experimental/risky features
// ============================================================================
export const FEATURE_FLAGS = {
  /** Allow layout operations on screens with contentMode=unknown */
  ALLOW_LAYOUT_ON_UNKNOWN: false,
  /** Enable aggressive retry logic (more API calls) */
  AGGRESSIVE_RETRY: true,
  /** Skip verification step (faster but less reliable) */
  SKIP_VERIFICATION: false,
  /** Enable auto-baseline seeding (create placeholder content) */
  AUTO_BASELINE_SEED: true,
  /** Maximum retries for API operations */
  MAX_API_RETRIES: 3,
  /** Require online screen for permanent operations */
  REQUIRE_ONLINE_FOR_PERMANENT: false,
  
  // ============================================================================
  // LEGACY CLEANUP FLAGS - Control deprecated features
  // ============================================================================
  
  /** Disable legacy screen content UI (manual playlist/media/layout/app/schedule selection) */
  DISABLE_LEGACY_SCREEN_CONTENT_UI: true,
  /** Disable DB status fields (use canonical API only) */
  DISABLE_DB_STATUS_FIELDS: true,
  /** Enable canonical-only mode (log when non-canonical data is used) */
  CANONICAL_ONLY_LOGGING: true,
};

/**
 * Log CANONICAL_ONLY warning when non-canonical data is being used
 */
export function logCanonicalOnlyWarning(source: string, detail?: string): void {
  if (FEATURE_FLAGS.CANONICAL_ONLY_LOGGING) {
    console.warn(`[CANONICAL_ONLY] WARNING: Non-canonical data used from ${source}${detail ? `: ${detail}` : ''}`);
  }
}

/**
 * Safety check: Should we proceed with layout operation on this screen?
 * Returns false if the screen status is unknown and ALLOW_LAYOUT_ON_UNKNOWN is false
 */
export function shouldProceedWithLayoutOperation(
  contentMode: string, 
  isOnline: boolean | "unknown",
  operationType: "temporary" | "permanent"
): { proceed: boolean; reason?: string } {
  // Guardrail 1: No PERMANENT operations on unknown content mode
  if (contentMode === "unknown" && operationType === "permanent" && !FEATURE_FLAGS.ALLOW_LAYOUT_ON_UNKNOWN) {
    return { 
      proceed: false, 
      reason: `GUARDRAIL: Cannot perform ${operationType} operation on screen with contentMode=unknown. Enable ALLOW_LAYOUT_ON_UNKNOWN flag to override.` 
    };
  }
  
  // Guardrail 2: Warn but proceed if screen is offline (for permanent ops only)
  if (isOnline === false && operationType === "permanent" && FEATURE_FLAGS.REQUIRE_ONLINE_FOR_PERMANENT) {
    return { 
      proceed: false, 
      reason: `GUARDRAIL: Cannot perform ${operationType} operation on offline screen. Enable REQUIRE_ONLINE_FOR_PERMANENT=false to override.` 
    };
  }
  
  return { proceed: true };
}

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

export async function yodeckRequest<T>(
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

// ============================================================================
// ELEVIZION LAYOUT SPECIFICATION - DETERMINISTIC DIMENSIONS
// ============================================================================

/**
 * Canonical Elevizion layout dimensions for 1920x1080 screens:
 * - BASE zone: 30% width (576px) on left
 * - ADS zone: 70% width (1344px) on right
 * Total: 576 + 1344 = 1920px
 */
export const ELEVIZION_LAYOUT_SPEC = {
  resolution_width: 1920,
  resolution_height: 1080,
  screen_type: "landscape",
  base: {
    name: "BASE",
    left: 0,
    top: 0,
    width: 576,   // 30% of 1920
    height: 1080,
    zindex: 1,
    order: 0,
    duration: 0,
    res_width: 576,
    res_height: 1080,
  },
  ads: {
    name: "ADS",
    left: 576,
    top: 0,
    width: 1344,  // 70% of 1920
    height: 1080,
    zindex: 2,    // Higher z-index for ADS
    order: 1,
    duration: 0,
    res_width: 1344,
    res_height: 1080,
  },
};

/**
 * Build the Elevizion layout payload for Yodeck API
 * This ensures deterministic, correct layout creation every time.
 */
export function buildElevizionLayoutPayload(
  name: string,
  baselinePlaylistId: string,
  adsPlaylistId: string
): any {
  return {
    name,
    description: "Elevizion 2-zone layout (30% Baseline + 70% Ads)",
    screen_type: ELEVIZION_LAYOUT_SPEC.screen_type,
    res_width: ELEVIZION_LAYOUT_SPEC.resolution_width,
    res_height: ELEVIZION_LAYOUT_SPEC.resolution_height,
    regions: [
      {
        ...ELEVIZION_LAYOUT_SPEC.base,
        playlist: parseInt(baselinePlaylistId, 10),
      },
      {
        ...ELEVIZION_LAYOUT_SPEC.ads,
        playlist: parseInt(adsPlaylistId, 10),
      },
    ],
  };
}

/**
 * Verify that an existing layout has correct Elevizion dimensions
 * Returns corrections needed if dimensions are wrong
 */
export async function verifyLayoutDimensions(layoutId: string): Promise<{
  ok: boolean;
  needsCorrection: boolean;
  issues: string[];
  layout?: any;
  error?: string;
}> {
  const result = await yodeckRequest<any>(`/layouts/${layoutId}/`);
  
  if (!result.ok || !result.data) {
    return { ok: false, needsCorrection: false, issues: [], error: result.error };
  }
  
  const layout = result.data;
  const issues: string[] = [];
  
  // Check resolution
  if (layout.res_width !== ELEVIZION_LAYOUT_SPEC.resolution_width) {
    issues.push(`Wrong res_width: ${layout.res_width} (expected ${ELEVIZION_LAYOUT_SPEC.resolution_width})`);
  }
  if (layout.res_height !== ELEVIZION_LAYOUT_SPEC.resolution_height) {
    issues.push(`Wrong res_height: ${layout.res_height} (expected ${ELEVIZION_LAYOUT_SPEC.resolution_height})`);
  }
  
  // Check regions
  const regions = layout.regions || [];
  const baseRegion = regions.find((r: any) => r.name === "BASE");
  const adsRegion = regions.find((r: any) => r.name === "ADS");
  
  if (!baseRegion) {
    issues.push("Missing BASE region");
  } else {
    if (baseRegion.width !== ELEVIZION_LAYOUT_SPEC.base.width) {
      issues.push(`BASE width: ${baseRegion.width} (expected ${ELEVIZION_LAYOUT_SPEC.base.width})`);
    }
    if (baseRegion.left !== ELEVIZION_LAYOUT_SPEC.base.left) {
      issues.push(`BASE left: ${baseRegion.left} (expected ${ELEVIZION_LAYOUT_SPEC.base.left})`);
    }
  }
  
  if (!adsRegion) {
    issues.push("Missing ADS region");
  } else {
    if (adsRegion.width !== ELEVIZION_LAYOUT_SPEC.ads.width) {
      issues.push(`ADS width: ${adsRegion.width} (expected ${ELEVIZION_LAYOUT_SPEC.ads.width})`);
    }
    if (adsRegion.left !== ELEVIZION_LAYOUT_SPEC.ads.left) {
      issues.push(`ADS left: ${adsRegion.left} (expected ${ELEVIZION_LAYOUT_SPEC.ads.left})`);
    }
  }
  
  return {
    ok: true,
    needsCorrection: issues.length > 0,
    issues,
    layout,
  };
}

/**
 * Fix layout dimensions if they're wrong
 * Returns true if layout was corrected, false if already correct or error
 */
export async function fixLayoutDimensions(
  layoutId: string,
  baselinePlaylistId: string,
  adsPlaylistId: string
): Promise<{
  ok: boolean;
  corrected: boolean;
  issues: string[];
  error?: string;
}> {
  const verification = await verifyLayoutDimensions(layoutId);
  
  if (!verification.ok) {
    return { ok: false, corrected: false, issues: [], error: verification.error };
  }
  
  if (!verification.needsCorrection) {
    return { ok: true, corrected: false, issues: [] };
  }
  
  console.log(`[LayoutFix] Correcting layout ${layoutId}: ${verification.issues.join(", ")}`);
  
  // PATCH layout with correct dimensions
  const patchPayload = {
    res_width: ELEVIZION_LAYOUT_SPEC.resolution_width,
    res_height: ELEVIZION_LAYOUT_SPEC.resolution_height,
    regions: [
      {
        ...ELEVIZION_LAYOUT_SPEC.base,
        playlist: parseInt(baselinePlaylistId, 10),
      },
      {
        ...ELEVIZION_LAYOUT_SPEC.ads,
        playlist: parseInt(adsPlaylistId, 10),
      },
    ],
  };
  
  const patchResult = await yodeckRequest<any>(`/layouts/${layoutId}/`, "PATCH", patchPayload);
  
  if (!patchResult.ok) {
    return { 
      ok: false, 
      corrected: false, 
      issues: verification.issues, 
      error: `PATCH failed: ${patchResult.error}` 
    };
  }
  
  console.log(`[LayoutFix] Layout ${layoutId} corrected successfully`);
  return { ok: true, corrected: true, issues: verification.issues };
}

// Cache for baseline media ID (idempotency)
let cachedBaselineMediaId: string | null = null;

// Cache for empty reset playlist per workspace
const emptyResetPlaylistCache: Map<string, string> = new Map();
const EMPTY_RESET_PLAYLIST_NAME = "Elevizion | EMPTY (reset)";

/**
 * Ensure an empty "reset" playlist exists in Yodeck (idempotent)
 * Used for robust screen reset - never reset to null, always to this empty playlist
 * This prevents "null playlist" errors and demo/ghost states
 */
export async function ensureEmptyResetPlaylist(workspaceId?: string | number): Promise<{ 
  ok: boolean; 
  playlistId?: string; 
  error?: string; 
  logs: string[] 
}> {
  const logs: string[] = [];
  const cacheKey = workspaceId ? String(workspaceId) : "default";
  
  // Check cache first
  if (emptyResetPlaylistCache.has(cacheKey)) {
    const cachedId = emptyResetPlaylistCache.get(cacheKey)!;
    logs.push(`[EmptyReset] Using cached empty reset playlist: ${cachedId}`);
    return { ok: true, playlistId: cachedId, logs };
  }
  
  logs.push(`[EmptyReset] Checking for existing empty reset playlist...`);
  
  // Check if playlist already exists by name
  const existingPlaylists = await yodeckRequest<{ 
    count: number; 
    results: Array<{ id: number; name: string; workspace?: { id: number } | number }> 
  }>("/playlists");
  
  if (existingPlaylists.ok && existingPlaylists.data?.results) {
    const existing = existingPlaylists.data.results.find(p => p.name === EMPTY_RESET_PLAYLIST_NAME);
    if (existing) {
      const playlistId = String(existing.id);
      logs.push(`[EmptyReset] Found existing empty reset playlist: ${playlistId}`);
      emptyResetPlaylistCache.set(cacheKey, playlistId);
      return { ok: true, playlistId, logs };
    }
  }
  
  // Create new empty reset playlist with v2 API format
  logs.push(`[EmptyReset] Creating new empty reset playlist: ${EMPTY_RESET_PLAYLIST_NAME}`);
  
  const createPayload: any = {
    name: EMPTY_RESET_PLAYLIST_NAME,
    description: "Elevizion system playlist for screen reset - DO NOT DELETE",
    items: [],
    add_gaps: false,
    shuffle_content: false,
    default_duration: 10,
  };
  
  // Include workspace if provided
  if (workspaceId) {
    createPayload.workspace = typeof workspaceId === "number" ? workspaceId : parseInt(String(workspaceId), 10);
  }
  
  logs.push(`[EmptyReset] Create payload: ${JSON.stringify(createPayload)}`);
  
  const createResult = await yodeckRequest<{ id: number }>("/playlists/", "POST", createPayload);
  
  if (!createResult.ok) {
    logs.push(`[EmptyReset] Failed to create playlist: ${createResult.error}`);
    return { ok: false, error: `CREATE_EMPTY_PLAYLIST_FAILED: ${createResult.error}`, logs };
  }
  
  const playlistId = String(createResult.data!.id);
  logs.push(`[EmptyReset] Created empty reset playlist: ${playlistId}`);
  emptyResetPlaylistCache.set(cacheKey, playlistId);
  
  return { ok: true, playlistId, logs };
}

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
 * Uses Yodeck API v2 screen_content format with legacy fallback
 */
/**
 * Helper: Wait for given ms
 */
function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper: Quick verification that screen has correct layout assigned (single check)
 * Returns true if layout is correctly assigned
 */
async function quickVerifyScreenLayout(
  screenId: string,
  expectedLayoutId: string,
  logs: string[]
): Promise<{ verified: boolean; currentMode?: string; currentLayoutId?: string }> {
  const { mapYodeckScreen } = await import("./yodeckScreenMapper");
  
  logs.push(`[Verify] Fetching screen ${screenId} to verify layout...`);
  
  const screenResult = await yodeckRequest<any>(`/screens/${screenId}/`, "GET");
  if (!screenResult.ok || !screenResult.data) {
    logs.push(`[Verify] Failed to fetch screen: ${screenResult.error}`);
    return { verified: false };
  }
  
  const mapped = mapYodeckScreen(screenResult.data);
  
  logs.push(`[Verify] Screen contentMode=${mapped.contentMode}, layoutId=${mapped.layoutId}, layoutName=${mapped.layoutName}`);
  
  // Accept success if:
  // 1. contentMode is "layout" AND layoutId matches expected layout ID
  // 2. OR contentMode is "layout" AND layoutName starts with "Elevizion" (name-based match)
  const isLayoutMode = mapped.contentMode === "layout";
  const idMatch = String(mapped.layoutId) === String(expectedLayoutId);
  const nameMatch = mapped.layoutName?.startsWith("Elevizion");
  
  if (isLayoutMode && (idMatch || nameMatch)) {
    logs.push(`[Verify] SUCCESS: Layout correctly assigned (idMatch=${idMatch}, nameMatch=${nameMatch})`);
    return { verified: true, currentMode: mapped.contentMode, currentLayoutId: String(mapped.layoutId || "") };
  }
  
  logs.push(`[Verify] NOT VERIFIED: Expected layout ${expectedLayoutId}, got contentMode=${mapped.contentMode}, layoutId=${mapped.layoutId}`);
  return { verified: false, currentMode: mapped.contentMode, currentLayoutId: String(mapped.layoutId || "") };
}

/**
 * Assign layout to screen with hard verification and retry logic
 * - 3 verify attempts after each assignment
 * - 500ms delay between verifications  
 * - Full retry cycle (re-assign + verify) if verification fails
 * - 2 full retry cycles max
 * - Guardrail: Checks screen status before permanent operations
 */
export async function assignLayoutToScreen(
  screenId: string,
  layoutId: string,
  options?: { operationType?: "temporary" | "permanent"; skipGuardrails?: boolean; isCanonicalFlow?: boolean }
): Promise<{ ok: boolean; error?: string; logs: string[]; verified?: boolean }> {
  const logs: string[] = [];
  const MAX_VERIFY_ATTEMPTS = 3;
  const VERIFY_DELAY_MS = 500;
  const MAX_FULL_RETRIES = 2;
  const operationType = options?.operationType || "permanent";
  
  // Guard against legacy writes (unless called from canonical flow)
  guardCanonicalWrite(`assignLayoutToScreen for screen ${screenId}`, options?.isCanonicalFlow);
  
  logs.push(`[AssignLayout] Starting robust layout assignment: layout ${layoutId} -> screen ${screenId}`);
  
  // === GUARDRAIL: Check screen status before proceeding ===
  if (!options?.skipGuardrails) {
    const { mapYodeckScreen } = await import("./yodeckScreenMapper");
    
    logs.push(`[AssignLayout] Checking screen status for guardrails...`);
    const preCheckResult = await yodeckRequest<any>(`/screens/${screenId}/`, "GET");
    
    if (preCheckResult.ok && preCheckResult.data) {
      const mapped = mapYodeckScreen(preCheckResult.data);
      const safetyCheck = shouldProceedWithLayoutOperation(mapped.contentMode, mapped.isOnline, operationType);
      
      if (!safetyCheck.proceed) {
        logs.push(`[AssignLayout] ${safetyCheck.reason}`);
        return { ok: false, error: safetyCheck.reason, logs, verified: false };
      }
      logs.push(`[AssignLayout] Guardrail check passed: contentMode=${mapped.contentMode}, isOnline=${mapped.isOnline}`);
    } else {
      logs.push(`[AssignLayout] Warning: Could not verify screen status for guardrails, proceeding with caution`);
    }
  }
  
  for (let fullRetry = 0; fullRetry <= MAX_FULL_RETRIES; fullRetry++) {
    if (fullRetry > 0) {
      logs.push(`[AssignLayout] FULL RETRY ${fullRetry}/${MAX_FULL_RETRIES}: Re-attempting assignment...`);
      await wait(1000); // Wait 1s before full retry
    }
    
    // Primary: Use Yodeck v2 API format (screen_content)
    const assignPayload = {
      screen_content: {
        source_type: "layout",
        source_id: parseInt(layoutId, 10),
      },
    };
    logs.push(`[AssignLayout] PATCH payload: ${JSON.stringify(assignPayload)}`);
    
    let result = await yodeckRequest(`/screens/${screenId}/`, "PATCH", assignPayload);

    // Fallback to legacy fields if screen_content format fails
    if (!result.ok && (result.status === 400 || result.status === 422)) {
      logs.push(`[AssignLayout] screen_content format failed, trying legacy format...`);
      result = await yodeckRequest(`/screens/${screenId}/`, "PATCH", {
        default_playlist_type: "layout",
        default_playlist: parseInt(layoutId, 10),
      });
    }

    if (!result.ok) {
      logs.push(`[AssignLayout] PATCH failed: ${result.error}`);
      continue; // Try full retry
    }

    logs.push(`[AssignLayout] PATCH returned OK, starting verification...`);
    
    // Verification loop: 3 attempts with 500ms delay
    for (let verifyAttempt = 1; verifyAttempt <= MAX_VERIFY_ATTEMPTS; verifyAttempt++) {
      if (verifyAttempt > 1) {
        await wait(VERIFY_DELAY_MS);
      }
      
      logs.push(`[AssignLayout] Verify attempt ${verifyAttempt}/${MAX_VERIFY_ATTEMPTS}...`);
      
      const verifyResult = await quickVerifyScreenLayout(screenId, layoutId, logs);
      
      if (verifyResult.verified) {
        logs.push(`[AssignLayout] SUCCESS: Layout ${layoutId} verified on screen ${screenId} after ${verifyAttempt} attempt(s)`);
        return { ok: true, logs, verified: true };
      }
    }
    
    logs.push(`[AssignLayout] Verification failed after ${MAX_VERIFY_ATTEMPTS} attempts, will try full retry...`);
  }
  
  logs.push(`[AssignLayout] FAILED: Layout assignment could not be verified after ${MAX_FULL_RETRIES + 1} full attempts`);
  return { 
    ok: false, 
    error: `Layout assignment verification failed after ${MAX_FULL_RETRIES + 1} full attempts`, 
    logs,
    verified: false 
  };
}

/**
 * Fallback: assign playlists directly to screen schedule
 * Used when layouts are not supported
 * Uses Yodeck API v2 screen_content format with legacy fallback
 */
export async function applyFallbackSchedule(
  locationId: string,
  screenId: string,
  baselinePlaylistId: string,
  adsPlaylistId: string
): Promise<{ ok: boolean; error?: string; logs: string[] }> {
  const logs: string[] = [];
  
  // Guard against legacy writes when canonical mode is enforced
  guardCanonicalWrite(`applyFallbackSchedule for screen ${screenId}`);
  
  logs.push(`Applying fallback schedule (layouts not supported)`);
  logs.push(`Screen: ${screenId}, Baseline: ${baselinePlaylistId}, Ads: ${adsPlaylistId}`);
  
  // For fallback mode, we just assign the ads tagbased playlist
  // Primary: Use Yodeck v2 API format (screen_content)
  const assignPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: parseInt(adsPlaylistId, 10),
    },
  };
  logs.push(`PATCH payload: ${JSON.stringify(assignPayload)}`);
  
  let result = await yodeckRequest(`/screens/${screenId}/`, "PATCH", assignPayload);

  // Fallback to legacy fields if screen_content format fails
  if (!result.ok && (result.status === 400 || result.status === 422)) {
    logs.push(`screen_content format failed, trying legacy format...`);
    result = await yodeckRequest(`/screens/${screenId}/`, "PATCH", {
      default_playlist_type: "playlist",
      default_playlist: parseInt(adsPlaylistId, 10),
    });
  }

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
  
  // Guard against legacy writes when canonical mode is enforced
  guardCanonicalWrite(`applyLayoutToLocation for location ${locationId}`);
  
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
  
  // Guard against legacy writes when canonical mode is enforced
  guardCanonicalWrite(`ensureAdsSurfaceActive for screen ${screenId}`);
  
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
 * Uses yodeckScreenMapper for robust field mapping across API variants.
 * Returns the current content mode (layout/playlist/schedule) and layout details
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
  isOnline?: boolean | "unknown";
  error?: string;
  rawApiResponse?: string;
  rawKeysUsed?: any;
  debugInfo?: {
    availableTopKeys: string[];
    screenContentKeys: string[];
    playerStatusKeys: string[];
    stateKeys: string[];
  };
  warnings?: string[];
}> {
  const { mapYodeckScreen, logYodeckScreenStructure } = await import("./yodeckScreenMapper");
  
  console.log(`[ScreenStatus] GET /screens/${screenId}`);
  
  const result = await yodeckRequest<any>(`/screens/${screenId}`);

  if (!result.ok || !result.data) {
    const errorMsg = `HTTP error: ${result.error}`;
    console.error(`[ScreenStatus] ${errorMsg}`);
    return { ok: false, mode: "unknown", isElevizionLayout: false, error: errorMsg };
  }

  const screen = result.data;
  
  // Log structure once for debugging
  logYodeckScreenStructure(screen, `[ScreenStatus] Screen ${screenId}`);
  
  // Use the mapper for robust field parsing
  const mapped = mapYodeckScreen(screen);
  
  if (mapped.warnings.length > 0) {
    console.log(`[ScreenStatus] Mapper warnings: ${mapped.warnings.join("; ")}`);
  }
  
  // If mode is layout but layoutName is missing, fetch it
  let layoutName = mapped.layoutName;
  if (mapped.contentMode === "layout" && mapped.layoutId && !layoutName) {
    console.log(`[ScreenStatus] Layout ID: ${mapped.layoutId}, fetching name...`);
    const layoutResult = await yodeckRequest<{ id: number; name: string }>(`/layouts/${mapped.layoutId}`);
    if (layoutResult.ok && layoutResult.data) {
      layoutName = layoutResult.data.name;
      console.log(`[ScreenStatus] Fetched layout name: ${layoutName}`);
    } else {
      console.log(`[ScreenStatus] Failed to fetch layout: ${layoutResult.error}`);
    }
  }
  
  // Convert mapped mode to our type
  const mode: "layout" | "playlist" | "schedule" | "unknown" = 
    mapped.contentMode === "layout" ? "layout" :
    mapped.contentMode === "playlist" ? "playlist" :
    mapped.contentMode === "schedule" ? "schedule" :
    "unknown";

  console.log(`[ScreenStatus] mode=${mode}, layout=${layoutName || "-"}, isElevizion=${isElevizionLayout(layoutName)}, online=${mapped.isOnline}`);

  return {
    ok: true,
    mode,
    rawContentType: mapped.rawKeysUsed.contentModeValue || undefined,
    layoutId: mapped.layoutId || undefined,
    layoutName: layoutName || undefined,
    playlistId: mapped.playlistId || undefined,
    playlistName: mapped.playlistName || undefined,
    isElevizionLayout: isElevizionLayout(layoutName),
    lastSeenOnline: mapped.lastSeenOnline || undefined,
    lastScreenshotAt: mapped.lastScreenshotAt || undefined,
    isOnline: mapped.isOnline,
    rawApiResponse: JSON.stringify(screen),
    rawKeysUsed: mapped.rawKeysUsed,
    debugInfo: mapped.debugInfo,
    warnings: mapped.warnings.length > 0 ? mapped.warnings : undefined,
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

export interface RawSnapshot {
  step: "before" | "afterReset" | "afterApply" | "afterVerify";
  timestamp: string;
  raw: any;
  topLevelKeys: string[];
  mapped: {
    contentMode: string;
    layoutId: string | null;
    layoutName: string | null;
    playlistId: string | null;
    playlistName: string | null;
    isOnline: boolean | "unknown";
  };
  rawKeysUsed: any;
  debugInfo: {
    availableTopKeys: string[];
    screenContentKeys: string[];
    playerStatusKeys: string[];
    stateKeys: string[];
  };
  warnings: string[];
}

export interface ForceLayoutResult {
  ok: boolean;
  verified: boolean;
  verifyUnavailable?: boolean;
  layoutId?: string;
  layoutName?: string;
  beforeLayoutName?: string;
  afterLayoutName?: string;
  screenshotTimestamp?: string;
  error?: string;
  logs: string[];
  rawSnapshots?: RawSnapshot[];
}

/**
 * Capture a raw snapshot of screen status from Yodeck API
 * Used for debugging and audit trail in force flow
 */
async function captureRawSnapshot(
  screenId: string,
  step: RawSnapshot["step"]
): Promise<RawSnapshot> {
  const { mapYodeckScreen } = await import("./yodeckScreenMapper");
  const timestamp = new Date().toISOString();
  
  const result = await yodeckRequest<any>(`/screens/${screenId}`);
  
  if (!result.ok || !result.data) {
    return {
      step,
      timestamp,
      raw: null,
      topLevelKeys: [],
      mapped: {
        contentMode: "unknown",
        layoutId: null,
        layoutName: null,
        playlistId: null,
        playlistName: null,
        isOnline: "unknown",
      },
      rawKeysUsed: {},
      debugInfo: {
        availableTopKeys: [],
        screenContentKeys: [],
        playerStatusKeys: [],
        stateKeys: [],
      },
      warnings: [`Failed to fetch screen: ${result.error}`],
    };
  }

  const raw = result.data;
  const topLevelKeys = Object.keys(raw);
  const mapped = mapYodeckScreen(raw);

  // Log snapshot for debugging
  console.log(`[RawSnapshot] ${step} @ ${timestamp} - mode=${mapped.contentMode}, online=${mapped.isOnline}, layout=${mapped.layoutName || "-"}`);
  console.log(`[RawSnapshot] ${step} - keysUsed: ${JSON.stringify(mapped.rawKeysUsed)}`);
  if (mapped.warnings.length > 0) {
    console.log(`[RawSnapshot] ${step} - warnings: ${mapped.warnings.join("; ")}`);
  }

  return {
    step,
    timestamp,
    raw,
    topLevelKeys,
    mapped: {
      contentMode: mapped.contentMode,
      layoutId: mapped.layoutId,
      layoutName: mapped.layoutName,
      playlistId: mapped.playlistId,
      playlistName: mapped.playlistName,
      isOnline: mapped.isOnline,
    },
    rawKeysUsed: mapped.rawKeysUsed,
    debugInfo: mapped.debugInfo,
    warnings: mapped.warnings,
  };
}

/**
 * Step 1: Force reset screen content to break existing content binding
 * Uses an "Elevizion | EMPTY (reset)" playlist instead of null to ensure reliability
 * This clears any existing demo layout and prepares for fresh assignment
 * 
 * Uses Yodeck API v2 screen_content fields:
 * - screen_content.source_type: "playlist"
 * - screen_content.source_id: ID of the empty reset playlist (never null!)
 */
async function forceResetScreenContent(
  screenId: string
): Promise<{ ok: boolean; resetPlaylistId?: string; error?: string; logs: string[] }> {
  const logs: string[] = [];
  const { mapYodeckScreen } = await import("./yodeckScreenMapper");
  
  logs.push(`[ForceReset] Resetting screen ${screenId} content...`);
  
  // Get current screen info for logging and workspace
  const currentInfo = await yodeckRequest<{
    id: number;
    name: string;
    workspace?: { id: number } | number;
    screen_content?: { source_type?: string; source_id?: number; source_name?: string };
    default_playlist_type?: string;
  }>(`/screens/${screenId}`);
  
  let workspaceId: number | undefined;
  if (currentInfo.ok && currentInfo.data) {
    const sc = currentInfo.data.screen_content;
    const currentType = sc?.source_type || currentInfo.data.default_playlist_type || "unknown";
    const currentName = sc?.source_name || "none";
    logs.push(`[ForceReset] Current: source_type=${currentType}, source_name=${currentName}`);
    
    // Extract workspace ID
    if (currentInfo.data.workspace) {
      workspaceId = typeof currentInfo.data.workspace === "object" 
        ? currentInfo.data.workspace.id 
        : currentInfo.data.workspace;
      logs.push(`[ForceReset] Screen workspace: ${workspaceId}`);
    }
  }
  
  // Step 1: Ensure empty reset playlist exists (never use null!)
  logs.push(`[ForceReset] Ensuring empty reset playlist exists...`);
  const emptyPlaylistResult = await ensureEmptyResetPlaylist(workspaceId);
  logs.push(...emptyPlaylistResult.logs);
  
  if (!emptyPlaylistResult.ok || !emptyPlaylistResult.playlistId) {
    logs.push(`[ForceReset] Failed to create/find empty reset playlist`);
    return { ok: false, error: emptyPlaylistResult.error || "EMPTY_PLAYLIST_FAILED", logs };
  }
  
  const emptyPlaylistId = parseInt(emptyPlaylistResult.playlistId, 10);
  logs.push(`[ForceReset] Using empty reset playlist: ${emptyPlaylistId}`);
  
  // Step 2: Set screen to playlist mode with empty playlist (v2 format)
  const resetPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: emptyPlaylistId,  // Use empty playlist, never null!
    },
  };
  logs.push(`[ForceReset] PATCH payload: ${JSON.stringify(resetPayload)}`);
  
  let resetResult = await yodeckRequest(`/screens/${screenId}/`, "PATCH", resetPayload);
  
  // Fallback to legacy fields if screen_content format fails
  if (!resetResult.ok && (resetResult.status === 400 || resetResult.status === 422)) {
    logs.push(`[ForceReset] screen_content format failed (${resetResult.status}), trying legacy format...`);
    const legacyPayload = {
      default_playlist_type: "playlist",
      default_playlist: emptyPlaylistId,  // Use empty playlist, never null!
    };
    logs.push(`[ForceReset] Legacy PATCH payload: ${JSON.stringify(legacyPayload)}`);
    resetResult = await yodeckRequest(`/screens/${screenId}/`, "PATCH", legacyPayload);
  }
  
  if (!resetResult.ok) {
    logs.push(`[ForceReset] PATCH failed: ${resetResult.error}`);
    return { ok: false, error: `RESET_FAILED: ${resetResult.error}`, logs };
  }
  logs.push(`[ForceReset] Screen set to empty reset playlist`);
  
  // Step 3: Push to sync the reset
  logs.push(`[ForceReset] Pushing reset to screen...`);
  const pushResult = await yodeckRequest(`/screens/${screenId}/push/`, "POST", {});
  if (!pushResult.ok) {
    logs.push(`[ForceReset] Push warning: ${pushResult.error} (continuing)`);
  } else {
    logs.push(`[ForceReset] Reset pushed successfully`);
  }
  
  // Step 4: Wait for screen to process reset
  logs.push(`[ForceReset] Waiting 2s for screen to process reset...`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 5: Verify reset (mode should be playlist, source_id should be emptyPlaylistId)
  logs.push(`[ForceReset] Verifying reset...`);
  const verifyResult = await yodeckRequest<any>(`/screens/${screenId}`);
  if (verifyResult.ok && verifyResult.data) {
    const mapped = mapYodeckScreen(verifyResult.data);
    const verifyOk = mapped.contentMode === "playlist" && mapped.playlistId === String(emptyPlaylistId);
    if (verifyOk) {
      logs.push(`[ForceReset] Verify OK: mode=playlist, playlistId=${emptyPlaylistId}`);
    } else {
      logs.push(`[ForceReset] RESET_VERIFY_UNAVAILABLE: mode=${mapped.contentMode}, playlistId=${mapped.playlistId}, expected=${emptyPlaylistId}`);
      // Don't fail - continue with layout apply, just log the warning
    }
  } else {
    logs.push(`[ForceReset] RESET_VERIFY_UNAVAILABLE: Could not fetch screen status`);
  }
  
  logs.push(`[ForceReset] Screen reset complete`);
  return { ok: true, resetPlaylistId: String(emptyPlaylistId), logs };
}

/**
 * Step 2: Apply Elevizion layout to screen (after reset)
 * Sets screen mode to LAYOUT with proper layoutId
 * 
 * Uses Yodeck API v2 screen_content fields:
 * - screen_content.source_type: "layout"
 * - screen_content.source_id: layoutId
 * 
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
  
  // Guard against legacy writes when canonical mode is enforced
  guardCanonicalWrite(`applyElevizionLayoutToScreen for screen ${screenId}`);
  
  logs.push(`[ApplyLayout] === Assigning layout to screen ===`);
  logs.push(`[ApplyLayout] Screen ID: ${screenId}`);
  logs.push(`[ApplyLayout] Layout ID: ${layoutId}`);
  logs.push(`[ApplyLayout] Layout Name: ${layoutName}`);
  
  // Set screen to layout mode using Yodeck v2 API format (screen_content)
  const assignPayload = {
    screen_content: {
      source_type: "layout",
      source_id: parseInt(layoutId, 10),
    },
  };
  logs.push(`[ApplyLayout] Endpoint: PATCH /screens/${screenId}/`);
  logs.push(`[ApplyLayout] Payload: ${JSON.stringify(assignPayload)}`);
  
  let assignResult = await yodeckRequest(`/screens/${screenId}/`, "PATCH", assignPayload);
  
  // Fallback to legacy fields if screen_content format fails
  if (!assignResult.ok && (assignResult.status === 400 || assignResult.status === 422)) {
    logs.push(`[ApplyLayout] screen_content format failed (${assignResult.status}), trying legacy format...`);
    const legacyPayload = {
      default_playlist_type: "layout",
      default_playlist: parseInt(layoutId, 10),
    };
    logs.push(`[ApplyLayout] Legacy Payload: ${JSON.stringify(legacyPayload)}`);
    assignResult = await yodeckRequest(`/screens/${screenId}/`, "PATCH", legacyPayload);
  }
  
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
  isOnline?: boolean | "unknown";
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
    
    logs.push(`[Verify] Attempt ${attempt + 1}: rawContentType="${lastScreenStatus.rawContentType}", mode="${lastScreenStatus.mode}", layoutId="${lastScreenStatus.layoutId || "-"}", layout="${lastScreenStatus.layoutName || "-"}", isElevizion=${lastScreenStatus.isElevizionLayout}, online=${lastScreenStatus.isOnline}`);
    
    // Check if verification passed (multiple success conditions)
    // 1. Mode is layout AND name starts with "Elevizion"
    // 2. Mode is layout AND layoutId matches expected
    const isLayoutMode = lastScreenStatus.mode === "layout";
    const isNameMatch = lastScreenStatus.isElevizionLayout;
    const isIdMatch = lastScreenStatus.layoutId === expectedLayoutId;
    
    if (isLayoutMode && (isNameMatch || isIdMatch)) {
      const reason = isNameMatch 
        ? `name '${lastScreenStatus.layoutName}' starts with Elevizion` 
        : `layoutId ${lastScreenStatus.layoutId} matches expected ${expectedLayoutId}`;
      logs.push(`[Verify] SUCCESS on attempt ${attempt + 1}: Screen is on Elevizion layout (${reason})`);
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
    
    logs.push(`[Verify] Attempt ${attempt + 1}: Not yet on Elevizion layout (isLayoutMode=${isLayoutMode}, isNameMatch=${isNameMatch}, isIdMatch=${isIdMatch}), will retry...`);
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
  const rawSnapshots: RawSnapshot[] = [];
  let beforeLayoutName: string | undefined;
  let afterLayoutName: string | undefined;
  let screenshotTimestamp: string | undefined;
  
  logs.push(`[ForceLayout] === Starting hard reset + double push for location ${locationId} ===`);
  
  // Get location
  const location = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  if (!location[0]) {
    return { ok: false, verified: false, error: "Location not found", logs, rawSnapshots };
  }

  const loc = location[0];
  const screenId = loc.yodeckDeviceId;

  if (!screenId) {
    return { ok: false, verified: false, error: "No Yodeck screen linked", logs, rawSnapshots };
  }

  // === CAPTURE RAW SNAPSHOT: BEFORE ===
  logs.push(`[ForceLayout] Capturing BEFORE snapshot...`);
  const beforeSnapshot = await captureRawSnapshot(screenId, "before");
  rawSnapshots.push(beforeSnapshot);
  logs.push(`[ForceLayout] BEFORE: mode=${beforeSnapshot.mapped.contentMode}, layout=${beforeSnapshot.mapped.layoutName || "-"}, keys=${beforeSnapshot.topLevelKeys.length}`);
  if (beforeSnapshot.warnings.length > 0) {
    logs.push(`[ForceLayout] BEFORE warnings: ${beforeSnapshot.warnings.join("; ")}`);
  }

  // Get current screen status for logging (beforeLayoutName)
  const currentStatus = await getScreenContentStatus(screenId);
  beforeLayoutName = currentStatus.layoutName || beforeSnapshot.mapped.layoutName || "none";
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
      logs,
      rawSnapshots,
    };
  }

  // === PREREQUISITE: Ensure playlists exist ===
  logs.push(`[ForceLayout] Ensuring baseline playlist...`);
  const baselineResult = await ensureBaselinePlaylist(locationId, loc.name);
  logs.push(...baselineResult.logs);
  if (!baselineResult.ok || !baselineResult.playlistId) {
    return { ok: false, verified: false, beforeLayoutName, error: baselineResult.error || "Failed to create baseline playlist", logs, rawSnapshots };
  }

  logs.push(`[ForceLayout] Ensuring ads playlist...`);
  const adsResult = await ensureAdsPlaylist(locationId);
  logs.push(...adsResult.logs);
  if (!adsResult.ok || !adsResult.playlistId) {
    return { ok: false, verified: false, beforeLayoutName, error: adsResult.error || "Failed to create ads playlist", logs, rawSnapshots };
  }

  // Check if layouts are supported
  const layoutsApiSupported = await probeLayoutsSupport();
  if (!layoutsApiSupported) {
    logs.push(`[ForceLayout] Layouts API not available`);
    return { ok: false, verified: false, beforeLayoutName, error: "LAYOUTS_API_NOT_AVAILABLE", logs, rawSnapshots };
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
          zindex: 2,  // Higher z-index for ADS zone
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
      return { ok: false, verified: false, beforeLayoutName, error: `CREATE_LAYOUT_FAILED: ${createResult.error}`, logs, rawSnapshots };
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
    return { ok: false, verified: false, beforeLayoutName, layoutId, layoutName, error: resetResult.error, logs, rawSnapshots };
  }

  // === CAPTURE RAW SNAPSHOT: AFTER RESET ===
  logs.push(`[ForceLayout] Capturing AFTER RESET snapshot...`);
  const afterResetSnapshot = await captureRawSnapshot(screenId, "afterReset");
  rawSnapshots.push(afterResetSnapshot);
  logs.push(`[ForceLayout] AFTER RESET: mode=${afterResetSnapshot.mapped.contentMode}, layout=${afterResetSnapshot.mapped.layoutName || "-"}`);

  // === STEP 2: APPLY ELEVIZION LAYOUT ===
  logs.push(`[ForceLayout] === STEP 2: Apply Elevizion Layout ===`);
  const applyResult = await applyElevizionLayoutToScreen(screenId, layoutId, layoutName!);
  logs.push(...applyResult.logs);
  
  if (!applyResult.ok) {
    return { ok: false, verified: false, beforeLayoutName, layoutId, layoutName, error: applyResult.error, logs, rawSnapshots };
  }

  // === CAPTURE RAW SNAPSHOT: AFTER APPLY ===
  logs.push(`[ForceLayout] Capturing AFTER APPLY snapshot...`);
  const afterApplySnapshot = await captureRawSnapshot(screenId, "afterApply");
  rawSnapshots.push(afterApplySnapshot);
  logs.push(`[ForceLayout] AFTER APPLY: mode=${afterApplySnapshot.mapped.contentMode}, layout=${afterApplySnapshot.mapped.layoutName || "-"}`);

  // === STEP 3: VERIFY (with 1 retry) ===
  logs.push(`[ForceLayout] === STEP 3: Verify (attempt 1) ===`);
  let verifyResult = await verifyScreenLayout(screenId, layoutId);
  logs.push(...verifyResult.logs);
  screenshotTimestamp = verifyResult.screenshotTimestamp;
  afterLayoutName = verifyResult.currentLayoutName;

  // === CAPTURE RAW SNAPSHOT: AFTER VERIFY ===
  logs.push(`[ForceLayout] Capturing AFTER VERIFY snapshot...`);
  const afterVerifySnapshot = await captureRawSnapshot(screenId, "afterVerify");
  rawSnapshots.push(afterVerifySnapshot);
  logs.push(`[ForceLayout] AFTER VERIFY: mode=${afterVerifySnapshot.mapped.contentMode}, layout=${afterVerifySnapshot.mapped.layoutName || "-"}`);

  // === CHECK: If contentMode is "unknown", try to verify via layoutId instead ===
  if (afterVerifySnapshot.mapped.contentMode === "unknown") {
    logs.push(`[ForceLayout] WARNING: Cannot read screen content mode - attempting verification via layout ID`);
    logs.push(`[ForceLayout] Available keys: ${afterVerifySnapshot.topLevelKeys.join(", ")}`);
    logs.push(`[ForceLayout] Warnings: ${afterVerifySnapshot.warnings.join("; ")}`);
    
    // If we can see the expected layout ID is assigned, consider it verified
    if (afterVerifySnapshot.mapped.layoutId === layoutId) {
      logs.push(`[ForceLayout] SUCCESS via layout ID match: expected=${layoutId}, found=${afterVerifySnapshot.mapped.layoutId}`);
      return {
        ok: true,
        verified: true,
        layoutId,
        layoutName,
        beforeLayoutName,
        afterLayoutName: afterVerifySnapshot.mapped.layoutName || layoutName,
        screenshotTimestamp,
        logs,
        rawSnapshots,
      };
    }
    
    // If layout name contains "Elevizion", consider it verified
    const detectedLayoutName = afterVerifySnapshot.mapped.layoutName;
    if (detectedLayoutName && detectedLayoutName.toLowerCase().includes("elevizion")) {
      logs.push(`[ForceLayout] SUCCESS via layout name match: found="${detectedLayoutName}" contains "Elevizion"`);
      return {
        ok: true,
        verified: true,
        layoutId,
        layoutName,
        beforeLayoutName,
        afterLayoutName: detectedLayoutName,
        screenshotTimestamp,
        logs,
        rawSnapshots,
      };
    }
    
    // Only return VERIFY_UNAVAILABLE if we truly can't verify anything
    logs.push(`[ForceLayout] Cannot verify: mode=unknown, layoutId=${afterVerifySnapshot.mapped.layoutId || "null"}, layoutName=${detectedLayoutName || "null"}`);
    return {
      ok: false,
      verified: false,
      verifyUnavailable: true,
      layoutId,
      layoutName,
      beforeLayoutName,
      afterLayoutName: detectedLayoutName || undefined,
      screenshotTimestamp,
      error: "VERIFY_UNAVAILABLE: Cannot determine screen content mode or layout assignment",
      logs,
      rawSnapshots,
    };
  }

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
      rawSnapshots,
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
      error: "RESET_FAILED_ON_RETRY", 
      logs,
      rawSnapshots,
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
      error: "APPLY_FAILED_ON_RETRY", 
      logs,
      rawSnapshots,
    };
  }

  // Verify again
  logs.push(`[ForceLayout] === STEP 3: Verify (attempt 2 - final) ===`);
  verifyResult = await verifyScreenLayout(screenId, layoutId);
  logs.push(...verifyResult.logs);
  screenshotTimestamp = verifyResult.screenshotTimestamp;
  afterLayoutName = verifyResult.currentLayoutName;

  // === CAPTURE FINAL RAW SNAPSHOT ===
  logs.push(`[ForceLayout] Capturing FINAL VERIFY snapshot...`);
  const finalSnapshot = await captureRawSnapshot(screenId, "afterVerify");
  // Replace the last afterVerify snapshot with this final one
  const existingAfterVerifyIndex = rawSnapshots.findIndex(s => s.step === "afterVerify");
  if (existingAfterVerifyIndex >= 0) {
    rawSnapshots[existingAfterVerifyIndex] = finalSnapshot;
  } else {
    rawSnapshots.push(finalSnapshot);
  }
  logs.push(`[ForceLayout] FINAL: mode=${finalSnapshot.mapped.contentMode}, layout=${finalSnapshot.mapped.layoutName || "-"}`);

  // === CHECK: If contentMode is "unknown" after retry, try to verify via layoutId ===
  if (finalSnapshot.mapped.contentMode === "unknown") {
    logs.push(`[ForceLayout] WARNING: Cannot read screen content mode after retry - attempting verification via layout ID`);
    logs.push(`[ForceLayout] Available keys: ${finalSnapshot.topLevelKeys.join(", ")}`);
    logs.push(`[ForceLayout] Warnings: ${finalSnapshot.warnings.join("; ")}`);
    
    // If we can see the expected layout ID is assigned, consider it verified
    if (finalSnapshot.mapped.layoutId === layoutId) {
      logs.push(`[ForceLayout] SUCCESS on retry via layout ID match: expected=${layoutId}, found=${finalSnapshot.mapped.layoutId}`);
      return {
        ok: true,
        verified: true,
        layoutId,
        layoutName,
        beforeLayoutName,
        afterLayoutName: finalSnapshot.mapped.layoutName || layoutName,
        screenshotTimestamp,
        logs,
        rawSnapshots,
      };
    }
    
    // If layout name contains "Elevizion", consider it verified
    const detectedLayoutName = finalSnapshot.mapped.layoutName;
    if (detectedLayoutName && detectedLayoutName.toLowerCase().includes("elevizion")) {
      logs.push(`[ForceLayout] SUCCESS on retry via layout name match: found="${detectedLayoutName}" contains "Elevizion"`);
      return {
        ok: true,
        verified: true,
        layoutId,
        layoutName,
        beforeLayoutName,
        afterLayoutName: detectedLayoutName,
        screenshotTimestamp,
        logs,
        rawSnapshots,
      };
    }
    
    // Only return VERIFY_UNAVAILABLE if we truly can't verify anything
    logs.push(`[ForceLayout] Cannot verify after retry: mode=unknown, layoutId=${finalSnapshot.mapped.layoutId || "null"}, layoutName=${detectedLayoutName || "null"}`);
    return {
      ok: false,
      verified: false,
      verifyUnavailable: true,
      layoutId,
      layoutName,
      beforeLayoutName,
      afterLayoutName: detectedLayoutName || undefined,
      screenshotTimestamp,
      error: "VERIFY_UNAVAILABLE: Cannot determine screen content mode or layout assignment (after retry)",
      logs,
      rawSnapshots,
    };
  }

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
      rawSnapshots,
    };
  }

  // === VERIFIED PERMANENT FAILURE ===
  // Only mark as PERMANENT if we can actually read the content mode and it's still wrong
  logs.push(`[ForceLayout] VERIFIED PERMANENT FAILURE - Screen layout stuck on '${afterLayoutName}'`);
  logs.push(`[ForceLayout] beforeLayoutName: ${beforeLayoutName}`);
  logs.push(`[ForceLayout] afterLayoutName: ${afterLayoutName}`);
  logs.push(`[ForceLayout] Final mode: ${finalSnapshot.mapped.contentMode}`);
  logs.push(`[ForceLayout] screenshotTimestamp: ${screenshotTimestamp}`);
  
  return {
    ok: false,
    verified: false,
    layoutId,
    layoutName,
    beforeLayoutName,
    afterLayoutName,
    screenshotTimestamp,
    error: `SCREEN_LAYOUT_STUCK: mode=${finalSnapshot.mapped.contentMode}, layout=${finalSnapshot.mapped.layoutName || "unknown"}`,
    logs,
    rawSnapshots,
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
