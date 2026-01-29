/**
 * Ad Targeting Service
 * Resolves which screens should receive ads based on targeting rules + package limits
 */

import { getYodeckToken } from "./yodeckClient";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

// =============================================================================
// TYPES
// =============================================================================

export interface TargetingAdvertiser {
  id: string;
  companyName?: string | null;
  linkKey?: string | null;
  targetRegionCodes?: string[] | null;
  targetCities?: string[] | null;
  packageType?: string | null; // SINGLE | TRIPLE | TEN | CUSTOM
  screensIncluded?: number | null;
}

export interface TargetingScreen {
  id: string;
  name: string;
  yodeckPlayerId?: string | null;
  playlistId?: string | null;
  city?: string | null;
  region?: string | null;
  locationId?: string | null;
  yodeckSyncStatus?: string | null;
}

export interface TargetingLocation {
  id: string;
  name?: string | null;
  city?: string | null;
  status?: string | null;
  readyForAds?: boolean | null;
}

export interface ScreenMatch {
  screenId: string;
  screenName: string;
  playlistId: string;
  locationId: string | null;
  locationCity: string | null;
  matchScore: number;
  matchReason: string;
}

export interface TargetingResult {
  ok: boolean;
  advertiserId: string;
  advertiserName: string;
  packageType: string;
  screensIncluded: number;
  targetRegions: string[];
  resolvedScreens: ScreenMatch[];
  skippedScreens: Array<{ screenId: string; reason: string }>;
  error?: string;
}

// =============================================================================
// TARGETING RESOLVER
// =============================================================================

/**
 * Resolve which screens should receive ads for a given advertiser
 * Respects package type (SINGLE = 1 screen), targeting rules, and location status
 */
export function resolveTargetScreensForAdvertiser(
  advertiser: TargetingAdvertiser,
  screens: TargetingScreen[],
  locations: TargetingLocation[]
): TargetingResult {
  console.log(`[Targeting] Resolving targets for advertiser: ${advertiser.companyName} (${advertiser.id})`);
  
  const packageType = advertiser.packageType || "SINGLE";
  const screensIncluded = advertiser.screensIncluded || getScreensForPackage(packageType);
  const targetRegions = (advertiser.targetRegionCodes || []).map(r => r.toLowerCase());
  const targetCities = (advertiser.targetCities || []).map(c => c.toLowerCase());
  
  console.log(`[Targeting] Package: ${packageType}, screensIncluded: ${screensIncluded}, targets: ${[...targetRegions, ...targetCities].join(",") || "none"}`);
  
  const result: TargetingResult = {
    ok: true,
    advertiserId: advertiser.id,
    advertiserName: advertiser.companyName || "Unknown",
    packageType,
    screensIncluded,
    targetRegions: [...targetRegions, ...targetCities],
    resolvedScreens: [],
    skippedScreens: [],
  };
  
  // Build location lookup
  const locationMap = new Map(locations.map(l => [l.id, l]));
  
  // Score and filter screens
  const scoredScreens: Array<ScreenMatch & { score: number }> = [];
  
  for (const screen of screens) {
    // Check basic requirements
    if (!screen.yodeckPlayerId || !screen.playlistId) {
      result.skippedScreens.push({ 
        screenId: screen.id, 
        reason: "NO_YODECK_LINK: Missing yodeckPlayerId or playlistId" 
      });
      continue;
    }
    
    if (screen.yodeckSyncStatus !== "synced" && screen.yodeckSyncStatus !== "linked") {
      result.skippedScreens.push({ 
        screenId: screen.id, 
        reason: `SYNC_STATUS: ${screen.yodeckSyncStatus}` 
      });
      continue;
    }
    
    // Check location requirements
    const location = screen.locationId ? locationMap.get(screen.locationId) : null;
    
    if (!location) {
      result.skippedScreens.push({ 
        screenId: screen.id, 
        reason: "NO_LOCATION: Screen has no linked location" 
      });
      continue;
    }
    
    if (location.status !== "active") {
      result.skippedScreens.push({ 
        screenId: screen.id, 
        reason: `LOCATION_INACTIVE: ${location.status}` 
      });
      continue;
    }
    
    if (!location.readyForAds) {
      result.skippedScreens.push({ 
        screenId: screen.id, 
        reason: "NOT_READY_FOR_ADS: Location not ready for ads" 
      });
      continue;
    }
    
    // Calculate targeting score
    const screenCity = (screen.city || location.city || "").toLowerCase();
    const screenRegion = (screen.region || "").toLowerCase();
    
    let matchScore = 0;
    let matchReason = "";
    
    // If no targeting specified, match all ready screens
    if (targetRegions.length === 0 && targetCities.length === 0) {
      matchScore = 1;
      matchReason = "NO_TARGETING: Matches all ready screens";
    } else {
      // Check exact city match (highest score)
      const cityMatch = targetCities.some(t => screenCity === t) || 
                        targetRegions.some(t => screenCity === t);
      if (cityMatch) {
        matchScore = 100;
        matchReason = `CITY_MATCH: ${screenCity}`;
      }
      
      // Check partial city match
      if (matchScore === 0) {
        const partialCityMatch = targetCities.some(t => screenCity.includes(t) || t.includes(screenCity)) ||
                                 targetRegions.some(t => screenCity.includes(t) || t.includes(screenCity));
        if (partialCityMatch) {
          matchScore = 50;
          matchReason = `PARTIAL_CITY_MATCH: ${screenCity}`;
        }
      }
      
      // Check region match
      if (matchScore === 0 && screenRegion) {
        const regionMatch = targetRegions.some(t => screenRegion === t || screenRegion.includes(t));
        if (regionMatch) {
          matchScore = 25;
          matchReason = `REGION_MATCH: ${screenRegion}`;
        }
      }
    }
    
    if (matchScore === 0) {
      result.skippedScreens.push({ 
        screenId: screen.id, 
        reason: `NO_TARGET_MATCH: city=${screenCity}, targets=${[...targetRegions, ...targetCities].join(",")}` 
      });
      continue;
    }
    
    scoredScreens.push({
      screenId: screen.id,
      screenName: screen.name,
      playlistId: screen.playlistId,
      locationId: screen.locationId,
      locationCity: screenCity,
      matchScore,
      matchReason,
      score: matchScore,
    });
  }
  
  // Sort by score (highest first), then by name (stable)
  scoredScreens.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.screenName.localeCompare(b.screenName);
  });
  
  // Apply package limit
  const limitedScreens = scoredScreens.slice(0, screensIncluded);
  
  // Log what was cut off
  if (scoredScreens.length > screensIncluded) {
    const cutOff = scoredScreens.slice(screensIncluded);
    for (const s of cutOff) {
      result.skippedScreens.push({
        screenId: s.screenId,
        reason: `PACKAGE_LIMIT: ${packageType} allows ${screensIncluded} screens, this was #${scoredScreens.indexOf(s) + 1}`,
      });
    }
  }
  
  result.resolvedScreens = limitedScreens.map(s => ({
    screenId: s.screenId,
    screenName: s.screenName,
    playlistId: s.playlistId,
    locationId: s.locationId,
    locationCity: s.locationCity,
    matchScore: s.matchScore,
    matchReason: s.matchReason,
  }));
  
  console.log(`[Targeting] Resolved ${result.resolvedScreens.length} screens, skipped ${result.skippedScreens.length}`);
  
  return result;
}

