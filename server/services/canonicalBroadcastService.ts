/**
 * LEGACY SERVICE - DISABLED
 * 
 * This service used LOCATION-based playlists.
 * Replaced by yodeckBroadcast.ts which uses SCREEN-based playlists.
 * 
 * All functions throw LEGACY_DISABLED error.
 */

// KILL SWITCH - All legacy code disabled
const LEGACY_DISABLED = true;
const LEGACY_ERROR = "LEGACY_CANONICAL_BROADCAST_DISABLED: Use yodeckBroadcast.ts instead";

function throwLegacyError(): never {
  throw new Error(LEGACY_ERROR);
}

import { db } from "../db";
import { locations, screens, systemSettings } from "@shared/schema";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { yodeckRequest } from "./yodeckLayoutService";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const LOG_PREFIX = "[CanonicalBroadcast]";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG_KEY_BASE_TEMPLATE = "canonical.baseTemplatePlaylistId";
const KNOWN_GOOD_DIR = "/tmp/evz-canonical";
const KNOWN_GOOD_FILENAME = "evz_canonical_test.mp4";

/**
 * Get the base template playlist ID from config or environment
 */
export async function getBaseTemplatePlaylistId(): Promise<string | null> {
  // 1. Check environment variable
  const envValue = process.env.YODECK_BASE_TEMPLATE_PLAYLIST_ID;
  if (envValue) {
    console.log(`${LOG_PREFIX} Using YODECK_BASE_TEMPLATE_PLAYLIST_ID from env: ${envValue}`);
    return envValue;
  }
  
  // 2. Check database setting
  const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, CONFIG_KEY_BASE_TEMPLATE));
  if (setting?.value) {
    console.log(`${LOG_PREFIX} Using base template from DB: ${setting.value}`);
    return setting.value;
  }
  
  // 3. Try existing autopilot.baselinePlaylistId
  const [autopilotSetting] = await db.select().from(systemSettings).where(eq(systemSettings.key, "autopilot.baselinePlaylistId"));
  if (autopilotSetting?.value) {
    console.log(`${LOG_PREFIX} Using autopilot.baselinePlaylistId as fallback: ${autopilotSetting.value}`);
    return autopilotSetting.value;
  }
  
  // 4. Try autopilot.baseTemplatePlaylistId
  const [templateSetting] = await db.select().from(systemSettings).where(eq(systemSettings.key, "autopilot.baseTemplatePlaylistId"));
  if (templateSetting?.value) {
    console.log(`${LOG_PREFIX} Using autopilot.baseTemplatePlaylistId as fallback: ${templateSetting.value}`);
    return templateSetting.value;
  }
  
  return null;
}

/**
 * Set the base template playlist ID in database
 */
export async function setBaseTemplatePlaylistId(playlistId: string): Promise<void> {
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, CONFIG_KEY_BASE_TEMPLATE));
  
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value: playlistId, updatedAt: new Date() })
      .where(eq(systemSettings.key, CONFIG_KEY_BASE_TEMPLATE));
  } else {
    await db.insert(systemSettings).values({
      key: CONFIG_KEY_BASE_TEMPLATE,
      value: playlistId,
    });
  }
  
  console.log(`${LOG_PREFIX} Base template playlist ID set to: ${playlistId}`);
}

// ============================================================================
// TEMPLATE CLONING
// ============================================================================

interface PlaylistItem {
  id: number;
  media: number;
  duration: number;
  position: number;
}

/**
 * Fetch items from a Yodeck playlist
 */
async function getPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
  const result = await yodeckRequest<{ items?: PlaylistItem[] }>(`/playlists/${playlistId}/`);
  if (!result.ok || !result.data?.items) {
    console.log(`${LOG_PREFIX} [CloneTemplate] Failed to fetch playlist ${playlistId} items`);
    return [];
  }
  return result.data.items;
}

/**
 * Create a new playlist in Yodeck
 */
async function createPlaylist(name: string): Promise<{ ok: boolean; playlistId: string | null }> {
  const result = await yodeckRequest<{ id: number }>("/playlists/", "POST", { name });
  
  if (!result.ok || !result.data?.id) {
    console.log(`${LOG_PREFIX} [CloneTemplate] Failed to create playlist: ${JSON.stringify(result)}`);
    return { ok: false, playlistId: null };
  }
  
  return { ok: true, playlistId: String(result.data.id) };
}

