/**
 * Yodeck Content Inventory Service
 * 
 * Resolves the full content hierarchy for all Yodeck screens:
 * - Screens → screen_content (playlist/layout/schedule)
 * - Playlists → items (media/widget/nested playlists/layouts)
 * - Layouts → regions (media/widget/playlists)
 * - Schedules → events + filler_content
 * 
 * Features:
 * - Recursive resolution with loop detection (visited sets)
 * - In-memory caching for media details
 * - Rate limiting (max 5 concurrent requests)
 * - Comprehensive media breakdown by type
 */

import { storage } from "../storage";
import { decryptCredentials } from "../crypto";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const MAX_CONCURRENT = 5;
const REQUEST_TIMEOUT = 10000;
const MAX_RETRIES = 2;

// Types for Yodeck API responses
interface YodeckScreenContent {
  source_type: "playlist" | "layout" | "schedule" | null;
  source_id: number | null;
  source_name: string | null;
}

interface YodeckScreen {
  id: number;
  name: string;
  workspace?: { id: number; name: string };
  screen_content?: YodeckScreenContent;
}

interface YodeckPlaylistItem {
  id: number;
  name?: string;
  type: "media" | "widget" | "layout" | "playlist";
  priority?: number;
  duration?: number;
  media_id?: number;
  resource_id?: number;
  playlist_id?: number;
  layout_id?: number;
  media?: {
    id: number;
    name?: string;
    type?: string;
  };
  playlist?: {
    id: number;
    name?: string;
  };
  layout?: {
    id: number;
    name?: string;
  };
}

interface YodeckPlaylist {
  id: number;
  name: string;
  items: YodeckPlaylistItem[];
}

interface YodeckLayoutRegion {
  item?: {
    type: "playlist" | "widget" | "media" | "layout";
    id: number;
    media?: { id: number; name?: string };
    playlist?: { id: number; name?: string };
    layout?: { id: number; name?: string };
  };
  duration?: number;
}

interface YodeckLayout {
  id: number;
  name: string;
  regions: YodeckLayoutRegion[];
  background_audio?: {
    item?: { type: string; id: number };
  };
}

interface YodeckScheduleEvent {
  source?: {
    source_type: "layout" | "playlist";
    source_id: number;
    source_name?: string;
  };
}

interface YodeckSchedule {
  id: number;
  name: string;
  events: YodeckScheduleEvent[];
  filler_content?: {
    source_type: "playlist" | "layout";
    source_id: number;
    source_name?: string;
  };
}

interface YodeckMedia {
  id: number;
  name: string;
  media_origin?: {
    type: "image" | "video" | "audio" | string;
    source?: string;
    format?: string | null;
  };
  file_extension?: string;
  tags?: string[];
  workspace?: { id: number; name: string };
  parent_folder?: { id: number; name: string };
}

// Resolved content result
export interface ResolvedContent {
  mediaIds: number[];
  widgetCount: number;
  totalPlaylistItems: number;
  nestedPlaylistCount: number;
  nestedLayoutCount: number;
}

export interface MediaDetail {
  id: number;
  name: string;
  type: "image" | "video" | "audio" | "other";
  file_extension?: string;
  folder?: string;
  tags?: string[];
}

export interface ScreenInventory {
  screenId: number;
  name: string;
  workspaceId?: number;
  workspaceName?: string;
  screen_content: YodeckScreenContent | null;
  counts: {
    totalPlaylistItems: number;
    mediaItemsTotal: number;
    uniqueMediaIds: number;
    widgetItemsTotal: number;
  };
  mediaBreakdown: {
    video: number;
    image: number;
    audio: number;
    other: number;
  };
  media: MediaDetail[];
}

export interface InventoryResult {
  generatedAt: string;
  screens: ScreenInventory[];
  totals: {
    screens: number;
    totalItemsAllScreens: number;
    totalMediaAllScreens: number;
    uniqueMediaAcrossAllScreens: number;
    topMediaByScreens: Array<{ mediaId: number; name: string; screenCount: number }>;
  };
}

