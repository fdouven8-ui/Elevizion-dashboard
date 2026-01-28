/**
 * Screen Playlist Service
 * 
 * Per-screen playlist management - each screen gets its own unique playlist.
 * 
 * ARCHITECTURE (HARD REQUIREMENTS):
 * 1. ONE baseline playlist in Yodeck managed by user (AUTOPILOT_BASELINE_PLAYLIST_ID)
 * 2. Baseline items are ALWAYS copied to every per-screen playlist
 * 3. Combined playlist per screen = baseline items + ads
 * 4. NEVER empty playlists - if baseline is empty, throw error with clear instruction
 * 5. Same playlistId for assign/push/verify - use screen's actual active playlist
 * 
 * Key functions:
 * - getBaselinePlaylistStatus(): Get baseline playlist info for settings UI
 * - getBaselineItemsFromYodeck(): Fetch baseline items (MUST have items, no fallback)
 * - syncScreenCombinedPlaylist(): Main sync function - baseline + ads into screen's playlist
 * - repairScreen(): Full repair cycle using syncScreenCombinedPlaylist
 */

import { db } from "../db";
import { screens, placements, contracts, adAssets, systemSettings, locations } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { yodeckRequest } from "./yodeckLayoutService";
import { getYodeckDeviceStatus, UnifiedDeviceStatus } from "./unifiedDeviceStatusService";

// ============================================================================
// EXPECTED SOURCE CALCULATION
// ============================================================================

interface ExpectedSource {
  type: "playlist" | "layout" | "unknown";
  id: string | null;
  source: "combinedPlaylistId" | "yodeckLayoutId" | "yodeckPlaylistId" | "none";
}

/**
 * Compute expected source from Location DB fields (NOT from current playlist name)
 * Priority:
 * 1. If location.combinedPlaylistId exists -> expectedType=playlist expectedId=combinedPlaylistId
 * 2. Else if location.layoutMode==="LAYOUT" and location.yodeckLayoutId -> expectedType=layout expectedId=yodeckLayoutId
 * 3. Else if location.yodeckPlaylistId -> expectedType=playlist expectedId=yodeckPlaylistId
 * 4. Else expected unknown
 */
function computeExpectedSource(location: {
  combinedPlaylistId: string | null;
  layoutMode: string | null;
  yodeckLayoutId: string | null;
  yodeckPlaylistId: string | null;
} | null): ExpectedSource {
  if (!location) {
    return { type: "unknown", id: null, source: "none" };
  }
  
  if (location.combinedPlaylistId) {
    return { type: "playlist", id: location.combinedPlaylistId, source: "combinedPlaylistId" };
  }
  
  if (location.layoutMode === "LAYOUT" && location.yodeckLayoutId) {
    return { type: "layout", id: location.yodeckLayoutId, source: "yodeckLayoutId" };
  }
  
  if (location.yodeckPlaylistId) {
    return { type: "playlist", id: location.yodeckPlaylistId, source: "yodeckPlaylistId" };
  }
  
  return { type: "unknown", id: null, source: "none" };
}

/**
 * Get the effective playlist ID for content operations
 * This ensures whatever we add is actually broadcast
 */
export function getEffectivePlaybackPlaylistId(
  location: { combinedPlaylistId: string | null; yodeckPlaylistId: string | null } | null,
  actualPlaylistId: string | null
): string | null {
  // Priority: combinedPlaylistId > actualPlaylistId > yodeckPlaylistId
  if (location?.combinedPlaylistId) {
    return location.combinedPlaylistId;
  }
  if (actualPlaylistId) {
    return actualPlaylistId;
  }
  if (location?.yodeckPlaylistId) {
    return location.yodeckPlaylistId;
  }
  return null;
}

/**
 * Auto-heal: Detect if actual Yodeck playlist is an auto-playlist and update Location DB
 * Returns repair status
 */
export async function repairBroadcastMismatch(screenId: string): Promise<{
  repaired: boolean;
  before: ExpectedSource;
  after: ExpectedSource;
  actualSource: { type: string; id: string | null; name: string | null };
  logs: string[];
}> {
  const logs: string[] = [];
  
  // Get screen with location
  const [screenData] = await db.select({
    id: screens.id,
    yodeckPlayerId: screens.yodeckPlayerId,
    locationId: screens.locationId,
  }).from(screens).where(eq(screens.id, screenId));
  
  if (!screenData) {
    logs.push(`Screen ${screenId} not found`);
    return { repaired: false, before: { type: "unknown", id: null, source: "none" }, after: { type: "unknown", id: null, source: "none" }, actualSource: { type: "unknown", id: null, name: null }, logs };
  }
  
  if (!screenData.locationId) {
    logs.push(`Screen ${screenId} has no location linked`);
    return { repaired: false, before: { type: "unknown", id: null, source: "none" }, after: { type: "unknown", id: null, source: "none" }, actualSource: { type: "unknown", id: null, name: null }, logs };
  }
  
  if (!screenData.yodeckPlayerId) {
    logs.push(`Screen ${screenId} has no Yodeck player linked`);
    return { repaired: false, before: { type: "unknown", id: null, source: "none" }, after: { type: "unknown", id: null, source: "none" }, actualSource: { type: "unknown", id: null, name: null }, logs };
  }
  
  // Get location
  const [location] = await db.select({
    id: locations.id,
    name: locations.name,
    combinedPlaylistId: locations.combinedPlaylistId,
    layoutMode: locations.layoutMode,
    yodeckLayoutId: locations.yodeckLayoutId,
    yodeckPlaylistId: locations.yodeckPlaylistId,
  }).from(locations).where(eq(locations.id, screenData.locationId));
  
  if (!location) {
    logs.push(`Location ${screenData.locationId} not found`);
    return { repaired: false, before: { type: "unknown", id: null, source: "none" }, after: { type: "unknown", id: null, source: "none" }, actualSource: { type: "unknown", id: null, name: null }, logs };
  }
  
  const before = computeExpectedSource(location);
  logs.push(`Before: expected ${before.type}/${before.id} from ${before.source}`);
  
  // Fetch actual source from Yodeck (fresh, no cache)
  const screenResult = await yodeckRequest<any>(`/screens/${screenData.yodeckPlayerId}/`);
  
  if (!screenResult.ok || !screenResult.data) {
    logs.push(`Failed to fetch Yodeck screen data`);
    return { repaired: false, before, after: before, actualSource: { type: "unknown", id: null, name: null }, logs };
  }
  
  const content = screenResult.data.screen_content;
  const actualSourceType = content?.source_type || "unknown";
  const actualSourceId = content?.source_id ? String(content.source_id) : null;
  const actualSourceName = content?.source_name || null;
  
  logs.push(`Actual: ${actualSourceType}/${actualSourceId} name="${actualSourceName}"`);
  
  const actualSource = { type: actualSourceType, id: actualSourceId, name: actualSourceName };
  
  // Check if this is an auto-playlist we should adopt
  const isAutoPlaylist = actualSourceType === "playlist" && (
    (actualSourceName && actualSourceName.includes("(auto-playlist-")) ||
    (actualSourceName && actualSourceName.includes("Elevizion | Loop | YDK-"))
  );
  
  if (!isAutoPlaylist) {
    logs.push(`Not an auto-playlist, no repair needed`);
    return { repaired: false, before, after: before, actualSource, logs };
  }
  
  // Auto-heal: Update location to use this playlist as canonical
  logs.push(`Detected auto-playlist, updating location...`);
  
  const now = new Date();
  await db.update(locations).set({
    layoutMode: "PLAYLIST",
    combinedPlaylistId: actualSourceId,
    combinedPlaylistVerifiedAt: now,
    updatedAt: now,
  }).where(eq(locations.id, location.id));
  
  logs.push(`Updated location ${location.id}: combinedPlaylistId=${actualSourceId}, layoutMode=PLAYLIST`);
  
  const after = computeExpectedSource({
    ...location,
    combinedPlaylistId: actualSourceId,
    layoutMode: "PLAYLIST",
  });
  
  return { repaired: true, before, after, actualSource, logs };
}

// ============================================================================
// TYPES
// ============================================================================

export interface PlaylistItem {
  type: "baseline" | "ad";
  mediaId: number;
  mediaName: string;
  duration: number;
  itemType?: string; // 'media', 'app', etc
}

export interface BaselineStatus {
  configured: boolean;
  playlistId: string | null;
  playlistName: string | null;
  itemCount: number;
  items: PlaylistItem[];
  lastCheckedAt: string;
  error?: string;
}

export interface ScreenSyncResult {
  ok: boolean;
  screenId: string;
  screenName: string;
  yodeckDeviceId: string | null;
  activePlaylistId: string | null;
  baselinePlaylistId: string | null;
  baselineCount: number;
  adsCount: number;
  itemCount: number;
  verificationOk: boolean;
  lastPushResult: string;
  errorReason?: string;
  logs: string[];
}

export interface ScreenRepairResult {
  ok: boolean;
  screenId: string;
  screenName: string;
  deviceStatus: UnifiedDeviceStatus;
  expectedPlaylistId: string | null;
  actualPlaylistId: string | null;
  baselinePlaylistId: string | null;
  itemCount: number;
  baselineCount: number;
  adsCount: number;
  publishOk: boolean;
  verificationOk: boolean;
  verificationError?: string;
  baselineError?: string;
  errorReason?: string;
  logs: string[];
}

// Playback Enforcement Result
export interface PlaybackEnforceResult {
  ok: boolean;
  playerId: string;
  previousSourceType: string | null;
  previousSourceId: string | null;
  currentSourceType: string;
  currentSourceId: string | null;
  playlistCreated: boolean;
  playlistId: string | null;
  playlistName: string | null;
  enforceAction: "created_and_assigned" | "reassigned" | "already_playlist" | "none";
  logs: string[];
  error?: string;
}

// Player Refresh Result
export interface PlayerRefreshResult {
  ok: boolean;
  method: "api_restart" | "content_reassign" | "none";
  playerId: string;
  status?: number;
  logs: string[];
  error?: string;
}

// Screenshot Proof Result
export interface ScreenshotProofResult {
  ok: boolean;
  url: string | null;
  byteSize: number | null;
  hash: string | null;
  hashChanged: boolean;
  detectedNoContent: boolean;
  lastOkAt: string | null;
  error?: string;
}

// Force Repair + Proof Result (E2E)
export interface ForceRepairProofResult {
  ok: boolean;
  playerId: string;
  activePlaylistId: string | null;
  itemCount: number;
  baselineConfigured: boolean;
  baselineCount: number;
  adsCount: number;
  screenshot: ScreenshotProofResult | null;
  proofStatus: {
    ok: boolean;
    isOnline: boolean;
    hasContent: boolean;
    hasScreenshot: boolean;
    detectedNoContent: boolean;
    reason: string;
  };
  refreshMethodUsed: string;
  pollAttempts: number;
  logs: string[];
}

// Legacy types for compatibility
export interface ScreenPlaylistResult {
  ok: boolean;
  screenId: string;
  screenName: string;
  playlistId: string | null;
  playlistName: string | null;
  itemCount: number;
  baselineCount: number;
  adsCount: number;
  isNew: boolean;
  logs: string[];
  error?: string;
  baselineError?: string;
  baselineFallbackUsed?: boolean;
}