function getScreensForPackage(packageType: string): number {
  switch (packageType) {
    case "SINGLE": return 1;
    case "TRIPLE": return 3;
    case "TEN": return 10;
    default: return 1;
  }
}

// =============================================================================
// YODECK MEDIA READINESS GATE
// =============================================================================

export interface MediaReadinessResult {
  mediaId: number;
  name: string;
  usable: boolean;
  reason: string;
  status?: string;
  fileSize?: number;
  duration?: number;
  processingState?: string;
}

/**
 * Check if a Yodeck media item is ready for publishing
 * Returns false for empty, unfinished, or processing videos
 */
export async function checkMediaReadiness(mediaId: number): Promise<MediaReadinessResult> {
  console.log(`[MediaGate] Checking readiness for media ${mediaId}`);
  
  const token = await getYodeckToken();
  if (!token.isValid || !token.value) {
    return {
      mediaId,
      name: "unknown",
      usable: false,
      reason: "AUTH_ERROR: Yodeck token not configured",
    };
  }
  
  try {
    const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/`, {
      headers: {
        "Authorization": `Token ${token.value}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      return {
        mediaId,
        name: "unknown",
        usable: false,
        reason: `API_ERROR: ${response.status} ${response.statusText}`,
      };
    }
    
    const media = await response.json();
    
    const name = media.name || "unknown";
    const status = media.status || media.processing_status || "unknown";
    const fileSize = media.file_size || media.size || 0;
    const duration = media.duration || 0;
    
    // Check for unusable states
    const badStates = ["encoding", "processing", "uploading", "failed", "error", "pending"];
    const isProcessing = badStates.some(s => status.toLowerCase().includes(s));
    
    if (isProcessing) {
      return {
        mediaId,
        name,
        usable: false,
        reason: `PROCESSING: Media is still being processed (status=${status})`,
        status,
        fileSize,
        duration,
        processingState: status,
      };
    }
    
    // Check for empty/zero-byte files
    if (fileSize === 0) {
      return {
        mediaId,
        name,
        usable: false,
        reason: `EMPTY_FILE: File size is 0 bytes`,
        status,
        fileSize,
        duration,
      };
    }
    
    // Check for videos without duration
    const mediaType = (media.type || media.media_type || "").toLowerCase();
    if (mediaType.includes("video") && duration <= 0) {
      return {
        mediaId,
        name,
        usable: false,
        reason: `NO_DURATION: Video has no duration (may be unfinished)`,
        status,
        fileSize,
        duration,
      };
    }
    
    // Media is usable
    return {
      mediaId,
      name,
      usable: true,
      reason: "READY: Media is ready for publishing",
      status,
      fileSize,
      duration,
    };
    
  } catch (error: any) {
    return {
      mediaId,
      name: "unknown",
      usable: false,
      reason: `FETCH_ERROR: ${error.message}`,
    };
  }
}

/**
 * Pick the best media from multiple candidates with the same advertiser prefix
 * Prefers: usable > higher filesize > newer (higher ID)
 */
export async function pickBestMedia(mediaIds: number[]): Promise<{
  bestMediaId: number | null;
  results: MediaReadinessResult[];
}> {
  if (mediaIds.length === 0) {
    return { bestMediaId: null, results: [] };
  }
  
  const results: MediaReadinessResult[] = [];
  
  for (const mediaId of mediaIds) {
    const check = await checkMediaReadiness(mediaId);
    results.push(check);
  }
  
  // Sort: usable first, then by filesize desc, then by mediaId desc (newer)
  const sorted = [...results].sort((a, b) => {
    if (a.usable !== b.usable) return a.usable ? -1 : 1;
    if ((b.fileSize || 0) !== (a.fileSize || 0)) return (b.fileSize || 0) - (a.fileSize || 0);
    return b.mediaId - a.mediaId;
  });
  
  const best = sorted.find(r => r.usable);
  
  return {
    bestMediaId: best?.mediaId || null,
    results,
  };
}