// In-memory caches (cleared per inventory run)
let mediaCache = new Map<number, MediaDetail>();
let playlistCache = new Map<number, YodeckPlaylist>();
let layoutCache = new Map<number, YodeckLayout>();
let scheduleCache = new Map<number, YodeckSchedule>();

// Simple semaphore for rate limiting
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.permits++;
    }
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT);

/**
 * Get Yodeck API key from integrations table
 */
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

/**
 * Make a Yodeck API request with retries and timeout
 */
async function yodeckRequest<T>(
  endpoint: string,
  apiKey: string,
  retries = MAX_RETRIES
): Promise<{ ok: boolean; data?: T; error?: string }> {
  await semaphore.acquire();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const url = `${YODECK_BASE_URL}${endpoint}`;
    console.log(`[YodeckInventory] GET ${endpoint}`);
    
    const response = await fetch(url, {
      headers: {
        "Authorization": `Token ${apiKey}`,
        "Accept": "application/json",
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      if (retries > 0 && response.status >= 500) {
        console.log(`[YodeckInventory] Retry ${endpoint} (${retries} left)`);
        semaphore.release();
        return yodeckRequest(endpoint, apiKey, retries - 1);
      }
      return { ok: false, error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    return { ok: true, data };
  } catch (error: any) {
    if (retries > 0 && error.name !== "AbortError") {
      console.log(`[YodeckInventory] Retry ${endpoint} after error: ${error.message}`);
      semaphore.release();
      return yodeckRequest(endpoint, apiKey, retries - 1);
    }
    return { ok: false, error: error.message };
  } finally {
    semaphore.release();
  }
}

/**
 * Fetch all screens with pagination
 */
async function fetchAllScreens(apiKey: string, workspaceId?: number): Promise<YodeckScreen[]> {
  const screens: YodeckScreen[] = [];
  let page = 1;
  const pageSize = 100;
  
  while (true) {
    const endpoint = `/screens?page=${page}&page_size=${pageSize}`;
    const result = await yodeckRequest<{ results: YodeckScreen[]; count: number }>(endpoint, apiKey);
    
    if (!result.ok || !result.data) {
      console.log(`[YodeckInventory] Failed to fetch screens page ${page}`);
      break;
    }
    
    let pageScreens = result.data.results || [];
    
    // Filter by workspace if specified
    if (workspaceId) {
      pageScreens = pageScreens.filter(s => s.workspace?.id === workspaceId);
    }
    
    screens.push(...pageScreens);
    
    if (screens.length >= result.data.count || pageScreens.length < pageSize) {
      break;
    }
    page++;
  }
  
  console.log(`[YodeckInventory] Fetched ${screens.length} screens`);
  return screens;
}

/**
 * Fetch screen details to get screen_content
 */
async function fetchScreenDetail(screenId: number, apiKey: string): Promise<YodeckScreen | null> {
  const result = await yodeckRequest<YodeckScreen>(`/screens/${screenId}`, apiKey);
  return result.ok ? result.data || null : null;
}

/**
 * Fetch and cache playlist
 */
async function fetchPlaylist(playlistId: number, apiKey: string): Promise<YodeckPlaylist | null> {
  if (playlistCache.has(playlistId)) {
    return playlistCache.get(playlistId)!;
  }
  
  const result = await yodeckRequest<YodeckPlaylist>(`/playlists/${playlistId}`, apiKey);
  if (result.ok && result.data) {
    playlistCache.set(playlistId, result.data);
    return result.data;
  }
  return null;
}

/**
 * Fetch and cache layout
 */
async function fetchLayout(layoutId: number, apiKey: string): Promise<YodeckLayout | null> {
  if (layoutCache.has(layoutId)) {
    return layoutCache.get(layoutId)!;
  }
  
  const result = await yodeckRequest<YodeckLayout>(`/layouts/${layoutId}`, apiKey);
  if (result.ok && result.data) {
    layoutCache.set(layoutId, result.data);
    return result.data;
  }
  return null;
}

/**
 * Fetch and cache schedule
 */
async function fetchSchedule(scheduleId: number, apiKey: string): Promise<YodeckSchedule | null> {
  if (scheduleCache.has(scheduleId)) {
    return scheduleCache.get(scheduleId)!;
  }
  
  const result = await yodeckRequest<YodeckSchedule>(`/schedules/${scheduleId}`, apiKey);
  if (result.ok && result.data) {
    scheduleCache.set(scheduleId, result.data);
    return result.data;
  }
  return null;
}

/**
 * Fetch and cache media details
 */
async function fetchMediaDetail(mediaId: number, apiKey: string): Promise<MediaDetail | null> {
  if (mediaCache.has(mediaId)) {
    return mediaCache.get(mediaId)!;
  }
  
  const result = await yodeckRequest<YodeckMedia>(`/media/${mediaId}`, apiKey);
  if (result.ok && result.data) {
    const media = result.data;
    const mediaType = media.media_origin?.type?.toLowerCase() || "other";
    const detail: MediaDetail = {
      id: media.id,
      name: media.name,
      type: (mediaType === "image" || mediaType === "video" || mediaType === "audio")
        ? mediaType as "image" | "video" | "audio"
        : "other",
      file_extension: media.file_extension,
      folder: media.parent_folder?.name,
      tags: media.tags,
    };
    mediaCache.set(mediaId, detail);
    return detail;
  }
  return null;
}

/**
 * Resolve playlist to media IDs (with loop detection)
 */
async function resolvePlaylistToMedia(
  playlistId: number,
  apiKey: string,
  visitedPlaylists: Set<number>,
  visitedLayouts: Set<number>
): Promise<ResolvedContent> {
  if (visitedPlaylists.has(playlistId)) {
    console.log(`[YodeckInventory] Skipping visited playlist ${playlistId}`);
    return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
  }
  visitedPlaylists.add(playlistId);
  
  const playlist = await fetchPlaylist(playlistId, apiKey);
  if (!playlist) {
    return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
  }
  
  const result: ResolvedContent = {
    mediaIds: [],
    widgetCount: 0,
    totalPlaylistItems: playlist.items?.length || 0,
    nestedPlaylistCount: 0,
    nestedLayoutCount: 0,
  };
  
  for (const item of playlist.items || []) {
    const itemType = item.type?.toLowerCase();
    
    // Log item structure for debugging
    console.log(`[YodeckInventory] Playlist ${playlistId} item: type=${itemType}, id=${item.id}, media=${JSON.stringify(item.media)}, playlist=${JSON.stringify(item.playlist)}, layout=${JSON.stringify(item.layout)}`);
    
    switch (itemType) {
      case "media":
        // Priority: embedded media object > media_id > resource_id > item.id (fallback)
        const mediaId = item.media?.id || item.media_id || item.resource_id || item.id;
        if (mediaId) {
          result.mediaIds.push(mediaId);
          console.log(`[YodeckInventory] Found media ID ${mediaId} in playlist ${playlistId}`);
        }
        break;
        
      case "widget":
        result.widgetCount++;
        break;
        
      case "playlist":
        // Priority: embedded playlist object > playlist_id > resource_id > item.id (fallback)
        const nestedPlaylistId = item.playlist?.id || item.playlist_id || item.resource_id || item.id;
        if (nestedPlaylistId) {
          result.nestedPlaylistCount++;
          console.log(`[YodeckInventory] Recursing into nested playlist ${nestedPlaylistId}`);
          const nestedPlaylist = await resolvePlaylistToMedia(nestedPlaylistId, apiKey, visitedPlaylists, visitedLayouts);
          result.mediaIds.push(...nestedPlaylist.mediaIds);
          result.widgetCount += nestedPlaylist.widgetCount;
          result.totalPlaylistItems += nestedPlaylist.totalPlaylistItems;
        }
        break;
        
      case "layout":
        // Priority: embedded layout object > layout_id > resource_id > item.id (fallback)
        const nestedLayoutId = item.layout?.id || item.layout_id || item.resource_id || item.id;
        if (nestedLayoutId) {
          result.nestedLayoutCount++;
          console.log(`[YodeckInventory] Recursing into layout ${nestedLayoutId}`);
          const layoutContent = await resolveLayoutToMedia(nestedLayoutId, apiKey, visitedPlaylists, visitedLayouts);
          result.mediaIds.push(...layoutContent.mediaIds);
          result.widgetCount += layoutContent.widgetCount;
        }
        break;
        
      default:
        console.log(`[YodeckInventory] Unknown playlist item type: ${itemType}, full item: ${JSON.stringify(item)}`);
    }
  }
  
  return result;
}

/**
 * Resolve layout to media IDs (with loop detection)
 */
async function resolveLayoutToMedia(
  layoutId: number,
  apiKey: string,
  visitedPlaylists: Set<number>,
  visitedLayouts: Set<number>
): Promise<ResolvedContent> {
  if (visitedLayouts.has(layoutId)) {
    console.log(`[YodeckInventory] Skipping visited layout ${layoutId}`);
    return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
  }
  visitedLayouts.add(layoutId);
  
  const layout = await fetchLayout(layoutId, apiKey);
  if (!layout) {
    return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
  }
  
  const result: ResolvedContent = {
    mediaIds: [],
    widgetCount: 0,
    totalPlaylistItems: 0,
    nestedPlaylistCount: 0,
    nestedLayoutCount: 0,
  };
  
  // Process regions
  for (const region of layout.regions || []) {
    if (!region.item) continue;
    
    const itemType = region.item.type?.toLowerCase();
    
    // Log region item structure for debugging
    console.log(`[YodeckInventory] Layout ${layoutId} region: type=${itemType}, id=${region.item.id}, media=${JSON.stringify(region.item.media)}, playlist=${JSON.stringify(region.item.playlist)}, layout=${JSON.stringify(region.item.layout)}`);
    
    switch (itemType) {
      case "media":
        // Priority: embedded media object > item.id
        const mediaId = region.item.media?.id || region.item.id;
        result.mediaIds.push(mediaId);
        console.log(`[YodeckInventory] Found media ID ${mediaId} in layout ${layoutId}`);
        break;
        
      case "widget":
        result.widgetCount++;
        break;
        
      case "playlist":
        // Priority: embedded playlist object > item.id
        const playlistId = region.item.playlist?.id || region.item.id;
        console.log(`[YodeckInventory] Recursing into playlist ${playlistId} from layout ${layoutId}`);
        const playlistContent = await resolvePlaylistToMedia(playlistId, apiKey, visitedPlaylists, visitedLayouts);
        result.mediaIds.push(...playlistContent.mediaIds);
        result.widgetCount += playlistContent.widgetCount;
        result.totalPlaylistItems += playlistContent.totalPlaylistItems;
        result.nestedPlaylistCount++;
        break;
        
      case "layout":
        // Priority: embedded layout object > item.id
        const nestedLayoutId = region.item.layout?.id || region.item.id;
        console.log(`[YodeckInventory] Recursing into nested layout ${nestedLayoutId} from layout ${layoutId}`);
        const nestedLayoutContent = await resolveLayoutToMedia(nestedLayoutId, apiKey, visitedPlaylists, visitedLayouts);
        result.mediaIds.push(...nestedLayoutContent.mediaIds);
        result.widgetCount += nestedLayoutContent.widgetCount;
        result.nestedLayoutCount++;
        break;
        
      default:
        console.log(`[YodeckInventory] Unknown layout region type: ${itemType}, full item: ${JSON.stringify(region.item)}`);
    }
  }
  
  // Process background audio
  if (layout.background_audio?.item) {
    const bgItem = layout.background_audio.item;
    if (bgItem.type === "widget") {
      result.widgetCount++;
    } else if (bgItem.type === "media") {
      result.mediaIds.push(bgItem.id);
    }
  }
  
  return result;
}

/**
 * Resolve schedule to media IDs
 */
async function resolveScheduleToMedia(
  scheduleId: number,
  apiKey: string,
  visitedPlaylists: Set<number>,
  visitedLayouts: Set<number>
): Promise<ResolvedContent> {
  const schedule = await fetchSchedule(scheduleId, apiKey);
  if (!schedule) {
    return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
  }
  
  const result: ResolvedContent = {
    mediaIds: [],
    widgetCount: 0,
    totalPlaylistItems: 0,
    nestedPlaylistCount: 0,
    nestedLayoutCount: 0,
  };
  
  // Process events
  for (const event of schedule.events || []) {
    if (!event.source) continue;
    
    const sourceType = event.source.source_type?.toLowerCase();
    const sourceId = event.source.source_id;
    
    if (sourceType === "playlist" && sourceId) {
      const playlistContent = await resolvePlaylistToMedia(sourceId, apiKey, visitedPlaylists, visitedLayouts);
      result.mediaIds.push(...playlistContent.mediaIds);
      result.widgetCount += playlistContent.widgetCount;
      result.totalPlaylistItems += playlistContent.totalPlaylistItems;
    } else if (sourceType === "layout" && sourceId) {
      const layoutContent = await resolveLayoutToMedia(sourceId, apiKey, visitedPlaylists, visitedLayouts);
      result.mediaIds.push(...layoutContent.mediaIds);
      result.widgetCount += layoutContent.widgetCount;
    }
  }
  
  // Process filler content
  if (schedule.filler_content) {
    const fillerType = schedule.filler_content.source_type?.toLowerCase();
    const fillerId = schedule.filler_content.source_id;
    
    if (fillerType === "playlist" && fillerId) {
      const playlistContent = await resolvePlaylistToMedia(fillerId, apiKey, visitedPlaylists, visitedLayouts);
      result.mediaIds.push(...playlistContent.mediaIds);
      result.widgetCount += playlistContent.widgetCount;
      result.totalPlaylistItems += playlistContent.totalPlaylistItems;
    } else if (fillerType === "layout" && fillerId) {
      const layoutContent = await resolveLayoutToMedia(fillerId, apiKey, visitedPlaylists, visitedLayouts);
      result.mediaIds.push(...layoutContent.mediaIds);
      result.widgetCount += layoutContent.widgetCount;
    }
  }
  
  return result;
}

/**
 * Resolve screen content to media IDs
 */
async function resolveScreenContent(
  screenContent: YodeckScreenContent,
  apiKey: string
): Promise<ResolvedContent> {
  if (!screenContent.source_type || !screenContent.source_id) {
    return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
  }
  
  const visitedPlaylists = new Set<number>();
  const visitedLayouts = new Set<number>();
  
  const sourceType = screenContent.source_type.toLowerCase();
  const sourceId = screenContent.source_id;
  
  switch (sourceType) {
    case "playlist":
      return resolvePlaylistToMedia(sourceId, apiKey, visitedPlaylists, visitedLayouts);
    case "layout":
      return resolveLayoutToMedia(sourceId, apiKey, visitedPlaylists, visitedLayouts);
    case "schedule":
      return resolveScheduleToMedia(sourceId, apiKey, visitedPlaylists, visitedLayouts);
    default:
      console.log(`[YodeckInventory] Unknown screen content type: ${sourceType}`);
      return { mediaIds: [], widgetCount: 0, totalPlaylistItems: 0, nestedPlaylistCount: 0, nestedLayoutCount: 0 };
  }
}

/**
 * Build complete content inventory for all screens
 */
export async function buildContentInventory(workspaceId?: number): Promise<InventoryResult> {
  // Clear caches at start of inventory run
  mediaCache.clear();
  playlistCache.clear();
  layoutCache.clear();
  scheduleCache.clear();
  
  const apiKey = await getYodeckApiKey();
  if (!apiKey) {
    throw new Error("Yodeck API key not configured");
  }
  
  console.log(`[YodeckInventory] Starting inventory build...`);
  
  // Fetch all screens
  const screens = await fetchAllScreens(apiKey, workspaceId);
  
  const screenInventories: ScreenInventory[] = [];
  const allMediaIds = new Set<number>();
  const mediaScreenCount = new Map<number, number>(); // mediaId -> screen count
  
  // Process each screen
  for (const screen of screens) {
    // Fetch screen detail to get screen_content
    const screenDetail = await fetchScreenDetail(screen.id, apiKey);
    const screenContent = screenDetail?.screen_content || null;
    
    let resolved: ResolvedContent = {
      mediaIds: [],
      widgetCount: 0,
      totalPlaylistItems: 0,
      nestedPlaylistCount: 0,
      nestedLayoutCount: 0,
    };
    
    if (screenContent?.source_type && screenContent?.source_id) {
      resolved = await resolveScreenContent(screenContent, apiKey);
    }
    
    // Get unique media IDs for this screen
    const uniqueMediaIds = Array.from(new Set(resolved.mediaIds));
    
    // Track media across screens
    for (const mediaId of uniqueMediaIds) {
      allMediaIds.add(mediaId);
      mediaScreenCount.set(mediaId, (mediaScreenCount.get(mediaId) || 0) + 1);
    }
    
    // Fetch media details
    const mediaDetails: MediaDetail[] = [];
    const mediaBreakdown = { video: 0, image: 0, audio: 0, other: 0 };
    
    for (const mediaId of uniqueMediaIds) {
      const detail = await fetchMediaDetail(mediaId, apiKey);
      if (detail) {
        mediaDetails.push(detail);
        mediaBreakdown[detail.type]++;
      }
    }
    
    screenInventories.push({
      screenId: screen.id,
      name: screen.name,
      workspaceId: screen.workspace?.id,
      workspaceName: screen.workspace?.name,
      screen_content: screenContent,
      counts: {
        totalPlaylistItems: resolved.totalPlaylistItems,
        mediaItemsTotal: resolved.mediaIds.length,
        uniqueMediaIds: uniqueMediaIds.length,
        widgetItemsTotal: resolved.widgetCount,
      },
      mediaBreakdown,
      media: mediaDetails,
    });
    
    console.log(`[YodeckInventory] Screen "${screen.name}": ${uniqueMediaIds.length} unique media, ${resolved.widgetCount} widgets`);
  }
  
  // Calculate totals
  const totalItemsAllScreens = screenInventories.reduce((sum, s) => sum + s.counts.totalPlaylistItems, 0);
  const totalMediaAllScreens = screenInventories.reduce((sum, s) => sum + s.counts.mediaItemsTotal, 0);
  
  // Top media by screen count
  const topMediaByScreens = Array.from(mediaScreenCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([mediaId, screenCount]) => {
      const detail = mediaCache.get(mediaId);
      return {
        mediaId,
        name: detail?.name || `Media ${mediaId}`,
        screenCount,
      };
    });
  
  const result: InventoryResult = {
    generatedAt: new Date().toISOString(),
    screens: screenInventories,
    totals: {
      screens: screenInventories.length,
      totalItemsAllScreens,
      totalMediaAllScreens,
      uniqueMediaAcrossAllScreens: allMediaIds.size,
      topMediaByScreens,
    },
  };
  
  console.log(`[YodeckInventory] Inventory complete: ${result.totals.screens} screens, ${result.totals.uniqueMediaAcrossAllScreens} unique media`);
  
  return result;
}