export interface AssignPushResult {
  ok: boolean;
  screenId: string;
  yodeckDeviceId: string | null;
  playlistId: string;
  publishOk: boolean;
  verificationOk: boolean;
  actualPlaylistId: string | null;
  actualItemCount: number;
  errorReason?: string;
  logs: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SCREEN_PLAYLIST_PREFIX = "Elevizion | Loop | ";
const DEFAULT_DURATION = 15;
const CONFIG_KEY_BASELINE_PLAYLIST = "autopilot.baselinePlaylistId";

// ============================================================================
// ACTIVE SOURCE FROM YODECK (SINGLE SOURCE OF TRUTH)
// ============================================================================

export interface ActiveSourceInfo {
  sourceType: string | null;
  sourceId: string | null;
  sourceName: string | null;
  screenName: string | null;
  rawScreenContent: any;
}

/**
 * Get active source from Yodeck API - SINGLE SOURCE OF TRUTH
 * 
 * This function reads directly from Yodeck API (never DB) and correctly
 * parses the screen_content fields to return the actual source_type and source_id.
 * 
 * CRITICAL: This is the authoritative source for what a screen is currently playing.
 */
export async function getActiveSourceFromYodeck(playerId: string): Promise<{ ok: boolean; data?: ActiveSourceInfo; error?: string }> {
  console.log(`[ActiveSource] Fetching source from Yodeck for player ${playerId}`);
  
  const screenResult = await yodeckRequest<any>(`/screens/${playerId}/`);
  
  if (!screenResult.ok || !screenResult.data) {
    console.log(`[ActiveSource] FAILED: ${screenResult.error}`);
    return { ok: false, error: screenResult.error || "Failed to fetch screen" };
  }
  
  const raw = screenResult.data;
  const screenContent = raw.screen_content || {};
  
  // Extract from screen_content - these are the actual Yodeck API fields
  const sourceType = screenContent.source_type || null;
  const sourceId = screenContent.source_id ? String(screenContent.source_id) : null;
  const sourceName = screenContent.source_name || null;
  const screenName = raw.name || null;
  
  console.log(`[ActiveSource] player=${playerId} raw={source_type=${sourceType}, source_id=${sourceId}, source_name="${sourceName}"}`);
  
  // CRITICAL: If source_type is "playlist" but source_id is null, something is wrong
  if (sourceType === "playlist" && !sourceId) {
    console.log(`[ActiveSource] WARNING: player=${playerId} has source_type=playlist but source_id=null!`);
  }
  
  return {
    ok: true,
    data: {
      sourceType,
      sourceId,
      sourceName,
      screenName,
      rawScreenContent: screenContent,
    },
  };
}

// ============================================================================
// BASELINE PLAYLIST FUNCTIONS
// ============================================================================

/**
 * Get baseline playlist ID from settings (env or database)
 * REQUIRED - returns null if not configured
 */
export async function getBaselinePlaylistId(): Promise<string | null> {
  // Check environment variable first
  const envValue = process.env.AUTOPILOT_BASELINE_PLAYLIST_ID || process.env.AUTOPILOT_BASE_PLAYLIST_ID;
  if (envValue) return envValue;
  
  // Check database setting
  const [setting] = await db.select().from(systemSettings)
    .where(eq(systemSettings.key, CONFIG_KEY_BASELINE_PLAYLIST));
  return setting?.value || null;
}

/**
 * Set baseline playlist ID in database
 */
export async function setBaselinePlaylistId(playlistId: string): Promise<void> {
  const existing = await db.select().from(systemSettings)
    .where(eq(systemSettings.key, CONFIG_KEY_BASELINE_PLAYLIST));
  
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value: playlistId, updatedAt: new Date() })
      .where(eq(systemSettings.key, CONFIG_KEY_BASELINE_PLAYLIST));
  } else {
    await db.insert(systemSettings).values({
      key: CONFIG_KEY_BASELINE_PLAYLIST,
      value: playlistId,
      description: "Yodeck baseline playlist ID (news/weather/etc)",
    });
  }
}

/**
 * Get baseline playlist status for settings UI
 * Shows: configured, playlistId, playlistName, itemCount, items, lastCheckedAt
 */
export async function getBaselinePlaylistStatus(): Promise<BaselineStatus> {
  const playlistId = await getBaselinePlaylistId();
  const now = new Date().toISOString();
  
  if (!playlistId) {
    return {
      configured: false,
      playlistId: null,
      playlistName: null,
      itemCount: 0,
      items: [],
      lastCheckedAt: now,
      error: "BASELINE_NOT_CONFIGURED - Stel AUTOPILOT_BASELINE_PLAYLIST_ID in of configureer via Instellingen",
    };
  }
  
  // Fetch playlist from Yodeck
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  
  if (!result.ok || !result.data) {
    return {
      configured: true,
      playlistId,
      playlistName: null,
      itemCount: 0,
      items: [],
      lastCheckedAt: now,
      error: `BASELINE_FETCH_ERROR - Kan playlist ${playlistId} niet ophalen: ${result.error}`,
    };
  }
  
  const playlistItems = result.data.items || [];
  const items: PlaylistItem[] = [];
  
  for (const item of playlistItems) {
    const mediaId = item.media?.id || item.media_id || item.app?.id || item.app_id || item.id;
    const mediaName = item.media?.name || item.app?.name || item.name || `Item ${mediaId}`;
    const duration = item.duration || item.media?.duration || DEFAULT_DURATION;
    const itemType = item.media ? 'media' : item.app ? 'app' : 'unknown';
    
    if (mediaId) {
      items.push({
        type: "baseline",
        mediaId: Number(mediaId),
        mediaName,
        duration: Number(duration),
        itemType,
      });
    }
  }
  
  if (items.length === 0) {
    return {
      configured: true,
      playlistId,
      playlistName: result.data.name || null,
      itemCount: 0,
      items: [],
      lastCheckedAt: now,
      error: "BASELINE_PLAYLIST_EMPTY - Vul de baseline playlist in Yodeck met nieuws/weer/etc content",
    };
  }
  
  return {
    configured: true,
    playlistId,
    playlistName: result.data.name || null,
    itemCount: items.length,
    items,
    lastCheckedAt: now,
  };
}

/**
 * Get baseline items from Yodeck - REQUIRED to have items
 * Throws clear error if not configured or empty
 */
async function getBaselineItemsFromYodeck(logs: string[]): Promise<{
  ok: boolean;
  playlistId: string | null;
  items: PlaylistItem[];
  error?: string;
}> {
  const playlistId = await getBaselinePlaylistId();
  
  if (!playlistId) {
    const error = "BASELINE_NOT_CONFIGURED - Stel AUTOPILOT_BASELINE_PLAYLIST_ID in via Instellingen > Autopilot";
    logs.push(`[Baseline] ✗ ${error}`);
    return { ok: false, playlistId: null, items: [], error };
  }
  
  logs.push(`[Baseline] Ophalen items van baseline playlist ${playlistId}`);
  
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  
  if (!result.ok || !result.data) {
    const error = `BASELINE_FETCH_ERROR - Kan playlist ${playlistId} niet ophalen: ${result.error}`;
    logs.push(`[Baseline] ✗ ${error}`);
    return { ok: false, playlistId, items: [], error };
  }
  
  const playlistItems = result.data.items || [];
  const items: PlaylistItem[] = [];
  
  for (const item of playlistItems) {
    // Handle both media items and app items (news/weather widgets)
    const mediaId = item.media?.id || item.media_id || item.app?.id || item.app_id || item.id;
    const mediaName = item.media?.name || item.app?.name || item.name || `Item ${mediaId}`;
    const duration = item.duration || item.media?.duration || DEFAULT_DURATION;
    
    if (mediaId) {
      items.push({
        type: "baseline",
        mediaId: Number(mediaId),
        mediaName,
        duration: Number(duration),
        itemType: item.media ? 'media' : item.app ? 'app' : 'unknown',
      });
    }
  }
  
  if (items.length === 0) {
    const error = "BASELINE_PLAYLIST_EMPTY - Vul de baseline playlist in Yodeck met nieuws/weer/etc content";
    logs.push(`[Baseline] ✗ ${error}`);
    return { ok: false, playlistId, items: [], error };
  }
  
  logs.push(`[Baseline] ✓ ${items.length} baseline items gevonden (${result.data.name})`);
  return { ok: true, playlistId, items };
}

// ============================================================================
// ADS FUNCTIONS
// ============================================================================

/**
 * Get approved ads for a screen via placements chain
 */
async function getApprovedAdsForScreen(screenId: string, logs: string[]): Promise<PlaylistItem[]> {
  logs.push(`[Ads] Zoeken approved ads voor scherm ${screenId}`);
  
  // Get active placements for this screen
  const screenPlacements = await db.select({ contractId: placements.contractId })
    .from(placements)
    .where(and(
      eq(placements.screenId, screenId),
      eq(placements.isActive, true)
    ));
  
  if (screenPlacements.length === 0) {
    logs.push(`[Ads] Geen actieve plaatsingen voor dit scherm`);
    return [];
  }
  
  const contractIds = Array.from(new Set(screenPlacements.map(p => p.contractId)));
  logs.push(`[Ads] ${contractIds.length} contracten met plaatsingen gevonden`);
  
  // Get advertisers from active contracts
  const activeContracts = await db.select({ advertiserId: contracts.advertiserId })
    .from(contracts)
    .where(and(
      inArray(contracts.id, contractIds),
      inArray(contracts.status, ["active", "signed"])
    ));
  
  const advertiserIds = Array.from(new Set(activeContracts.map(c => c.advertiserId)));
  
  if (advertiserIds.length === 0) {
    logs.push(`[Ads] Geen actieve contracten`);
    return [];
  }
  
  logs.push(`[Ads] ${advertiserIds.length} adverteerders met actieve contracten`);
  
  // Get approved ad assets
  const approvedAssets = await db.select({
    yodeckMediaId: adAssets.yodeckMediaId,
    originalFileName: adAssets.originalFileName,
  })
    .from(adAssets)
    .where(and(
      inArray(adAssets.advertiserId, advertiserIds),
      eq(adAssets.approvalStatus, "APPROVED")
    ));
  
  const items: PlaylistItem[] = [];
  for (const asset of approvedAssets) {
    if (asset.yodeckMediaId) {
      items.push({
        type: "ad",
        mediaId: asset.yodeckMediaId,
        mediaName: asset.originalFileName || `Ad ${asset.yodeckMediaId}`,
        duration: DEFAULT_DURATION,
        itemType: 'media',
      });
    }
  }
  
  logs.push(`[Ads] ${items.length} approved ads gevonden`);
  return items;
}

// ============================================================================
// PLAYLIST HELPERS
// ============================================================================

/**
 * Get canonical playlist name for a screen
 */
function getScreenPlaylistName(screenIdOrDeviceId: string): string {
  return `${SCREEN_PLAYLIST_PREFIX}${screenIdOrDeviceId}`.trim();
}

/**
 * Search for existing playlist by name in Yodeck
 */
async function findPlaylistByName(name: string): Promise<{ id: number; name: string; itemCount: number } | null> {
  const result = await yodeckRequest<{ results: any[] }>(`/playlists/?q=${encodeURIComponent(name)}`);
  
  if (!result.ok || !result.data?.results) return null;
  
  const match = result.data.results.find((p: any) => 
    p.name?.toLowerCase().trim() === name.toLowerCase().trim()
  );
  
  if (!match) return null;
  
  return {
    id: match.id,
    name: match.name,
    itemCount: Array.isArray(match.items) ? match.items.length : 0,
  };
}

/**
 * Create a new playlist in Yodeck
 */
async function createPlaylist(name: string): Promise<{ ok: boolean; playlistId?: number; error?: string }> {
  const result = await yodeckRequest<any>(`/playlists/`, "POST", {
    name,
    type: "mixed", // mixed supports both media and app items (news/weather widgets)
    items: [],
    description: "Auto-managed by Elevizion Dashboard",
  });
  
  if (!result.ok || !result.data?.id) {
    return { ok: false, error: result.error || "CREATE_FAILED" };
  }
  
  return { ok: true, playlistId: result.data.id };
}

/**
 * Get the ACTUAL playlist ID assigned to this screen in Yodeck
 */
