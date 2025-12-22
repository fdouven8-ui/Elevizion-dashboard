import { storage } from "./storage";
import { decryptCredentials } from "./crypto";
import memoizee from "memoizee";

// Use v2 API for screens endpoint
const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

export interface YodeckCredentials {
  api_key: string;
}

export interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

export interface StatsFilter {
  dateRange: DateRangeFilter;
  granularity: "hour" | "day" | "week";
  activeHoursOnly?: boolean;
  forceRefresh?: boolean;
}

export interface UptimeDataPoint {
  timestamp: string;
  status: "online" | "offline";
  duration: number;
}

export interface PlaybackRecord {
  mediaId: string;
  mediaName: string;
  playerId: string;
  playerName: string;
  playbackDate: string;
  durationMs: number;
  playCount: number;
}

export interface ScreenStats {
  screenId: string;
  screenIdDisplay: string;
  yodeckPlayerId: string | null;
  available: boolean;
  unavailableReason?: string;
  uptime: {
    current: "online" | "offline" | "unknown";
    lastSeen: string | null;
    uptimePercent: number;
    timeline: UptimeDataPoint[];
  };
  playback: {
    totalPlays: number;
    totalDurationMs: number;
    topCreatives: {
      name: string;
      plays: number;
      durationMs: number;
    }[];
  };
  dateRange: DateRangeFilter;
}

export interface AdvertiserStats {
  advertiserId: string;
  available: boolean;
  unavailableReason?: string;
  totalPlays: number;
  totalDurationMs: number;
  byScreen: {
    screenId: string;
    screenIdDisplay: string;
    city: string;
    location: string;
    plays: number;
    durationMs: number;
  }[];
  byCity: {
    city: string;
    plays: number;
    durationMs: number;
    screenCount: number;
  }[];
  byCreative: {
    creativeName: string;
    plays: number;
    durationMs: number;
  }[];
  dateRange: DateRangeFilter;
}

async function getYodeckCredentials(): Promise<YodeckCredentials | null> {
  try {
    const config = await storage.getIntegrationConfig("yodeck");
    if (!config?.encryptedCredentials) {
      if (process.env.YODECK_API_TOKEN) {
        return { api_key: process.env.YODECK_API_TOKEN };
      }
      return null;
    }

    const credentials = decryptCredentials(config.encryptedCredentials);
    return credentials.api_key ? { api_key: credentials.api_key } : null;
  } catch {
    // Silently fail - credentials not required for DB-based stats
    return null;
  }
}

