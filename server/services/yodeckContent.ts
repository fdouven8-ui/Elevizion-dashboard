/**
 * Yodeck Content Service
 * Fetches and parses what content is currently assigned to Yodeck screens
 * 
 * Strategy: Uses GET /screens (list) endpoint which returns content info in the response,
 * rather than individual /screens/{id} calls. This is more efficient and reliable.
 */

import { storage } from "../storage";
import { decryptCredentials } from "../crypto";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

export type ContentStatus = "unknown" | "empty" | "has_content";

export interface ScreenContentResult {
  screenId: string;
  yodeckName: string;
  status: ContentStatus;
  contentCount: number;
  summary: string;
  error?: string;
}

export interface ContentSummary {
  playlists: Array<{ id: number; name: string }>;
  media: Array<{ id: number; name: string }>;
  schedules: Array<{ id: number; name: string }>;
  items: string[];
  topItems: string[];
  lastFetchedAt: string;
}

interface YodeckScreenResponse {
  id: number;
  uuid: string;
  name: string;
  workspace?: { id: number; name: string };
  basic?: { tags?: string[]; description?: string };
  state?: { online?: boolean; last_seen?: string };
  playlist?: { id: number; name: string } | null;
  playlists?: Array<{ id: number; name: string }>;
  media?: { id: number; name: string } | null;
  schedule?: { id: number; name: string } | null;
  layout?: { id: number; name: string } | null;
}

async function getYodeckApiKey(): Promise<string | null> {
  try {
    const config = await storage.getIntegrationConfig("yodeck");
    if (!config?.encryptedCredentials) return null;
    const credentials = decryptCredentials(config.encryptedCredentials);
    return credentials.api_key || null;
  } catch {
    return null;
  }
}

async function fetchAllYodeckScreens(apiKey: string): Promise<YodeckScreenResponse[]> {
  const url = `${YODECK_BASE_URL}/screens`;
  console.log(`[YodeckContent] GET ${url}`);
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(`${response.status} - ${error.substring(0, 200)}`);
  }

  const data = await response.json();
  const screens = data.results || data;
  
  console.log(`[YodeckContent] Fetched ${screens.length} screens from Yodeck API`);
  
  // Log first screen's content-related keys for debugging (without sensitive data)
  if (screens.length > 0) {
    const sample = screens[0];
    const contentKeys = ['playlist', 'playlists', 'media', 'schedule', 'layout']
      .filter(k => sample[k] !== undefined && sample[k] !== null);
    console.log(`[YodeckContent] Content fields present: ${contentKeys.join(', ') || 'none'}`);
  }
  
  return screens;
}

function buildContentSummary(screenData: YodeckScreenResponse): { 
  contentCount: number; 
  summary: string; 
  contentSummary: ContentSummary;
  status: ContentStatus;
} {
  const playlists: Array<{ id: number; name: string }> = [];
  const media: Array<{ id: number; name: string }> = [];
  const schedules: Array<{ id: number; name: string }> = [];
  const items: string[] = [];

  // Check for assigned playlist(s)
  if (screenData.playlist) {
    playlists.push(screenData.playlist);
    items.push(`Playlist: ${screenData.playlist.name}`);
  }
  if (screenData.playlists && Array.isArray(screenData.playlists)) {
    screenData.playlists.forEach((p) => {
      if (!playlists.find(x => x.id === p.id)) {
        playlists.push(p);
        items.push(`Playlist: ${p.name}`);
      }
    });
  }
  
  // Check for assigned media
  if (screenData.media) {
    media.push(screenData.media);
    items.push(`Media: ${screenData.media.name}`);
  }
  
  // Check for schedule
  if (screenData.schedule) {
    schedules.push(screenData.schedule);
    items.push(`Schedule: ${screenData.schedule.name}`);
  }
  
  // Check for layout
  if (screenData.layout) {
    items.push(`Layout: ${screenData.layout.name || "Actief"}`);
  }

  const contentCount = playlists.length + media.length + schedules.length + (screenData.layout ? 1 : 0);
  const topItems = items.slice(0, 5);
  const summary = topItems.length > 0 ? topItems.join(" • ") : "Geen content";
  const status: ContentStatus = contentCount > 0 ? "has_content" : "empty";

  return {
    contentCount,
    summary,
    status,
    contentSummary: {
      playlists,
      media,
      schedules,
      items,
      topItems,
      lastFetchedAt: new Date().toISOString(),
    },
  };
}

