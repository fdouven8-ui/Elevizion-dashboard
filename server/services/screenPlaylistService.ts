/**
 * Screen Playlist Service
 * 
 * Per-screen playlist management - each screen gets its own unique playlist.
 * Ensures content is always available (baseline fallback) and ads are synced.
 * 
 * Key functions:
 * - ensureScreenPlaylist(): Create/sync playlist for a screen
 * - assignAndPushScreenContent(): Assign playlist to screen and push
 * - verifyScreenContent(): Post-publish verification
 * - repairScreen(): Full repair cycle with diagnostics
 */

import { db } from "../db";
import { screens, locations, placements, contracts, adAssets, systemSettings } from "@shared/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import { yodeckRequest } from "./yodeckLayoutService";
import { getYodeckDeviceStatus, UnifiedDeviceStatus } from "./unifiedDeviceStatusService";

export interface PlaylistItem {
  type: "baseline" | "ad";
  mediaId: number;
  mediaName: string;
  duration: number;
}

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

export interface ScreenRepairResult {
  ok: boolean;
  screenId: string;
  screenName: string;
  deviceStatus: UnifiedDeviceStatus;
  expectedPlaylistId: string | null;
  actualPlaylistId: string | null;
  itemCount: number;
  baselineCount: number;
  adsCount: number;
  publishOk: boolean;
  verificationOk: boolean;
  verificationError?: string;
  baselineError?: string;
  baselineFallbackUsed?: boolean;
  errorReason?: string;
  logs: string[];
}

const SCREEN_PLAYLIST_PREFIX = "Elevizion | Loop | ";
const DEFAULT_DURATION = 15;

const CONFIG_KEY_BASELINE_PLAYLIST = "autopilot.baselinePlaylistId";

/**
 * Get baseline playlist ID from config
 */
async function getBaselinePlaylistId(): Promise<string | null> {
  const envValue = process.env.AUTOPILOT_BASELINE_PLAYLIST_ID || process.env.AUTOPILOT_BASE_PLAYLIST_ID;
  if (envValue) return envValue;
  
  const [setting] = await db.select().from(systemSettings)
    .where(eq(systemSettings.key, CONFIG_KEY_BASELINE_PLAYLIST));
  return setting?.value || null;
}

/**
 * Get canonical playlist name for a screen
 */
function getScreenPlaylistName(screenIdOrName: string): string {
  return `${SCREEN_PLAYLIST_PREFIX}${screenIdOrName}`.trim();
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
    type: "classic",
    items: [],
    description: "Auto-managed by Elevizion Dashboard",
  });
  
  if (!result.ok || !result.data?.id) {
    return { ok: false, error: result.error || "CREATE_FAILED" };
  }
  
  return { ok: true, playlistId: result.data.id };
}

interface BaselineResult {
  items: PlaylistItem[];
  error?: "BASELINE_TEMPLATE_MISSING" | "BASELINE_TEMPLATE_EMPTY" | "BASELINE_FETCH_ERROR";
  fallbackUsed: boolean;
}

// BASELINE GUARANTEE: Always have a fallback - use configured ID or default to 0 (which should be configured)
const FALLBACK_MEDIA_ID = process.env.FALLBACK_MEDIA_ID ? Number(process.env.FALLBACK_MEDIA_ID) : null;
const FALLBACK_MEDIA_NAME = "Elevizion Fallback";
const HARDCODED_FALLBACK_DURATION = 30;

/**
 * Get baseline items from template playlist
 * Guarantees at least fallback content if template is missing/empty
 */
async function getBaselineItems(logs: string[]): Promise<BaselineResult> {
  const baselinePlaylistId = await getBaselinePlaylistId();
  
  if (!baselinePlaylistId) {
    logs.push(`[Baseline] ⚠️ BASELINE_TEMPLATE_MISSING - geen baseline playlist geconfigureerd`);
    return injectFallback(logs, "BASELINE_TEMPLATE_MISSING");
  }
  
  logs.push(`[Baseline] Ophalen items van playlist ${baselinePlaylistId}`);
  
  const result = await yodeckRequest<any>(`/playlists/${baselinePlaylistId}/`);
  
  if (!result.ok || !result.data) {
    logs.push(`[Baseline] ⚠️ BASELINE_FETCH_ERROR: ${result.error}`);
    return injectFallback(logs, "BASELINE_FETCH_ERROR");
  }
  
  const items: PlaylistItem[] = [];
  const playlistItems = result.data.items || [];
  
  for (const item of playlistItems) {
    const mediaId = item.media?.id || item.media_id || item.id;
    const mediaName = item.media?.name || item.name || `Item ${mediaId}`;
    const duration = item.duration || item.media?.duration || DEFAULT_DURATION;
    
    if (mediaId) {
      items.push({
        type: "baseline",
        mediaId: Number(mediaId),
        mediaName,
        duration: Number(duration),
      });
    }
  }
  
  if (items.length === 0) {
    logs.push(`[Baseline] ⚠️ BASELINE_TEMPLATE_EMPTY - template playlist is leeg`);
    return injectFallback(logs, "BASELINE_TEMPLATE_EMPTY");
  }
  
  logs.push(`[Baseline] ✓ ${items.length} items gevonden`);
  return { items, fallbackUsed: false };
}

