/**
 * Yodeck Content Service
 * Fetches and parses what content is currently assigned to Yodeck screens
 * 
 * Strategy: 
 * 1. First fetch screen list to get all screen IDs (numeric ID + UUID)
 * 2. For each screen, fetch detail endpoint using NUMERIC ID to get assigned content
 * 3. Parse screen_content field for source_type/source_name
 * 
 * ============================================================================
 * DEV NOTES - Yodeck API Integration (Updated Dec 2025)
 * ============================================================================
 * 
 * ENDPOINTS USED:
 * - GET /api/v2/screens - List all screens (returns: id, uuid, name, workspace, state)
 * - GET /api/v2/screens/{id} - Get screen details (REQUIRES NUMERIC ID, not UUID!)
 * 
 * CRITICAL: The detail endpoint ONLY works with NUMERIC ID (e.g. 591896).
 * Using UUID returns 404! Always use the numeric id field from the list response.
 * 
 * IDENTIFIER MAPPING:
 * - yodeckPlayerId = numeric ID (e.g. "591896") - REQUIRED for detail API calls
 * - yodeckUuid = UUID string (e.g. "abc123-def456...") - for reference only
 * 
 * CONTENT STRUCTURE IN RESPONSE:
 * Yodeck returns content in screen_content object with format:
 * {"source_type":"playlist","source_id":27644453,"source_name":"Test Playlist"}
 * 
 * EXAMPLE RESPONSE:
 * GET /api/v2/screens/591896 returns:
 * {
 *   "id": 591896,
 *   "uuid": "abc123...",
 *   "name": "Test Screen",
 *   "screen_content": {
 *     "source_type": "playlist",
 *     "source_id": 27644453,
 *     "source_name": "Main Playlist"
 *   }
 * }
 * => contentCount: 1, summary: "Playlist: Main Playlist"
 * 
 * CONTENT STATUS SEMANTICS:
 * - "unknown" = API failed, never synced, or no Yodeck link
 * - "empty" = API confirmed no content assigned (screen_content is null)
 * - "has_content" = Content detected via API
 * - "likely_has_content" = Screenshot suggests content (fallback)
 * ============================================================================
 */

import { storage } from "../storage";
import { decryptCredentials } from "../crypto";
import { computePHashFromUrl, ImageHashResult, isHashMatch, findBestCreativeMatch } from "../utils/phash";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const CONCURRENT_LIMIT = 3; // Max parallel requests to avoid rate limiting

export type ContentStatus = "unknown" | "empty" | "has_content" | "error";

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

export interface MediaItem {
  id: number;
  name: string;
  type?: string;
  duration?: number;
  thumbnailUrl?: string;
}