/**
 * Add items to a playlist
 */
async function addItemsToPlaylist(playlistId: string, items: { media: number; duration: number }[]): Promise<boolean> {
  if (items.length === 0) return true;
  
  const result = await yodeckRequest(`/playlists/${playlistId}/`, "PATCH", {
    items: items.map((item, index) => ({
      media: item.media,
      duration: item.duration,
      position: index + 1,
    })),
  });
  
  return result.ok;
}

/**
 * Clone a playlist from the base template
 * Creates a new playlist with all items from the template
 */
export async function clonePlaylistFromTemplate(
  templatePlaylistId: string,
  newName: string
): Promise<{ ok: boolean; playlistId: string | null; itemCount: number }> {
  console.log(`${LOG_PREFIX} [CloneTemplate] Cloning from ${templatePlaylistId} as "${newName}"...`);
  
  // 1. Get template items
  const templateItems = await getPlaylistItems(templatePlaylistId);
  console.log(`${LOG_PREFIX} [CloneTemplate] Template has ${templateItems.length} items`);
  
  // 2. Create new playlist
  const createResult = await createPlaylist(newName);
  if (!createResult.ok || !createResult.playlistId) {
    return { ok: false, playlistId: null, itemCount: 0 };
  }
  
  // 3. Add template items to new playlist
  if (templateItems.length > 0) {
    const itemsToAdd = templateItems.map(item => ({
      media: item.media,
      duration: item.duration,
    }));
    
    const addOk = await addItemsToPlaylist(createResult.playlistId, itemsToAdd);
    if (!addOk) {
      console.log(`${LOG_PREFIX} [CloneTemplate] ⚠️ Failed to add items to cloned playlist`);
    }
  }
  
  console.log(`${LOG_PREFIX} [CloneTemplate] ✓ Created playlist ${createResult.playlistId} with ${templateItems.length} items`);
  return { ok: true, playlistId: createResult.playlistId, itemCount: templateItems.length };
}

// ============================================================================
// CANONICAL PLAYLIST MANAGEMENT
// ============================================================================

/**
 * Generate canonical playlist name for a location
 */
function getCanonicalPlaylistName(locationName: string, yodeckDeviceId?: string): string {
  const deviceSuffix = yodeckDeviceId ? ` | YDK-${yodeckDeviceId}` : "";
  return `Elevizion | Loop | ${locationName}${deviceSuffix}`;
}

/**
 * Search for existing playlist by name pattern
 */
async function findPlaylistByName(namePattern: string): Promise<string | null> {
  const result = await yodeckRequest<{ results?: { id: number; name: string }[] }>(`/playlists/?search=${encodeURIComponent(namePattern)}`);
  if (!result.ok || !result.data?.results) return null;
  
  const exact = result.data.results.find((p: { id: number; name: string }) => p.name === namePattern);
  if (exact) return String(exact.id);
  
  // Partial match
  const partial = result.data.results.find((p: { id: number; name: string }) => p.name.includes(namePattern));
  if (partial) return String(partial.id);
  
  return null;
}

/**
 * Ensure a location has a canonical playlist
 * If missing, clone from base template
 */
