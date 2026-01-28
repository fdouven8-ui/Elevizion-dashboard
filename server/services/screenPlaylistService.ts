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
import { screens, placements, contracts, adAssets, systemSettings } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { yodeckRequest } from "./yodeckLayoutService";
import { getYodeckDeviceStatus, UnifiedDeviceStatus } from "./unifiedDeviceStatusService";

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
  }).from(screens).where(eq(screens.id, screenId));
  
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
  
  // Verification is OK if:
  // 1. Screen has a playlist assigned
  // 2. Playlist has content (itemCount > 0)
  const verificationOk = playlistId !== null && hasContent;
  
  // Mismatch warning (not failure) - only show if playlist doesn't look like our managed one
  const isElevizionPlaylist = playlistName?.toLowerCase().includes("elevizion");
  const mismatch = playlistName !== null && !isElevizionPlaylist;
  
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
  } else if (!baselineConfigured && verificationOk) {
    // Content playing but baseline not configured - INFO level only (not an error)
    mismatchReason = "Baseline playlist niet geconfigureerd - baseline telling onbekend";
    mismatchLevel = "info";
  } else if (mismatch && verificationOk) {
    // Playlist playing but not an Elevizion playlist - warning
    mismatchReason = `Let op: playlist heet "${playlistName}"`;
    mismatchLevel = "warning";
  }
  
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