async function getScreenActivePlaylistId(
  yodeckDeviceId: string,
  logs: string[]
): Promise<{ playlistId: string | null; playlistName: string | null; error?: string }> {
  logs.push(`[ActivePlaylist] Ophalen screen_content van Yodeck device ${yodeckDeviceId}`);
  
  const screenResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`);
  
  if (!screenResult.ok || !screenResult.data) {
    logs.push(`[ActivePlaylist] ✗ Kan Yodeck scherm niet ophalen: ${screenResult.error}`);
    return { playlistId: null, playlistName: null, error: "YODECK_SCREEN_FETCH_FAILED" };
  }
  
  const content = screenResult.data.screen_content;
  
  if (!content) {
    logs.push(`[ActivePlaylist] ⚠️ Geen screen_content gevonden op scherm`);
    return { playlistId: null, playlistName: null };
  }
  
  if (content.source_type !== "playlist") {
    logs.push(`[ActivePlaylist] ⚠️ Screen content is geen playlist maar: ${content.source_type}`);
    return { playlistId: null, playlistName: null, error: `WRONG_SOURCE_TYPE_${content.source_type}` };
  }
  
  const playlistId = content.source_id ? String(content.source_id) : null;
  
  if (!playlistId) {
    logs.push(`[ActivePlaylist] ⚠️ Geen playlist ID in screen_content`);
    return { playlistId: null, playlistName: null };
  }
  
  // Get playlist name for verification
  const playlistResult = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  const playlistName = playlistResult.ok ? playlistResult.data?.name : null;
  
  logs.push(`[ActivePlaylist] ✓ Actieve playlist: ID=${playlistId}, naam="${playlistName}"`);
  return { playlistId, playlistName };
}

/**
 * Build playlist items array for Yodeck API
 */
function buildPlaylistItems(baselineItems: PlaylistItem[], adItems: PlaylistItem[]): any[] {
  const items: any[] = [];
  let priority = 1;
  
  // Add all baseline items first
  // Yodeck API requires: id, priority, duration, type (media/app)
  for (const item of baselineItems) {
    items.push({
      id: item.mediaId,
      priority: priority++,
      duration: item.duration,
      type: item.itemType === 'app' ? 'app' : 'media',
    });
  }
  
  // Add all ad items (always media type)
  for (const item of adItems) {
    items.push({
      id: item.mediaId,
      priority: priority++,
      duration: item.duration,
      type: 'media',
    });
  }
  
  return items;
}

// ============================================================================
// MAIN SYNC FUNCTION
// ============================================================================

/**
 * Sync a screen's combined playlist with baseline + ads
 * This is the main sync function that ensures correct content on screens
 * 
 * Flow:
 * 1. Get baseline items from configured baseline playlist (REQUIRED)
 * 2. Get active playlistId from Yodeck screen - create if missing
 * 3. Build desiredItems = baselineItems + adItems
 * 4. Write items to the active playlist
 * 5. Push to screen
 * 6. Verify: itemCount > 0 and correct playlistId
 */
export async function syncScreenCombinedPlaylist(screenId: string): Promise<ScreenSyncResult> {
  const logs: string[] = [];
  logs.push(`[Sync] ═══════════════════════════════════════`);
  logs.push(`[Sync] Start sync voor scherm ${screenId}`);
  
  // Get screen info
  const [screen] = await db.select({
    name: screens.name,
    screenId: screens.screenId,
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(eq(screens.id, screenId));
  
  if (!screen) {
    return {
      ok: false,
      screenId,
      screenName: "Onbekend",
      yodeckDeviceId: null,
      activePlaylistId: null,
      baselinePlaylistId: null,
      baselineCount: 0,
      adsCount: 0,
      itemCount: 0,
      verificationOk: false,
      lastPushResult: "error: scherm niet gevonden",
      errorReason: "SCREEN_NOT_FOUND",
      logs,
    };
  }
  
  logs.push(`[Sync] Scherm: ${screen.name}`);
  
  if (!screen.yodeckPlayerId) {
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckDeviceId: null,
      activePlaylistId: null,
      baselinePlaylistId: null,
      baselineCount: 0,
      adsCount: 0,
      itemCount: 0,
      verificationOk: false,
      lastPushResult: "error: geen Yodeck device gekoppeld",
      errorReason: "NO_YODECK_DEVICE",
      logs,
    };
  }
  
  const yodeckDeviceId = screen.yodeckPlayerId;
  logs.push(`[Sync] Yodeck device: ${yodeckDeviceId}`);
  
  // STEP 1: Get baseline items (REQUIRED - must have content)
  const baselineResult = await getBaselineItemsFromYodeck(logs);
  
  if (!baselineResult.ok || baselineResult.items.length === 0) {
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckDeviceId,
      activePlaylistId: null,
      baselinePlaylistId: baselineResult.playlistId,
      baselineCount: 0,
      adsCount: 0,
      itemCount: 0,
      verificationOk: false,
      lastPushResult: `error: ${baselineResult.error}`,
      errorReason: baselineResult.error,
      logs,
    };
  }
  
  // STEP 2: Get or create active playlist for this screen
  let activePlaylistId: string;
  
  const activePlaylist = await getScreenActivePlaylistId(yodeckDeviceId, logs);
  
  if (activePlaylist.playlistId) {
    activePlaylistId = activePlaylist.playlistId;
    logs.push(`[Sync] ✓ Scherm heeft al playlist: ${activePlaylistId}`);
  } else {
    // Create new playlist and assign to screen
    logs.push(`[Sync] Scherm heeft geen playlist - nieuwe aanmaken`);
    
    const playlistName = getScreenPlaylistName(screen.screenId || `YDK-${yodeckDeviceId}`);
    
    // First check if our named playlist already exists
    const existing = await findPlaylistByName(playlistName);
    
    if (existing) {
      activePlaylistId = String(existing.id);
      logs.push(`[Sync] Bestaande playlist gevonden: ${activePlaylistId} ("${playlistName}")`);
    } else {
      const createResult = await createPlaylist(playlistName);
      if (!createResult.ok || !createResult.playlistId) {
        return {
          ok: false,
          screenId,
          screenName: screen.name,
          yodeckDeviceId,
          activePlaylistId: null,
          baselinePlaylistId: baselineResult.playlistId,
          baselineCount: baselineResult.items.length,
          adsCount: 0,
          itemCount: 0,
          verificationOk: false,
          lastPushResult: `error: playlist aanmaken mislukt - ${createResult.error}`,
          errorReason: createResult.error || "CREATE_PLAYLIST_FAILED",
          logs,
        };
      }
      activePlaylistId = String(createResult.playlistId);
      logs.push(`[Sync] ✓ Nieuwe playlist aangemaakt: ${activePlaylistId} ("${playlistName}")`);
    }
    
    // Assign playlist to screen
    logs.push(`[Sync] Toewijzen playlist ${activePlaylistId} aan scherm...`);
    
    const assignPayload = {
      screen_content: {
        source_type: "playlist",
        source_id: parseInt(activePlaylistId),
      },
    };
    
    const assignResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`, "PATCH", assignPayload);
    
    if (!assignResult.ok) {
      logs.push(`[Sync] ✗ Toewijzen mislukt: ${assignResult.error}`);
      return {
        ok: false,
        screenId,
        screenName: screen.name,
        yodeckDeviceId,
        activePlaylistId,
        baselinePlaylistId: baselineResult.playlistId,
        baselineCount: baselineResult.items.length,
        adsCount: 0,
        itemCount: 0,
        verificationOk: false,
        lastPushResult: `error: toewijzen mislukt - ${assignResult.error}`,
        errorReason: "ASSIGN_PLAYLIST_FAILED",
        logs,
      };
    }
    
    logs.push(`[Sync] ✓ Playlist toegewezen aan scherm`);
  }
  
  // STEP 3: Get ads for this screen
  const adItems = await getApprovedAdsForScreen(screenId, logs);
  
  // STEP 4: Build and write items to playlist
  const desiredItems = buildPlaylistItems(baselineResult.items, adItems);
  const totalItems = desiredItems.length;
  
  logs.push(`[Sync] Schrijven ${totalItems} items naar playlist ${activePlaylistId} (${baselineResult.items.length} baseline + ${adItems.length} ads)`);
  
  const patchResult = await yodeckRequest<any>(`/playlists/${activePlaylistId}/`, "PATCH", {
    items: desiredItems,
  });
  
  if (!patchResult.ok) {
    const errorDetail = patchResult.error || "Unknown PATCH error";
    logs.push(`[Sync] ✗ PATCH mislukt: ${errorDetail}`);
    console.error(`[syncScreenCombinedPlaylist] PATCH /playlists/${activePlaylistId}/ failed: ${errorDetail}`);
    console.error(`[syncScreenCombinedPlaylist] Payload preview: ${JSON.stringify(desiredItems).slice(0, 500)}`);
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckDeviceId,
      activePlaylistId,
      baselinePlaylistId: baselineResult.playlistId,
      baselineCount: baselineResult.items.length,
      adsCount: adItems.length,
      itemCount: 0,
      verificationOk: false,
      lastPushResult: `error: PATCH mislukt - ${errorDetail}`,
      errorReason: `PATCH_PLAYLIST_FAILED: ${errorDetail}`,
      logs,
    };
  }
  
  logs.push(`[Sync] ✓ Playlist items geschreven`);
  
  // STEP 5: Push to screen (Save & Push)
  logs.push(`[Sync] Push naar scherm...`);
  
  // Re-assign to trigger push
  const pushPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: parseInt(activePlaylistId),
    },
  };
  
  const pushResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`, "PATCH", pushPayload);
  
  if (!pushResult.ok) {
    logs.push(`[Sync] ⚠️ Push warning: ${pushResult.error}`);
  } else {
    logs.push(`[Sync] ✓ Push naar scherm succesvol`);
  }
  
  // STEP 6: Verify
  logs.push(`[Sync] Verificatie...`);
  
  // Verify playlist items
  const verifyPlaylist = await yodeckRequest<any>(`/playlists/${activePlaylistId}/`);
  
  if (!verifyPlaylist.ok || !verifyPlaylist.data) {
    logs.push(`[Sync] ✗ Verificatie playlist mislukt: ${verifyPlaylist.error}`);
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckDeviceId,
      activePlaylistId,
      baselinePlaylistId: baselineResult.playlistId,
      baselineCount: baselineResult.items.length,
      adsCount: adItems.length,
      itemCount: 0,
      verificationOk: false,
      lastPushResult: "error: verificatie mislukt",
      errorReason: "VERIFY_PLAYLIST_FAILED",
      logs,
    };
  }
  
  const actualItemCount = Array.isArray(verifyPlaylist.data.items) ? verifyPlaylist.data.items.length : 0;
  
  if (actualItemCount === 0) {
    logs.push(`[Sync] ✗ Playlist is LEEG na schrijven!`);
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckDeviceId,
      activePlaylistId,
      baselinePlaylistId: baselineResult.playlistId,
      baselineCount: baselineResult.items.length,
      adsCount: adItems.length,
      itemCount: 0,
      verificationOk: false,
      lastPushResult: "error: playlist leeg na schrijven",
      errorReason: "PLAYLIST_EMPTY_AFTER_WRITE",
      logs,
    };
  }
  
  // Verify screen still points to correct playlist
  const verifyScreen = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`);
  const screenPlaylistId = verifyScreen.data?.screen_content?.source_id ? 
    String(verifyScreen.data.screen_content.source_id) : null;
  
  if (screenPlaylistId !== activePlaylistId) {
    logs.push(`[Sync] ⚠️ MISMATCH: scherm wijst naar ${screenPlaylistId}, verwacht ${activePlaylistId}`);
  }
  
  logs.push(`[Sync] ═══════════════════════════════════════`);
  logs.push(`[Sync] ✓ SYNC COMPLEET - Playlist ${activePlaylistId} met ${actualItemCount} items`);
  
  return {
    ok: true,
    screenId,
    screenName: screen.name,
    yodeckDeviceId,
    activePlaylistId,
    baselinePlaylistId: baselineResult.playlistId,
    baselineCount: baselineResult.items.length,
    adsCount: adItems.length,
    itemCount: actualItemCount,
    verificationOk: actualItemCount > 0 && screenPlaylistId === activePlaylistId,
    lastPushResult: "ok",
    logs,
  };
}

// ============================================================================
// REPAIR SCREEN (WRAPPER FOR SYNC)
// ============================================================================

/**
 * Full repair cycle for a screen
 * Uses syncScreenCombinedPlaylist with additional device status info
 */