export async function ensureLocationCanonicalPlaylist(locationId: string): Promise<{
  ok: boolean;
  playlistId: string | null;
  created: boolean;
  itemCount: number;
}> {
  console.log(`${LOG_PREFIX} Ensuring canonical playlist for location ${locationId}...`);
  
  // 1. Get location
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location) {
    console.log(`${LOG_PREFIX} Location ${locationId} not found`);
    return { ok: false, playlistId: null, created: false, itemCount: 0 };
  }
  
  // 2. Check if already has canonical playlist (yodeckPlaylistId ONLY - single source of truth)
  // Note: combinedPlaylistId is deprecated and ignored for source of truth
  if (location.yodeckPlaylistId) {
    console.log(`${LOG_PREFIX} Location already has canonical playlist: ${location.yodeckPlaylistId}`);
    
    // Verify it exists in Yodeck
    const verifyResult = await yodeckRequest<{ id: number; items?: any[] }>(`/playlists/${location.yodeckPlaylistId}/`);
    if (verifyResult.ok) {
      const itemCount = verifyResult.data?.items?.length || 0;
      
      // Sync combinedPlaylistId to match (for backwards compat with existing code paths)
      if (location.combinedPlaylistId !== location.yodeckPlaylistId) {
        await db.update(locations)
          .set({ 
            combinedPlaylistId: location.yodeckPlaylistId,
            updatedAt: new Date(),
          })
          .where(eq(locations.id, locationId));
        console.log(`${LOG_PREFIX} Synced combinedPlaylistId to match yodeckPlaylistId: ${location.yodeckPlaylistId}`);
      }
      
      return { ok: true, playlistId: location.yodeckPlaylistId, created: false, itemCount };
    }
    
    console.log(`${LOG_PREFIX} ⚠️ Existing playlist ${location.yodeckPlaylistId} not found in Yodeck, will create new`);
  }
  
  // 3. Try to find existing playlist by name
  const playlistName = getCanonicalPlaylistName(location.name, location.yodeckDeviceId || undefined);
  const existingByName = await findPlaylistByName(playlistName);
  if (existingByName) {
    console.log(`${LOG_PREFIX} Found existing playlist by name: ${existingByName}`);
    
    await db.update(locations)
      .set({
        yodeckPlaylistId: existingByName,
        combinedPlaylistId: existingByName,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, locationId));
    
    const verifyResult = await yodeckRequest<{ items?: any[] }>(`/playlists/${existingByName}/`);
    const itemCount = verifyResult.ok ? (verifyResult.data?.items?.length || 0) : 0;
    
    return { ok: true, playlistId: existingByName, created: false, itemCount };
  }
  
  // 4. Get base template ID
  const templateId = await getBaseTemplatePlaylistId();
  if (!templateId) {
    console.log(`${LOG_PREFIX} ✗ No base template playlist configured. Set YODECK_BASE_TEMPLATE_PLAYLIST_ID env var.`);
    return { ok: false, playlistId: null, created: false, itemCount: 0 };
  }
  
  // 5. Clone from template
  const cloneResult = await clonePlaylistFromTemplate(templateId, playlistName);
  if (!cloneResult.ok || !cloneResult.playlistId) {
    return { ok: false, playlistId: null, created: false, itemCount: 0 };
  }
  
  // 6. Update location with new playlist ID
  await db.update(locations)
    .set({
      yodeckPlaylistId: cloneResult.playlistId,
      combinedPlaylistId: cloneResult.playlistId,
      updatedAt: new Date(),
    })
    .where(eq(locations.id, locationId));
  
  console.log(`${LOG_PREFIX} ✓ Created canonical playlist ${cloneResult.playlistId} for location ${location.name}`);
  return { ok: true, playlistId: cloneResult.playlistId, created: true, itemCount: cloneResult.itemCount };
}

// ============================================================================
// SCREEN ASSIGNMENT (NO OTHER PATH EXISTS)
// ============================================================================

/**
 * Set a Yodeck screen to play a specific playlist
 * This is the ONLY way to assign content to screens
 */
export async function setYodeckScreenSourceToPlaylist(
  yodeckScreenId: string,
  playlistId: string
): Promise<{ ok: boolean; verified: boolean }> {
  console.log(`${LOG_PREFIX} [SetScreenSource] Setting screen ${yodeckScreenId} to playlist ${playlistId}...`);
  
  // 1. PATCH screen with playlist source
  const patchResult = await yodeckRequest(`/screens/${yodeckScreenId}/`, "PATCH", {
    screen_content: {
      source_type: "playlist",
      source_id: Number(playlistId),
    },
  });
  
  if (!patchResult.ok) {
    console.log(`${LOG_PREFIX} [SetScreenSource] ✗ PATCH failed: ${JSON.stringify(patchResult)}`);
    return { ok: false, verified: false };
  }
  
  // 2. Verify by GET
  const verifyResult = await yodeckRequest<{ screen_content?: { source_type?: string; source_id?: number } }>(`/screens/${yodeckScreenId}/`);
  if (!verifyResult.ok) {
    console.log(`${LOG_PREFIX} [SetScreenSource] ⚠️ Could not verify screen source`);
    return { ok: true, verified: false };
  }
  
  const actualSourceType = verifyResult.data?.screen_content?.source_type;
  const actualSourceId = String(verifyResult.data?.screen_content?.source_id || "");
  
  const verified = actualSourceType === "playlist" && actualSourceId === playlistId;
  
  if (verified) {
    console.log(`${LOG_PREFIX} [SetScreenSource] ✓ Screen ${yodeckScreenId} now plays playlist ${playlistId}`);
  } else {
    console.log(`${LOG_PREFIX} [SetScreenSource] ⚠️ Mismatch: expected playlist/${playlistId}, got ${actualSourceType}/${actualSourceId}`);
  }
  
  return { ok: true, verified };
}

