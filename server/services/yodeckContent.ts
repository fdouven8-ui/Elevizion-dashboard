/**
 * Yodeck Content Service
 * Fetches and parses what content is currently assigned to Yodeck screens
 * 
 * Strategy: 
 * 1. First fetch screen list to get all screen IDs
 * 2. For each screen, fetch detail endpoint to get assigned content
 * 3. Try multiple strategies: UUID first, then numeric ID
 * 4. Use null for "unknown", 0 for "truly empty"
 * 
 * ============================================================================
 * DEV NOTES - Yodeck API Integration
 * ============================================================================
 * 
 * ENDPOINTS USED:
 * - GET /api/v2/screens - List all screens (returns: id, uuid, name, workspace, state)
 * - GET /api/v2/screens/{uuid} - Get screen details (REQUIRES UUID, not numeric ID)
 * 
 * CRITICAL: The detail endpoint ONLY works with UUID, not the numeric screen ID!
 * Using numeric ID (e.g. 591896) returns 404. Always use the uuid field.
 * 
 * IDENTIFIER MAPPING:
 * - yodeckPlayerId = numeric ID (e.g. "591896") - used for display/reference only
 * - yodeckUuid = UUID string (e.g. "abc123-def456...") - REQUIRED for API calls
 * 
 * CONTENT STRUCTURE IN RESPONSE:
 * Yodeck returns content in two possible locations:
 * 1. Top-level fields: playlist, playlists, media, schedule, layout, apps, widgets
 * 2. assigned_content object: { playlists[], items[], media[], schedules[], etc. }
 * 
 * We check BOTH locations to maximize content detection.
 * 
 * EXAMPLE RESPONSE MAPPING:
 * {
 *   "id": 591896,
 *   "uuid": "abc123...",
 *   "name": "Test Screen",
 *   "assigned_content": {
 *     "playlists": [{ "id": 123, "name": "Main Playlist" }],
 *     "items": [{ "id": 456, "name": "Weather Widget", "type": "widget" }]
 *   }
 * }
 * => contentCount: 2, summary: "Playlist: Main Playlist • Widget: Weather Widget"
 * 
 * NULL vs 0 SEMANTICS:
 * - null = unknown (API failed, never synced, or endpoint returned error)
 * - 0 = truly empty (API confirmed no content assigned)
 * - >0 = has content (count of items)
 * ============================================================================
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
  // Yodeck API returns content in "screen_content" (observed) or "assigned_content" (documented)
  screen_content?: {
    playlists?: Array<{ id: number; name: string }>;
    media?: Array<{ id: number; name: string; filename?: string }>;
    schedules?: Array<{ id: number; name: string }>;
    layouts?: Array<{ id: number; name: string }>;
    apps?: Array<{ id: number; name: string; type?: string }>;
    webpages?: Array<{ id: number; name: string; url?: string }>;
    widgets?: Array<{ id: number; name: string; type?: string }>;
  } | null;
  assigned_content?: {
    playlists?: Array<{ id: number; name: string }>;
    items?: Array<{ id: number; name: string; type?: string }>;
    media?: Array<{ id: number; name: string }>;
    schedules?: Array<{ id: number; name: string }>;
    layouts?: Array<{ id: number; name: string }>;
    apps?: Array<{ id: number; name: string; type?: string }>;
    webpages?: Array<{ id: number; name: string; url?: string }>;
    widgets?: Array<{ id: number; name: string; type?: string }>;
  };
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
 * Fetch assigned content for a single screen
 * 
 * DEV NOTES - Yodeck API behavior:
 * - Screen detail endpoint ONLY works with numeric ID (e.g., 591896)
 * - UUID returns 404, so we skip it entirely to avoid unnecessary API calls
 * - The response contains screen_content with source_type, source_id, source_name
 */