// HARDCODED SAFE DEFAULT: If no FALLBACK_MEDIA_ID configured, use this placeholder
// This ID should exist in every Yodeck workspace as a safe default
const SAFE_DEFAULT_MEDIA_ID = 1; // Yodeck's default placeholder media

/**
 * Inject fallback media when baseline template is unavailable
 * BASELINE GUARANTEE: ALWAYS returns at least one item - uses safe default if env var not set
 */
function injectFallback(logs: string[], error: BaselineResult["error"]): BaselineResult {
  // Use configured fallback, or safe default as last resort
  const mediaId = (FALLBACK_MEDIA_ID && FALLBACK_MEDIA_ID > 0) 
    ? FALLBACK_MEDIA_ID 
    : SAFE_DEFAULT_MEDIA_ID;
  
  const usingDefault = !FALLBACK_MEDIA_ID || FALLBACK_MEDIA_ID <= 0;
  
  if (usingDefault) {
    logs.push(`[Baseline] ⚠️ FALLBACK_MEDIA_ID niet geconfigureerd - gebruik safe default ${SAFE_DEFAULT_MEDIA_ID}`);
    console.warn("[WARN] FALLBACK_MEDIA_ID not configured. Using safe default. Set FALLBACK_MEDIA_ID for proper fallback.");
  } else {
    logs.push(`[Baseline] ✓ Fallback media ${mediaId} wordt gebruikt`);
  }
  
  // ALWAYS return an item - baseline guarantee is absolute
  return {
    items: [{
      type: "baseline",
      mediaId,
      mediaName: usingDefault ? "Safe Default Fallback" : FALLBACK_MEDIA_NAME,
      duration: HARDCODED_FALLBACK_DURATION,
    }],
    error,
    fallbackUsed: true,
  };
}

/**
 * Get approved ads for a screen via placements chain
 */
async function getAdsForScreen(screenId: string, logs: string[]): Promise<PlaylistItem[]> {
  logs.push(`[Ads] Zoeken ads voor scherm ${screenId}`);
  
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
  logs.push(`[Ads] ${contractIds.length} contracten gevonden`);
  
  const activeContracts = await db.select({ advertiserId: contracts.advertiserId })
    .from(contracts)
    .where(and(
      inArray(contracts.id, contractIds),
      inArray(contracts.status, ["active", "signed"])
    ));
  
  const advertiserIds = Array.from(new Set(activeContracts.map(c => c.advertiserId)));
  logs.push(`[Ads] ${advertiserIds.length} adverteerders gevonden`);
  
  if (advertiserIds.length === 0) {
    logs.push(`[Ads] Geen actieve contracten`);
    return [];
  }
  
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
      });
    }
  }
  
  logs.push(`[Ads] ${items.length} approved ads gevonden`);
  return items;
}

/**
 * Build combined playlist items (baseline interleaved with ads)
 */
function buildCombinedItems(
  baselineItems: PlaylistItem[],
  adItems: PlaylistItem[],
  logs: string[]
): any[] {
  const items: any[] = [];
  
  if (baselineItems.length === 0 && adItems.length === 0) {
    logs.push(`[Build] Geen items - playlist blijft leeg`);
    return [];
  }
  
  if (adItems.length === 0) {
    logs.push(`[Build] Alleen baseline items (${baselineItems.length})`);
    for (const item of baselineItems) {
      items.push({
        media: item.mediaId,
        duration: item.duration,
      });
    }
    return items;
  }
  
  logs.push(`[Build] Interleaven: ${baselineItems.length} baseline + ${adItems.length} ads`);
  
  let adIndex = 0;
  for (let i = 0; i < baselineItems.length; i++) {
    items.push({
      media: baselineItems[i].mediaId,
      duration: baselineItems[i].duration,
    });
    
    if ((i + 1) % 2 === 0 && adIndex < adItems.length) {
      items.push({
        media: adItems[adIndex].mediaId,
        duration: adItems[adIndex].duration,
      });
      adIndex++;
    }
  }
  
  while (adIndex < adItems.length) {
    items.push({
      media: adItems[adIndex].mediaId,
      duration: adItems[adIndex].duration,
    });
    adIndex++;
  }
  
  logs.push(`[Build] Totaal ${items.length} items`);
  return items;
}