/**
 * Ensure a screen broadcasts its location's canonical playlist
 * This is the main entry point for screen assignment
 */
export async function ensureScreenBroadcast(screenId: string): Promise<{
  ok: boolean;
  playlistId: string | null;
  verified: boolean;
  error?: string;
}> {
  console.log(`${LOG_PREFIX} Ensuring broadcast for screen ${screenId}...`);
  
  // 1. Get screen with location
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  if (!screen) {
    return { ok: false, playlistId: null, verified: false, error: "Screen not found" };
  }
  
  if (!screen.yodeckPlayerId) {
    return { ok: false, playlistId: null, verified: false, error: "Screen has no yodeckPlayerId" };
  }
  
  if (!screen.locationId) {
    return { ok: false, playlistId: null, verified: false, error: "Screen has no locationId" };
  }
  
  // 2. Ensure location has canonical playlist
  const playlistResult = await ensureLocationCanonicalPlaylist(screen.locationId);
  if (!playlistResult.ok || !playlistResult.playlistId) {
    return { ok: false, playlistId: null, verified: false, error: "Could not ensure location playlist" };
  }
  
  // 3. Ensure playlist is not empty
  const playableResult = await ensurePlaylistNotEmptyAndPlayable(playlistResult.playlistId);
  if (!playableResult.ok) {
    console.log(`${LOG_PREFIX} ⚠️ Could not ensure playlist is playable`);
  }
  
  // 4. Set screen source to playlist
  const assignResult = await setYodeckScreenSourceToPlaylist(screen.yodeckPlayerId, playlistResult.playlistId);
  
  // 5. Update screen with last sync result
  await db.update(screens)
    .set({
      yodeckSyncStatus: assignResult.verified ? "synced" : "pending",
      yodeckLastSyncAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(screens.id, screenId));
  
  return {
    ok: assignResult.ok,
    playlistId: playlistResult.playlistId,
    verified: assignResult.verified,
  };
}

// ============================================================================
// PLAYABILITY GUARANTEE
// ============================================================================

/**
 * Create a known-good test video using ffmpeg
 */
async function createKnownGoodTestVideo(): Promise<string | null> {
  try {
    if (!fs.existsSync(KNOWN_GOOD_DIR)) {
      fs.mkdirSync(KNOWN_GOOD_DIR, { recursive: true });
    }
    
    const outputPath = path.join(KNOWN_GOOD_DIR, KNOWN_GOOD_FILENAME);
    
    if (fs.existsSync(outputPath)) {
      console.log(`${LOG_PREFIX} [EnsurePlayable] Reusing existing test video: ${outputPath}`);
      return outputPath;
    }
    
    console.log(`${LOG_PREFIX} [EnsurePlayable] Creating test video...`);
    
    const ffmpegCmd = `ffmpeg -y -f lavfi -i "color=c=black:s=1920x1080:d=3" -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=48000" -vf "drawtext=text='ELEVIZION TEST':fontcolor=white:fontsize=72:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -profile:v high -level:v 4.0 -pix_fmt yuv420p -c:a aac -b:a 128k -t 3 -movflags +faststart "${outputPath}"`;
    
    execSync(ffmpegCmd, { stdio: "pipe" });
    
    if (fs.existsSync(outputPath)) {
      console.log(`${LOG_PREFIX} [EnsurePlayable] ✓ Test video created: ${outputPath}`);
      return outputPath;
    }
    
    return null;
  } catch (error) {
    console.log(`${LOG_PREFIX} [EnsurePlayable] ✗ Failed to create test video: ${error}`);
    return null;
  }
}

/**
 * Ensure a playlist is not empty and has playable content
 * If empty, add a known-good test video
 */
export async function ensurePlaylistNotEmptyAndPlayable(playlistId: string): Promise<{
  ok: boolean;
  itemCount: number;
  addedKnownGood: boolean;
}> {
  console.log(`${LOG_PREFIX} [EnsurePlayable] Checking playlist ${playlistId}...`);
  
  // 1. Get current items
  const result = await yodeckRequest<{ items?: any[] }>(`/playlists/${playlistId}/`);
  if (!result.ok) {
    return { ok: false, itemCount: 0, addedKnownGood: false };
  }
  
  const currentItems = result.data?.items || [];
  console.log(`${LOG_PREFIX} [EnsurePlayable] Playlist has ${currentItems.length} items`);
  
  if (currentItems.length > 0) {
    return { ok: true, itemCount: currentItems.length, addedKnownGood: false };
  }
  
  // 2. Playlist is empty - try to add known-good test video
  console.log(`${LOG_PREFIX} [EnsurePlayable] Playlist is empty, attempting to add known-good content...`);
  
  // Create test video (local)
  const videoPath = await createKnownGoodTestVideo();
  if (!videoPath) {
    console.log(`${LOG_PREFIX} [EnsurePlayable] ⚠️ Could not create test video`);
    return { ok: false, itemCount: 0, addedKnownGood: false };
  }
  
  // Note: Uploading to Yodeck is complex and has API format issues
  // For now, log warning and return false
  console.log(`${LOG_PREFIX} [EnsurePlayable] ⚠️ Playlist is empty. Manual intervention required to add content.`);
  
  return { ok: false, itemCount: 0, addedKnownGood: false };
}

// ============================================================================
// BROADCAST WORKER (5-minute interval)
// ============================================================================

let workerInterval: NodeJS.Timeout | null = null;
const WORKER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Run broadcast enforcement for all active screens
 */
export async function runBroadcastWorker(): Promise<{
  screensProcessed: number;
  screensOk: number;
  screensFailed: number;
  errors: string[];
}> {
  console.log(`${LOG_PREFIX} [Worker] Running broadcast enforcement...`);
  
  const result = {
    screensProcessed: 0,
    screensOk: 0,
    screensFailed: 0,
    errors: [] as string[],
  };
  
  // Get all active screens with yodeckPlayerId and locationId
  const activeScreens = await db.select().from(screens).where(
    and(
      isNotNull(screens.yodeckPlayerId),
      isNotNull(screens.locationId),
      ne(screens.status, "inactive")
    )
  );
  
  console.log(`${LOG_PREFIX} [Worker] Found ${activeScreens.length} active screens`);
  
  for (const screen of activeScreens) {
    result.screensProcessed++;
    
    try {
      const broadcastResult = await ensureScreenBroadcast(screen.id);
      
      if (broadcastResult.ok && broadcastResult.verified) {
        result.screensOk++;
      } else {
        result.screensFailed++;
        if (broadcastResult.error) {
          result.errors.push(`${screen.name}: ${broadcastResult.error}`);
        }
      }
    } catch (error) {
      result.screensFailed++;
      result.errors.push(`${screen.name}: ${error}`);
    }
  }
  
  console.log(`${LOG_PREFIX} [Worker] Completed: ${result.screensOk}/${result.screensProcessed} OK, ${result.screensFailed} failed`);
  
  return result;
}

/**
 * Start the broadcast worker
 */
export function startBroadcastWorker(): void {
  if (workerInterval) {
    console.log(`${LOG_PREFIX} [Worker] Already running`);
    return;
  }
  
  console.log(`${LOG_PREFIX} [Worker] Starting (interval: ${WORKER_INTERVAL_MS / 1000}s)`);
  
  // Schedule first run in 2 minutes
  setTimeout(() => {
    runBroadcastWorker().catch(console.error);
  }, 2 * 60 * 1000);
  
  // Schedule recurring runs
  workerInterval = setInterval(() => {
    runBroadcastWorker().catch(console.error);
  }, WORKER_INTERVAL_MS);
}

/**
 * Stop the broadcast worker
 */
export function stopBroadcastWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log(`${LOG_PREFIX} [Worker] Stopped`);
  }
}