async function fetchScreenAssignedContent(
  screenId: string,
  uuid: string | null,
  numericId: string | null,
  apiKey: string
): Promise<{ items: ContentItem[]; raw?: any; error?: string }> {
  // IMPORTANT: Only use numeric ID - UUID endpoint returns 404
  if (!numericId) {
    console.log(`[Yodeck] No numeric ID for ${screenId} - cannot fetch content details`);
    return { items: [], error: "no_numeric_id" };
  }

  const endpoint = `/screens/${numericId}`;
  console.log(`[Yodeck] Fetching content: GET ${YODECK_BASE_URL}${endpoint}`);
  
  const result = await yodeckApiRequest<YodeckScreenDetail>(endpoint, apiKey);
  
  if (result.ok && result.data) {
    const items = extractContentItems(result.data);
    
    // Log response for debugging
    console.log(`[Yodeck] Content for ${screenId}: ${items.length} items`);
    if (items.length > 0) {
      console.log(`[Yodeck] Content items: ${items.map(i => `${i.type}:${i.name}`).slice(0, 3).join(", ")}${items.length > 3 ? "..." : ""}`);
    }
    // Log screen_content structure
    if (result.data.screen_content) {
      console.log(`[Yodeck] screen_content: ${JSON.stringify(result.data.screen_content).substring(0, 150)}`);
    }
    
    return { items, raw: result.data };
  }
  
  if (result.status === 404) {
    console.log(`[Yodeck] 404 for ${endpoint} - screen may have been deleted from Yodeck`);
    return { items: [], error: "not_found" };
  }
  
  console.log(`[Yodeck] Error for ${endpoint}: ${result.error || result.status}`);
  return { items: [], error: result.error || `http_${result.status}` };
}

/**
 * Extract content items from Yodeck screen detail response
 * 
 * DEV NOTES - Yodeck API structure:
 * - Content can be at top-level (playlist, media, schedule, layout, apps, widgets) OR
 * - Inside assigned_content object (playlists[], items[], media[], schedules[], apps[], webpages[], widgets[])
 * - We check BOTH locations to maximize content detection
 */
