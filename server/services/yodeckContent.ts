/**
 * Yodeck Content Service
 * Fetches and parses what content is currently assigned to Yodeck screens
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

async function yodeckApiRequest(endpoint: string, apiKey: string): Promise<any> {
  const url = `${YODECK_BASE_URL}${endpoint}`;
  console.log(`[YodeckContent] GET ${url}`);
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text().catch(() => "");
    throw new Error(`${response.status} - ${error.substring(0, 100)}`);
  }

  return response.json();
}

function buildContentSummary(screenData: any): { 
  contentCount: number; 
  summary: string; 
  contentSummary: ContentSummary;
  status: ContentStatus;
} {
  const playlists: Array<{ id: number; name: string }> = [];
  const media: Array<{ id: number; name: string }> = [];
  const schedules: Array<{ id: number; name: string }> = [];
  const items: string[] = [];

  if (screenData.playlist) {
    playlists.push(screenData.playlist);
    items.push(`Playlist: ${screenData.playlist.name}`);
  }
  if (screenData.playlists && Array.isArray(screenData.playlists)) {
    screenData.playlists.forEach((p: any) => {
      if (!playlists.find(x => x.id === p.id)) {
        playlists.push(p);
        items.push(`Playlist: ${p.name}`);
      }
    });
  }
  if (screenData.media) {
    media.push(screenData.media);
    items.push(`Media: ${screenData.media.name}`);
  }
  if (screenData.schedule) {
    schedules.push(screenData.schedule);
    items.push(`Schedule: ${screenData.schedule.name}`);
  }
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

    console.log(`[YodeckContent] Fetching content for ${screen.screenId} (yodeck: ${identifier})`);
    
    const screenData = await yodeckApiRequest(`/screens/${identifier}`, apiKey);
    
    console.log(`[YodeckContent] Response keys for ${screen.screenId}: ${Object.keys(screenData).join(", ")}`);
    
    const { contentCount, summary, status, contentSummary } = buildContentSummary(screenData);
    
    await storage.updateScreen(screen.id, {
      yodeckContentCount: contentCount,
      yodeckContentSummary: contentSummary,
      yodeckContentLastFetchedAt: new Date(),
    });

    return {
      screenId: screen.screenId,
      yodeckName,
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

export async function syncAllScreensContent(): Promise<{
  success: boolean;
  results: ScreenContentResult[];
  stats: {
    total: number;
    hasContent: number;
    empty: number;
    unknown: number;
  };
}> {
  const screens = await storage.getScreens();
  const results: ScreenContentResult[] = [];
  
  const CONCURRENT_LIMIT = 3;
  
  for (let i = 0; i < screens.length; i += CONCURRENT_LIMIT) {
    const batch = screens.slice(i, i + CONCURRENT_LIMIT);
    const batchResults = await Promise.all(
      batch.map(screen => fetchScreenContentSummary(screen))
    );
    results.push(...batchResults);
  }

  const stats = {
    total: results.length,
    hasContent: results.filter(r => r.status === "has_content").length,
    empty: results.filter(r => r.status === "empty").length,
    unknown: results.filter(r => r.status === "unknown").length,
  };

  console.log(`[YodeckContent] Sync complete: ${stats.total} screens (${stats.hasContent} with content, ${stats.empty} empty, ${stats.unknown} unknown)`);

  return { success: true, results, stats };
}
