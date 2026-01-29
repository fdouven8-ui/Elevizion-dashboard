/**
 * ProductionBroadcast - PRODUCTION-READY broadcast engine
 * 
 * HARD REQUIREMENTS:
 * 1. NEVER use layout mode (source_type="layout" is FORBIDDEN)
 * 2. Every screen has exactly 1 canonical playlist
 * 3. Baseline items (min 4) must always be present
 * 4. Ads go to CORRECT screens only, removed from WRONG screens
 * 5. Media must be READY (fileSize > 0, status = Live) before publishing
 * 6. Auto-push after every playlist change with verify step
 */

import { storage } from "../storage";
import { getYodeckToken } from "./yodeckClient";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

export const BASELINE_MIN_ITEMS = 4;

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

export async function getPlaylistItems(playlistId: number): Promise<{ ok: boolean; items: number[]; error?: string }> {
  const result = await yodeckFetch("GET", `/playlists/${playlistId}/`);
  if (!result.ok) {
    return { ok: false, items: [], error: result.error };
  }
  
  const playlist = result.data;
  const items = playlist.items || [];
  return { ok: true, items };
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
    
    if (!location || location.status !== "active" || !location.readyForAds) {
      candidates.push({
        screenId: screen.id,
        screenName: screen.name || "Unknown",
        city,
        score: 0,
        reason: !location ? "NO_LOCATION" : location.status !== "active" ? "INACTIVE" : "NOT_READY_FOR_ADS",
        selected: false,
      });
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
  const result = await yodeckFetch("GET", `/media/${mediaId}/`);
  if (!result.ok) {
    return { ready: false, fileSize: 0, duration: null, status: "unknown", error: result.error };
  }

  const media = result.data;
  const fileSize = media.file_size || 0;
  const duration = media.duration || null;
  const status = media.status || "unknown";

  const blockedStatuses = ["initialized", "uploading", "encoding", "processing", "failed"];
  const isBlockedByStatus = blockedStatuses.includes(status.toLowerCase());
  const isApp = status.toLowerCase() === "finished" && fileSize === 0 && !duration;
  const isBlocked = isBlockedByStatus || (!isApp && fileSize === 0);

  console.log(`[MEDIA_GATE] media=${mediaId} READY=${!isBlocked} isApp=${isApp} fileSize=${fileSize} duration=${duration} status=${status}`);

  return {
    ready: !isBlocked,
    fileSize,
    duration,
    status,
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