function extractContentItems(screenData: YodeckScreenDetail): ContentItem[] {
  const items: ContentItem[] = [];
  const seenIds = new Set<string>(); // Avoid duplicates
  
  const addItem = (type: ContentItem["type"], name: string, id?: number) => {
    const key = `${type}-${id || name}`;
    if (!seenIds.has(key)) {
      seenIds.add(key);
      items.push({ type, name, id });
    }
  };
  
  // === TOP-LEVEL FIELDS (legacy/simple assignments) ===
  
  // Check for assigned playlist(s)
  if (screenData.playlist) {
    addItem("playlist", screenData.playlist.name, screenData.playlist.id);
  }
  if (screenData.playlists && Array.isArray(screenData.playlists)) {
    for (const p of screenData.playlists) {
      addItem("playlist", p.name, p.id);
    }
  }
  
  // Check for assigned media
  if (screenData.media) {
    addItem("media", screenData.media.name, screenData.media.id);
  }
  
  // Check for schedule
  if (screenData.schedule) {
    addItem("schedule", screenData.schedule.name, screenData.schedule.id);
  }
  
  // Check for layout
  if (screenData.layout) {
    addItem("layout", screenData.layout.name || "Actief", screenData.layout.id);
  }
  
  // Check for apps
  if (screenData.apps && Array.isArray(screenData.apps)) {
    for (const app of screenData.apps) {
      addItem("app", app.name || app.type || "App", app.id);
    }
  }
  
  // Check for webpages
  if (screenData.webpages && Array.isArray(screenData.webpages)) {
    for (const wp of screenData.webpages) {
      addItem("webpage", wp.name || wp.url || "Webpage", wp.id);
    }
  }
  
  // Check for widgets (news, weather, etc.)
  if (screenData.widgets && Array.isArray(screenData.widgets)) {
    for (const widget of screenData.widgets) {
      addItem("app", widget.name || widget.type || "Widget", widget.id);
    }
  }

  // === ASSIGNED_CONTENT OBJECT (Yodeck's actual structure for most screens) ===
  const ac = screenData.assigned_content;
  if (ac && typeof ac === "object") {
    // Playlists array
    if (ac.playlists && Array.isArray(ac.playlists)) {
      for (const p of ac.playlists) {
        addItem("playlist", p.name || `Playlist ${p.id}`, p.id);
      }
    }
    
    // Items array (generic content items)
    if (ac.items && Array.isArray(ac.items)) {
      for (const item of ac.items) {
        const itemType = (item.type?.toLowerCase() || "other") as ContentItem["type"];
        addItem(itemType === "playlist" || itemType === "media" || itemType === "schedule" || itemType === "layout" || itemType === "app" || itemType === "webpage" ? itemType : "other", 
          item.name || `Item ${item.id}`, item.id);
      }
    }
    
    // Media array
    if (ac.media && Array.isArray(ac.media)) {
      for (const m of ac.media) {
        addItem("media", m.name || `Media ${m.id}`, m.id);
      }
    }
    
    // Schedules array
    if (ac.schedules && Array.isArray(ac.schedules)) {
      for (const s of ac.schedules) {
        addItem("schedule", s.name || `Schedule ${s.id}`, s.id);
      }
    }
    
    // Layouts array
    if (ac.layouts && Array.isArray(ac.layouts)) {
      for (const l of ac.layouts) {
        addItem("layout", l.name || `Layout ${l.id}`, l.id);
      }
    }
    
    // Apps array
    if (ac.apps && Array.isArray(ac.apps)) {
      for (const app of ac.apps) {
        addItem("app", app.name || app.type || `App ${app.id}`, app.id);
      }
    }
    
    // Webpages array
    if (ac.webpages && Array.isArray(ac.webpages)) {
      for (const wp of ac.webpages) {
        addItem("webpage", wp.name || wp.url || `Webpage ${wp.id}`, wp.id);
      }
    }
    
    // Widgets array
    if (ac.widgets && Array.isArray(ac.widgets)) {
      for (const w of ac.widgets) {
        addItem("app", w.name || w.type || `Widget ${w.id}`, w.id);
      }
    }
  }

  // === SCREEN_CONTENT OBJECT (observed Yodeck API structure) ===
  // Format observed: {"source_type":"playlist","source_id":27644453,"source_name":"Test(auto-playlist-27644453-fit)"}
  const sc = screenData.screen_content as any;
  if (sc && typeof sc === "object") {
    // Check for single source assignment (source_type, source_id, source_name format)
    if (sc.source_type && sc.source_name) {
      const sourceType = String(sc.source_type).toLowerCase();
      const validTypes: Record<string, ContentItem["type"]> = {
        playlist: "playlist",
        media: "media",
        schedule: "schedule",
        layout: "layout",
        app: "app",
        webpage: "webpage",
        widget: "app",
      };
      const contentType = validTypes[sourceType] || "other";
      addItem(contentType, sc.source_name, sc.source_id);
    }
    
    // Also check for arrays (in case Yodeck changes their API format)
    // Playlists array
    if (sc.playlists && Array.isArray(sc.playlists)) {
      for (const p of sc.playlists) {
        addItem("playlist", p.name || `Playlist ${p.id}`, p.id);
      }
    }
    
    // Media array
    if (sc.media && Array.isArray(sc.media)) {
      for (const m of sc.media) {
        const mediaName = m.name || m.filename || `Media ${m.id}`;
        addItem("media", mediaName, m.id);
      }
    }
    
    // Schedules array
    if (sc.schedules && Array.isArray(sc.schedules)) {
      for (const s of sc.schedules) {
        addItem("schedule", s.name || `Schedule ${s.id}`, s.id);
      }
    }
    
    // Layouts array
    if (sc.layouts && Array.isArray(sc.layouts)) {
      for (const l of sc.layouts) {
        addItem("layout", l.name || `Layout ${l.id}`, l.id);
      }
    }
    
    // Apps array
    if (sc.apps && Array.isArray(sc.apps)) {
      for (const app of sc.apps) {
        addItem("app", app.name || app.type || `App ${app.id}`, app.id);
      }
    }
    
    // Webpages array
    if (sc.webpages && Array.isArray(sc.webpages)) {
      for (const wp of sc.webpages) {
        addItem("webpage", wp.name || wp.url || `Webpage ${wp.id}`, wp.id);
      }
    }
    
    // Widgets array
    if (sc.widgets && Array.isArray(sc.widgets)) {
      for (const w of sc.widgets) {
        addItem("app", w.name || w.type || `Widget ${w.id}`, w.id);
      }
    }
  }

  // === FALLBACK: Generic content field ===
  if (items.length === 0 && screenData.content) {
    // Check if content has any truthy properties that indicate content is present
    if (typeof screenData.content === "object" && Object.keys(screenData.content).length > 0) {
      addItem("other", "Content toegewezen");
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
        
        // Set to unknown (not in Yodeck)
        await storage.updateScreen(screen.id, {
          yodeckContentStatus: "unknown",
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

      if (contentResult.error) {
        console.log(`[Yodeck] Content for ${yodeckName} (${screen.screenId}): unknown (${contentResult.error})`);
        
        await storage.updateScreen(screen.id, {
          yodeckContentStatus: "unknown",
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
          error: contentResult.error,
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
        yodeckContentStatus: status, // has_content or empty
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
