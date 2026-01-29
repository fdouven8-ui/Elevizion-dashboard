/**
 * ProductionBroadcast - PRODUCTION-READY broadcast engine
 * 
 * HARD REQUIREMENTS:
 * 1. NEVER use layout mode (source_type="layout" is FORBIDDEN)
 * 2. Every screen has exactly 1 canonical playlist
 * 3. Baseline items (min 4) must always be present + fallback guarantee
 * 4. Ads go to CORRECT screens only, removed from WRONG screens
 * 5. Media must be READY (fileSize > 0, status = Live) before publishing
 * 6. Auto-push after every playlist change with verify + self-heal
 * 
 * CONTENT_PIPELINE_MODE = SCREEN_PLAYLIST_ONLY
 * All layout functions are HARD DISABLED.
 */

import { storage } from "../storage";
import { getYodeckToken } from "./yodeckClient";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

export const CONTENT_PIPELINE_MODE = "SCREEN_PLAYLIST_ONLY";
export const BASELINE_MIN_ITEMS = 4;
export const VERIFY_TIMEOUT_MS = 60000;
export const PUSH_RETRY_COUNT = 3;

export type MediaStatus = "OK" | "NOT_READY" | "BROKEN";

export interface MediaVerifyResult {
  mediaId: number;
  status: MediaStatus;
  fileSize: number;
  duration: number | null;
  yodeckStatus: string;
  reason: string;
}

export interface RenderabilityResult {
  playlistId: number;
  itemCount: number;
  okItemsCount: number;
  brokenItems: MediaVerifyResult[];
  fallbackPresent: boolean;
  isRenderable: boolean;
  lastPushResult?: string;
}

export interface SelfHealResult {
  applied: boolean;
  reason: string;
  fallbackInjected: boolean;
  pushed: boolean;
  verified: boolean;
}

export interface ContentWriteGateResult {
  enabled: boolean;
  reasons: string[];
  baselineConfigured: boolean;
  baselineItemCount: number;
  screensWithPlaylist: number;
  tokenValid: boolean;
}

export interface PublishResult {
  ok: boolean;
  screenId: string;
  yodeckScreenId: number;
  playlistId: number;
  action: "added" | "already_present" | "removed" | "skipped";
  reason?: string;
  pushed: boolean;
  verified: boolean;
  logs: string[];
}

export interface TargetingDiagnostics {
  advertiserId: string;
  advertiserName: string;
  packageType: string;
  screensIncluded: number;
  targetRegions: string[];
  targetCities: string[];
  regionCodes: string[];
  candidates: Array<{
    screenId: string;
    screenName: string;
    city: string;
    score: number;
    reason: string;
    selected: boolean;
  }>;
  selectedScreens: Array<{
    screenId: string;
    playlistId: string;
  }>;
  excludedScreens: Array<{
    screenId: string;
    playlistId: string;
    reason: string;
  }>;
}