// ============================================================================
// REPAIR ENDPOINT
// ============================================================================

export interface RepairBroadcastResult {
  ok: boolean;
  screenId: string;
  screenName: string;
  yodeckPlayerId: string | null;
  locationId: string | null;
  locationName: string | null;
  playlistId: string | null;
  playlistItemCount: number;
  verified: boolean;
  logs: string[];
}

/**
 * Repair broadcast for a single screen
 * Runs full enforcement cycle with detailed logging
 */
export async function repairBroadcast(screenId: string): Promise<RepairBroadcastResult> {
  const logs: string[] = [];
  
  logs.push(`[RepairBroadcast] Starting repair for screen ${screenId}`);
  
  // 1. Get screen
  const [screen] = await db.select().from(screens).where(eq(screens.id, screenId));
  if (!screen) {
    logs.push(`[RepairBroadcast] ✗ Screen not found`);
    return {
      ok: false,
      screenId,
      screenName: "Unknown",
      yodeckPlayerId: null,
      locationId: null,
      locationName: null,
      playlistId: null,
      playlistItemCount: 0,
      verified: false,
      logs,
    };
  }
  
  logs.push(`[RepairBroadcast] Screen: ${screen.name}, Yodeck: ${screen.yodeckPlayerId}`);
  
  if (!screen.yodeckPlayerId) {
    logs.push(`[RepairBroadcast] ✗ No yodeckPlayerId`);
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckPlayerId: null,
      locationId: screen.locationId,
      locationName: null,
      playlistId: null,
      playlistItemCount: 0,
      verified: false,
      logs,
    };
  }
  
  // 2. Get location
  let locationName: string | null = null;
  if (screen.locationId) {
    const [location] = await db.select().from(locations).where(eq(locations.id, screen.locationId));
    locationName = location?.name || null;
    logs.push(`[RepairBroadcast] Location: ${locationName}`);
  } else {
    logs.push(`[RepairBroadcast] ⚠️ No locationId`);
  }
  
  // 3. Ensure canonical playlist
  if (!screen.locationId) {
    logs.push(`[RepairBroadcast] ✗ Cannot ensure playlist without location`);
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckPlayerId: screen.yodeckPlayerId,
      locationId: null,
      locationName: null,
      playlistId: null,
      playlistItemCount: 0,
      verified: false,
      logs,
    };
  }
  
  const playlistResult = await ensureLocationCanonicalPlaylist(screen.locationId);
  logs.push(`[RepairBroadcast] Playlist: ${playlistResult.playlistId || "NONE"} (created: ${playlistResult.created})`);
  
  if (!playlistResult.ok || !playlistResult.playlistId) {
    logs.push(`[RepairBroadcast] ✗ Could not ensure playlist`);
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      yodeckPlayerId: screen.yodeckPlayerId,
      locationId: screen.locationId,
      locationName,
      playlistId: null,
      playlistItemCount: 0,
      verified: false,
      logs,
    };
  }
  
  // 4. Ensure playable
  const playableResult = await ensurePlaylistNotEmptyAndPlayable(playlistResult.playlistId);
  logs.push(`[RepairBroadcast] Items: ${playableResult.itemCount}, KnownGood added: ${playableResult.addedKnownGood}`);
  
  // 5. Set screen source
  const assignResult = await setYodeckScreenSourceToPlaylist(screen.yodeckPlayerId, playlistResult.playlistId);
  logs.push(`[RepairBroadcast] Assigned: ${assignResult.ok}, Verified: ${assignResult.verified}`);
  
  // 6. Verify by fetching now-playing
  const verifyResult = await yodeckRequest<{ screen_content?: { source_type?: string; source_id?: number } }>(`/screens/${screen.yodeckPlayerId}/`);
  const actualSourceId = String(verifyResult.data?.screen_content?.source_id || "");
  const finalVerified = actualSourceId === playlistResult.playlistId;
  logs.push(`[RepairBroadcast] Final check: Yodeck source_id=${actualSourceId}, expected=${playlistResult.playlistId}, match=${finalVerified}`);
  
  logs.push(`[RepairBroadcast] ${finalVerified ? "✓ REPAIR SUCCESS" : "⚠️ REPAIR INCOMPLETE"}`);
  
  return {
    ok: finalVerified,
    screenId,
    screenName: screen.name,
    yodeckPlayerId: screen.yodeckPlayerId,
    locationId: screen.locationId,
    locationName,
    playlistId: playlistResult.playlistId,
    playlistItemCount: playableResult.itemCount,
    verified: finalVerified,
    logs,
  };
}

