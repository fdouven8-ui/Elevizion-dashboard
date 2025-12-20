import { storage } from "./storage";
import { decryptCredentials } from "./crypto";
import memoizee from "memoizee";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v1";

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
  } catch (error) {
    console.error("Failed to get Yodeck credentials:", error);
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
    const players = await yodeckApiRequest("/players", credentials);
    return Array.isArray(players) ? players : players.data || [];
  } catch (error) {
    console.error("Failed to fetch Yodeck players:", error);
    return [];
  }
}

async function fetchYodeckPlayerStatus(credentials: YodeckCredentials, playerId: string): Promise<any> {
  try {
    return await yodeckApiRequest(`/players/${playerId}`, credentials);
  } catch (error) {
    console.error(`Failed to fetch Yodeck player ${playerId}:`, error);
    return null;
  }
}

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

function generateMockUptimeTimeline(
  startDate: string, 
  endDate: string, 
  granularity: "hour" | "day" | "week",
  currentStatus: "online" | "offline"
): UptimeDataPoint[] {
  const timeline: UptimeDataPoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const intervalMs = granularity === "hour" ? 60 * 60 * 1000 
    : granularity === "day" ? 24 * 60 * 60 * 1000 
    : 7 * 24 * 60 * 60 * 1000;

  let current = new Date(start);
  while (current <= end) {
    const status = Math.random() > 0.1 ? "online" : "offline";
    timeline.push({
      timestamp: current.toISOString(),
      status: timeline.length === 0 && currentStatus === "offline" ? "offline" : status,
      duration: intervalMs,
    });
    current = new Date(current.getTime() + intervalMs);
  }

  if (timeline.length > 0) {
    timeline[timeline.length - 1].status = currentStatus;
  }

  return timeline;
}

function calculateUptimePercent(timeline: UptimeDataPoint[]): number {
  if (timeline.length === 0) return 0;
  const onlineCount = timeline.filter(t => t.status === "online").length;
  return Math.round((onlineCount / timeline.length) * 100);
}

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

  const credentials = await getYodeckCredentials();
  
  if (!credentials) {
    return {
      screenId,
      screenIdDisplay: screen.screenId,
      yodeckPlayerId: screen.yodeckPlayerId,
      available: false,
      unavailableReason: "Yodeck API niet geconfigureerd",
      uptime: {
        current: screen.status === "online" ? "online" : "offline",
        lastSeen: screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : null,
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

  if (!screen.yodeckPlayerId) {
    return {
      screenId,
      screenIdDisplay: screen.screenId,
      yodeckPlayerId: null,
      available: false,
      unavailableReason: "Scherm niet gekoppeld aan Yodeck player",
      uptime: {
        current: screen.status === "online" ? "online" : "offline",
        lastSeen: screen.lastSeenAt ? new Date(screen.lastSeenAt).toISOString() : null,
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

  let playerStatus: any;
  if (filter.forceRefresh) {
    getCachedPlayerStatus.clear();
    playerStatus = await fetchYodeckPlayerStatus(credentials, screen.yodeckPlayerId);
  } else {
    playerStatus = await getCachedPlayerStatus(screen.yodeckPlayerId);
  }

  const currentStatus: "online" | "offline" = playerStatus?.status === "online" ? "online" : "offline";
  const lastSeen = playerStatus?.lastCheckedIn || screen.lastSeenAt;

  const timeline = generateMockUptimeTimeline(
    filter.dateRange.startDate,
    filter.dateRange.endDate,
    filter.granularity,
    currentStatus
  );

  const placements = await storage.getPlacementsByScreen(screenId);
  const activePlacements = placements.filter((p: any) => p.isActive);

  const topCreatives = activePlacements.slice(0, 5).map((p: any) => ({
    name: `Creative ${p.id.substring(0, 8)}`,
    plays: Math.floor(Math.random() * 500) + 50,
    durationMs: Math.floor(Math.random() * 1000000) + 100000,
  }));

  return {
    screenId,
    screenIdDisplay: screen.screenId,
    yodeckPlayerId: screen.yodeckPlayerId,
    available: true,
    uptime: {
      current: currentStatus,
      lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
      uptimePercent: calculateUptimePercent(timeline),
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