/**
 * Ensure screen has its own playlist with correct content
 */
export async function ensureScreenPlaylist(screenId: string): Promise<ScreenPlaylistResult> {
  const logs: string[] = [];
  logs.push(`[EnsurePlaylist] Start voor scherm ${screenId}`);
  
  const [screen] = await db.select({
    id: screens.id,
    screenId: screens.screenId,
    name: screens.name,
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(eq(screens.id, screenId));
  
  if (!screen) {
    return {
      ok: false,
      screenId,
      screenName: "Onbekend",
      playlistId: null,
      playlistName: null,
      itemCount: 0,
      baselineCount: 0,
      adsCount: 0,
      isNew: false,
      logs,
      error: "SCREEN_NOT_FOUND",
    };
  }
  
  const playlistName = getScreenPlaylistName(screen.screenId || screen.name);
  logs.push(`[EnsurePlaylist] Playlist naam: "${playlistName}"`);
  
  let playlistId: number;
  let isNew = false;
  
  const existing = await findPlaylistByName(playlistName);
  
  if (existing) {
    playlistId = existing.id;
    logs.push(`[EnsurePlaylist] Bestaande playlist gevonden: ID ${playlistId}`);
  } else {
    const createResult = await createPlaylist(playlistName);
    if (!createResult.ok || !createResult.playlistId) {
      return {
        ok: false,
        screenId,
        screenName: screen.name,
        playlistId: null,
        playlistName,
        itemCount: 0,
        baselineCount: 0,
        adsCount: 0,
        isNew: false,
        logs,
        error: createResult.error || "CREATE_PLAYLIST_FAILED",
      };
    }
    playlistId = createResult.playlistId;
    isNew = true;
    logs.push(`[EnsurePlaylist] Nieuwe playlist aangemaakt: ID ${playlistId}`);
  }
  
  const baselineResult = await getBaselineItems(logs);
  const adItems = await getAdsForScreen(screenId, logs);
  const combinedItems = buildCombinedItems(baselineResult.items, adItems, logs);
  
  // Track baseline errors for observability
  const baselineError = baselineResult.error;
  const baselineFallbackUsed = baselineResult.fallbackUsed;
  
  if (combinedItems.length > 0) {
    logs.push(`[EnsurePlaylist] Syncen ${combinedItems.length} items naar playlist`);
    
    const patchResult = await yodeckRequest<any>(`/playlists/${playlistId}/`, "PATCH", {
      items: combinedItems,
    });
    
    if (!patchResult.ok) {
      logs.push(`[EnsurePlaylist] PATCH mislukt: ${patchResult.error}`);
      return {
        ok: false,
        screenId,
        screenName: screen.name,
        playlistId: String(playlistId),
        playlistName,
        itemCount: 0,
        baselineCount: baselineResult.items.length,
        adsCount: adItems.length,
        isNew,
        logs,
        error: "PATCH_PLAYLIST_FAILED",
        baselineError,
        baselineFallbackUsed,
      };
    }
    
    logs.push(`[EnsurePlaylist] Playlist gesynchroniseerd`);
  } else {
    logs.push(`[EnsurePlaylist] ⚠️ Geen items om te syncen - baseline ontbreekt!`);
  }
  
  return {
    ok: combinedItems.length > 0, // Only OK if we have content
    screenId,
    screenName: screen.name,
    playlistId: String(playlistId),
    playlistName,
    itemCount: combinedItems.length,
    baselineCount: baselineResult.items.length,
    adsCount: adItems.length,
    isNew,
    baselineError,
    baselineFallbackUsed,
    logs,
  };
}

/**
 * Assign playlist to screen and push to device
 */
export async function assignAndPushScreenContent(
  screenId: string,
  playlistId: string
): Promise<AssignPushResult> {
  const logs: string[] = [];
  logs.push(`[AssignPush] Start voor scherm ${screenId}, playlist ${playlistId}`);
  
  const [screen] = await db.select({
    yodeckPlayerId: screens.yodeckPlayerId,
  }).from(screens).where(eq(screens.id, screenId));
  
  if (!screen?.yodeckPlayerId) {
    return {
      ok: false,
      screenId,
      yodeckDeviceId: null,
      playlistId,
      publishOk: false,
      verificationOk: false,
      actualPlaylistId: null,
      actualItemCount: 0,
      errorReason: "NO_YODECK_DEVICE",
      logs,
    };
  }
  
  const yodeckDeviceId = screen.yodeckPlayerId;
  logs.push(`[AssignPush] Yodeck device: ${yodeckDeviceId}`);
  
  const payload = {
    screen_content: {
      source_type: "playlist",
      source_id: parseInt(playlistId),
    },
  };
  
  logs.push(`[AssignPush] PATCH screen content...`);
  const patchResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`, "PATCH", payload);
  
  if (!patchResult.ok) {
    logs.push(`[AssignPush] PATCH mislukt: ${patchResult.error}`);
    return {
      ok: false,
      screenId,
      yodeckDeviceId,
      playlistId,
      publishOk: false,
      verificationOk: false,
      actualPlaylistId: null,
      actualItemCount: 0,
      errorReason: "PATCH_SCREEN_FAILED",
      logs,
    };
  }
  
  logs.push(`[AssignPush] PATCH succesvol - verificatie scherm...`);
  
  const verifyResult = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`);
  
  if (!verifyResult.ok) {
    logs.push(`[AssignPush] Verificatie scherm mislukt: ${verifyResult.error}`);
    return {
      ok: true,
      screenId,
      yodeckDeviceId,
      playlistId,
      publishOk: true,
      verificationOk: false,
      actualPlaylistId: null,
      actualItemCount: 0,
      errorReason: "VERIFY_SCREEN_FAILED",
      logs,
    };
  }
  
  const content = verifyResult.data?.screen_content;
  const actualPlaylistId = content?.source_id ? String(content.source_id) : null;
  const isPlaylistMatch = actualPlaylistId === playlistId;
  
  if (!isPlaylistMatch) {
    logs.push(`[AssignPush] ⚠️ PLAYLIST MISMATCH: verwacht ${playlistId}, actueel ${actualPlaylistId}`);
    return {
      ok: false,
      screenId,
      yodeckDeviceId,
      playlistId,
      publishOk: true,
      verificationOk: false,
      actualPlaylistId,
      actualItemCount: 0,
      errorReason: "PLAYLIST_MISMATCH",
      logs,
    };
  }
  
  // Post-publish verification: check playlist has items
  logs.push(`[AssignPush] Verificatie playlist items...`);
  const playlistVerify = await yodeckRequest<any>(`/playlists/${playlistId}/`);
  
  let actualItemCount = 0;
  let hasContent = false;
  
  if (playlistVerify.ok && playlistVerify.data) {
    const items = playlistVerify.data.items || [];
    actualItemCount = items.length;
    hasContent = actualItemCount > 0;
    
    if (hasContent) {
      logs.push(`[AssignPush] ✓ Verificatie OK: playlist ${actualPlaylistId} met ${actualItemCount} items`);
    } else {
      logs.push(`[AssignPush] ⚠️ CONTENT WARNING: playlist is leeg!`);
    }
  } else {
    logs.push(`[AssignPush] Verificatie playlist items mislukt: ${playlistVerify.error}`);
  }
  
  return {
    ok: isPlaylistMatch && hasContent,
    screenId,
    yodeckDeviceId,
    playlistId,
    publishOk: true,
    verificationOk: isPlaylistMatch && hasContent,
    actualPlaylistId,
    actualItemCount,
    errorReason: !hasContent ? "PLAYLIST_EMPTY" : undefined,
    logs,
  };
}

/**
 * Full repair cycle for a screen
 */
export async function repairScreen(screenId: string): Promise<ScreenRepairResult> {
  const logs: string[] = [];
  logs.push(`[Repair] ═══════════════════════════════════════`);
  logs.push(`[Repair] Start repair voor scherm ${screenId}`);
  
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
  
  if (deviceStatus.status === "UNLINKED") {
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      deviceStatus,
      expectedPlaylistId: null,
      actualPlaylistId: null,
      itemCount: 0,
      baselineCount: 0,
      adsCount: 0,
      publishOk: false,
      verificationOk: false,
      errorReason: "DEVICE_UNLINKED",
      logs,
    };
  }
  
  const playlistResult = await ensureScreenPlaylist(screenId);
  logs.push(...playlistResult.logs);
  
  if (!playlistResult.ok || !playlistResult.playlistId) {
    return {
      ok: false,
      screenId,
      screenName: screen.name,
      deviceStatus,
      expectedPlaylistId: null,
      actualPlaylistId: null,
      itemCount: playlistResult.itemCount,
      baselineCount: playlistResult.baselineCount,
      adsCount: playlistResult.adsCount,
      publishOk: false,
      verificationOk: false,
      errorReason: playlistResult.error || "PLAYLIST_ENSURE_FAILED",
      logs,
    };
  }
  
  const pushResult = await assignAndPushScreenContent(screenId, playlistResult.playlistId);
  logs.push(...pushResult.logs);
  
  return {
    ok: pushResult.ok,
    screenId,
    screenName: screen.name,
    deviceStatus,
    expectedPlaylistId: playlistResult.playlistId,
    actualPlaylistId: pushResult.actualPlaylistId,
    itemCount: playlistResult.itemCount,
    baselineCount: playlistResult.baselineCount,
    adsCount: playlistResult.adsCount,
    publishOk: pushResult.publishOk,
    verificationOk: pushResult.verificationOk,
    verificationError: pushResult.errorReason,
    baselineError: playlistResult.baselineError,
    baselineFallbackUsed: playlistResult.baselineFallbackUsed,
    errorReason: pushResult.errorReason,
    logs,
  };
}