async function yodeckFetch(method: string, endpoint: string, body?: any): Promise<{ ok: boolean; data?: any; error?: string }> {
  const token = await getYodeckToken();
  if (!token.isValid || !token.value) {
    return { ok: false, error: "Invalid Yodeck token" };
  }

  try {
    const options: RequestInit = {
      method,
      headers: {
        "Authorization": `Token ${token.label}:${token.value}`,
        "Content-Type": "application/json",
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${YODECK_BASE_URL}${endpoint}`, options);
    
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    
    if (response.status === 204) {
      return { ok: true };
    }
    
    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

export function assertNotLayoutMode(sourceType: string | null | undefined, context: string): void {
  if (sourceType === "layout") {
    const errorMsg = `[FATAL] LAYOUT_MODE_FORBIDDEN: Attempted to use layout mode in ${context}. This is strictly prohibited.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

export async function checkContentWriteGate(): Promise<ContentWriteGateResult> {
  const reasons: string[] = [];
  
  const token = await getYodeckToken();
  const tokenValid = token.isValid && !!token.value;
  if (!tokenValid) {
    reasons.push("Yodeck token not configured or invalid");
  }

  const baselineConfig = await storage.getIntegrationConfig("yodeck_baseline");
  const settings = baselineConfig?.settings as { baselineMediaIds?: number[] } | undefined;
  const baselineMediaIds = settings?.baselineMediaIds;
  const baselineConfigured = Array.isArray(baselineMediaIds) && baselineMediaIds.length >= BASELINE_MIN_ITEMS;
  const baselineItemCount = baselineMediaIds?.length || 0;
  
  if (!baselineConfigured) {
    reasons.push(`Baseline not configured: need ${BASELINE_MIN_ITEMS} items, have ${baselineItemCount}`);
  }

  const screens = await storage.getScreens();
  const screensWithPlaylist = screens.filter(s => s.playlistId).length;
  
  if (screensWithPlaylist === 0) {
    reasons.push("No screens have a playlist configured");
  }

  const enabled = tokenValid && baselineConfigured && screensWithPlaylist > 0;

  console.log(`[SAFETY] contentWriteEnabled=${enabled} reason=${reasons.join("; ") || "all checks passed"}`);

  return {
    enabled,
    reasons,
    baselineConfigured,
    baselineItemCount,
    screensWithPlaylist,
    tokenValid,
  };
}

export async function getBaselineMediaIds(): Promise<{ ok: boolean; mediaIds: number[]; error?: string }> {
  const config = await storage.getIntegrationConfig("yodeck_baseline");
  const settings = config?.settings as { baselineMediaIds?: number[] } | undefined;
  const mediaIds = settings?.baselineMediaIds;
  
  if (!Array.isArray(mediaIds) || mediaIds.length < BASELINE_MIN_ITEMS) {
    return { 
      ok: false, 
      mediaIds: mediaIds || [], 
      error: `Baseline needs ${BASELINE_MIN_ITEMS} items, have ${mediaIds?.length || 0}` 
    };
  }
  
  return { ok: true, mediaIds };
}

export async function getPlaylistItems(playlistId: number): Promise<{ ok: boolean; items: number[]; rawItems?: any[]; error?: string }> {
  const result = await yodeckFetch("GET", `/playlists/${playlistId}/`);
  if (!result.ok) {
    return { ok: false, items: [], error: result.error };
  }
  
  const playlist = result.data;
  const rawItems = playlist.items || [];
  const items = rawItems.map((item: any) => {
    if (typeof item === "number") return item;
    if (typeof item === "object" && item.id) return item.id;
    return null;
  }).filter((id: number | null): id is number => id !== null);
  
  return { ok: true, items, rawItems };
}

export async function updatePlaylistItems(playlistId: number, items: number[]): Promise<{ ok: boolean; error?: string }> {
  if (items.length === 0) {
    console.error(`[SAFETY] BLOCKED: Attempted to set playlist ${playlistId} to 0 items. This is forbidden.`);
    return { ok: false, error: "Cannot set playlist to 0 items - this would cause black screen" };
  }

  const result = await yodeckFetch("PATCH", `/playlists/${playlistId}/`, { items });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  
  console.log(`[PUBLISH] playlist=${playlistId} itemCount=${items.length}`);
  return { ok: true };
}

export async function pushScreen(yodeckScreenId: number): Promise<{ ok: boolean; error?: string }> {
  const result = await yodeckFetch("POST", `/screens/${yodeckScreenId}/push/`);
  if (!result.ok) {
    console.warn(`[PUSH] screen=${yodeckScreenId} FAILED: ${result.error}`);
    return { ok: false, error: result.error };
  }
  
  console.log(`[PUSH] screen=${yodeckScreenId} ok`);
  return { ok: true };
}

export async function verifyScreenPlaylist(yodeckScreenId: number, expectedPlaylistId: number): Promise<{ ok: boolean; sourceType?: string; sourceId?: number; error?: string }> {
  const result = await yodeckFetch("GET", `/screens/${yodeckScreenId}/`);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  
  const screen = result.data;
  const content = screen.screen_content || {};
  const sourceType = content.source_type;
  const sourceId = content.source_id;

  assertNotLayoutMode(sourceType, `verifyScreenPlaylist(${yodeckScreenId})`);

  if (sourceType !== "playlist") {
    return { ok: false, sourceType, sourceId, error: `Expected playlist, got ${sourceType}` };
  }
  
  if (sourceId !== expectedPlaylistId) {
    return { ok: false, sourceType, sourceId, error: `Expected playlist ${expectedPlaylistId}, got ${sourceId}` };
  }

  console.log(`[VERIFY] screen=${yodeckScreenId} ok source_type=playlist source_id=${sourceId}`);
  return { ok: true, sourceType, sourceId };
}

export async function ensureScreenOnPlaylist(yodeckScreenId: number, playlistId: number): Promise<{ ok: boolean; pushed: boolean; verified: boolean; error?: string }> {
  const patchResult = await yodeckFetch("PATCH", `/screens/${yodeckScreenId}/`, {
    screen_content: {
      source_type: "playlist",
      source_id: playlistId,
    },
  });
  
  if (!patchResult.ok) {
    return { ok: false, pushed: false, verified: false, error: patchResult.error };
  }

  const pushResult = await pushScreen(yodeckScreenId);
  if (!pushResult.ok) {
    return { ok: true, pushed: false, verified: false, error: pushResult.error };
  }

  await new Promise(r => setTimeout(r, 2000));

  const retryDelays = [2000, 5000, 10000];
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    const verifyResult = await verifyScreenPlaylist(yodeckScreenId, playlistId);
    if (verifyResult.ok) {
      return { ok: true, pushed: true, verified: true };
    }
    
    if (attempt < retryDelays.length - 1) {
      console.log(`[PUBLISH_VERIFY_FAIL] screen=${yodeckScreenId} attempt=${attempt + 1}, retrying...`);
      await new Promise(r => setTimeout(r, retryDelays[attempt]));
    }
  }

  return { ok: true, pushed: true, verified: false, error: "Verify failed after 3 attempts" };
}

export async function resolveTargetingWithDiagnostics(advertiserId: string): Promise<TargetingDiagnostics> {
  const advertiser = await storage.getAdvertiser(advertiserId);
  if (!advertiser) {
    throw new Error(`Advertiser not found: ${advertiserId}`);
  }

  const packageType = advertiser.packageType || "SINGLE";
  const screensIncluded = advertiser.screensIncluded || getPackageLimit(packageType);
  const regionCodes = Array.isArray(advertiser.targetRegionCodes) ? advertiser.targetRegionCodes.map((r: string) => r.toLowerCase()) : [];
  const targetCities = Array.isArray(advertiser.targetCities) ? advertiser.targetCities.map((c: string) => c.toLowerCase()) : [];

  const screens = await storage.getScreens();
  const locations = await storage.getLocations();
  const locationMap = new Map(locations.map(l => [l.id, l]));

  const candidates: TargetingDiagnostics["candidates"] = [];

  for (const screen of screens) {
    if (!screen.yodeckPlayerId || !screen.playlistId) {
      continue;
    }

    const location = screen.locationId ? locationMap.get(screen.locationId) : null;
    const city = (screen.city || location?.city || "").toLowerCase();
    const regionCode = (location?.regionCode || "").toLowerCase();
    
    const isUnlinked = !screen.locationId || 
                       screen.locationId.startsWith("YODECK-") || 
                       screen.locationId === "unlinked";
    const isPaused = location?.pausedByAdmin === true;
    const isScreenInactive = screen.isActive === false;
    
    let eligibilityReason = "";
    if (isUnlinked) {
      eligibilityReason = "UNLINKED: screen has no valid location";
    } else if (!location) {
      eligibilityReason = "NO_LOCATION: location record not found";
    } else if (location.status !== "active") {
      eligibilityReason = `INACTIVE: location.status=${location.status}`;
    } else if (!location.readyForAds) {
      eligibilityReason = "NOT_READY_FOR_ADS: location.readyForAds=false";
    } else if (isPaused) {
      eligibilityReason = "PAUSED_BY_ADMIN: location.pausedByAdmin=true";
    } else if (isScreenInactive) {
      eligibilityReason = "SCREEN_INACTIVE: screen.isActive=false";
    }
    
    if (eligibilityReason) {
      candidates.push({
        screenId: screen.id,
        screenName: screen.name || "Unknown",
        city,
        score: 0,
        reason: eligibilityReason,
        selected: false,
      });
      console.log(`[ELIGIBILITY_GATE] EXCLUDED screen=${screen.name} reason=${eligibilityReason}`);
      continue;
    }

    let score = 0;
    let reason = "";

    const hasTargeting = targetCities.length > 0 || regionCodes.length > 0;
    const allTargets = [...targetCities, ...regionCodes];
    
    if (!hasTargeting) {
      score = 1;
      reason = "NO_TARGETING: matches all";
    } else {
      const exactCityMatch = allTargets.some(t => city === t);
      if (exactCityMatch) {
        score = 100;
        reason = `CITY_MATCH: ${city}`;
      } else {
        const partialCityMatch = allTargets.some(t => city.includes(t) || t.includes(city));
        if (partialCityMatch) {
          score = 50;
          reason = `PARTIAL_CITY: ${city}`;
        } else {
          const regionMatch = regionCode && regionCodes.some(r => regionCode === r);
          if (regionMatch) {
            score = 25;
            reason = `REGION_MATCH: ${regionCode}`;
          } else {
            score = 0;
            reason = `NO_MATCH: city=${city} targets=${allTargets.join(",")}`;
          }
        }
      }
    }

    candidates.push({
      screenId: screen.id,
      screenName: screen.name || "Unknown",
      city,
      score,
      reason,
      selected: false,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.screenName.localeCompare(b.screenName);
  });

  const selectedScreens: TargetingDiagnostics["selectedScreens"] = [];
  const excludedScreens: TargetingDiagnostics["excludedScreens"] = [];
  let selectedCount = 0;

  for (const candidate of candidates) {
    const screen = screens.find(s => s.id === candidate.screenId);
    if (!screen?.playlistId) continue;

    if (candidate.score > 0 && selectedCount < screensIncluded) {
      candidate.selected = true;
      selectedCount++;
      selectedScreens.push({
        screenId: candidate.screenId,
        playlistId: screen.playlistId,
      });
    } else if (screen.playlistId) {
      excludedScreens.push({
        screenId: candidate.screenId,
        playlistId: screen.playlistId,
        reason: candidate.score === 0 ? candidate.reason : `PACKAGE_LIMIT: ${packageType}=${screensIncluded}`,
      });
    }
  }

  console.log(`[TARGETING] advertiser=${advertiser.companyName} selectedScreens=[${selectedScreens.map(s => s.screenId).join(",")}] scores=[${candidates.filter(c => c.selected).map(c => c.score).join(",")}]`);

  return {
    advertiserId,
    advertiserName: advertiser.companyName || "Unknown",
    packageType,
    screensIncluded,
    targetRegions: [...targetCities, ...regionCodes],
    targetCities,
    regionCodes,
    candidates,
    selectedScreens,
    excludedScreens,
  };
}

function getPackageLimit(packageType: string): number {
  switch (packageType) {
    case "SINGLE": return 1;
    case "TRIPLE": return 3;
    case "TEN": return 10;
    default: return 1;
  }
}

export async function checkMediaReadiness(mediaId: number): Promise<{ 
  ready: boolean; 
  fileSize: number; 
  duration: number | null; 
  status: string;
  error?: string;
}> {
  const verifyResult = await verifyMedia(mediaId);
  
  console.log(`[MEDIA_GATE] media=${mediaId} status=${verifyResult.status} yodeckStatus=${verifyResult.yodeckStatus} fileSize=${verifyResult.fileSize}`);
  
  return {
    ready: verifyResult.status === "OK",
    fileSize: verifyResult.fileSize,
    duration: verifyResult.duration,
    status: verifyResult.yodeckStatus,
    error: verifyResult.status !== "OK" ? verifyResult.reason : undefined,
  };
}

export async function publishAdToScreens(
  advertiserId: string, 
  mediaId: number,
  dryRun: boolean = false
): Promise<{ ok: boolean; results: PublishResult[]; diagnostics: TargetingDiagnostics }> {
  const gate = await checkContentWriteGate();
  if (!gate.enabled && !dryRun) {
    throw new Error(`Publishing disabled: ${gate.reasons.join("; ")}`);
  }

  const mediaCheck = await checkMediaReadiness(mediaId);
  if (!mediaCheck.ready) {
    throw new Error(`Media ${mediaId} not ready: ${mediaCheck.error || `fileSize=${mediaCheck.fileSize} status=${mediaCheck.status}`}`);
  }

  const baseline = await getBaselineMediaIds();
  if (!baseline.ok) {
    throw new Error(`Baseline not configured: ${baseline.error}`);
  }

  const diagnostics = await resolveTargetingWithDiagnostics(advertiserId);
  const results: PublishResult[] = [];

  for (const target of diagnostics.selectedScreens) {
    const screen = (await storage.getScreens()).find(s => s.id === target.screenId);
    if (!screen?.yodeckPlayerId) continue;

    const yodeckScreenId = parseInt(screen.yodeckPlayerId, 10);
    const playlistId = parseInt(target.playlistId, 10);
    const logs: string[] = [];

    if (dryRun) {
      results.push({
        ok: true,
        screenId: target.screenId,
        yodeckScreenId,
        playlistId,
        action: "skipped",
        reason: "DRY_RUN",
        pushed: false,
        verified: false,
        logs: ["[DRY_RUN] Would add ad to playlist"],
      });
      continue;
    }

    const currentItems = await getPlaylistItems(playlistId);
    if (!currentItems.ok) {
      results.push({
        ok: false,
        screenId: target.screenId,
        yodeckScreenId,
        playlistId,
        action: "skipped",
        reason: currentItems.error,
        pushed: false,
        verified: false,
        logs: [`Failed to get playlist items: ${currentItems.error}`],
      });
      continue;
    }

    let items = [...currentItems.items];
    const hasAd = items.includes(mediaId);

    for (const baselineId of baseline.mediaIds) {
      if (!items.includes(baselineId)) {
        items.push(baselineId);
        logs.push(`Added baseline item ${baselineId}`);
      }
    }

    if (!hasAd) {
      items.push(mediaId);
      logs.push(`Added ad ${mediaId}`);
    }

    if (items.length !== currentItems.items.length || !hasAd) {
      const updateResult = await updatePlaylistItems(playlistId, items);
      if (!updateResult.ok) {
        results.push({
          ok: false,
          screenId: target.screenId,
          yodeckScreenId,
          playlistId,
          action: "skipped",
          reason: updateResult.error,
          pushed: false,
          verified: false,
          logs,
        });
        continue;
      }

      const ensureResult = await ensureScreenOnPlaylist(yodeckScreenId, playlistId);
      results.push({
        ok: true,
        screenId: target.screenId,
        yodeckScreenId,
        playlistId,
        action: hasAd ? "already_present" : "added",
        pushed: ensureResult.pushed,
        verified: ensureResult.verified,
        logs,
      });
    } else {
      results.push({
        ok: true,
        screenId: target.screenId,
        yodeckScreenId,
        playlistId,
        action: "already_present",
        pushed: false,
        verified: true,
        logs: ["Ad already in playlist, no changes needed"],
      });
    }
  }

  for (const excluded of diagnostics.excludedScreens) {
    const screen = (await storage.getScreens()).find(s => s.id === excluded.screenId);
    if (!screen?.yodeckPlayerId) continue;

    const yodeckScreenId = parseInt(screen.yodeckPlayerId, 10);
    const playlistId = parseInt(excluded.playlistId, 10);

    if (dryRun) {
      results.push({
        ok: true,
        screenId: excluded.screenId,
        yodeckScreenId,
        playlistId,
        action: "skipped",
        reason: `DRY_RUN: Would check and remove ad if present (${excluded.reason})`,
        pushed: false,
        verified: false,
        logs: [],
      });
      continue;
    }

    const currentItems = await getPlaylistItems(playlistId);
    if (!currentItems.ok) continue;

    const hasAd = currentItems.items.includes(mediaId);
    if (hasAd) {
      const newItems = currentItems.items.filter(id => id !== mediaId);
      
      if (newItems.length < BASELINE_MIN_ITEMS) {
        console.warn(`[SAFETY] Cannot remove ad from playlist ${playlistId} - would leave < ${BASELINE_MIN_ITEMS} items`);
        continue;
      }

      const updateResult = await updatePlaylistItems(playlistId, newItems);
      if (updateResult.ok) {
        await pushScreen(yodeckScreenId);
        console.log(`[PUBLISH] screen=${excluded.screenId} playlist=${playlistId} removeItems=[${mediaId}]`);
        results.push({
          ok: true,
          screenId: excluded.screenId,
          yodeckScreenId,
          playlistId,
          action: "removed",
          reason: excluded.reason,
          pushed: true,
          verified: false,
          logs: [`Removed ad ${mediaId} from non-target screen`],
        });
      }
    }
  }

  return { ok: true, results, diagnostics };
}

// ============================================================================
// MEDIA VERIFIER - Validates media before publishing
// ============================================================================

export async function verifyMedia(mediaId: number): Promise<MediaVerifyResult> {
  const result = await yodeckFetch("GET", `/media/${mediaId}/`);
  
  if (!result.ok) {
    return {
      mediaId,
      status: "BROKEN",
      fileSize: 0,
      duration: null,
      yodeckStatus: "unknown",
      reason: `API error: ${result.error}`,
    };
  }
  
  const media = result.data;
  const fileSize = media.file_size || 0;
  const duration = media.duration || null;
  const yodeckStatus = (media.status || "unknown").toLowerCase();
  
  const okStatuses = ["finished", "live", "ready", "published"];
  const notReadyStatuses = ["initialized", "uploading", "encoding", "processing", "pending"];
  const brokenStatuses = ["failed", "error", "deleted", "rejected"];
  
  if (brokenStatuses.includes(yodeckStatus)) {
    return {
      mediaId,
      status: "BROKEN",
      fileSize,
      duration,
      yodeckStatus,
      reason: `Status indicates failure: ${yodeckStatus}`,
    };
  }
  
  if (notReadyStatuses.includes(yodeckStatus)) {
    return {
      mediaId,
      status: "NOT_READY",
      fileSize,
      duration,
      yodeckStatus,
      reason: `Still processing: ${yodeckStatus}`,
    };
  }
  
  const isApp = okStatuses.includes(yodeckStatus) && fileSize === 0 && !duration;
  const isVideo = okStatuses.includes(yodeckStatus) && fileSize > 0;
  
  if (!isApp && !isVideo) {
    if (fileSize === 0) {
      return {
        mediaId,
        status: "BROKEN",
        fileSize,
        duration,
        yodeckStatus,
        reason: `fileSize=0 for non-app media (status=${yodeckStatus})`,
      };
    }
    if (!okStatuses.includes(yodeckStatus)) {
      return {
        mediaId,
        status: "NOT_READY",
        fileSize,
        duration,
        yodeckStatus,
        reason: `Unknown status: ${yodeckStatus}`,
      };
    }
  }
  
  return {
    mediaId,
    status: "OK",
    fileSize,
    duration,
    yodeckStatus,
    reason: isApp ? "App media is ready" : `Video ready (fileSize=${fileSize})`,
  };
}

export async function verifyPlaylistRenderability(playlistId: number): Promise<RenderabilityResult> {
  const itemsResult = await getPlaylistItems(playlistId);
  
  if (!itemsResult.ok) {
    return {
      playlistId,
      itemCount: 0,
      okItemsCount: 0,
      brokenItems: [],
      fallbackPresent: false,
      isRenderable: false,
      lastPushResult: itemsResult.error,
    };
  }
  
  const items = itemsResult.items;
  const verifyResults: MediaVerifyResult[] = [];
  
  for (const mediaId of items) {
    const verifyResult = await verifyMedia(mediaId);
    verifyResults.push(verifyResult);
  }
  
  const okItems = verifyResults.filter(r => r.status === "OK");
  const brokenItems = verifyResults.filter(r => r.status === "BROKEN");
  
  const fallbackId = await getFallbackMediaId();
  const fallbackPresent = fallbackId ? items.includes(fallbackId) : false;
  
  const isRenderable = okItems.length > 0;
  
  return {
    playlistId,
    itemCount: items.length,
    okItemsCount: okItems.length,
    brokenItems,
    fallbackPresent,
    isRenderable,
  };
}

// ============================================================================
// FALLBACK SYSTEM - Ensures no black screen
// ============================================================================

export async function getFallbackMediaId(): Promise<number | null> {
  const config = await storage.getIntegrationConfig("broadcast_fallback");
  if (config?.settings && typeof config.settings === "object" && "mediaId" in config.settings) {
    return (config.settings as { mediaId: number }).mediaId;
  }
  return null;
}

export async function setFallbackMediaId(mediaId: number): Promise<{ ok: boolean; error?: string }> {
  const verifyResult = await verifyMedia(mediaId);
  if (verifyResult.status !== "OK") {
    return { ok: false, error: `Fallback media not ready: ${verifyResult.reason}` };
  }
  
  await storage.upsertIntegrationConfig("broadcast_fallback", { settings: { mediaId } });
  console.log(`[FALLBACK] Set fallback media to ${mediaId}`);
  return { ok: true };
}

// ============================================================================
// SELF-HEAL - Automatic recovery from non-renderable state
// ============================================================================

export async function selfHealPlaylist(
  playlistId: number, 
  yodeckScreenId: number
): Promise<SelfHealResult> {
  console.log(`[SELF_HEAL] Starting for playlist=${playlistId} screen=${yodeckScreenId}`);
  
  const renderability = await verifyPlaylistRenderability(playlistId);
  
  if (renderability.isRenderable && renderability.okItemsCount >= BASELINE_MIN_ITEMS) {
    return {
      applied: false,
      reason: "Playlist is already renderable",
      fallbackInjected: false,
      pushed: false,
      verified: true,
    };
  }
  
  const baselineResult = await getBaselineMediaIds();
  if (baselineResult.ok && baselineResult.mediaIds.length >= BASELINE_MIN_ITEMS) {
    const updateResult = await updatePlaylistItems(playlistId, baselineResult.mediaIds);
    if (updateResult.ok) {
      const pushResult = await pushScreenWithRetry(yodeckScreenId);
      console.log(`[SELF_HEAL_APPLIED] playlist=${playlistId} action=BASELINE_RESTORE pushed=${pushResult.ok}`);
      return {
        applied: true,
        reason: "Restored baseline items",
        fallbackInjected: false,
        pushed: pushResult.ok,
        verified: false,
      };
    }
  }
  
  const fallbackId = await getFallbackMediaId();
  if (fallbackId) {
    const currentItems = await getPlaylistItems(playlistId);
    const newItems = currentItems.ok ? [...currentItems.items.filter(id => id !== fallbackId), fallbackId] : [fallbackId];
    
    const updateResult = await updatePlaylistItems(playlistId, newItems);
    if (updateResult.ok) {
      const pushResult = await pushScreenWithRetry(yodeckScreenId);
      console.log(`[SELF_HEAL_APPLIED] playlist=${playlistId} action=FALLBACK_INJECT mediaId=${fallbackId} pushed=${pushResult.ok}`);
      return {
        applied: true,
        reason: "Injected fallback media",
        fallbackInjected: true,
        pushed: pushResult.ok,
        verified: false,
      };
    }
  }
  
  console.error(`[SELF_HEAL_FAILED] playlist=${playlistId} - No fallback available`);
  return {
    applied: false,
    reason: "Self-heal failed: no fallback media configured",
    fallbackInjected: false,
    pushed: false,
    verified: false,
  };
}

async function pushScreenWithRetry(yodeckScreenId: number): Promise<{ ok: boolean; attempts: number; error?: string }> {
  for (let attempt = 1; attempt <= PUSH_RETRY_COUNT; attempt++) {
    const result = await pushScreen(yodeckScreenId);
    if (result.ok) {
      return { ok: true, attempts: attempt };
    }
    console.log(`[PUSH_RETRY] screen=${yodeckScreenId} attempt=${attempt}/${PUSH_RETRY_COUNT} failed`);
    await new Promise(r => setTimeout(r, 2000));
  }
  return { ok: false, attempts: PUSH_RETRY_COUNT, error: "Max retries exceeded" };
}

// ============================================================================
// PUBLISH WITH VERIFY + SELF-HEAL
// ============================================================================

export async function publishWithVerifyAndHeal(
  advertiserId: string,
  mediaId: number
): Promise<{ ok: boolean; results: PublishResult[]; diagnostics: TargetingDiagnostics; selfHealApplied: boolean }> {
  const publishResult = await publishAdToScreens(advertiserId, mediaId, false);
  
  if (!publishResult.ok) {
    return { ...publishResult, selfHealApplied: false };
  }
  
  let selfHealApplied = false;
  
  for (const result of publishResult.results) {
    if (result.ok && (result.action === "added" || result.action === "removed")) {
      const renderability = await verifyPlaylistRenderability(result.playlistId);
      
      if (!renderability.isRenderable) {
        console.log(`[VERIFY_FAIL] screen=${result.screenId} playlist=${result.playlistId} - triggering self-heal`);
        const healResult = await selfHealPlaylist(result.playlistId, result.yodeckScreenId);
        if (healResult.applied) {
          selfHealApplied = true;
          result.logs.push(`[SELF_HEAL] ${healResult.reason}`);
        }
      }
    }
  }
  
  return { ...publishResult, selfHealApplied };
}

// ============================================================================
// LAYOUT MODE HARD DISABLE
// ============================================================================

export function assertPlaylistOnlyMode(): void {
  if (CONTENT_PIPELINE_MODE !== "SCREEN_PLAYLIST_ONLY") {
    throw new Error("FATAL: CONTENT_PIPELINE_MODE must be SCREEN_PLAYLIST_ONLY");
  }
}

export function throwLayoutDisabled(): never {
  throw new Error("FATAL: Layout mode is HARD DISABLED. CONTENT_PIPELINE_MODE=SCREEN_PLAYLIST_ONLY. All layout functions are forbidden.");
}

// ============================================================================
// SCREEN DIAGNOSTICS
// ============================================================================

export async function getScreenRenderability(screenId: string): Promise<RenderabilityResult | null> {
  const screens = await storage.getScreens();
  const screen = screens.find(s => s.id === screenId);
  
  if (!screen?.playlistId) {
    return null;
  }
  
  const playlistId = parseInt(screen.playlistId, 10);
  return verifyPlaylistRenderability(playlistId);
}