export async function repairScreen(screenId: string): Promise<ScreenRepairResult> {
  const logs: string[] = [];
  logs.push(`[Repair] ═══════════════════════════════════════`);
  logs.push(`[Repair] Start repair voor scherm ${screenId}`);
  
  // Get screen info
  const [screen] = await db.select({
    name: screens.name,
    screenId: screens.screenId,
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(eq(screens.id, screenId));
  
  if (!screen) {
    return {
      ok: false,
      screenId,
      screenName: "Onbekend",
      deviceStatus: {
        status: "UNLINKED",
        isOnline: false,
        lastSeenAt: null,
        lastScreenshotAt: null,
        yodeckDeviceId: null,
        yodeckDeviceName: null,
        source: "unlinked",
        fetchedAt: new Date().toISOString(),
        error: "SCREEN_NOT_FOUND",
      },
      expectedPlaylistId: null,
      actualPlaylistId: null,
      baselinePlaylistId: null,
      itemCount: 0,
      baselineCount: 0,
      adsCount: 0,
      publishOk: false,
      verificationOk: false,
      errorReason: "SCREEN_NOT_FOUND",
      logs,
    };
  }
  
  logs.push(`[Repair] Scherm: ${screen.name}`);
  
  const deviceStatus = await getYodeckDeviceStatus(screenId);
  logs.push(`[Repair] Device status: ${deviceStatus.status}`);
  
  if (deviceStatus.status === "UNLINKED" || !screen.yodeckPlayerId) {
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      deviceStatus,
      expectedPlaylistId: null,
      actualPlaylistId: null,
      baselinePlaylistId: null,
      itemCount: 0,
      baselineCount: 0,
      adsCount: 0,
      publishOk: false,
      verificationOk: false,
      errorReason: "DEVICE_UNLINKED",
      logs,
    };
  }
  
  // Run the main sync
  const syncResult = await syncScreenCombinedPlaylist(screenId);
  logs.push(...syncResult.logs);
  
  return {
    ok: syncResult.ok,
    screenId,
    screenName: syncResult.screenName,
    deviceStatus,
    expectedPlaylistId: syncResult.activePlaylistId,
    actualPlaylistId: syncResult.activePlaylistId,
    baselinePlaylistId: syncResult.baselinePlaylistId,
    itemCount: syncResult.itemCount,
    baselineCount: syncResult.baselineCount,
    adsCount: syncResult.adsCount,
    publishOk: syncResult.ok,
    verificationOk: syncResult.verificationOk,
    baselineError: syncResult.errorReason?.startsWith("BASELINE") ? syncResult.errorReason : undefined,
    errorReason: syncResult.errorReason,
    logs,
  };
}

// ============================================================================
// NOW PLAYING STATUS
// ============================================================================

/**
 * Get what's currently playing on a screen
 * Shows actual playlist state with clear error messages
 */
export async function getScreenNowPlaying(screenId: string): Promise<{
  ok: boolean;
  deviceStatus: UnifiedDeviceStatus;
  playlistId: string | null;
  playlistName: string | null;
  expectedPlaylistName: string | null;
  baselinePlaylistId: string | null;
  baselineConfigured: boolean;
  itemCount: number;
  baselineCount: number | null;
  baselineCountUnknown?: boolean;
  adsCount: number;
  lastPushAt: string | null;
  lastPushResult: string | null;
  verificationOk: boolean;
  mismatch: boolean;
  mismatchLevel?: "error" | "warning" | "info";
  mismatchReason?: string;
  screenshot?: {
    url: string | null;
    lastOkAt: string | null;
    byteSize: number | null;
    hash: string | null;
  };
  proofStatus?: {
    ok: boolean;
    isOnline: boolean;
    hasContent: boolean;
    hasScreenshot: boolean;
    reason?: string;
  };
  error?: string;
}> {
  const deviceStatus = await getYodeckDeviceStatus(screenId);
  
  // Get baseline status
  const baselinePlaylistId = await getBaselinePlaylistId();
  const baselineConfigured = !!baselinePlaylistId;
  
  if (deviceStatus.status === "UNLINKED") {
    return {
      ok: false,
      deviceStatus,
      playlistId: null,
      playlistName: null,
      expectedPlaylistName: null,
      baselinePlaylistId,
      baselineConfigured,
      itemCount: 0,
      baselineCount: 0,
      adsCount: 0,
      lastPushAt: null,
      lastPushResult: null,
      verificationOk: false,
      mismatch: false,
      error: "DEVICE_UNLINKED",
    };
  }
  
  const [screen] = await db.select({
    yodeckPlayerId: screens.yodeckPlayerId,
    screenId: screens.screenId,
    name: screens.name,
    locationId: screens.locationId,
    yodeckScreenshotUrl: screens.yodeckScreenshotUrl,
    yodeckScreenshotLastOkAt: screens.yodeckScreenshotLastOkAt,
    yodeckScreenshotByteSize: screens.yodeckScreenshotByteSize,
    yodeckScreenshotHash: screens.yodeckScreenshotHash,
  }).from(screens).where(eq(screens.id, screenId));
  
  // Get location for expected source calculation
  let location: {
    id: string;
    combinedPlaylistId: string | null;
    layoutMode: string | null;
    yodeckLayoutId: string | null;
    yodeckPlaylistId: string | null;
  } | null = null;
  
  if (screen?.locationId) {
    const [loc] = await db.select({
      id: locations.id,
      combinedPlaylistId: locations.combinedPlaylistId,
      layoutMode: locations.layoutMode,
      yodeckLayoutId: locations.yodeckLayoutId,
      yodeckPlaylistId: locations.yodeckPlaylistId,
    }).from(locations).where(eq(locations.id, screen.locationId));
    location = loc || null;
  }
  
  const expectedSource = computeExpectedSource(location);
  
  if (!screen?.yodeckPlayerId) {
    return {
      ok: false,
      deviceStatus,
      playlistId: null,
      playlistName: null,
      expectedPlaylistName: getScreenPlaylistName(screen?.screenId || screen?.name || screenId),
      baselinePlaylistId,
      baselineConfigured,
      itemCount: 0,
      baselineCount: 0,
      adsCount: 0,
      lastPushAt: null,
      lastPushResult: null,
      verificationOk: false,
      mismatch: false,
      error: "NO_YODECK_DEVICE",
    };
  }
  
  const screenResult = await yodeckRequest<any>(`/screens/${screen.yodeckPlayerId}/`);
  
  const expectedPlaylistName = getScreenPlaylistName(screen.screenId || screen.name);
  
  if (!screenResult.ok || !screenResult.data) {
    return {
      ok: false,
      deviceStatus,
      playlistId: null,
      playlistName: null,
      expectedPlaylistName,
      baselinePlaylistId,
      baselineConfigured,
      itemCount: 0,
      baselineCount: 0,
      adsCount: 0,
      lastPushAt: null,
      lastPushResult: "error",
      verificationOk: false,
      mismatch: false,
      error: "YODECK_API_ERROR",
    };
  }
  
  const content = screenResult.data.screen_content;
  const playlistId = content?.source_id ? String(content.source_id) : null;
  
  let playlistName: string | null = null;
  let itemCount = 0;
  
  // Get active playlist items with their mediaIds
  let playlistItems: Array<{ id: number; name?: string; type?: string }> = [];
  
  if (playlistId) {
    const playlistResult = await yodeckRequest<any>(`/playlists/${playlistId}/`);
    if (playlistResult.ok && playlistResult.data) {
      playlistName = playlistResult.data.name || null;
      playlistItems = Array.isArray(playlistResult.data.items) ? playlistResult.data.items : [];
      itemCount = playlistItems.length;
    }
  }
  
  // VERIFICATION: Check if playlist has content
  const hasContent = itemCount > 0;
  
  // Actual source from Yodeck
  const actualSourceType = content?.source_type || "unknown";
  const actualSourceId = playlistId; // Already extracted above
  
  // Compare actual vs expected source from Location DB
  // Mismatch = true when DB config differs from actual Yodeck playback
  const sourceMismatch = expectedSource.id !== null && (
    expectedSource.type !== actualSourceType ||
    expectedSource.id !== actualSourceId
  );
  
  // Verification is OK if:
  // 1. Screen has a playlist assigned
  // 2. Playlist has content (itemCount > 0)
  // 3. Source matches expected (or expected is unknown)
  const verificationOk = playlistId !== null && hasContent && !sourceMismatch;
  
  // Mismatch for UI display
  const isElevizionPlaylist = playlistName?.toLowerCase().includes("elevizion");
  const mismatch = sourceMismatch || (playlistName !== null && !isElevizionPlaylist);
  
  // Count baseline vs ads by MATCHING MEDIA IDs
  let baselineCount: number | "unknown" = 0;
  let adsCount = 0;
  
  if (hasContent && baselineConfigured) {
    // Fetch baseline items to get their mediaIds
    const baselineLogs: string[] = [];
    const baselineResult = await getBaselineItemsFromYodeck(baselineLogs);
    if (baselineResult.ok && baselineResult.items.length > 0) {
      const baselineMediaIds = new Set(baselineResult.items.map(item => item.mediaId));
      
      // Count how many items in active playlist match baseline mediaIds
      baselineCount = playlistItems.filter(item => baselineMediaIds.has(item.id)).length;
      adsCount = itemCount - baselineCount;
    } else {
      // Baseline fetch failed - can't determine counts
      baselineCount = "unknown";
      adsCount = itemCount;
    }
  } else if (hasContent && !baselineConfigured) {
    // Baseline not configured but playlist has content
    // Don't assume anything about what's baseline vs ads
    baselineCount = "unknown";
    adsCount = itemCount;
  }
  
  // Build specific error/status message
  let lastPushResult: string | null = null;
  if (verificationOk) {
    lastPushResult = "ok";
  } else if (!playlistId) {
    lastPushResult = "error: geen playlist toegewezen - klik Force Repair";
  } else if (!hasContent) {
    lastPushResult = `error: playlist ${playlistId} leeg (0 items) - klik Force Repair`;
  }
  // Note: baseline not configured is NOT an error if content is playing
  
  // Determine mismatch reason - only show as warning/error for actual problems
  let mismatchReason: string | undefined = undefined;
  let mismatchLevel: "error" | "warning" | "info" | undefined = undefined;
  
  if (!hasContent) {
    mismatchReason = `Playlist is leeg (0 items) - Force Repair nodig!`;
    mismatchLevel = "error";
  } else if (sourceMismatch) {
    // Source mismatch between DB config and actual Yodeck playback
    mismatchReason = `Broadcast mismatch: DB verwacht ${expectedSource.type}/${expectedSource.id} (${expectedSource.source}), actual ${actualSourceType}/${actualSourceId}`;
    mismatchLevel = "warning";
  } else if (!baselineConfigured && !sourceMismatch) {
    // Content playing but baseline not configured - INFO level only (not an error)
    mismatchReason = "Baseline playlist niet geconfigureerd - baseline telling onbekend";
    mismatchLevel = "info";
  } else if (!isElevizionPlaylist && !sourceMismatch) {
    // Playlist playing but not an Elevizion playlist - warning
    mismatchReason = `Let op: playlist heet "${playlistName}"`;
    mismatchLevel = "warning";
  }
  
  // Build screenshot info
  const screenshot = {
    url: screen.yodeckScreenshotUrl || null,
    lastOkAt: screen.yodeckScreenshotLastOkAt?.toISOString() || null,
    byteSize: screen.yodeckScreenshotByteSize || null,
    hash: screen.yodeckScreenshotHash || null,
  };
  
  // Build proof status
  const proofIsOnline = deviceStatus.isOnline ?? false;
  const proofHasContent = itemCount > 0;
  const proofHasScreenshot = (screen.yodeckScreenshotByteSize || 0) > 5000; // >5KB suggests real content
  
  const proofOk = proofIsOnline && proofHasContent && proofHasScreenshot;
  const proofStatus = {
    ok: proofOk,
    isOnline: proofIsOnline,
    hasContent: proofHasContent,
    hasScreenshot: proofHasScreenshot,
    reason: !proofOk 
      ? (!proofIsOnline ? "Device offline" : !proofHasContent ? "Playlist empty" : "Screenshot not available or too small")
      : "All checks passed",
  };
  
  return {
    ok: verificationOk,
    deviceStatus,
    playlistId,
    playlistName,
    expectedPlaylistName,
    baselinePlaylistId,
    baselineConfigured,
    itemCount,
    baselineCount: typeof baselineCount === "number" ? baselineCount : null,
    baselineCountUnknown: baselineCount === "unknown",
    adsCount,
    lastPushAt: null,
    lastPushResult,
    verificationOk,
    mismatch: mismatchLevel === "error" || mismatchLevel === "warning",
    mismatchLevel,
    mismatchReason,
    screenshot,
    proofStatus,
  };
}

// ============================================================================
// PLAYBACK ENFORCEMENT (CRITICAL FOR ACTUAL PLAYBACK)
// ============================================================================

/**
 * Ensure a screen is playing a playlist (not layout/schedule)
 * This is the MOST IMPORTANT function for guaranteeing actual playback
 * 
 * Source of truth is Yodeck screen_content, NOT local DB fields
 * 
 * Flow:
 * 1. Fetch screen details from Yodeck
 * 2. Check screen_content.source_type
 * 3. If not "playlist", create/reuse canonical playlist and assign
 * 4. If already playlist but NO CONTENT, reassign to force refresh
 */
export async function ensureScreenPlaysPlaylist(
  yodeckPlayerId: string,
  screenId?: string
): Promise<PlaybackEnforceResult> {
  const logs: string[] = [];
  logs.push(`[PlaybackEnforce] ═══════════════════════════════════════`);
  logs.push(`[PlaybackEnforce] Start enforce voor player ${yodeckPlayerId}`);
  
  // Step 1: Fetch current screen state from Yodeck (SOURCE OF TRUTH)
  const screenResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  
  if (!screenResult.ok || !screenResult.data) {
    logs.push(`[PlaybackEnforce] ✗ Kan Yodeck scherm niet ophalen: ${screenResult.error}`);
    return {
      ok: false,
      playerId: yodeckPlayerId,
      previousSourceType: null,
      previousSourceId: null,
      currentSourceType: "unknown",
      currentSourceId: null,
      playlistCreated: false,
      playlistId: null,
      playlistName: null,
      enforceAction: "none",
      logs,
      error: `YODECK_FETCH_FAILED: ${screenResult.error}`,
    };
  }
  
  const screenData = screenResult.data;
  const screenName = screenData.name || `YDK-${yodeckPlayerId}`;
  const content = screenData.screen_content || {};
  const previousSourceType = content.source_type || null;
  const previousSourceId = content.source_id ? String(content.source_id) : null;
  
  logs.push(`[PlaybackEnforce] Scherm: "${screenName}"`);
  logs.push(`[PlaybackEnforce] Huidige source_type: ${previousSourceType || "NONE"}`);
  logs.push(`[PlaybackEnforce] Huidige source_id: ${previousSourceId || "NONE"}`);
  
  // Step 2: Determine canonical playlist name
  const canonicalPlaylistName = getScreenPlaylistName(`YDK-${yodeckPlayerId}`);
  
  // Step 3: Check if we need to enforce playlist mode
  let needsEnforce = false;
  let enforceReason = "";
  
  if (previousSourceType !== "playlist") {
    needsEnforce = true;
    enforceReason = `source_type is "${previousSourceType}" (not playlist)`;
  } else if (!previousSourceId) {
    needsEnforce = true;
    enforceReason = "source_id is empty";
  }
  
  if (!needsEnforce) {
    logs.push(`[PlaybackEnforce] ✓ Scherm is al in playlist mode met source_id=${previousSourceId}`);
    
    // Verify the playlist has content
    const playlistCheck = await yodeckRequest<any>(`/playlists/${previousSourceId}/`);
    const itemCount = Array.isArray(playlistCheck.data?.items) ? playlistCheck.data.items.length : 0;
    
    if (itemCount === 0) {
      logs.push(`[PlaybackEnforce] ⚠️ Playlist ${previousSourceId} is LEEG - toch reassign forceren`);
      needsEnforce = true;
      enforceReason = "playlist empty, reassigning to trigger refresh";
    } else {
      logs.push(`[PlaybackEnforce] ✓ Playlist heeft ${itemCount} items - geen actie nodig`);
      return {
        ok: true,
        playerId: yodeckPlayerId,
        previousSourceType,
        previousSourceId,
        currentSourceType: "playlist",
        currentSourceId: previousSourceId,
        playlistCreated: false,
        playlistId: previousSourceId,
        playlistName: playlistCheck.data?.name || null,
        enforceAction: "already_playlist",
        logs,
      };
    }
  }
  
  logs.push(`[PlaybackEnforce] Enforce nodig: ${enforceReason}`);
  
  // Step 4: Find or create canonical playlist
  let targetPlaylistId: string | null = null;
  let playlistCreated = false;
  
  // First check if canonical playlist already exists
  const existingPlaylist = await findPlaylistByName(canonicalPlaylistName);
  
  if (existingPlaylist) {
    targetPlaylistId = String(existingPlaylist.id);
    logs.push(`[PlaybackEnforce] Bestaande canonical playlist gevonden: ${targetPlaylistId} ("${canonicalPlaylistName}")`);
  } else {
    // Create new playlist
    logs.push(`[PlaybackEnforce] Canonical playlist niet gevonden, nieuwe aanmaken...`);
    const createResult = await createPlaylist(canonicalPlaylistName);
    
    if (!createResult.ok || !createResult.playlistId) {
      logs.push(`[PlaybackEnforce] ✗ Playlist aanmaken mislukt: ${createResult.error}`);
      return {
        ok: false,
        playerId: yodeckPlayerId,
        previousSourceType,
        previousSourceId,
        currentSourceType: previousSourceType || "unknown",
        currentSourceId: previousSourceId,
        playlistCreated: false,
        playlistId: null,
        playlistName: null,
        enforceAction: "none",
        logs,
        error: `CREATE_PLAYLIST_FAILED: ${createResult.error}`,
      };
    }
    
    targetPlaylistId = String(createResult.playlistId);
    playlistCreated = true;
    logs.push(`[PlaybackEnforce] ✓ Nieuwe playlist aangemaakt: ${targetPlaylistId}`);
  }
  
  // Step 5: Assign playlist to screen
  logs.push(`[PlaybackEnforce] Toewijzen playlist ${targetPlaylistId} aan scherm...`);
  
  const assignPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: parseInt(targetPlaylistId),
    },
  };
  
  const assignResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`, "PATCH", assignPayload);
  
  if (!assignResult.ok) {
    logs.push(`[PlaybackEnforce] ✗ Toewijzen mislukt: ${assignResult.error}`);
    return {
      ok: false,
      playerId: yodeckPlayerId,
      previousSourceType,
      previousSourceId,
      currentSourceType: previousSourceType || "unknown",
      currentSourceId: previousSourceId,
      playlistCreated,
      playlistId: targetPlaylistId,
      playlistName: canonicalPlaylistName,
      enforceAction: "none",
      logs,
      error: `ASSIGN_FAILED: ${assignResult.error}`,
    };
  }
  
  const enforceAction = playlistCreated ? "created_and_assigned" : "reassigned";
  logs.push(`[PlaybackEnforce] ✓ player=${yodeckPlayerId} changed source_type ${previousSourceType}->playlist source_id ${previousSourceId}->${targetPlaylistId}`);
  logs.push(`[PlaybackEnforce] ═══════════════════════════════════════`);
  
  return {
    ok: true,
    playerId: yodeckPlayerId,
    previousSourceType,
    previousSourceId,
    currentSourceType: "playlist",
    currentSourceId: targetPlaylistId,
    playlistCreated,
    playlistId: targetPlaylistId,
    playlistName: canonicalPlaylistName,
    enforceAction,
    logs,
  };
}

/**
 * Force refresh/sync on the player after playlist assignment
 * Tries API restart first, falls back to content reassignment
 */
export async function refreshScreenPlayback(yodeckPlayerId: string): Promise<PlayerRefreshResult> {
  const logs: string[] = [];
  logs.push(`[PlaybackRefresh] ═══════════════════════════════════════`);
  logs.push(`[PlaybackRefresh] Start refresh voor player ${yodeckPlayerId}`);
  
  // Method 1: Try to restart player app via API (if available)
  // Yodeck API v2 has POST /screens/{id}/restart/ or similar
  const restartResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/restart/`, "POST", {});
  
  if (restartResult.ok) {
    logs.push(`[PlaybackRefresh] method=api_restart ok=true status=${restartResult.data?.status || 'ok'}`);
    return {
      ok: true,
      method: "api_restart",
      playerId: yodeckPlayerId,
      status: 200,
      logs,
    };
  }
  
  logs.push(`[PlaybackRefresh] API restart niet beschikbaar: ${restartResult.error}`);
  
  // Method 2: Reassign content to trigger player refresh
  logs.push(`[PlaybackRefresh] Falling back to content_reassign method...`);
  
  // Get current screen content
  const screenResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  
  if (!screenResult.ok || !screenResult.data) {
    logs.push(`[PlaybackRefresh] ✗ Kan scherm niet ophalen: ${screenResult.error}`);
    return {
      ok: false,
      method: "none",
      playerId: yodeckPlayerId,
      logs,
      error: `SCREEN_FETCH_FAILED: ${screenResult.error}`,
    };
  }
  
  const content = screenResult.data.screen_content;
  
  if (!content?.source_id) {
    logs.push(`[PlaybackRefresh] ✗ Geen source_id om te reassignen`);
    return {
      ok: false,
      method: "none",
      playerId: yodeckPlayerId,
      logs,
      error: "NO_SOURCE_ID",
    };
  }
  
  // Reassign same content to trigger refresh
  const reassignPayload = {
    screen_content: {
      source_type: content.source_type || "playlist",
      source_id: content.source_id,
    },
  };
  
  const reassignResult = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`, "PATCH", reassignPayload);
  
  if (!reassignResult.ok) {
    logs.push(`[PlaybackRefresh] ✗ Reassign mislukt: ${reassignResult.error}`);
    return {
      ok: false,
      method: "content_reassign",
      playerId: yodeckPlayerId,
      logs,
      error: `REASSIGN_FAILED: ${reassignResult.error}`,
    };
  }
  
  logs.push(`[PlaybackRefresh] method=content_reassign ok=true source_id=${content.source_id}`);
  logs.push(`[PlaybackRefresh] ═══════════════════════════════════════`);
  
  return {
    ok: true,
    method: "content_reassign",
    playerId: yodeckPlayerId,
    status: 200,
    logs,
  };
}

// ============================================================================
// SCREENSHOT PROOF WITH NO CONTENT DETECTION
// ============================================================================

// Known hash for "NO CONTENT TO PLAY" screen (detected empirically)
// This is a heuristic - may need adjustment based on actual screenshots
const NO_CONTENT_HASHES = new Set<string>([
  // Add known hashes here as we discover them
]);

/**
 * Detect if screenshot shows "NO CONTENT TO PLAY"
 * Uses multiple heuristics:
 * 1. Known hash matching
 * 2. Very small file size (< 5KB suggests simple/blank screen)
 * 3. Future: pixel sampling for dark screen with bright rectangle
 */
function detectNoContentInScreenshot(
  hash: string | null,
  byteSize: number | null,
  imageData?: Buffer
): boolean {
  // Check known hashes
  if (hash && NO_CONTENT_HASHES.has(hash)) {
    return true;
  }
  
  // Very small screenshots often indicate "no content" or error screens
  // Real content screenshots are typically >20KB
  if (byteSize !== null && byteSize < 3000) {
    return true; // Likely an error or "no content" screen
  }
  
  // Future: Add pixel analysis if imageData is provided
  // For now, rely on hash matching and size heuristics
  
  return false;
}

/**
 * Fetch and store screenshot proof for a screen
 * Adds cache buster to avoid CDN caching
 */
export async function fetchScreenshotProof(
  screenId: string,
  screenshotUrl: string
): Promise<ScreenshotProofResult> {
  const logs: string[] = [];
  logs.push(`[ScreenshotFetch] ═══════════════════════════════════════`);
  logs.push(`[ScreenshotFetch] Fetching screenshot voor scherm ${screenId}`);
  
  if (!screenshotUrl) {
    logs.push(`[ScreenshotFetch] ✗ Geen screenshot URL`);
    return {
      ok: false,
      url: null,
      byteSize: null,
      hash: null,
      hashChanged: false,
      detectedNoContent: false,
      lastOkAt: null,
      error: "NO_SCREENSHOT_URL",
    };
  }
  
  // Add cache buster to URL
  const cacheBusterUrl = screenshotUrl.includes("?") 
    ? `${screenshotUrl}&t=${Date.now()}` 
    : `${screenshotUrl}?t=${Date.now()}`;
  
  logs.push(`[ScreenshotFetch] URL: ${cacheBusterUrl}`);
  
  try {
    const response = await fetch(cacheBusterUrl, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
    
    if (!response.ok) {
      logs.push(`[ScreenshotFetch] ✗ HTTP ${response.status}`);
      return {
        ok: false,
        url: screenshotUrl,
        byteSize: null,
        hash: null,
        hashChanged: false,
        detectedNoContent: false,
        lastOkAt: null,
        error: `HTTP_${response.status}`,
      };
    }
    
    const buffer = await response.arrayBuffer();
    const byteSize = buffer.byteLength;
    
    logs.push(`[ScreenshotFetch] Size: ${byteSize} bytes`);
    
    // Compute hash (simple approach: sha256 of first 16KB)
    const crypto = await import('crypto');
    const hashBuffer = Buffer.from(buffer.slice(0, 16384));
    const hash = crypto.createHash('sha256').update(hashBuffer).digest('hex').substring(0, 16);
    
    logs.push(`[ScreenshotFetch] Hash: ${hash}`);
    
    // Get previous hash from DB
    const [screen] = await db.select({
      yodeckScreenshotHash: screens.yodeckScreenshotHash,
    }).from(screens).where(eq(screens.id, screenId));
    
    const previousHash = screen?.yodeckScreenshotHash || null;
    const hashChanged = previousHash !== hash;
    
    logs.push(`[ScreenshotFetch] Previous hash: ${previousHash}, Changed: ${hashChanged}`);
    
    // Detect NO CONTENT
    const detectedNoContent = detectNoContentInScreenshot(hash, byteSize, Buffer.from(buffer));
    
    if (detectedNoContent) {
      logs.push(`[ScreenshotFetch] ⚠️ Detected: NO CONTENT TO PLAY`);
    }
    
    // Store in DB if size is reasonable (>5KB suggests real content)
    const now = new Date();
    const isValidScreenshot = byteSize > 5000 && !detectedNoContent;
    
    if (isValidScreenshot) {
      await db.update(screens)
        .set({
          yodeckScreenshotUrl: screenshotUrl,
          yodeckScreenshotLastOkAt: now,
          yodeckScreenshotByteSize: byteSize,
          yodeckScreenshotHash: hash,
        })
        .where(eq(screens.id, screenId));
      
      logs.push(`[ScreenshotFetch] ✓ Stored: size=${byteSize}, hash=${hash}`);
    } else {
      logs.push(`[ScreenshotFetch] ⚠️ Screenshot too small or NO CONTENT - not storing as valid proof`);
    }
    
    logs.push(`[ScreenshotFetch] ═══════════════════════════════════════`);
    
    return {
      ok: isValidScreenshot,
      url: screenshotUrl,
      byteSize,
      hash,
      hashChanged,
      detectedNoContent,
      lastOkAt: isValidScreenshot ? now.toISOString() : null,
    };
  } catch (error: any) {
    logs.push(`[ScreenshotFetch] ✗ Error: ${error.message}`);
    return {
      ok: false,
      url: screenshotUrl,
      byteSize: null,
      hash: null,
      hashChanged: false,
      detectedNoContent: false,
      lastOkAt: null,
      error: error.message,
    };
  }
}

// ============================================================================
// FORCE REPAIR + PROOF (E2E)
// ============================================================================

/**
 * Force Repair + Proof - Complete E2E cycle
 * 
 * 1. ensureScreenPlaysPlaylist(playerId) - enforce PLAYLIST mode
 * 2. fillPlaylistWithContent(activePlaylistId) - baseline + ads
 * 3. refreshScreenPlayback() - trigger player refresh
 * 4. Poll up to 6 times with backoff for screenshot proof
 */
export async function forceRepairAndProof(screenId: string): Promise<ForceRepairProofResult> {
  const logs: string[] = [];
  logs.push(`[ForceRepairProof] ═══════════════════════════════════════════════`);
  logs.push(`[ForceRepairProof] Start FORCE REPAIR + PROOF voor scherm ${screenId}`);
  logs.push(`[ForceRepairProof] Timestamp: ${new Date().toISOString()}`);
  
  // Get screen info
  const [screen] = await db.select({
    name: screens.name,
    screenId: screens.screenId,
    yodeckPlayerId: screens.yodeckPlayerId,
    yodeckScreenshotUrl: screens.yodeckScreenshotUrl,
  }).from(screens).where(eq(screens.id, screenId));
  
  if (!screen) {
    logs.push(`[ForceRepairProof] ✗ Scherm niet gevonden`);
    return {
      ok: false,
      playerId: "",
      activePlaylistId: null,
      itemCount: 0,
      baselineConfigured: false,
      baselineCount: 0,
      adsCount: 0,
      screenshot: null,
      proofStatus: {
        ok: false,
        isOnline: false,
        hasContent: false,
        hasScreenshot: false,
        detectedNoContent: false,
        reason: "SCREEN_NOT_FOUND",
      },
      refreshMethodUsed: "none",
      pollAttempts: 0,
      logs,
    };
  }
  
  if (!screen.yodeckPlayerId) {
    logs.push(`[ForceRepairProof] ✗ Geen Yodeck device gekoppeld`);
    return {
      ok: false,
      playerId: "",
      activePlaylistId: null,
      itemCount: 0,
      baselineConfigured: false,
      baselineCount: 0,
      adsCount: 0,
      screenshot: null,
      proofStatus: {
        ok: false,
        isOnline: false,
        hasContent: false,
        hasScreenshot: false,
        detectedNoContent: false,
        reason: "NO_YODECK_DEVICE",
      },
      refreshMethodUsed: "none",
      pollAttempts: 0,
      logs,
    };
  }
  
  const playerId = screen.yodeckPlayerId;
  logs.push(`[ForceRepairProof] Player ID: ${playerId}`);
  
  // STEP 1: Enforce playlist mode
  logs.push(`[ForceRepairProof] STEP 1: Enforce playlist mode...`);
  const enforceResult = await ensureScreenPlaysPlaylist(playerId, screenId);
  logs.push(...enforceResult.logs);
  
  if (!enforceResult.ok) {
    logs.push(`[ForceRepairProof] ✗ Enforce failed: ${enforceResult.error}`);
    return {
      ok: false,
      playerId,
      activePlaylistId: enforceResult.playlistId,
      itemCount: 0,
      baselineConfigured: false,
      baselineCount: 0,
      adsCount: 0,
      screenshot: null,
      proofStatus: {
        ok: false,
        isOnline: false,
        hasContent: false,
        hasScreenshot: false,
        detectedNoContent: false,
        reason: `ENFORCE_FAILED: ${enforceResult.error}`,
      },
      refreshMethodUsed: "none",
      pollAttempts: 0,
      logs,
    };
  }
  
  // STEP 2: Fill playlist with baseline + ads (using existing sync)
  logs.push(`[ForceRepairProof] STEP 2: Fill playlist with content...`);
  const syncResult = await syncScreenCombinedPlaylist(screenId);
  logs.push(...syncResult.logs);
  
  const activePlaylistId = syncResult.activePlaylistId;
  const baselinePlaylistId = await getBaselinePlaylistId();
  const baselineConfigured = !!baselinePlaylistId;
  
  if (!syncResult.ok) {
    logs.push(`[ForceRepairProof] ✗ Sync failed: ${syncResult.errorReason}`);
    return {
      ok: false,
      playerId,
      activePlaylistId,
      itemCount: syncResult.itemCount,
      baselineConfigured,
      baselineCount: syncResult.baselineCount,
      adsCount: syncResult.adsCount,
      screenshot: null,
      proofStatus: {
        ok: false,
        isOnline: false,
        hasContent: false,
        hasScreenshot: false,
        detectedNoContent: false,
        reason: `SYNC_FAILED: ${syncResult.errorReason}`,
      },
      refreshMethodUsed: "none",
      pollAttempts: 0,
      logs,
    };
  }
  
  // STEP 3: Force refresh on player
  logs.push(`[ForceRepairProof] STEP 3: Refresh player...`);
  const refreshResult = await refreshScreenPlayback(playerId);
  logs.push(...refreshResult.logs);
  
  const refreshMethodUsed = refreshResult.method;
  
  // STEP 4: Poll for screenshot proof with backoff
  logs.push(`[ForceRepairProof] STEP 4: Polling for screenshot proof...`);
  
  const pollIntervals = [5000, 5000, 10000, 10000, 15000, 15000]; // Total: ~60s
  let screenshot: ScreenshotProofResult | null = null;
  let pollAttempts = 0;
  
  // Get screenshot URL from Yodeck
  const deviceStatus = await getYodeckDeviceStatus(screenId);
  let screenshotUrl = screen.yodeckScreenshotUrl;
  
  // Try to get fresh URL from device status
  if (deviceStatus.yodeckDeviceId) {
    const screenData = await yodeckRequest<any>(`/screens/${playerId}/`);
    if (screenData.ok && screenData.data?.screenshot_path) {
      screenshotUrl = screenData.data.screenshot_path;
    }
  }
  
  for (let i = 0; i < pollIntervals.length; i++) {
    pollAttempts = i + 1;
    logs.push(`[ProofPoll] Attempt ${pollAttempts}/${pollIntervals.length}, waiting ${pollIntervals[i]}ms...`);
    
    // Wait
    await new Promise(resolve => setTimeout(resolve, pollIntervals[i]));
    
    // Fetch screenshot
    if (screenshotUrl) {
      screenshot = await fetchScreenshotProof(screenId, screenshotUrl);
      
      logs.push(`[ProofPoll] Result: ok=${screenshot.ok}, size=${screenshot.byteSize}, noContent=${screenshot.detectedNoContent}`);
      
      // Success if screenshot OK and not showing "NO CONTENT"
      if (screenshot.ok && !screenshot.detectedNoContent) {
        logs.push(`[ProofPoll] ✓ Valid screenshot proof obtained!`);
        break;
      }
    } else {
      logs.push(`[ProofPoll] ✗ No screenshot URL available`);
    }
  }
  
  // Build final proof status
  const isOnline = deviceStatus.isOnline ?? false;
  const hasContent = syncResult.itemCount > 0;
  const hasScreenshot = screenshot?.ok ?? false;
  const detectedNoContent = screenshot?.detectedNoContent ?? false;
  
  const proofOk = isOnline && hasContent && hasScreenshot && !detectedNoContent;
  
  let proofReason = "All checks passed";
  if (!proofOk) {
    const reasons: string[] = [];
    if (!isOnline) reasons.push("Device offline");
    if (!hasContent) reasons.push("Playlist empty");
    if (!hasScreenshot) reasons.push("No valid screenshot");
    if (detectedNoContent) reasons.push("Screenshot shows NO CONTENT TO PLAY");
    proofReason = reasons.join("; ");
  }
  
  logs.push(`[ForceRepairProof] ═══════════════════════════════════════════════`);
  logs.push(`[ForceRepairProof] RESULT: proofOk=${proofOk}, reason=${proofReason}`);
  logs.push(`[ForceRepairProof] Items: ${syncResult.itemCount} (baseline: ${syncResult.baselineCount}, ads: ${syncResult.adsCount})`);
  
  return {
    ok: proofOk,
    playerId,
    activePlaylistId,
    itemCount: syncResult.itemCount,
    baselineConfigured,
    baselineCount: syncResult.baselineCount,
    adsCount: syncResult.adsCount,
    screenshot,
    proofStatus: {
      ok: proofOk,
      isOnline,
      hasContent,
      hasScreenshot,
      detectedNoContent,
      reason: proofReason,
    },
    refreshMethodUsed,
    pollAttempts,
    logs,
  };
}

// ============================================================================
// LEGACY EXPORTS (for compatibility with existing code)
// ============================================================================

export async function ensureScreenPlaylist(screenId: string): Promise<ScreenPlaylistResult> {
  const result = await syncScreenCombinedPlaylist(screenId);
  return {
    ok: result.ok,
    screenId: result.screenId,
    screenName: result.screenName,
    playlistId: result.activePlaylistId,
    playlistName: null,
    itemCount: result.itemCount,
    baselineCount: result.baselineCount,
    adsCount: result.adsCount,
    isNew: false,
    logs: result.logs,
    error: result.errorReason,
    baselineError: result.errorReason?.startsWith("BASELINE") ? result.errorReason : undefined,
    baselineFallbackUsed: false,
  };
}

export async function assignAndPushScreenContent(
  screenId: string,
  playlistId: string
): Promise<AssignPushResult> {
  // This is now handled by syncScreenCombinedPlaylist
  const logs: string[] = [];
  logs.push(`[AssignPush] Using syncScreenCombinedPlaylist instead`);
  
  const result = await syncScreenCombinedPlaylist(screenId);
  
  return {
    ok: result.ok,
    screenId: result.screenId,
    yodeckDeviceId: result.yodeckDeviceId,
    playlistId: result.activePlaylistId || playlistId,
    publishOk: result.ok,
    verificationOk: result.verificationOk,
    actualPlaylistId: result.activePlaylistId,
    actualItemCount: result.itemCount,
    errorReason: result.errorReason,
    logs: [...logs, ...result.logs],
  };
}

// Export getScreenActivePlaylistId for external use
export { getScreenActivePlaylistId };

// ============================================================================
// BROADCAST ENFORCER - Deterministic Playback Control
// ============================================================================

const KNOWN_GOOD_MEDIA_NAME = "EVZ_KNOWN_GOOD_TEST";

interface BroadcastEnforcerResult {
  ok: boolean;
  before: { sourceType: string | null; sourceId: string | null };
  after: { sourceType: string | null; sourceId: string | null };
  effectivePlaylistId: string | null;
  playlistItemCount: number;
  knownGoodMediaId: string | null;
  knownGoodPresent: boolean;
  verificationOk: boolean;
  logs: string[];
}

/**
 * Compute effective playback source for a location
 * ALIGNED with getEffectivePlaybackPlaylistId:
 * Priority: combinedPlaylistId > actual > yodeckPlaylistId
 */
function computeEffectivePlaybackSource(
  location: { combinedPlaylistId: string | null; yodeckPlaylistId: string | null },
  actualSourceId: string | null
): { playlistId: string | null; source: string } {
  // Priority: combinedPlaylistId > actualSourceId > yodeckPlaylistId
  // This matches getEffectivePlaybackPlaylistId for consistency
  if (location.combinedPlaylistId) {
    return { playlistId: location.combinedPlaylistId, source: "combinedPlaylistId" };
  }
  if (actualSourceId) {
    return { playlistId: actualSourceId, source: "actual" };
  }
  if (location.yodeckPlaylistId) {
    return { playlistId: location.yodeckPlaylistId, source: "yodeckPlaylistId" };
  }
  return { playlistId: null, source: "none" };
}

/**
 * Create a known-good test video via ffmpeg
 * Returns the path to the generated file
 */
async function createKnownGoodVideo(): Promise<{ ok: boolean; filePath?: string; error?: string }> {
  const { execSync } = await import("child_process");
  const { existsSync, mkdirSync } = await import("fs");
  const path = await import("path");
  
  const tmpDir = "/tmp/evz-known-good";
  const filePath = path.join(tmpDir, "evz_known_good_test.mp4");
  
  try {
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
    
    // Check if file already exists
    if (existsSync(filePath)) {
      console.log("[KnownGood] Reusing existing test video:", filePath);
      return { ok: true, filePath };
    }
    
    // Generate a 3-second H.264 test video with text overlay
    // This uses lavfi (software) filters - no hardware needed
    console.log("[KnownGood] Generating test video via ffmpeg...");
    
    const ffmpegCmd = [
      "ffmpeg -y",
      "-f lavfi",
      '-i "color=c=blue:s=1920x1080:d=3"',
      "-f lavfi",
      '-i "sine=f=440:d=3"',
      `-vf "drawtext=text='EVZ TEST':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2"`,
      "-c:v libx264",
      "-pix_fmt yuv420p",
      "-profile:v baseline",
      "-level 3.1",
      "-c:a aac",
      "-b:a 128k",
      "-shortest",
      `"${filePath}"`
    ].join(" ");
    
    execSync(ffmpegCmd, { stdio: "pipe", timeout: 30000 });
    
    if (existsSync(filePath)) {
      console.log("[KnownGood] Test video created:", filePath);
      return { ok: true, filePath };
    } else {
      return { ok: false, error: "File not created" };
    }
  } catch (error: any) {
    console.error("[KnownGood] ffmpeg error:", error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Ensure known-good media exists in Yodeck
 * Creates if not found, returns mediaId
 */
async function ensureKnownGoodMedia(logs: string[]): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  logs.push(`[KnownGood] Checking for existing "${KNOWN_GOOD_MEDIA_NAME}" in Yodeck...`);
  
  // Search for existing media
  const searchResult = await yodeckRequest<{ results?: any[] }>(`/media/?search=${encodeURIComponent(KNOWN_GOOD_MEDIA_NAME)}`);
  
  if (searchResult.ok && searchResult.data?.results) {
    const existing = searchResult.data.results.find((m: any) => m.name === KNOWN_GOOD_MEDIA_NAME);
    if (existing && existing.id) {
      logs.push(`[KnownGood] Found existing media: ${existing.id}`);
      return { ok: true, mediaId: String(existing.id) };
    }
  }
  
  logs.push(`[KnownGood] Not found, creating new test video...`);
  
  // Create the video file
  const videoResult = await createKnownGoodVideo();
  if (!videoResult.ok || !videoResult.filePath) {
    logs.push(`[KnownGood] ✗ Video creation failed: ${videoResult.error}`);
    return { ok: false, error: videoResult.error };
  }
  
  logs.push(`[KnownGood] Test video ready: ${videoResult.filePath}`);
  
  // Upload to Yodeck using two-step pipeline
  const { readFileSync, statSync } = await import("fs");
  const fileBuffer = readFileSync(videoResult.filePath);
  const fileStats = statSync(videoResult.filePath);
  
  logs.push(`[KnownGood] Uploading to Yodeck (${fileStats.size} bytes)...`);
  
  // Upload using Yodeck API with proper multipart format
  const axios = (await import("axios")).default;
  const FormData = (await import("form-data")).default;
  
  const apiKey = process.env.YODECK_AUTH_TOKEN;
  if (!apiKey) {
    logs.push(`[KnownGood] ✗ YODECK_AUTH_TOKEN not configured`);
    return { ok: false, error: "YODECK_AUTH_TOKEN not configured" };
  }
  
  const formData = new FormData();
  formData.append("name", KNOWN_GOOD_MEDIA_NAME);
  // Yodeck requires nested media_origin fields
  formData.append("media_origin[source]", "local");
  formData.append("media_origin[type]", "video");
  formData.append("file", fileBuffer, {
    filename: "evz_known_good_test.mp4",
    contentType: "video/mp4",
    knownLength: fileStats.size,
  });
  
  // Calculate content length
  let contentLength: number;
  try {
    contentLength = await new Promise<number>((resolve, reject) => {
      formData.getLength((err: Error | null, length: number) => {
        if (err) reject(err);
        else resolve(length);
      });
    });
  } catch (lengthErr) {
    logs.push(`[KnownGood] ✗ Could not calculate Content-Length`);
    return { ok: false, error: "Could not calculate Content-Length" };
  }
  
  try {
    const uploadResponse = await axios.post(
      "https://app.yodeck.com/api/v2/media/",
      formData,
      {
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Length": String(contentLength),
          ...formData.getHeaders(),
        },
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }
    );
    
    if (uploadResponse.data?.id) {
      const mediaId = String(uploadResponse.data.id);
      logs.push(`[KnownGood] ✓ Uploaded: mediaId=${mediaId}`);
      return { ok: true, mediaId };
    } else {
      logs.push(`[KnownGood] ✗ Upload response missing id: ${JSON.stringify(uploadResponse.data)}`);
      return { ok: false, error: "Upload response missing id" };
    }
  } catch (error: any) {
    const errDetail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logs.push(`[KnownGood] ✗ Upload failed: ${errDetail}`);
    return { ok: false, error: errDetail };
  }
}

/**
 * Add media to playlist if not already present
 */
async function ensureMediaInPlaylist(
  playlistId: string,
  mediaId: string,
  logs: string[]
): Promise<{ ok: boolean; alreadyPresent: boolean }> {
  logs.push(`[KnownGood] Checking if media ${mediaId} is in playlist ${playlistId}...`);
  
  // Get playlist items
  const playlistResult = await yodeckRequest<{ items?: any[] }>(`/playlists/${playlistId}/`);
  if (!playlistResult.ok || !playlistResult.data) {
    logs.push(`[KnownGood] ✗ Could not fetch playlist: ${playlistResult.error}`);
    return { ok: false, alreadyPresent: false };
  }
  
  const items = playlistResult.data.items || [];
  const alreadyPresent = items.some((item: any) => String(item.media) === mediaId || String(item.media?.id) === mediaId);
  
  if (alreadyPresent) {
    logs.push(`[KnownGood] ✓ Media already in playlist`);
    return { ok: true, alreadyPresent: true };
  }
  
  // Add to playlist
  logs.push(`[KnownGood] Adding media to playlist...`);
  const addResult = await yodeckRequest<any>(`/playlists/${playlistId}/items/`, "POST", {
    media: parseInt(mediaId),
    duration: 10,
    enabled: true,
  });
  
  if (!addResult.ok) {
    logs.push(`[KnownGood] ✗ Failed to add media: ${addResult.error}`);
    return { ok: false, alreadyPresent: false };
  }
  
  logs.push(`[KnownGood] ✓ Media added to playlist`);
  return { ok: true, alreadyPresent: false };
}

/**
 * Force Yodeck player to play specific playlist
 * Tries modern screen_content format, falls back to legacy
 */
async function forceScreenToPlaylist(
  yodeckDeviceId: string,
  playlistId: string,
  logs: string[]
): Promise<{ ok: boolean; method?: string; error?: string }> {
  logs.push(`[YodeckForce] Setting screen ${yodeckDeviceId} to playlist ${playlistId}...`);
  
  // Try modern screen_content format first
  const modernPayload = {
    screen_content: {
      source_type: "playlist",
      source_id: parseInt(playlistId),
    },
  };
  
  logs.push(`[YodeckForce] Trying PATCH /screens/${yodeckDeviceId}/ with screen_content...`);
  const modernResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`, "PATCH", modernPayload);
  
  if (modernResult.ok) {
    logs.push(`[YodeckForce] ✓ Modern format succeeded (status ${modernResult.status})`);
    return { ok: true, method: "screen_content" };
  }
  
  // Try legacy format
  logs.push(`[YodeckForce] Modern format failed (${modernResult.status}), trying legacy format...`);
  const legacyPayload = {
    default_playlist_type: "playlist",
    default_playlist: parseInt(playlistId),
  };
  
  const legacyResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`, "PATCH", legacyPayload);
  
  if (legacyResult.ok) {
    logs.push(`[YodeckForce] ✓ Legacy format succeeded (status ${legacyResult.status})`);
    return { ok: true, method: "legacy" };
  }
  
  logs.push(`[YodeckForce] ✗ Both formats failed: ${legacyResult.error}`);
  return { ok: false, error: legacyResult.error };
}

/**
 * Fetch fresh screen content from Yodeck (no cache)
 */
async function fetchFreshScreenContent(yodeckDeviceId: string): Promise<{
  ok: boolean;
  sourceType: string | null;
  sourceId: string | null;
  sourceName: string | null;
}> {
  // Add timestamp to bust any caching
  const result = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/?_t=${Date.now()}`);
  
  if (!result.ok || !result.data) {
    return { ok: false, sourceType: null, sourceId: null, sourceName: null };
  }
  
  const content = result.data.screen_content || {};
  return {
    ok: true,
    sourceType: content.source_type || null,
    sourceId: content.source_id ? String(content.source_id) : null,
    sourceName: content.source_name || null,
  };
}

