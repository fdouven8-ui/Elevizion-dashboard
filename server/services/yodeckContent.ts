/**
 * Yodeck Content Service
 * Fetches and parses what content is currently assigned to Yodeck screens
 * 
 * Strategy: 
 * 1. First fetch screen list to get all screen IDs
 * 2. For each screen, fetch detail endpoint to get assigned content
 * 3. Try multiple strategies: UUID first, then numeric ID
 * 4. Use null for "unknown", 0 for "truly empty"
 */

import { storage } from "../storage";
import { decryptCredentials } from "../crypto";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const CONCURRENT_LIMIT = 3; // Max parallel requests to avoid rate limiting

export type ContentStatus = "unknown" | "empty" | "has_content";

export interface ContentItem {
  type: "playlist" | "media" | "schedule" | "layout" | "app" | "webpage" | "other";
  name: string;
  id?: string | number;
}

export interface ScreenContentResult {
  screenId: string;
  yodeckName: string;
  yodeckId?: string;
  status: ContentStatus;
  contentCount: number | null; // null = unknown, 0 = truly empty, >0 = has content
  summary: string | null;
  items?: ContentItem[];
  error?: string;
}

export interface ContentSummary {
  items: ContentItem[];
  topItems: string[];
  lastFetchedAt: string;
}

interface YodeckScreenListItem {
  id: number;
  uuid: string;
  name: string;
  workspace?: { id: number; name: string };
  basic?: { tags?: string[]; description?: string };
  state?: { online?: boolean; last_seen?: string };
}