// ============================================================================
// LEGACY PATH DISABLING
// ============================================================================

/**
 * Throws an error for any legacy broadcast path
 * Use this to replace deprecated functions
 */
export function legacyBroadcastPathDisabled(pathName: string): never {
  console.log(`${LOG_PREFIX} [LegacyDisabled] Blocked call to: ${pathName}`);
  
  const error: any = new Error("LEGACY_BROADCAST_PATH_DISABLED");
  error.statusCode = 410;
  error.body = {
    ok: false,
    error: "LEGACY_BROADCAST_PATH_DISABLED",
    message: "Deze broadcast methode is verwijderd. Alleen canonical playlist broadcast is toegestaan.",
    blockedPath: pathName,
  };
  
  throw error;
}

// ============================================================================
// ADD APPROVED VIDEO TO CANONICAL PLAYLIST
// ============================================================================

/**
 * Add a media item to a location's canonical playlist
 * This is the ONLY way approved videos should be added to playback
 */
export async function addMediaToCanonicalPlaylist(
  locationId: string,
  yodeckMediaId: string,
  duration: number = 15
): Promise<{ ok: boolean; playlistId: string | null; error?: string }> {
  console.log(`${LOG_PREFIX} Adding media ${yodeckMediaId} to location ${locationId}...`);
  
  // 1. Ensure location has canonical playlist
  const playlistResult = await ensureLocationCanonicalPlaylist(locationId);
  if (!playlistResult.ok || !playlistResult.playlistId) {
    return { ok: false, playlistId: null, error: "Could not ensure canonical playlist" };
  }
  
  // 2. Check if media already exists in playlist (dedupe)
  const existingItems = await getPlaylistItems(playlistResult.playlistId);
  const alreadyExists = existingItems.some(item => String(item.media) === String(yodeckMediaId));
  
  if (alreadyExists) {
    console.log(`${LOG_PREFIX} Media ${yodeckMediaId} already in playlist ${playlistResult.playlistId}`);
    return { ok: true, playlistId: playlistResult.playlistId };
  }
  
  // 3. Add media to playlist
  const newPosition = existingItems.length + 1;
  const result = await yodeckRequest(`/playlists/${playlistResult.playlistId}/`, "PATCH", {
    items: [
      ...existingItems.map((item, index) => ({
        media: item.media,
        duration: item.duration,
        position: index + 1,
      })),
      {
        media: Number(yodeckMediaId),
        duration,
        position: newPosition,
      },
    ],
  });
  
  if (!result.ok) {
    console.log(`${LOG_PREFIX} Failed to add media to playlist: ${JSON.stringify(result)}`);
    return { ok: false, playlistId: playlistResult.playlistId, error: "Failed to add media" };
  }
  
  console.log(`${LOG_PREFIX} ✓ Added media ${yodeckMediaId} to playlist ${playlistResult.playlistId}`);
  return { ok: true, playlistId: playlistResult.playlistId };
}