/**
 * BROADCAST ENFORCER - Main entry point
 * Forces deterministic playback: whatever playlist we manage MUST be active on the player
 */
export async function enforcePlaybackSource(locationId: string): Promise<BroadcastEnforcerResult> {
  const logs: string[] = [];
  logs.push(`[BroadcastEnforcer] ═══════════════════════════════════════`);
  logs.push(`[BroadcastEnforcer] Start enforce voor location ${locationId}`);
  
  // Load location
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  
  if (!location) {
    logs.push(`[BroadcastEnforcer] ✗ Location niet gevonden`);
    return {
      ok: false,
      before: { sourceType: null, sourceId: null },
      after: { sourceType: null, sourceId: null },
      effectivePlaylistId: null,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  const yodeckDeviceId = location.yodeckDeviceId;
  if (!yodeckDeviceId) {
    logs.push(`[BroadcastEnforcer] ✗ Geen yodeckDeviceId geconfigureerd`);
    return {
      ok: false,
      before: { sourceType: null, sourceId: null },
      after: { sourceType: null, sourceId: null },
      effectivePlaylistId: null,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  logs.push(`[BroadcastEnforcer] Location: ${location.name}, Device: ${yodeckDeviceId}`);
  
  // Get BEFORE state
  const beforeState = await fetchFreshScreenContent(yodeckDeviceId);
  logs.push(`[BroadcastEnforcer] Before: ${beforeState.sourceType}/${beforeState.sourceId}`);
  
  // Compute effective playlist
  const effective = computeEffectivePlaybackSource(
    { combinedPlaylistId: location.combinedPlaylistId, yodeckPlaylistId: location.yodeckPlaylistId },
    beforeState.sourceId
  );
  
  if (!effective.playlistId) {
    logs.push(`[BroadcastEnforcer] ✗ Geen effectieve playlist (combinedPlaylistId en yodeckPlaylistId zijn null)`);
    return {
      ok: false,
      before: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      after: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      effectivePlaylistId: null,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  logs.push(`[BroadcastEnforcer] Effective playlist: ${effective.playlistId} (from ${effective.source})`);
  
  // Force screen to playlist
  const forceResult = await forceScreenToPlaylist(yodeckDeviceId, effective.playlistId, logs);
  
  if (!forceResult.ok) {
    logs.push(`[BroadcastEnforcer] ✗ Force failed`);
    return {
      ok: false,
      before: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      after: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      effectivePlaylistId: effective.playlistId,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  // Verify AFTER state
  logs.push(`[Verify] Fetching fresh screen content...`);
  const afterState = await fetchFreshScreenContent(yodeckDeviceId);
  logs.push(`[Verify] After: ${afterState.sourceType}/${afterState.sourceId}`);
  
  const sourceMatchesTarget = afterState.sourceId === effective.playlistId;
  if (!sourceMatchesTarget) {
    logs.push(`[Verify] ⚠️ MISMATCH: expected ${effective.playlistId}, got ${afterState.sourceId}`);
  } else {
    logs.push(`[Verify] ✓ Source matches target`);
  }
  
  // Update location in DB
  logs.push(`[BroadcastEnforcer] Updating location in DB...`);
  await db.update(locations)
    .set({
      layoutMode: "PLAYLIST",
      combinedPlaylistId: effective.playlistId,
      combinedPlaylistVerifiedAt: new Date(),
    })
    .where(eq(locations.id, locationId));
  logs.push(`[BroadcastEnforcer] ✓ Location updated: layoutMode=PLAYLIST, combinedPlaylistId=${effective.playlistId}`);
  
  // Get playlist item count
  const playlistResult = await yodeckRequest<{ items?: any[] }>(`/playlists/${effective.playlistId}/`);
  const playlistItemCount = playlistResult.ok && playlistResult.data?.items 
    ? playlistResult.data.items.length 
    : 0;
  logs.push(`[Verify] Playlist heeft ${playlistItemCount} items`);
  
  // Ensure known-good media (OPTIONAL - verification passes if itemCount > 0)
  const knownGoodResult = await ensureKnownGoodMedia(logs);
  let knownGoodMediaId: string | null = null;
  let knownGoodPresent = false;
  
  if (knownGoodResult.ok && knownGoodResult.mediaId) {
    knownGoodMediaId = knownGoodResult.mediaId;
    
    // Add to playlist if not present
    const addResult = await ensureMediaInPlaylist(effective.playlistId, knownGoodMediaId, logs);
    knownGoodPresent = addResult.ok;
  } else if (playlistItemCount > 0) {
    // KnownGood upload failed but playlist has items - this is acceptable
    logs.push(`[KnownGood] ⚠️ Upload optioneel - playlist heeft ${playlistItemCount} bestaande items`);
  }
  
  // Final verification - OK if source matches AND playlist has content
  // KnownGood is OPTIONAL - verification passes when itemCount > 0
  const verificationOk = sourceMatchesTarget && playlistItemCount > 0;
  
  logs.push(`[BroadcastEnforcer] ═══════════════════════════════════════`);
  logs.push(`[BroadcastEnforcer] ${verificationOk ? "✓ SUCCES" : "⚠️ WAARSCHUWING"} - Enforce afgerond`);
  logs.push(`[BroadcastEnforcer] Playlist: ${effective.playlistId}, Items: ${playlistItemCount}, KnownGood: ${knownGoodPresent ? "JA" : "NEE (optioneel)"}`);
  
  return {
    ok: verificationOk,
    before: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
    after: { sourceType: afterState.sourceType, sourceId: afterState.sourceId },
    effectivePlaylistId: effective.playlistId,
    playlistItemCount,
    knownGoodMediaId,
    knownGoodPresent,
    verificationOk,
    logs,
  };
}

/**
 * Run Broadcast Enforcer for a screen by screenId
 * Uses screen's yodeckPlayerId directly (not location.yodeckDeviceId)
 */
export async function enforceBroadcastForScreen(screenId: string): Promise<BroadcastEnforcerResult> {
  const logs: string[] = [];
  logs.push(`[BroadcastEnforcer] ═══════════════════════════════════════`);
  logs.push(`[BroadcastEnforcer] Looking up screen ${screenId}...`);
  
  // Get screen with location
  const [screen] = await db.select({
    id: screens.id,
    name: screens.name,
    locationId: screens.locationId,
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(eq(screens.id, screenId));
  
  if (!screen) {
    logs.push(`[BroadcastEnforcer] ✗ Screen niet gevonden`);
    return {
      ok: false,
      before: { sourceType: null, sourceId: null },
      after: { sourceType: null, sourceId: null },
      effectivePlaylistId: null,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  const yodeckDeviceId = screen.yodeckPlayerId;
  if (!yodeckDeviceId) {
    logs.push(`[BroadcastEnforcer] ✗ Screen heeft geen yodeckPlayerId`);
    return {
      ok: false,
      before: { sourceType: null, sourceId: null },
      after: { sourceType: null, sourceId: null },
      effectivePlaylistId: null,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  logs.push(`[BroadcastEnforcer] Screen: ${screen.name}, YodeckPlayer: ${yodeckDeviceId}`);
  
  // Get location for playlist IDs
  let location: { combinedPlaylistId: string | null; yodeckPlaylistId: string | null } | null = null;
  if (screen.locationId) {
    const [loc] = await db.select({
      combinedPlaylistId: locations.combinedPlaylistId,
      yodeckPlaylistId: locations.yodeckPlaylistId,
    }).from(locations).where(eq(locations.id, screen.locationId));
    location = loc || null;
    logs.push(`[BroadcastEnforcer] Location: ${screen.locationId}, combinedPlaylistId: ${location?.combinedPlaylistId || 'null'}`);
  }
  
  // Get BEFORE state
  const beforeState = await fetchFreshScreenContent(yodeckDeviceId);
  logs.push(`[BroadcastEnforcer] Before: ${beforeState.sourceType}/${beforeState.sourceId}`);
  
  // Compute effective playlist
  const effective = computeEffectivePlaybackSource(
    location || { combinedPlaylistId: null, yodeckPlaylistId: null },
    beforeState.sourceId
  );
  
  if (!effective.playlistId) {
    logs.push(`[BroadcastEnforcer] ✗ Geen effectieve playlist (combinedPlaylistId, yodeckPlaylistId en actual zijn null)`);
    return {
      ok: false,
      before: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      after: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      effectivePlaylistId: null,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  logs.push(`[BroadcastEnforcer] Effective playlist: ${effective.playlistId} (from ${effective.source})`);
  
  // Force screen to playlist
  const forceResult = await forceScreenToPlaylist(yodeckDeviceId, effective.playlistId, logs);
  
  if (!forceResult.ok) {
    logs.push(`[BroadcastEnforcer] ✗ Force failed`);
    return {
      ok: false,
      before: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      after: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
      effectivePlaylistId: effective.playlistId,
      playlistItemCount: 0,
      knownGoodMediaId: null,
      knownGoodPresent: false,
      verificationOk: false,
      logs,
    };
  }
  
  // Verify AFTER state
  logs.push(`[Verify] Fetching fresh screen content...`);
  const afterState = await fetchFreshScreenContent(yodeckDeviceId);
  logs.push(`[Verify] After: ${afterState.sourceType}/${afterState.sourceId}`);
  
  const sourceMatchesTarget = afterState.sourceId === effective.playlistId;
  if (!sourceMatchesTarget) {
    logs.push(`[Verify] ⚠️ MISMATCH: expected ${effective.playlistId}, got ${afterState.sourceId}`);
  } else {
    logs.push(`[Verify] ✓ Source matches target`);
  }
  
  // Update location in DB if we have one
  if (screen.locationId) {
    logs.push(`[BroadcastEnforcer] Updating location in DB...`);
    await db.update(locations)
      .set({
        layoutMode: "PLAYLIST",
        combinedPlaylistId: effective.playlistId,
        combinedPlaylistVerifiedAt: new Date(),
      })
      .where(eq(locations.id, screen.locationId));
    logs.push(`[BroadcastEnforcer] ✓ Location updated: layoutMode=PLAYLIST, combinedPlaylistId=${effective.playlistId}`);
  }
  
  // Get playlist item count
  const playlistResult = await yodeckRequest<{ items?: any[] }>(`/playlists/${effective.playlistId}/`);
  const playlistItemCount = playlistResult.ok && playlistResult.data?.items 
    ? playlistResult.data.items.length 
    : 0;
  logs.push(`[Verify] Playlist heeft ${playlistItemCount} items`);
  
  // Ensure known-good media (OPTIONAL - verification passes if itemCount > 0)
  const knownGoodResult = await ensureKnownGoodMedia(logs);
  let knownGoodMediaId: string | null = null;
  let knownGoodPresent = false;
  
  if (knownGoodResult.ok && knownGoodResult.mediaId) {
    knownGoodMediaId = knownGoodResult.mediaId;
    
    // Add to playlist if not present
    const addResult = await ensureMediaInPlaylist(effective.playlistId, knownGoodMediaId, logs);
    knownGoodPresent = addResult.ok;
  } else if (playlistItemCount > 0) {
    // KnownGood upload failed but playlist has items - this is acceptable
    logs.push(`[KnownGood] ⚠️ Upload optioneel - playlist heeft ${playlistItemCount} bestaande items`);
  }
  
  // Final verification - OK if source matches AND playlist has content
  // KnownGood is OPTIONAL - verification passes when itemCount > 0
  const verificationOk = sourceMatchesTarget && playlistItemCount > 0;
  
  logs.push(`[BroadcastEnforcer] ═══════════════════════════════════════`);
  logs.push(`[BroadcastEnforcer] ${verificationOk ? "✓ SUCCES" : "⚠️ WAARSCHUWING"} - Enforce afgerond`);
  logs.push(`[BroadcastEnforcer] Playlist: ${effective.playlistId}, Items: ${playlistItemCount}, KnownGood: ${knownGoodPresent ? "JA" : "NEE (optioneel)"}`);
  
  return {
    ok: verificationOk,
    before: { sourceType: beforeState.sourceType, sourceId: beforeState.sourceId },
    after: { sourceType: afterState.sourceType, sourceId: afterState.sourceId },
    effectivePlaylistId: effective.playlistId,
    playlistItemCount,
    knownGoodMediaId,
    knownGoodPresent,
    verificationOk,
    logs,
  };
}