interface YodeckScreenDetail {
  id: number;
  uuid: string;
  name: string;
  playlist?: { id: number; name: string } | null;
  playlists?: Array<{ id: number; name: string }>;
  media?: { id: number; name: string } | null;
  schedule?: { id: number; name: string } | null;
  layout?: { id: number; name: string } | null;
  apps?: Array<{ id: number; name: string; type?: string }>;
  webpages?: Array<{ id: number; name: string; url?: string }>;
  widgets?: Array<{ id: number; name: string; type?: string }>;
  assigned_content?: any;
  content?: any;
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

async function yodeckApiRequest<T>(endpoint: string, apiKey: string): Promise<{ ok: boolean; data?: T; status?: number; error?: string }> {
  const url = `${YODECK_BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, error: `${response.status}` };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

/**
 * Fetch assigned content for a single screen using multiple strategies
 */
async function fetchScreenAssignedContent(
  screenId: string,
  uuid: string | null,
  numericId: string | null,
  apiKey: string
): Promise<{ items: ContentItem[]; raw?: any; error?: string }> {
  const strategies = [];
  
  // Strategy A: Screen details by UUID
  if (uuid) {
    strategies.push({ endpoint: `/screens/${uuid}`, identifier: uuid, type: "uuid" });
  }
  
  // Strategy B: Screen details by numeric ID
  if (numericId) {
    strategies.push({ endpoint: `/screens/${numericId}`, identifier: numericId, type: "numericId" });
  }

  for (const strategy of strategies) {
    const result = await yodeckApiRequest<YodeckScreenDetail>(strategy.endpoint, apiKey);
    
    if (result.ok && result.data) {
      console.log(`[Yodeck] Content for ${screenId} via ${strategy.type}: found`);
      const items = extractContentItems(result.data);
      return { items, raw: result.data };
    }
    
    if (result.status === 404) {
      console.log(`[Yodeck] 404 not found for ${strategy.endpoint} using ${strategy.type} ${strategy.identifier}, trying next strategy`);
      continue;
    }
    
    // Other error - log but continue trying
    console.log(`[Yodeck] Error for ${strategy.endpoint}: ${result.error}, trying next strategy`);
  }

  // All strategies failed
  return { items: [], error: "all_strategies_failed" };
}

/**
 * Extract content items from Yodeck screen detail response
 */
function extractContentItems(screenData: YodeckScreenDetail): ContentItem[] {
  const items: ContentItem[] = [];
  
  // Check for assigned playlist(s)
  if (screenData.playlist) {
    items.push({ type: "playlist", name: screenData.playlist.name, id: screenData.playlist.id });
  }
  if (screenData.playlists && Array.isArray(screenData.playlists)) {
    for (const p of screenData.playlists) {
      if (!items.find(i => i.type === "playlist" && i.id === p.id)) {
        items.push({ type: "playlist", name: p.name, id: p.id });
      }
    }
  }
  
  // Check for assigned media
  if (screenData.media) {
    items.push({ type: "media", name: screenData.media.name, id: screenData.media.id });
  }
  
  // Check for schedule
  if (screenData.schedule) {
    items.push({ type: "schedule", name: screenData.schedule.name, id: screenData.schedule.id });
  }
  
  // Check for layout
  if (screenData.layout) {
    items.push({ type: "layout", name: screenData.layout.name || "Actief", id: screenData.layout.id });
  }
  
  // Check for apps
  if (screenData.apps && Array.isArray(screenData.apps)) {
    for (const app of screenData.apps) {
      items.push({ type: "app", name: app.name || app.type || "App", id: app.id });
    }
  }
  
  // Check for webpages
  if (screenData.webpages && Array.isArray(screenData.webpages)) {
    for (const wp of screenData.webpages) {
      items.push({ type: "webpage", name: wp.name || wp.url || "Webpage", id: wp.id });
    }
  }
  
  // Check for widgets (news, weather, etc.)
  if (screenData.widgets && Array.isArray(screenData.widgets)) {
    for (const widget of screenData.widgets) {
      items.push({ type: "app", name: widget.name || widget.type || "Widget", id: widget.id });
    }
  }

  // Fallback: check for generic content/assigned_content fields
  if (items.length === 0) {
    if (screenData.assigned_content) {
      items.push({ type: "other", name: "Toegewezen content" });
    }
    if (screenData.content) {
      items.push({ type: "other", name: "Content" });
    }
  }

  return items;
}

/**
 * Build human-readable summary from content items
 */
function buildSummary(items: ContentItem[]): string {
  if (items.length === 0) return "Geen content";
  
  const typeLabels: Record<ContentItem["type"], string> = {
    playlist: "Playlist",
    media: "Media",
    schedule: "Schedule",
    layout: "Layout",
    app: "App",
    webpage: "Webpage",
    other: "",
  };
  
  const summaryParts: string[] = [];
  for (const item of items.slice(0, 4)) {
    const label = typeLabels[item.type];
    summaryParts.push(label ? `${label}: ${item.name}` : item.name);
  }
  
  if (items.length > 4) {
    summaryParts.push(`+${items.length - 4} meer`);
  }
  
  // Limit total length to ~120 chars
  let summary = summaryParts.join(" • ");
  if (summary.length > 120) {
    summary = summary.substring(0, 117) + "...";
  }
  
  return summary;
}

/**
 * Sync content for all screens in database
 */
export async function syncAllScreensContent(): Promise<{
  success: boolean;
  results: ScreenContentResult[];
  stats: {
    total: number;
    withContent: number;
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
      stats: { total: 0, withContent: 0, empty: 0, unknown: 0 },
    };
  }

  // First, fetch screen list to verify which screens exist
  const listResult = await yodeckApiRequest<{ results?: YodeckScreenListItem[]; count?: number }>("/screens", apiKey);
  
  if (!listResult.ok) {
    console.error(`[YodeckContent] Failed to fetch screen list: ${listResult.error}`);
    return {
      success: false,
      results: [],
      stats: { total: 0, withContent: 0, empty: 0, unknown: 0 },
    };
  }

  const yodeckScreens = listResult.data?.results || [];
  console.log(`[YodeckContent] Yodeck API returned ${yodeckScreens.length} screens`);

  // Build lookup map
  const yodeckById = new Map<string, YodeckScreenListItem>();
  const yodeckByUuid = new Map<string, YodeckScreenListItem>();
  for (const ys of yodeckScreens) {
    yodeckById.set(String(ys.id), ys);
    if (ys.uuid) yodeckByUuid.set(ys.uuid, ys);
  }

  // Get our screens from DB
  const dbScreens = await storage.getScreens();
  const results: ScreenContentResult[] = [];

  // Process screens in batches for rate limiting
  for (let i = 0; i < dbScreens.length; i += CONCURRENT_LIMIT) {
    const batch = dbScreens.slice(i, i + CONCURRENT_LIMIT);
    
    const batchPromises = batch.map(async (screen): Promise<ScreenContentResult> => {
      const yodeckName = screen.yodeckPlayerName || screen.name || screen.screenId;
      
      // Check if screen exists in Yodeck
      let yodeckScreen: YodeckScreenListItem | undefined;
      if (screen.yodeckPlayerId) {
        yodeckScreen = yodeckById.get(screen.yodeckPlayerId);
      }
      if (!yodeckScreen && screen.yodeckUuid) {
        yodeckScreen = yodeckByUuid.get(screen.yodeckUuid);
      }

      if (!yodeckScreen) {
        console.log(`[Yodeck] Content for ${yodeckName} (${screen.screenId}): unknown (no Yodeck match)`);
        
        // Set to null (unknown) not 0
        await storage.updateScreen(screen.id, {
          yodeckContentCount: null,
          yodeckContentSummary: null,
          yodeckContentLastFetchedAt: new Date(),
        });
        
        return {
          screenId: screen.screenId,
          yodeckName,
          status: "unknown",
          contentCount: null,
          summary: null,
          error: "no_yodeck_match",
        };
      }

      // Fetch content details using multi-strategy approach
      const contentResult = await fetchScreenAssignedContent(
        screen.screenId,
        screen.yodeckUuid || yodeckScreen.uuid || null,
        screen.yodeckPlayerId || String(yodeckScreen.id),
        apiKey
      );

      if (contentResult.error === "all_strategies_failed") {
        console.log(`[Yodeck] Content for ${yodeckName} (${screen.screenId}): unknown (API endpoints failed)`);
        
        await storage.updateScreen(screen.id, {
          yodeckContentCount: null,
          yodeckContentSummary: null,
          yodeckContentLastFetchedAt: new Date(),
        });
        
        return {
          screenId: screen.screenId,
          yodeckName: yodeckScreen.name || yodeckName,
          yodeckId: String(yodeckScreen.id),
          status: "unknown",
          contentCount: null,
          summary: null,
          error: "api_failed",
        };
      }

      const items = contentResult.items;
      const contentCount = items.length;
      const summary = buildSummary(items);
      const status: ContentStatus = contentCount > 0 ? "has_content" : "empty";

      console.log(`[Yodeck] Content for ${yodeckName} (${screen.screenId}): ${contentCount} items (${summary})`);

      // Save to DB
      const contentSummary: ContentSummary = {
        items,
        topItems: items.slice(0, 5).map(i => `${i.type}: ${i.name}`),
        lastFetchedAt: new Date().toISOString(),
      };

      await storage.updateScreen(screen.id, {
        yodeckContentCount: contentCount,
        yodeckContentSummary: contentSummary,
        yodeckContentLastFetchedAt: new Date(),
      });

      return {
        screenId: screen.screenId,
        yodeckName: yodeckScreen.name || yodeckName,
        yodeckId: String(yodeckScreen.id),
        status,
        contentCount,
        summary,
        items,
      };
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  const stats = {
    total: results.length,
    withContent: results.filter(r => r.status === "has_content").length,
    empty: results.filter(r => r.status === "empty").length,
    unknown: results.filter(r => r.status === "unknown").length,
  };

  console.log(`[YodeckContent] Sync complete: ${stats.total} screens`);
  console.log(`[YodeckContent] Results: ${stats.withContent} with content, ${stats.empty} empty, ${stats.unknown} unknown`);

  return { 
    success: true, 
    results, 
    stats,
    yodeckScreenCount: yodeckScreens.length,
  };
}

/**
 * Sync content for a single screen (for on-demand refresh)
 */
export async function fetchScreenContentSummary(screen: {
  id: string;
  screenId: string;
  yodeckUuid?: string | null;
  yodeckPlayerId?: string | null;
  yodeckPlayerName?: string | null;
  name?: string | null;
}): Promise<ScreenContentResult> {
  const yodeckName = screen.yodeckPlayerName || screen.name || screen.screenId;
  
  const apiKey = await getYodeckApiKey();
  if (!apiKey) {
    return {
      screenId: screen.screenId,
      yodeckName,
      status: "unknown",
      contentCount: null,
      summary: null,
      error: "no_api_key",
    };
  }

  if (!screen.yodeckPlayerId && !screen.yodeckUuid) {
    return {
      screenId: screen.screenId,
      yodeckName,
      status: "unknown",
      contentCount: null,
      summary: null,
      error: "no_yodeck_id",
    };
  }

  const contentResult = await fetchScreenAssignedContent(
    screen.screenId,
    screen.yodeckUuid || null,
    screen.yodeckPlayerId || null,
    apiKey
  );

  if (contentResult.error === "all_strategies_failed") {
    await storage.updateScreen(screen.id, {
      yodeckContentCount: null,
      yodeckContentSummary: null,
      yodeckContentLastFetchedAt: new Date(),
    });
    
    return {
      screenId: screen.screenId,
      yodeckName,
      status: "unknown",
      contentCount: null,
      summary: null,
      error: "api_failed",
    };
  }

  const items = contentResult.items;
  const contentCount = items.length;
  const summary = buildSummary(items);
  const status: ContentStatus = contentCount > 0 ? "has_content" : "empty";

  const contentSummary: ContentSummary = {
    items,
    topItems: items.slice(0, 5).map(i => `${i.type}: ${i.name}`),
    lastFetchedAt: new Date().toISOString(),
  };

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
    items,
  };
}