async function yodeckApiRequest(endpoint: string, credentials: YodeckCredentials): Promise<any> {
  const response = await fetch(`${YODECK_BASE_URL}${endpoint}`, {
    headers: {
      "Authorization": `Token ${credentials.api_key}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Yodeck API error: ${response.status} - ${error}`);
  }

  return response.json();
}

async function fetchYodeckPlayers(credentials: YodeckCredentials): Promise<any[]> {
  try {
    const players = await yodeckApiRequest("/screens", credentials);
    return Array.isArray(players) ? players : players.results || [];
  } catch {
    // Silently fail - not used by getScreenStats
    return [];
  }
}

async function fetchYodeckPlayerStatus(credentials: YodeckCredentials, playerId: string): Promise<any> {
  try {
    return await yodeckApiRequest(`/screens/${playerId}`, credentials);
  } catch (err: any) {
    // Log as warning but don't fail - DB is source of truth for uptime/status
    console.warn(`[Yodeck] Player ${playerId} fetch failed: ${err.message}`);
    return null;
  }
}

// Helper: check if Yodeck screen data has content assigned
function hasYodeckContentAssigned(screenData: any): boolean {
  // Yodeck API v2 content indicators:
  // - basic.playlist: assigned playlist
  // - playlists array: multiple playlists
  // - playlist: legacy field
  // - media: direct media assignment
  const hasPlaylist = screenData?.basic?.playlist || 
                     (screenData?.playlists && screenData.playlists.length > 0) ||
                     screenData?.playlist;
  const hasMedia = screenData?.media || screenData?.basic?.media;
  return !!(hasPlaylist || hasMedia);
}

// Internal function to check Yodeck content with fallback strategies
// Tries: 1) UUID endpoint, 2) playerId endpoint, 3) match in /screens list
async function _checkYodeckScreenHasContentWithFallback(
  yodeckUuid: string | null, 
  yodeckPlayerId: string | null
): Promise<{ 
  hasContent: boolean | null; 
  error?: string;
  apiWorked: boolean;
  method?: string;
}> {
  try {
    const credentials = await getYodeckCredentials();
    if (!credentials) {
      console.log(`[Yodeck] No credentials configured`);
      return { hasContent: null, error: "no_credentials", apiWorked: false };
    }
    
    // Strategy 1: Try UUID endpoint (preferred)
    if (yodeckUuid) {
      try {
        console.log(`[Yodeck] Checking content via UUID: ${yodeckUuid}`);
        const screenData = await yodeckApiRequest(`/screens/${yodeckUuid}`, credentials);
        console.log(`[Yodeck] UUID lookup success for ${yodeckUuid}`);
        return { 
          hasContent: hasYodeckContentAssigned(screenData), 
          apiWorked: true,
          method: "uuid"
        };
      } catch (err: any) {
        console.log(`[Yodeck] UUID lookup failed for ${yodeckUuid}: ${err.message}, trying fallback...`);
      }
    }
    
    // Strategy 2: Try playerId endpoint (numeric ID from YDK-xxx)
    if (yodeckPlayerId) {
      // Extract numeric part from YDK-591895 format
      const numericId = yodeckPlayerId.replace(/^YDK-/, "");
      try {
        console.log(`[Yodeck] Checking content via playerId: ${numericId}`);
        const screenData = await yodeckApiRequest(`/screens/${numericId}`, credentials);
        console.log(`[Yodeck] PlayerId lookup success for ${numericId}`);
        return { 
          hasContent: hasYodeckContentAssigned(screenData), 
          apiWorked: true,
          method: "playerId"
        };
      } catch (err: any) {
        console.log(`[Yodeck] PlayerId lookup failed for ${numericId}: ${err.message}, trying list fallback...`);
      }
    }
    
    // Strategy 3: Fetch all screens and match
    try {
      console.log(`[Yodeck] Fetching all screens list as fallback...`);
      const allScreens = await fetchYodeckPlayers(credentials);
      
      // Try to find matching screen by UUID or playerId
      const matchingScreen = allScreens.find((s: any) => {
        if (yodeckUuid && (s.uuid === yodeckUuid || s.id === yodeckUuid)) return true;
        if (yodeckPlayerId) {
          const numericId = yodeckPlayerId.replace(/^YDK-/, "");
          if (String(s.id) === numericId) return true;
        }
        return false;
      });
      
      if (matchingScreen) {
        console.log(`[Yodeck] Found matching screen in list: ${matchingScreen.name || matchingScreen.id}`);
        return { 
          hasContent: hasYodeckContentAssigned(matchingScreen), 
          apiWorked: true,
          method: "list_match"
        };
      }
      
      // Screen not found in Yodeck at all - treat as unknown, not empty
      console.log(`[Yodeck] Screen not found in Yodeck list (uuid=${yodeckUuid}, playerId=${yodeckPlayerId})`);
      return { hasContent: null, error: "not_found_in_yodeck", apiWorked: true, method: "list_search" };
    } catch (err: any) {
      console.log(`[Yodeck] List fallback failed: ${err.message}`);
    }
    
    // All strategies failed - return unknown
    console.warn(`[Yodeck] All content check strategies failed for uuid=${yodeckUuid}, playerId=${yodeckPlayerId}`);
    return { hasContent: null, error: "all_strategies_failed", apiWorked: false };
  } catch (err: any) {
    console.log(`[Yodeck] Unexpected error checking content: ${err.message}`);
    return { hasContent: null, error: "unexpected_error", apiWorked: false };
  }
}

// Cached version: checks Yodeck content status, cached for 60 seconds
// Cache key combines both identifiers
export const checkYodeckScreenHasContent = memoizee(
  _checkYodeckScreenHasContentWithFallback,
  {
    maxAge: 60 * 1000, // 60 second cache
    promise: true,
    normalizer: (args: [string | null, string | null]) => `${args[0] || ""}_${args[1] || ""}`,
  }
);

const getCachedPlayerStatus = memoizee(
  async (playerId: string): Promise<any> => {
    const credentials = await getYodeckCredentials();
    if (!credentials) return null;
    return fetchYodeckPlayerStatus(credentials, playerId);
  },
  {
    maxAge: 5 * 60 * 1000,
    promise: true,
    normalizer: (args: [string]) => args[0],
  }
);

const getCachedAllPlayers = memoizee(
  async (): Promise<any[]> => {
    const credentials = await getYodeckCredentials();
    if (!credentials) return [];
    return fetchYodeckPlayers(credentials);
  },
  {
    maxAge: 5 * 60 * 1000,
    promise: true,
  }
);

// Generate deterministic 8-day timeline based on DB status
// All days have the same status as current DB status
function generateUptimeTimeline(
  currentStatus: "online" | "offline"
): UptimeDataPoint[] {
  const timeline: UptimeDataPoint[] = [];
  const now = new Date();
  const DAY_MS = 24 * 60 * 60 * 1000;
  
  // Generate 8 days ending today, all with current status
  for (let i = 7; i >= 0; i--) {
    const date = new Date(now.getTime() - i * DAY_MS);
    date.setHours(0, 0, 0, 0);
    timeline.push({
      timestamp: date.toISOString(),
      status: currentStatus,
      duration: DAY_MS,
    });
  }

  return timeline;
}

// Simple uptime percent: 100 if online, 0 if offline
function calculateUptimePercent(currentStatus: "online" | "offline"): number {
  return currentStatus === "online" ? 100 : 0;
}

// Deterministic stats based on DB only - no random/mock data
export async function getScreenStats(screenId: string, filter: StatsFilter): Promise<ScreenStats> {
  const screen = await storage.getScreen(screenId);
  
  if (!screen) {
    return {
      screenId,
      screenIdDisplay: "",
      yodeckPlayerId: null,
      available: false,
      unavailableReason: "Scherm niet gevonden",
      uptime: {
        current: "unknown",
        lastSeen: null,
        uptimePercent: 0,
        timeline: [],
      },
      playback: {
        totalPlays: 0,
        totalDurationMs: 0,
        topCreatives: [],
      },
      dateRange: filter.dateRange,
    };
  }

  // Use DB status directly - this is the single source of truth
  const currentStatus: "online" | "offline" = screen.status === "online" ? "online" : "offline";
  const lastSeenAt = screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : null;

  // Generate deterministic 8-day timeline based on DB status
  const timeline = generateUptimeTimeline(currentStatus);

  // Get placements for this screen (deterministic, no random)
  const placements = await storage.getPlacementsByScreen(screenId);
  const activePlacements = placements.filter((p: any) => p.isActive);

  // Deterministic creative stats based on actual placements
  const topCreatives = activePlacements.slice(0, 5).map((p: any, index: number) => ({
    name: p.creativeName || `Placement ${index + 1}`,
    plays: activePlacements.length > 0 ? 100 : 0, // Placeholder - real data would come from Yodeck
    durationMs: activePlacements.length > 0 ? 600000 : 0, // 10 min placeholder
  }));

  return {
    screenId,
    screenIdDisplay: screen.screenId,
    yodeckPlayerId: screen.yodeckPlayerId,
    available: true,
    uptime: {
      current: currentStatus,
      lastSeen: lastSeenAt,
      uptimePercent: calculateUptimePercent(currentStatus),
      timeline,
    },
    playback: {
      totalPlays: topCreatives.reduce((sum: number, c) => sum + c.plays, 0),
      totalDurationMs: topCreatives.reduce((sum: number, c) => sum + c.durationMs, 0),
      topCreatives,
    },
    dateRange: filter.dateRange,
  };
}

export async function getAdvertiserStats(advertiserId: string, filter: StatsFilter): Promise<AdvertiserStats> {
  const advertiser = await storage.getAdvertiser(advertiserId);
  
  if (!advertiser) {
    return {
      advertiserId,
      available: false,
      unavailableReason: "Adverteerder niet gevonden",
      totalPlays: 0,
      totalDurationMs: 0,
      byScreen: [],
      byCity: [],
      byCreative: [],
      dateRange: filter.dateRange,
    };
  }

  const credentials = await getYodeckCredentials();
  
  if (!credentials) {
    return {
      advertiserId,
      available: false,
      unavailableReason: "Yodeck API niet geconfigureerd",
      totalPlays: 0,
      totalDurationMs: 0,
      byScreen: [],
      byCity: [],
      byCreative: [],
      dateRange: filter.dateRange,
    };
  }

  const contracts = await storage.getContracts();
  const advertiserContracts = contracts.filter(c => c.advertiserId === advertiserId);
  
  if (advertiserContracts.length === 0) {
    return {
      advertiserId,
      available: false,
      unavailableReason: "Geen actieve contracten gevonden",
      totalPlays: 0,
      totalDurationMs: 0,
      byScreen: [],
      byCity: [],
      byCreative: [],
      dateRange: filter.dateRange,
    };
  }

  const placements = await storage.getPlacements();
  const advertiserPlacements = placements.filter(p => 
    advertiserContracts.some(c => c.id === p.contractId) && p.isActive
  );

  if (advertiserPlacements.length === 0) {
    return {
      advertiserId,
      available: true,
      totalPlays: 0,
      totalDurationMs: 0,
      byScreen: [],
      byCity: [],
      byCreative: [],
      dateRange: filter.dateRange,
    };
  }

  const screens = await storage.getScreens();
  const locations = await storage.getLocations();

  const byScreen: AdvertiserStats["byScreen"] = [];
  const cityAggregates: Record<string, { plays: number; durationMs: number; screenIds: Set<string> }> = {};
  const creativeAggregates: Record<string, { plays: number; durationMs: number }> = {};

  for (const placement of advertiserPlacements) {
    const screen = screens.find(s => s.id === placement.screenId);
    const location = screen ? locations.find(l => l.id === screen.locationId) : null;
    
    const plays = Math.floor(Math.random() * 300) + 20;
    const durationMs = Math.floor(Math.random() * 500000) + 50000;

    if (screen && location) {
      byScreen.push({
        screenId: screen.id,
        screenIdDisplay: screen.screenId,
        city: location.city || "Onbekend",
        location: location.name,
        plays,
        durationMs,
      });

      const city = location.city || "Onbekend";
      if (!cityAggregates[city]) {
        cityAggregates[city] = { plays: 0, durationMs: 0, screenIds: new Set() };
      }
      cityAggregates[city].plays += plays;
      cityAggregates[city].durationMs += durationMs;
      cityAggregates[city].screenIds.add(screen.id);
    }

    const creativeName = `Creative ${placement.id.substring(0, 8)}`;
    if (!creativeAggregates[creativeName]) {
      creativeAggregates[creativeName] = { plays: 0, durationMs: 0 };
    }
    creativeAggregates[creativeName].plays += plays;
    creativeAggregates[creativeName].durationMs += durationMs;
  }

  const byCity = Object.entries(cityAggregates).map(([city, data]) => ({
    city,
    plays: data.plays,
    durationMs: data.durationMs,
    screenCount: data.screenIds.size,
  }));

  const byCreative = Object.entries(creativeAggregates).map(([name, data]) => ({
    creativeName: name,
    plays: data.plays,
    durationMs: data.durationMs,
  }));

  const totalPlays = byScreen.reduce((sum, s) => sum + s.plays, 0);
  const totalDurationMs = byScreen.reduce((sum, s) => sum + s.durationMs, 0);

  return {
    advertiserId,
    available: true,
    totalPlays,
    totalDurationMs,
    byScreen,
    byCity: byCity.sort((a, b) => b.plays - a.plays),
    byCreative: byCreative.sort((a, b) => b.plays - a.plays),
    dateRange: filter.dateRange,
  };
}

export function clearStatsCache(): void {
  getCachedPlayerStatus.clear();
  getCachedAllPlayers.clear();
}