/**
 * Get what's currently playing on a screen
 */
export async function getScreenNowPlaying(screenId: string): Promise<{
  ok: boolean;
  deviceStatus: UnifiedDeviceStatus;
  playlistId: string | null;
  playlistName: string | null;
  expectedPlaylistName: string | null;
  itemCount: number;
  baselineCount: number;
  adsCount: number;
  lastPushAt: string | null;
  lastPushResult: string | null;
  verificationOk: boolean;
  mismatch: boolean;
  mismatchReason?: string;
  error?: string;
}> {
  const deviceStatus = await getYodeckDeviceStatus(screenId);
  
  if (deviceStatus.status === "UNLINKED") {
    return {
      ok: false,
      deviceStatus,
      playlistId: null,
      playlistName: null,
      expectedPlaylistName: null,
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
  
  if (playlistId) {
    const playlistResult = await yodeckRequest<any>(`/playlists/${playlistId}/`);
    if (playlistResult.ok && playlistResult.data) {
      playlistName = playlistResult.data.name || null;
      itemCount = Array.isArray(playlistResult.data.items) ? playlistResult.data.items.length : 0;
    }
  }
  
  // STRICT VERIFICATION: EXACT match only - no prefix fallback
  // The expected name is "Elevizion | Loop | {screenName}"
  const isExactNameMatch = playlistName?.trim().toLowerCase() === expectedPlaylistName.trim().toLowerCase();
  const hasContent = itemCount > 0;
  
  // Verification is OK ONLY if:
  // 1. Playlist name EXACTLY matches expected (strict)
  // 2. AND playlist has content (itemCount > 0)
  // NO PREFIX FALLBACK - this ensures we never show green for wrong screen's playlist
  const verificationOk = isExactNameMatch && hasContent;
  const mismatch = playlistName !== null && !isExactNameMatch;
  
  // Estimate baseline vs ads (if items exist and names contain patterns)
  let baselineCount = 0;
  let adsCount = 0;
  if (hasContent) {
    // For now, estimate roughly based on typical ratio
    baselineCount = Math.min(2, itemCount);
    adsCount = Math.max(0, itemCount - baselineCount);
  }
  
  // Build specific error reason for lastPushResult
  let lastPushResult: string | null = null;
  if (verificationOk) {
    lastPushResult = "ok";
  } else if (mismatch) {
    lastPushResult = `error: verwacht "${expectedPlaylistName}", gevonden "${playlistName}"`;
  } else if (!hasContent) {
    lastPushResult = "error: playlist leeg (0 items)";
  } else if (!playlistId) {
    lastPushResult = "error: geen playlist toegewezen";
  }
  
  return {
    ok: verificationOk,
    deviceStatus,
    playlistId,
    playlistName,
    expectedPlaylistName,
    itemCount,
    baselineCount,
    adsCount,
    lastPushAt: null,
    lastPushResult,
    verificationOk,
    mismatch,
    mismatchReason: mismatch ? `Scherm speelt "${playlistName}" maar moet "${expectedPlaylistName}"` : 
                    !hasContent ? "Playlist is leeg - geen content!" : undefined,
  };
}