export async function syncAllScreensContent(): Promise<{
  success: boolean;
  results: ScreenContentResult[];
  stats: {
    total: number;
    hasContent: number;
    empty: number;
    unknown: number;
  };
  yodeckScreenCount?: number;
}> {
  const apiKey = await getYodeckApiKey();
  if (!apiKey) {
    console.warn("[YodeckContent] No API key configured");
    return {
      success: false,
      results: [],
      stats: { total: 0, hasContent: 0, empty: 0, unknown: 0 },
    };
  }

  // Fetch all screens from Yodeck in one API call
  let yodeckScreens: YodeckScreenResponse[];
  try {
    yodeckScreens = await fetchAllYodeckScreens(apiKey);
  } catch (error: any) {
    console.error(`[YodeckContent] Failed to fetch Yodeck screens: ${error.message}`);
    return {
      success: false,
      results: [],
      stats: { total: 0, hasContent: 0, empty: 0, unknown: 0 },
    };
  }

  // Build lookup maps for matching
  const yodeckById = new Map<string, YodeckScreenResponse>();
  const yodeckByUuid = new Map<string, YodeckScreenResponse>();
  
  for (const ys of yodeckScreens) {
    yodeckById.set(String(ys.id), ys);
    if (ys.uuid) {
      yodeckByUuid.set(ys.uuid, ys);
    }
  }

  // Get our screens from DB
  const dbScreens = await storage.getScreens();
  const results: ScreenContentResult[] = [];

  for (const screen of dbScreens) {
    const yodeckName = screen.yodeckPlayerName || screen.name || screen.screenId;
    
    // Try to find matching Yodeck screen by playerId or uuid
    let yodeckScreen: YodeckScreenResponse | undefined;
    
    if (screen.yodeckPlayerId) {
      yodeckScreen = yodeckById.get(screen.yodeckPlayerId);
    }
    if (!yodeckScreen && screen.yodeckUuid) {
      yodeckScreen = yodeckByUuid.get(screen.yodeckUuid);
    }

    if (!yodeckScreen) {
      // No match found - screen not linked or has invalid Yodeck ID
      console.log(`[YodeckContent] No Yodeck match for ${screen.screenId} (playerId: ${screen.yodeckPlayerId}, uuid: ${screen.yodeckUuid})`);
      results.push({
        screenId: screen.screenId,
        yodeckName,
        status: "unknown",
        contentCount: 0,
        summary: "Geen Yodeck koppeling gevonden",
        error: "no_match",
      });
      continue;
    }

    // Found a match - extract content info
    const { contentCount, summary, status, contentSummary } = buildContentSummary(yodeckScreen);
    
    // Update DB
    await storage.updateScreen(screen.id, {
      yodeckContentCount: contentCount,
      yodeckContentSummary: contentSummary,
      yodeckContentLastFetchedAt: new Date(),
    });

    console.log(`[YodeckContent] ${screen.screenId} -> ${status} (${contentCount} items: ${summary})`);

    results.push({
      screenId: screen.screenId,
      yodeckName: yodeckScreen.name || yodeckName,
      status,
      contentCount,
      summary,
    });
  }

  const stats = {
    total: results.length,
    hasContent: results.filter(r => r.status === "has_content").length,
    empty: results.filter(r => r.status === "empty").length,
    unknown: results.filter(r => r.status === "unknown").length,
  };

  console.log(`[YodeckContent] Sync complete: ${stats.total} DB screens, ${yodeckScreens.length} Yodeck screens`);
  console.log(`[YodeckContent] Results: ${stats.hasContent} with content, ${stats.empty} empty, ${stats.unknown} unknown`);

  return { 
    success: true, 
    results, 
    stats,
    yodeckScreenCount: yodeckScreens.length,
  };
}

// Single screen content fetch (uses the list approach internally for consistency)
export async function fetchScreenContentSummary(screen: {
  id: string;
  screenId: string;
  yodeckUuid?: string | null;
  yodeckPlayerId?: string | null;
  yodeckPlayerName?: string | null;
  name?: string | null;
}): Promise<ScreenContentResult> {
  const yodeckName = screen.yodeckPlayerName || screen.name || screen.screenId;
  
  try {
    const apiKey = await getYodeckApiKey();
    if (!apiKey) {
      return {
        screenId: screen.screenId,
        yodeckName,
        status: "unknown",
        contentCount: 0,
        summary: "Yodeck API niet geconfigureerd",
        error: "no_api_key",
      };
    }

    const identifier = screen.yodeckUuid || screen.yodeckPlayerId;
    if (!identifier) {
      return {
        screenId: screen.screenId,
        yodeckName,
        status: "unknown",
        contentCount: 0,
        summary: "Geen Yodeck koppeling",
        error: "no_yodeck_id",
      };
    }

    // Use list endpoint and find this screen
    const yodeckScreens = await fetchAllYodeckScreens(apiKey);
    
    const yodeckScreen = yodeckScreens.find(ys => 
      String(ys.id) === screen.yodeckPlayerId || 
      ys.uuid === screen.yodeckUuid
    );

    if (!yodeckScreen) {
      return {
        screenId: screen.screenId,
        yodeckName,
        status: "unknown",
        contentCount: 0,
        summary: "Scherm niet gevonden in Yodeck",
        error: "not_found",
      };
    }

    const { contentCount, summary, status, contentSummary } = buildContentSummary(yodeckScreen);
    
    await storage.updateScreen(screen.id, {
      yodeckContentCount: contentCount,
      yodeckContentSummary: contentSummary,
      yodeckContentLastFetchedAt: new Date(),
    });

    return {
      screenId: screen.screenId,
      yodeckName: yodeckScreen.name || yodeckName,
      status,
      contentCount,
      summary,
    };
  } catch (error: any) {
    console.warn(`[YodeckContent] Failed for ${screen.screenId}: ${error.message}`);
    
    return {
      screenId: screen.screenId,
      yodeckName,
      status: "unknown",
      contentCount: 0,
      summary: "Kon content niet ophalen",
      error: error.message,
    };
  }
}