export interface ContentSummary {
  items: ContentItem[];
  topItems: string[];
  lastFetchedAt: string;
  mediaItems?: MediaItem[];
  uniqueMediaCount?: number;
  mediaIds?: number[];
  sourceType?: string;
  sourceId?: number;
  sourceName?: string;
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
 * Check if a string looks like a real Yodeck numeric ID (not a dummy placeholder)
 */
function isRealYodeckId(playerId: string | null): boolean {
  if (!playerId) return false;
  // Dummy IDs use patterns like "yd_player_001", real Yodeck IDs are pure numbers
  return /^\d+$/.test(playerId);
}

/**
 * Fetch playlist items from Yodeck API
 * Returns array of media items within the playlist
 */
async function fetchPlaylistItems(playlistId: number, apiKey: string): Promise<MediaItem[]> {
  const endpoint = `/playlists/${playlistId}`;
  console.log(`[Yodeck] Fetching playlist ${playlistId}: GET ${YODECK_BASE_URL}${endpoint}`);
  
  const result = await yodeckApiRequest<any>(endpoint, apiKey);
  
  if (!result.ok || !result.data) {
    console.log(`[Yodeck] Playlist ${playlistId}: Failed with status ${result.status || result.error}`);
    return [];
  }
  
  const data = result.data;
  const mediaItems: MediaItem[] = [];
  
  console.log(`[Yodeck] Playlist ${playlistId} keys: [${Object.keys(data).join(", ")}]`);
  
  // Yodeck playlist response structure observed:
  // - items: array of {id, name, type, duration, ...}
  // - media: array of {id, name, filename, ...}
  // - slots: array of {media: {id, name, ...}, duration, ...}
  
  // Method 1: items array (most common)
  if (data.items && Array.isArray(data.items)) {
    for (const item of data.items) {
      // Each item might have embedded media reference
      if (item.media) {
        mediaItems.push({
          id: item.media.id,
          name: item.media.name || item.media.filename || `Media ${item.media.id}`,
          type: item.media.type || item.media.file_extension || "unknown",
          duration: item.duration || item.media.duration,
        });
      } else if (item.id) {
        mediaItems.push({
          id: item.id,
          name: item.name || item.title || `Item ${item.id}`,
          type: item.type || item.media_type || "unknown",
          duration: item.duration,
        });
      }
    }
  }
  
  // Method 2: media array
  if (data.media && Array.isArray(data.media)) {
    for (const m of data.media) {
      // Avoid duplicates
      if (!mediaItems.some(existing => existing.id === m.id)) {
        mediaItems.push({
          id: m.id,
          name: m.name || m.filename || `Media ${m.id}`,
          type: m.type || m.file_extension || "media",
          duration: m.duration,
        });
      }
    }
  }
  
  // Method 3: slots array (Yodeck format for some playlists)
  if (data.slots && Array.isArray(data.slots)) {
    for (const slot of data.slots) {
      if (slot.media && !mediaItems.some(existing => existing.id === slot.media.id)) {
        mediaItems.push({
          id: slot.media.id,
          name: slot.media.name || slot.media.filename || `Media ${slot.media.id}`,
          type: slot.media.type || slot.media.file_extension || "media",
          duration: slot.duration || slot.media.duration,
        });
      }
    }
  }
  
  console.log(`[Yodeck] Playlist ${playlistId}: Found ${mediaItems.length} media items`);
  return mediaItems;
}

/**
 * In-memory cache for media lookups during sync (prevents duplicate API calls)
 */
const mediaCache = new Map<number, MediaItem>();

/**
 * Fetch media details from Yodeck API (with caching)
 */
async function fetchMediaDetails(mediaId: number, apiKey: string): Promise<MediaItem | null> {
  // Check cache first
  if (mediaCache.has(mediaId)) {
    return mediaCache.get(mediaId)!;
  }
  
  const endpoint = `/media/${mediaId}`;
  const result = await yodeckApiRequest<any>(endpoint, apiKey);
  
  if (!result.ok || !result.data) {
    return null;
  }
  
  const data = result.data;
  const mediaItem: MediaItem = {
    id: mediaId,
    name: data.name || data.filename || `Media ${mediaId}`,
    type: data.type || data.file_extension || "unknown",
    duration: data.duration,
    thumbnailUrl: data.thumbnail_url || data.thumbnail,
  };
  
  // Cache for future use
  mediaCache.set(mediaId, mediaItem);
  return mediaItem;
}

/**
 * Clear media cache (call at start of sync run)
 */
export function clearMediaCache() {
  mediaCache.clear();
}

/**
 * Fetch assigned content for a single screen using multi-endpoint probe approach
 * 
 * DEV NOTES - Yodeck API behavior:
 * - Screen detail endpoint ONLY works with numeric ID (e.g., 591896)
 * - UUID returns 404, so we skip it entirely to avoid unnecessary API calls
 * - The response contains screen_content with source_type, source_id, source_name
 * 
 * PROBE ORDER (stops at first success with content):
 * 1. GET /screens/{id} - Primary endpoint, contains screen_content
 */
interface FetchContentResult {
  items: ContentItem[];
  mediaItems: MediaItem[];
  raw?: any;
  error?: string;
  confirmedEmpty?: boolean;
  endpoint?: string;
  sourceType?: string;
  sourceId?: number;
  sourceName?: string;
}

async function fetchScreenAssignedContent(
  screenId: string,
  uuid: string | null,
  numericId: string | null,
  apiKey: string
): Promise<FetchContentResult> {
  // Check if this is a real Yodeck ID (not a dummy placeholder)
  if (!numericId || !isRealYodeckId(numericId)) {
    console.log(`[Yodeck] ${screenId}: Invalid or dummy ID "${numericId}" - skipping API call`);
    return { items: [], mediaItems: [], error: "invalid_yodeck_id" };
  }

  const endpoint = `/screens/${numericId}`;
  console.log(`[Yodeck] ${screenId}: GET ${YODECK_BASE_URL}${endpoint}`);
  
  const result = await yodeckApiRequest<YodeckScreenDetail>(endpoint, apiKey);
  
  if (result.ok && result.data) {
    // Log response keys for debugging
    const responseKeys = Object.keys(result.data);
    console.log(`[Yodeck] ${screenId}: SUCCESS - Response keys: [${responseKeys.join(", ")}]`);
    
    const items = extractContentItems(result.data);
    
    // Log detailed content detection
    if (items.length > 0) {
      console.log(`[Yodeck] ${screenId}: CONTENT DETECTED - ${items.length} item(s):`);
      items.forEach((item, i) => {
        console.log(`[Yodeck]   ${i + 1}. ${item.type}: "${item.name}" (id: ${item.id || "n/a"})`);
      });
    }
    
    // Log screen_content structure if present
    const sc = result.data.screen_content as any;
    if (sc) {
      console.log(`[Yodeck] ${screenId}: screen_content = ${JSON.stringify(sc)}`);
    } else {
      console.log(`[Yodeck] ${screenId}: screen_content = null (no content assigned in Yodeck)`);
    }
    
    // Log assigned_content if present
    if (result.data.assigned_content) {
      console.log(`[Yodeck] ${screenId}: assigned_content found with keys: [${Object.keys(result.data.assigned_content).join(", ")}]`);
    }
    
    // Determine if screen is CONFIRMED empty
    const screenContent = result.data.screen_content as any;
    const assignedContent = result.data.assigned_content;
    const hasScreenContent = screenContent && (
      screenContent.source_type || 
      (screenContent.playlists?.length > 0) ||
      (screenContent.media?.length > 0) ||
      (screenContent.schedules?.length > 0)
    );
    const hasAssignedContent = assignedContent && (
      (assignedContent.playlists?.length || 0) > 0 ||
      (assignedContent.items?.length || 0) > 0 ||
      (assignedContent.media?.length || 0) > 0
    );
    
    const confirmedEmpty = items.length === 0 && !hasScreenContent && !hasAssignedContent;
    
    if (items.length === 0) {
      console.log(`[Yodeck] ${screenId}: NO CONTENT - confirmedEmpty=${confirmedEmpty}`);
    }
    
    // Fetch playlist items for all playlists found
    const allMediaItems: MediaItem[] = [];
    const playlistItems = items.filter(i => i.type === "playlist" && i.id);
    
    // Also check screen_content for playlist source
    if (sc?.source_type === "playlist" && sc?.source_id) {
      const playlistId = sc.source_id;
      // Check if we already have this playlist
      if (!playlistItems.some(p => p.id === playlistId)) {
        playlistItems.push({ type: "playlist", name: sc.source_name || `Playlist ${playlistId}`, id: playlistId });
      }
    }
    
    for (const playlist of playlistItems) {
      if (playlist.id && typeof playlist.id === "number") {
        const mediaItems = await fetchPlaylistItems(playlist.id, apiKey);
        for (const media of mediaItems) {
          // Avoid duplicates
          if (!allMediaItems.some(m => m.id === media.id)) {
            allMediaItems.push(media);
          }
        }
      }
    }
    
    if (allMediaItems.length > 0) {
      console.log(`[Yodeck] ${screenId}: TOTAL UNIQUE MEDIA ITEMS: ${allMediaItems.length}`);
    }
    
    // Extract source info from screen_content
    const sourceType = sc?.source_type as string | undefined;
    const sourceId = sc?.source_id as number | undefined;
    const sourceName = sc?.source_name as string | undefined;
    
    return { 
      items, 
      mediaItems: allMediaItems, 
      raw: result.data, 
      confirmedEmpty, 
      endpoint,
      sourceType,
      sourceId,
      sourceName,
    };
  }
  
  if (result.status === 404) {
    console.log(`[Yodeck] ${screenId}: 404 NOT FOUND - screen may have been deleted from Yodeck`);
    return { items: [], mediaItems: [], error: "not_found" };
  }
  
  console.log(`[Yodeck] ${screenId}: ERROR ${result.status || "network"} - ${result.error || "unknown"}`);
  return { items: [], mediaItems: [], error: result.error || `http_${result.status}` };
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

// Cache duration in milliseconds (10 minutes)
const CONTENT_CACHE_DURATION_MS = 10 * 60 * 1000;

// Minimum screenshot size to consider as "has content" (20KB)
const SCREENSHOT_MIN_SIZE_BYTES = 20 * 1024;

export interface ScreenshotAnalysisResult {
  hasContent: boolean;
  byteSize: number | null;
  hash: string | null;
  isEmptyOrBlank: boolean;
  matchedCreativeId?: string;
  matchedAdvertiserId?: string;
  matchSimilarity?: number;
  error?: string;
}

/**
 * Screenshot fallback - check if screenshot URL is valid and large enough
 * A screenshot > 20KB strongly suggests content is playing on the screen
 * 
 * Strategy:
 * 1. HEAD request to get content-type and content-length
 * 2. If HEAD doesn't give size, do partial GET request
 * 3. Check content-type starts with "image/"
 * 4. Check size > 20KB (arbitrary threshold for "real" content)
 */
async function checkScreenshotFallback(
  screenshotUrl: string,
  screenId: string
): Promise<{ hasContent: boolean; byteSize: number | null; error?: string }> {
  if (!screenshotUrl) {
    return { hasContent: false, byteSize: null, error: "no_url" };
  }

  console.log(`[Yodeck] ${screenId}: Trying screenshot fallback: ${screenshotUrl.substring(0, 60)}...`);

  try {
    // Try HEAD request first (faster, no body download)
    const headResponse = await fetch(screenshotUrl, {
      method: "HEAD",
      headers: {
        "Accept": "image/*",
      },
    });

    if (!headResponse.ok) {
      console.log(`[Yodeck] ${screenId}: Screenshot HEAD failed with ${headResponse.status}`);
      return { hasContent: false, byteSize: null, error: `http_${headResponse.status}` };
    }

    const contentType = headResponse.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      console.log(`[Yodeck] ${screenId}: Screenshot is not an image: ${contentType}`);
      return { hasContent: false, byteSize: null, error: "not_image" };
    }

    // Check content-length from HEAD response
    const contentLength = headResponse.headers.get("content-length");
    if (contentLength) {
      const byteSize = parseInt(contentLength, 10);
      const hasContent = byteSize >= SCREENSHOT_MIN_SIZE_BYTES;
      console.log(`[Yodeck] ${screenId}: Screenshot size=${byteSize} bytes, hasContent=${hasContent}`);
      return { hasContent, byteSize };
    }

    // If HEAD doesn't give size, do a partial GET to estimate
    console.log(`[Yodeck] ${screenId}: No content-length in HEAD, trying partial GET...`);
    const getResponse = await fetch(screenshotUrl, {
      method: "GET",
      headers: {
        "Accept": "image/*",
        "Range": "bytes=0-25000", // Get first 25KB to check
      },
    });

    if (!getResponse.ok && getResponse.status !== 206) {
      console.log(`[Yodeck] ${screenId}: Screenshot GET failed with ${getResponse.status}`);
      return { hasContent: false, byteSize: null, error: `http_${getResponse.status}` };
    }

    // Read the response body to get actual size
    const buffer = await getResponse.arrayBuffer();
    const byteSize = buffer.byteLength;
    
    // If we got 25KB (our range limit), likely there's more content
    const hasContent = byteSize >= SCREENSHOT_MIN_SIZE_BYTES;
    console.log(`[Yodeck] ${screenId}: Screenshot partial size=${byteSize} bytes, hasContent=${hasContent}`);
    
    return { hasContent, byteSize };
  } catch (error: any) {
    console.log(`[Yodeck] ${screenId}: Screenshot fetch error: ${error.message}`);
    return { hasContent: false, byteSize: null, error: error.message };
  }
}

/**
 * Advanced screenshot analysis with perceptual hashing
 * 1. Download screenshot and compute pHash
 * 2. Check if blank/empty screen
 * 3. Match against known creative hashes in database
 * 
 * Returns detailed analysis including matched creative if found
 */
export async function analyzeScreenshot(
  screenshotUrl: string,
  screenId: string
): Promise<ScreenshotAnalysisResult> {
  if (!screenshotUrl) {
    return { hasContent: false, byteSize: null, hash: null, isEmptyOrBlank: false, error: "no_url" };
  }

  console.log(`[Yodeck] ${screenId}: Analyzing screenshot with pHash...`);

  try {
    // Compute pHash from screenshot
    const hashResult = await computePHashFromUrl(screenshotUrl);
    
    if (!hashResult) {
      console.log(`[Yodeck] ${screenId}: Failed to compute pHash`);
      return { hasContent: false, byteSize: null, hash: null, isEmptyOrBlank: false, error: "hash_failed" };
    }

    console.log(`[Yodeck] ${screenId}: pHash computed: ${hashResult.hash.substring(0, 16)}... empty=${hashResult.isEmptyOrBlank}`);

    // If the image appears blank/empty, return early
    if (hashResult.isEmptyOrBlank) {
      console.log(`[Yodeck] ${screenId}: Screenshot appears blank/empty`);
      return { 
        hasContent: false, 
        byteSize: null, 
        hash: hashResult.hash, 
        isEmptyOrBlank: true 
      };
    }

    // Try to match against known creative hashes
    const creatives = await storage.getCreativesWithHash();
    if (creatives.length > 0) {
      const match = await findBestCreativeMatch(
        hashResult.hash,
        creatives.map(c => ({ id: c.id, hash: c.phash!, advertiserId: c.advertiserId })),
        0.80 // 80% similarity threshold
      );

      if (match) {
        console.log(`[Yodeck] ${screenId}: Matched creative ${match.creativeId} (${Math.round(match.similarity * 100)}% match)`);
        return {
          hasContent: true,
          byteSize: null,
          hash: hashResult.hash,
          isEmptyOrBlank: false,
          matchedCreativeId: match.creativeId,
          matchedAdvertiserId: match.advertiserId,
          matchSimilarity: match.similarity
        };
      }
    }

    // Has content but no matching creative (unmanaged content)
    console.log(`[Yodeck] ${screenId}: Screenshot has content but no matching creative`);
    return {
      hasContent: true,
      byteSize: null,
      hash: hashResult.hash,
      isEmptyOrBlank: false
    };

  } catch (error: any) {
    console.log(`[Yodeck] ${screenId}: Screenshot analysis error: ${error.message}`);
    return { hasContent: false, byteSize: null, hash: null, isEmptyOrBlank: false, error: error.message };
  }
}

/**
 * Sync content for all screens in database
 * @param force - If true, skip cache and force refresh all screens
 */
export async function syncAllScreensContent(force: boolean = false): Promise<{
  success: boolean;
  results: ScreenContentResult[];
  stats: {
    total: number;
    withContent: number;
    empty: number;
    unknown: number;
    error: number;
    skipped: number;
  };
  yodeckScreenCount?: number;
}> {
  const apiKey = await getYodeckApiKey();
  if (!apiKey) {
    console.warn("[YodeckContent] No API key configured");
    return {
      success: false,
      results: [],
      stats: { total: 0, withContent: 0, empty: 0, unknown: 0, error: 0, skipped: 0 },
    };
  }

  // First, fetch screen list to verify which screens exist
  const listResult = await yodeckApiRequest<{ results?: YodeckScreenListItem[]; count?: number }>("/screens", apiKey);
  
  if (!listResult.ok) {
    console.error(`[YodeckContent] Failed to fetch screen list: ${listResult.error}`);
    return {
      success: false,
      results: [],
      stats: { total: 0, withContent: 0, empty: 0, unknown: 0, error: 0, skipped: 0 },
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
  const now = new Date();

  // Process screens in batches for rate limiting
  for (let i = 0; i < dbScreens.length; i += CONCURRENT_LIMIT) {
    const batch = dbScreens.slice(i, i + CONCURRENT_LIMIT);
    
    const batchPromises = batch.map(async (screen): Promise<ScreenContentResult & { skipped?: boolean }> => {
      const yodeckName = screen.yodeckPlayerName || screen.name || screen.screenId;
      
      // Check cache: skip if last fetched within cache duration (unless force=true)
      if (!force && screen.yodeckContentLastFetchedAt) {
        const lastFetched = new Date(screen.yodeckContentLastFetchedAt);
        const ageMs = now.getTime() - lastFetched.getTime();
        if (ageMs < CONTENT_CACHE_DURATION_MS) {
          console.log(`[Yodeck] Content for ${yodeckName} (${screen.screenId}): cached (${Math.round(ageMs / 1000)}s ago)`);
          return {
            screenId: screen.screenId,
            yodeckName,
            status: (screen.yodeckContentStatus as ContentStatus) || "unknown",
            contentCount: screen.yodeckContentCount,
            summary: screen.yodeckContentSummary ? buildSummary((screen.yodeckContentSummary as ContentSummary).items || []) : null,
            skipped: true,
          };
        }
      }
      
      // First, check if screen has a valid Yodeck ID (not a dummy placeholder)
      const hasRealYodeckId = isRealYodeckId(screen.yodeckPlayerId);
      
      if (!hasRealYodeckId && !screen.yodeckUuid) {
        console.log(`[Yodeck] ${screen.screenId}: NOT LINKED - No valid Yodeck player ID or UUID`);
        
        // Set to unknown (not linked to Yodeck)
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
          error: "not_linked_to_yodeck",
        };
      }

      // Check if screen exists in Yodeck screen list
      let yodeckScreen: YodeckScreenListItem | undefined;
      if (hasRealYodeckId && screen.yodeckPlayerId) {
        yodeckScreen = yodeckById.get(screen.yodeckPlayerId);
      }
      if (!yodeckScreen && screen.yodeckUuid) {
        yodeckScreen = yodeckByUuid.get(screen.yodeckUuid);
      }

      if (!yodeckScreen) {
        console.log(`[Yodeck] ${screen.screenId}: NOT FOUND IN LIST - ID "${screen.yodeckPlayerId}" UUID "${screen.yodeckUuid}" not in Yodeck`);
        
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

      // Determine the numeric ID to use for API call
      // ALWAYS prefer the matched yodeckScreen.id (numeric) over screen.yodeckPlayerId (may be dummy)
      const numericIdToUse = String(yodeckScreen.id);
      
      // Fetch content details using multi-strategy approach
      const contentResult = await fetchScreenAssignedContent(
        screen.screenId,
        screen.yodeckUuid || yodeckScreen.uuid || null,
        numericIdToUse,
        apiKey
      );

      if (contentResult.error) {
        // Local skip reasons should NOT be marked as "error"
        if (contentResult.error === "invalid_yodeck_id") {
          // This shouldn't happen now since we use yodeckScreen.id, but handle gracefully
          console.log(`[Yodeck] ${screen.screenId}: SKIP - Invalid ID despite match`);
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
        
        const errorMessage = contentResult.error === "not_found"
          ? "Screen not found in Yodeck (404)"
          : `API error: ${contentResult.error}`;
        
        console.log(`[Yodeck] ${screen.screenId}: API ERROR - ${contentResult.error}`);
        
        await storage.updateScreen(screen.id, {
          yodeckContentStatus: "error",
          yodeckContentCount: null,
          yodeckContentSummary: null,
          yodeckContentLastFetchedAt: new Date(),
          yodeckContentError: errorMessage,
        });
        
        return {
          screenId: screen.screenId,
          yodeckName: yodeckScreen.name || yodeckName,
          yodeckId: String(yodeckScreen.id),
          status: "error",
          contentCount: null,
          summary: null,
          error: contentResult.error,
        };
      }

      const items = contentResult.items;
      const mediaItems = contentResult.mediaItems;
      // Use media items count if available, otherwise fall back to content items count
      const uniqueMediaCount = mediaItems.length;
      const contentCount = uniqueMediaCount > 0 ? uniqueMediaCount : items.length;
      const summary = buildSummary(items);
      
      // Log media items if found
      if (mediaItems.length > 0) {
        console.log(`[Yodeck] ${screen.screenId}: Found ${mediaItems.length} unique media items in playlists`);
        mediaItems.slice(0, 5).forEach((m, i) => {
          console.log(`[Yodeck]   ${i + 1}. ${m.type || "media"}: "${m.name}" (id: ${m.id})`);
        });
      }
      
      // CRITICAL STATUS LOGIC:
      // - "has_content" = We found content items
      // - "empty" = API explicitly confirmed no content (confirmedEmpty=true)
      // - "unknown" = We couldn't find content but API didn't confirm empty
      let status: ContentStatus;
      let screenshotFallbackUsed = false;
      
      if (contentCount > 0) {
        status = "has_content";
      } else if (contentResult.confirmedEmpty === true) {
        // ONLY set "empty" if API explicitly confirmed no content
        status = "empty";
        console.log(`[Yodeck] ${screen.screenId}: CONFIRMED EMPTY by API`);
      } else {
        // We couldn't find content but API didn't confirm empty
        // Try screenshot fallback before giving up
        const screenshotUrl = screen.yodeckScreenshotUrl;
        if (screenshotUrl) {
          // Try advanced screenshot analysis with pHash
          const analysisResult = await analyzeScreenshot(screenshotUrl, screen.screenId);
          
          if (analysisResult.isEmptyOrBlank) {
            // Screenshot analysis confirms screen is blank/empty
            status = "empty";
            console.log(`[Yodeck] ${screen.screenId}: Screenshot analysis confirms BLANK/EMPTY screen`);
            
            await storage.updateScreen(screen.id, {
              yodeckScreenshotLastOkAt: new Date(),
              yodeckScreenshotHash: analysisResult.hash,
            });
          } else if (analysisResult.hasContent) {
            status = "has_content";
            screenshotFallbackUsed = true;
            console.log(`[Yodeck] ${screen.screenId}: Screenshot analysis SUCCESS - hash=${analysisResult.hash?.substring(0, 16)}...`);
            
            // Update screenshot tracking fields with hash
            await storage.updateScreen(screen.id, {
              yodeckScreenshotLastOkAt: new Date(),
              yodeckScreenshotByteSize: analysisResult.byteSize,
              yodeckScreenshotHash: analysisResult.hash,
            });
            
            // If matched a creative, log it (for future use in managed content detection)
            if (analysisResult.matchedCreativeId) {
              console.log(`[Yodeck] ${screen.screenId}: Matched creative ${analysisResult.matchedCreativeId} (${Math.round((analysisResult.matchSimilarity || 0) * 100)}%)`);
            }
          } else {
            // Screenshot fallback also failed - stay unknown
            status = "unknown";
            console.log(`[Yodeck] ${screen.screenId}: Screenshot fallback failed - keeping as unknown`);
          }
        } else {
          status = "unknown";
          console.log(`[Yodeck] ${screen.screenId}: No content found, no screenshot URL - keeping as unknown`);
        }
      }

      console.log(`[Yodeck] Content for ${yodeckName} (${screen.screenId}): ${contentCount} items, status=${status}${screenshotFallbackUsed ? " (screenshot fallback)" : ""}`);

      // Save to DB - include media items for detailed content tracking
      const contentSummary: ContentSummary = {
        items: screenshotFallbackUsed && items.length === 0 
          ? [{ type: "other" as const, name: "Screenshot OK (content detected via fallback)" }]
          : items,
        topItems: screenshotFallbackUsed && items.length === 0
          ? ["Screenshot OK (fallback)"]
          : mediaItems.length > 0
            ? mediaItems.slice(0, 5).map(m => `${m.type || "media"}: ${m.name}`)
            : items.slice(0, 5).map(i => `${i.type}: ${i.name}`),
        lastFetchedAt: new Date().toISOString(),
        mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
        uniqueMediaCount: mediaItems.length > 0 ? mediaItems.length : undefined,
        mediaIds: mediaItems.length > 0 ? mediaItems.map(m => m.id) : undefined,
        sourceType: contentResult.sourceType,
        sourceId: contentResult.sourceId,
        sourceName: contentResult.sourceName,
      };

      await storage.updateScreen(screen.id, {
        yodeckContentStatus: status,
        yodeckContentCount: screenshotFallbackUsed ? 1 : contentCount,
        yodeckContentSummary: contentSummary,
        yodeckContentLastFetchedAt: new Date(),
        yodeckContentError: null, // Clear any previous error
      });

      // Return consistent data for both API items and screenshot fallback
      const finalContentCount = screenshotFallbackUsed ? 1 : contentCount;
      const finalSummary = screenshotFallbackUsed && items.length === 0 
        ? "Screenshot OK (fallback)" 
        : summary;
      const finalItems = screenshotFallbackUsed && items.length === 0
        ? [{ type: "other" as const, name: "Screenshot OK (content detected via fallback)" }]
        : items;

      return {
        screenId: screen.screenId,
        yodeckName: yodeckScreen.name || yodeckName,
        yodeckId: String(yodeckScreen.id),
        status,
        contentCount: finalContentCount,
        summary: finalSummary,
        items: finalItems,
        mediaIds: mediaItems.map(m => m.id),
        uniqueMediaCount: mediaItems.length,
        sourceType: contentResult.sourceType,
        sourceId: contentResult.sourceId,
        sourceName: contentResult.sourceName,
      };
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  const skippedCount = results.filter((r: any) => r.skipped === true).length;
  
  // Calculate totals across all screens
  const allMediaIds = new Set<number>();
  let totalMediaAssignments = 0;
  
  for (const r of results) {
    if (r.mediaIds && Array.isArray(r.mediaIds)) {
      for (const id of r.mediaIds) {
        allMediaIds.add(id);
      }
      totalMediaAssignments += r.mediaIds.length;
    }
  }
  
  const stats = {
    total: results.length,
    withContent: results.filter(r => r.status === "has_content").length,
    empty: results.filter(r => r.status === "empty").length,
    unknown: results.filter(r => r.status === "unknown").length,
    error: results.filter(r => r.status === "error").length,
    skipped: skippedCount,
  };

  console.log(`[YodeckContent] Sync complete: ${stats.total} screens (${stats.skipped} cached)`);
  console.log(`[YodeckContent] Results: ${stats.withContent} with content, ${stats.empty} empty, ${stats.unknown} unknown, ${stats.error} errors`);
  console.log(`[YodeckContent] Totals: ${allMediaIds.size} unique media, ${totalMediaAssignments} total assignments`);

  return { 
    success: true, 
    results, 
    stats,
    yodeckScreenCount: yodeckScreens.length,
    totals: {
      totalUniqueMedia: allMediaIds.size,
      totalMediaAssignments,
    },
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

  // Handle API errors - set status to "error" with error message
  if (contentResult.error) {
    const errorMessage = contentResult.error === "all_strategies_failed" 
      ? "API calls failed" 
      : contentResult.error === "not_found"
      ? "Screen not found in Yodeck (404)"
      : contentResult.error === "no_numeric_id"
      ? "No numeric Yodeck ID available"
      : `API error: ${contentResult.error}`;
    
    await storage.updateScreen(screen.id, {
      yodeckContentCount: null,
      yodeckContentSummary: null,
      yodeckContentLastFetchedAt: new Date(),
      yodeckContentStatus: "error",
      yodeckContentError: errorMessage,
    });
    
    return {
      screenId: screen.screenId,
      yodeckName,
      status: "error",
      contentCount: null,
      summary: null,
      error: contentResult.error,
    };
  }

  const items = contentResult.items;
  const contentCount = items.length;
  const summary = buildSummary(items);
  
  // Determine content status:
  // - "has_content": We found content items
  // - "empty": API confirmed NO content (confirmedEmpty=true)
  // - "unknown": We couldn't extract content but API didn't confirm empty
  let status: ContentStatus;
  if (contentCount > 0) {
    status = "has_content";
  } else if (contentResult.confirmedEmpty) {
    // Only set "empty" if API explicitly confirmed no content
    status = "empty";
    console.log(`[Yodeck] Screen ${screen.screenId} confirmed EMPTY by API`);
  } else {
    // We couldn't find content but API didn't confirm empty - stay unknown
    status = "unknown";
    console.log(`[Yodeck] Screen ${screen.screenId} content unclear - keeping as unknown`);
  }

  const contentSummary: ContentSummary = {
    items,
    topItems: items.slice(0, 5).map(i => `${i.type}: ${i.name}`),
    lastFetchedAt: new Date().toISOString(),
  };

  await storage.updateScreen(screen.id, {
    yodeckContentCount: contentCount,
    yodeckContentSummary: contentSummary,
    yodeckContentLastFetchedAt: new Date(),
    yodeckContentStatus: status,
    yodeckContentError: null, // Clear any previous error
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

/**
 * Debug function to inspect raw Yodeck API responses for a specific screen
 * Tries multiple endpoints and returns all attempts for debugging
 */
export async function debugYodeckScreen(yodeckScreenId: string): Promise<{
  tried: Array<{ endpoint: string; url: string; status: number | string; success: boolean }>;
  data: any;
  error?: string;
}> {
  const apiKey = await getYodeckApiKey();
  if (!apiKey) {
    return { tried: [], data: null, error: "No Yodeck API key configured" };
  }

  const tried: Array<{ endpoint: string; url: string; status: number | string; success: boolean }> = [];
  let successData: any = null;

  // Try endpoint 1: GET /screens/{id} (numeric ID - the working method)
  const endpoint1 = `/screens/${yodeckScreenId}`;
  const url1 = `${YODECK_BASE_URL}${endpoint1}`;
  console.log(`[YodeckDebug] Trying: GET ${url1}`);
  
  try {
    const response1 = await fetch(url1, {
      headers: {
        "Authorization": `Token ${apiKey.substring(0, 4)}...`, // Don't log full key
        "Accept": "application/json",
      },
    });
    
    // Actually make the request with full key
    const realResponse1 = await fetch(url1, {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Accept": "application/json",
      },
    });

    const attempt1 = {
      endpoint: "GET /screens/{id}",
      url: url1,
      status: realResponse1.status,
      success: realResponse1.ok,
    };
    tried.push(attempt1);

    if (realResponse1.ok) {
      successData = await realResponse1.json();
      console.log(`[YodeckDebug] Success on ${endpoint1}`);
    } else {
      console.log(`[YodeckDebug] Failed ${endpoint1}: ${realResponse1.status}`);
    }
  } catch (e: any) {
    tried.push({
      endpoint: "GET /screens/{id}",
      url: url1,
      status: e.message || "error",
      success: false,
    });
  }

  // If first attempt failed, try with trailing slash
  if (!successData) {
    const endpoint2 = `/screens/${yodeckScreenId}/`;
    const url2 = `${YODECK_BASE_URL}${endpoint2}`;
    console.log(`[YodeckDebug] Trying: GET ${url2}`);
    
    try {
      const realResponse2 = await fetch(url2, {
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
        },
      });

      tried.push({
        endpoint: "GET /screens/{id}/",
        url: url2,
        status: realResponse2.status,
        success: realResponse2.ok,
      });

      if (realResponse2.ok) {
        successData = await realResponse2.json();
        console.log(`[YodeckDebug] Success on ${endpoint2}`);
      }
    } catch (e: any) {
      tried.push({
        endpoint: "GET /screens/{id}/",
        url: url2,
        status: e.message || "error",
        success: false,
      });
    }
  }

  // Try players endpoint if screens failed
  if (!successData) {
    const endpoint3 = `/players/${yodeckScreenId}`;
    const url3 = `${YODECK_BASE_URL}${endpoint3}`;
    console.log(`[YodeckDebug] Trying: GET ${url3}`);
    
    try {
      const realResponse3 = await fetch(url3, {
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
        },
      });

      tried.push({
        endpoint: "GET /players/{id}",
        url: url3,
        status: realResponse3.status,
        success: realResponse3.ok,
      });

      if (realResponse3.ok) {
        successData = await realResponse3.json();
        console.log(`[YodeckDebug] Success on ${endpoint3}`);
      }
    } catch (e: any) {
      tried.push({
        endpoint: "GET /players/{id}",
        url: url3,
        status: e.message || "error",
        success: false,
      });
    }
  }

  return {
    tried,
    data: successData,
    error: successData ? undefined : "All endpoints failed",
  };
}

/**
 * DISCOVERY FUNCTION - Probe multiple Yodeck endpoints to find content
 * Tries various endpoint patterns and fetches playlist items if a playlist is assigned
 * 
 * This function is more thorough than the regular sync - used for debugging
 * and to understand which endpoints work for a specific Yodeck account/plan.
 */
export async function discoverScreenContent(playerId: string): Promise<{
  tried: Array<{ 
    endpoint: string; 
    status: number | string; 
    keys?: string[]; 
    hasContent?: boolean;
    snippet?: any;
  }>;
  resolved: {
    count: number;
    playlists: Array<{ id: number; name: string }>;
    topItems: string[];
    status: "has_content" | "empty" | "unknown" | "error";
    statusReason: string;
  };
  rawSample?: any;
  playlistItems?: Array<{ id: number; name: string; type?: string }>;
}> {
  const apiKey = await getYodeckApiKey();
  if (!apiKey) {
    return {
      tried: [],
      resolved: {
        count: 0,
        playlists: [],
        topItems: [],
        status: "error",
        statusReason: "No Yodeck API key configured",
      },
    };
  }

  const tried: Array<{ 
    endpoint: string; 
    status: number | string; 
    keys?: string[]; 
    hasContent?: boolean;
    snippet?: any;
  }> = [];
  
  let screenData: any = null;
  let resolvedPlaylists: Array<{ id: number; name: string }> = [];
  let playlistItems: Array<{ id: number; name: string; type?: string }> = [];
  let statusReason = "";

  // List of endpoints to try (in order of priority)
  const endpointsToTry = [
    { path: `/screens/${playerId}`, name: "GET /screens/{id}" },
    { path: `/screens/${playerId}/`, name: "GET /screens/{id}/" },
    { path: `/screens/${playerId}/details`, name: "GET /screens/{id}/details" },
    { path: `/screens/${playerId}/playlists`, name: "GET /screens/{id}/playlists" },
    { path: `/screens/${playerId}/schedule`, name: "GET /screens/{id}/schedule" },
    { path: `/screens/${playerId}/assigned`, name: "GET /screens/{id}/assigned" },
    { path: `/players/${playerId}`, name: "GET /players/{id}" },
    { path: `/players/${playerId}/playlists`, name: "GET /players/{id}/playlists" },
  ];

  console.log(`[YodeckDiscovery] Starting discovery for playerId=${playerId}`);

  for (const ep of endpointsToTry) {
    if (screenData) break; // Stop once we have data
    
    const url = `${YODECK_BASE_URL}${ep.path}`;
    console.log(`[YodeckDiscovery] Trying: ${ep.name}`);
    
    try {
      const response = await fetch(url, {
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Accept": "application/json",
        },
      });

      const attempt: typeof tried[0] = {
        endpoint: ep.name,
        status: response.status,
      };

      if (response.ok) {
        const data = await response.json();
        attempt.keys = Object.keys(data);
        
        // Check if this response has content info
        const hasContent = !!(
          data.screen_content || 
          data.assigned_content || 
          data.playlist || 
          data.playlists?.length > 0 ||
          data.schedule ||
          data.layout ||
          data.media ||
          data.items?.length > 0
        );
        attempt.hasContent = hasContent;
        
        // Include a small snippet for debugging
        if (data.screen_content) {
          attempt.snippet = { screen_content: data.screen_content };
        } else if (data.playlist) {
          attempt.snippet = { playlist: data.playlist };
        } else if (data.playlists) {
          attempt.snippet = { playlists: data.playlists };
        }

        if (hasContent || ep.name === "GET /screens/{id}") {
          screenData = data;
          statusReason = `Found via ${ep.name}`;
          console.log(`[YodeckDiscovery] SUCCESS on ${ep.name} - keys: [${attempt.keys.join(", ")}]`);
        }
      } else {
        console.log(`[YodeckDiscovery] ${ep.name} returned ${response.status}`);
      }

      tried.push(attempt);
    } catch (e: any) {
      tried.push({
        endpoint: ep.name,
        status: `error: ${e.message}`,
      });
    }
  }

  // If we found screen data, extract content
  if (screenData) {
    const items = extractContentItems(screenData);
    
    // Extract playlists specifically
    const sc = screenData.screen_content as any;
    if (sc?.source_type === "playlist" && sc?.source_id) {
      resolvedPlaylists.push({ id: sc.source_id, name: sc.source_name || `Playlist ${sc.source_id}` });
      
      // Try to fetch playlist items
      console.log(`[YodeckDiscovery] Fetching playlist items for playlist ${sc.source_id}...`);
      try {
        const playlistResult = await fetch(`${YODECK_BASE_URL}/playlists/${sc.source_id}`, {
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Accept": "application/json",
          },
        });
        
        tried.push({
          endpoint: `GET /playlists/${sc.source_id}`,
          status: playlistResult.status,
        });

        if (playlistResult.ok) {
          const playlistData = await playlistResult.json();
          console.log(`[YodeckDiscovery] Playlist ${sc.source_id} keys: [${Object.keys(playlistData).join(", ")}]`);
          
          // Extract items from playlist
          if (playlistData.items && Array.isArray(playlistData.items)) {
            playlistItems = playlistData.items.map((item: any) => ({
              id: item.id,
              name: item.name || item.title || `Item ${item.id}`,
              type: item.type || item.media_type || "unknown",
            }));
            console.log(`[YodeckDiscovery] Found ${playlistItems.length} items in playlist`);
          } else if (playlistData.media && Array.isArray(playlistData.media)) {
            playlistItems = playlistData.media.map((m: any) => ({
              id: m.id,
              name: m.name || m.filename || `Media ${m.id}`,
              type: "media",
            }));
          }
        }
      } catch (e: any) {
        console.log(`[YodeckDiscovery] Failed to fetch playlist: ${e.message}`);
        tried.push({
          endpoint: `GET /playlists/${sc.source_id}`,
          status: `error: ${e.message}`,
        });
      }
    }

    // Build topItems from content
    const topItems = items.slice(0, 5).map(i => `${i.type}: ${i.name}`);
    
    // Add playlist items to topItems if we have them
    if (playlistItems.length > 0 && topItems.length < 5) {
      const remaining = 5 - topItems.length;
      for (let i = 0; i < Math.min(remaining, playlistItems.length); i++) {
        topItems.push(`${playlistItems[i].type}: ${playlistItems[i].name}`);
      }
    }

    const contentCount = items.length + playlistItems.length;

    return {
      tried,
      resolved: {
        count: contentCount,
        playlists: resolvedPlaylists,
        topItems,
        status: contentCount > 0 ? "has_content" : "empty",
        statusReason: statusReason || (contentCount > 0 ? "Content found" : "No content detected"),
      },
      rawSample: screenData,
      playlistItems: playlistItems.length > 0 ? playlistItems : undefined,
    };
  }

  // No data found at all
  return {
    tried,
    resolved: {
      count: 0,
      playlists: [],
      topItems: [],
      status: "unknown",
      statusReason: "All endpoints failed or returned no data",
    },
  };
}