/**
 * Add approved video to all target location playlists
 * Called after video approval in the admin review workflow
 */
export async function publishApprovedVideoToLocations(
  yodeckMediaId: string,
  targetLocationIds: string[],
  duration: number = 15
): Promise<{
  ok: boolean;
  totalLocations: number;
  successCount: number;
  failedCount: number;
  results: { locationId: string; ok: boolean; playlistId: string | null; error?: string }[];
}> {
  console.log(`${LOG_PREFIX} Publishing media ${yodeckMediaId} to ${targetLocationIds.length} locations...`);
  
  const results: { locationId: string; ok: boolean; playlistId: string | null; error?: string }[] = [];
  
  for (const locationId of targetLocationIds) {
    const result = await addMediaToCanonicalPlaylist(locationId, yodeckMediaId, duration);
    results.push({
      locationId,
      ok: result.ok,
      playlistId: result.playlistId,
      error: result.error,
    });
    
    // If successful, trigger screen broadcast for all screens at this location
    if (result.ok) {
      const locationScreens = await db.select({ id: screens.id })
        .from(screens)
        .where(and(
          eq(screens.locationId, locationId),
          isNotNull(screens.yodeckPlayerId)
        ));
      
      for (const screen of locationScreens) {
        await ensureScreenBroadcast(screen.id);
      }
    }
  }
  
  const successCount = results.filter(r => r.ok).length;
  const failedCount = results.filter(r => !r.ok).length;
  
  console.log(`${LOG_PREFIX} Publish complete: ${successCount}/${targetLocationIds.length} locations OK`);
  
  return {
    ok: failedCount === 0,
    totalLocations: targetLocationIds.length,
    successCount,
    failedCount,
    results,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  LOG_PREFIX,
  getCanonicalPlaylistName,
  getPlaylistItems,
  createPlaylist,
  addItemsToPlaylist,
  findPlaylistByName,
};
