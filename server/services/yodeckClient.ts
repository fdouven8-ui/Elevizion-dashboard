/**
 * Yodeck API Client
 * 
 * Centralized client for all Yodeck API v2 interactions with:
 * - Automatic pagination handling
 * - Rate limiting with exponential backoff
 * - Request timeout handling
 * - In-memory caching with TTL
 * 
 * Auth: Authorization: Token <label:value>
 * Base URL: https://app.yodeck.com/api/v2
 */

import { storage } from "../storage";
import { decryptCredentials } from "../crypto";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const REQUEST_TIMEOUT = 15000;
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY_BASE = 1000;
const MAX_CONCURRENT = 5;
const DEFAULT_LIMIT = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface YodeckListResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface YodeckScreen {
  id: number;
  name: string;
  uuid?: string;
  tags?: string[];
  workspace?: { id: number; name: string };
  state?: { online: boolean; last_seen?: string };
  screen_content?: {
    source_type: "playlist" | "layout" | "schedule" | "tagbased-playlist" | "tagbased_playlist" | null;
    source_id: number | null;
    source_name: string | null;
  } | null;
}

export interface YodeckPlaylistItem {
  id: number;
  name?: string;
  type: "media" | "widget" | "layout" | "playlist" | "tagbased-playlist" | "tagbased_playlist";
  priority?: number;
  duration?: number;
}

export interface YodeckPlaylist {
  id: number;
  name: string;
  items: YodeckPlaylistItem[];
  workspace?: { id: number; name: string };
  tags?: string[];
}

export interface YodeckTagbasedPlaylist {
  id: number;
  name: string;
  content_to_filter: "only_media" | "all";
  tags?: Array<{ id: number; name: string }>;
  workspaces?: Array<{ id: number; name: string }>;
  includes?: { media?: number[]; playlists?: number[] };
  excludes?: { media?: number[]; playlists?: number[] };
}

export interface YodeckLayoutRegion {
  id: number;
  item?: {
    type: "playlist" | "widget" | "media" | "layout" | "tagbased-playlist" | "tagbased_playlist";
    id: number;
  };
}

export interface YodeckLayout {
  id: number;
  name: string;
  regions: YodeckLayoutRegion[];
  background_audio?: {
    item?: { type: string; id: number };
  };
}

export interface YodeckScheduleEvent {
  id?: number;
  source?: {
    source_type: "layout" | "playlist";
    source_id: number;
    source_name?: string;
  };
}

export interface YodeckSchedule {
  id: number;
  name: string;
  events: YodeckScheduleEvent[];
  filler_content?: {
    source_type: "playlist" | "layout";
    source_id: number;
    source_name?: string;
  };
}

export interface YodeckMedia {
  id: number;
  name: string;
  media_origin?: {
    type: "image" | "video" | "audio" | "document" | "webpage" | string;
    source?: string;
    format?: string | null;
  };
  file_extension?: string;
  tags?: string[];
  workspace?: { id: number; name: string };
  parent_folder?: { id: number; name: string };
  thumbnail_url?: string;
}

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

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TTLCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttl: number;

  constructor(ttlMs: number = CACHE_TTL_MS) {
    this.ttl = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export class YodeckClient {
  private apiKey: string;
  private playlistCache = new TTLCache<YodeckPlaylist>();
  private layoutCache = new TTLCache<YodeckLayout>();
  private scheduleCache = new TTLCache<YodeckSchedule>();
  private tagbasedPlaylistCache = new TTLCache<YodeckTagbasedPlaylist>();
  private mediaIndexCache = new TTLCache<Map<number, YodeckMedia>>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  static async create(): Promise<YodeckClient | null> {
    try {
      const config = await storage.getIntegrationConfig("yodeck");
      if (!config?.encryptedCredentials) return null;
      const credentials = decryptCredentials(config.encryptedCredentials);
      const apiKey = credentials.api_key;
      if (!apiKey) return null;
      return new YodeckClient(apiKey);
    } catch {
      return null;
    }
  }

  clearCaches(): void {
    this.playlistCache.clear();
    this.layoutCache.clear();
    this.scheduleCache.clear();
    this.tagbasedPlaylistCache.clear();
    this.mediaIndexCache.clear();
    console.log("[YodeckClient] All caches cleared");
  }

  private async request<T>(
    endpoint: string,
    params: Record<string, string | number> = {},
    retries = MAX_RETRIES
  ): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
    await semaphore.acquire();
    
    try {
      const url = new URL(`${YODECK_BASE_URL}${endpoint}`);
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 429 && retries > 0) {
          const delay = RATE_LIMIT_DELAY_BASE * Math.pow(2, MAX_RETRIES - retries);
          console.log(`[YodeckClient] Rate limited, waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          semaphore.release();
          return this.request<T>(endpoint, params, retries - 1);
        }

        if (!response.ok) {
          return { ok: false, status: response.status, error: `HTTP ${response.status}` };
        }

        const data = await response.json() as T;
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
          if (retries > 0) {
            semaphore.release();
            return this.request<T>(endpoint, params, retries - 1);
          }
          return { ok: false, error: "timeout" };
        }
        throw err;
      }
    } catch (err: any) {
      return { ok: false, error: err.message || "unknown_error" };
    } finally {
      semaphore.release();
    }
  }

  private async listAll<T>(
    endpoint: string,
    params: Record<string, string | number> = {}
  ): Promise<T[]> {
    const results: T[] = [];
    let offset = 0;

    while (true) {
      const response = await this.request<YodeckListResponse<T>>(endpoint, {
        ...params,
        limit: DEFAULT_LIMIT,
        offset,
      });

      if (!response.ok || !response.data) break;
      
      results.push(...response.data.results);
      
      if (!response.data.next) break;
      offset += DEFAULT_LIMIT;
    }

    return results;
  }

  async getScreens(): Promise<YodeckScreen[]> {
    console.log("[YodeckClient] Fetching all screens...");
    const screens = await this.listAll<YodeckScreen>("/screens");
    console.log(`[YodeckClient] Found ${screens.length} screens`);
    return screens;
  }

  async getScreen(id: number): Promise<YodeckScreen | null> {
    const response = await this.request<YodeckScreen>(`/screens/${id}`);
    return response.ok ? response.data || null : null;
  }

  async getPlaylist(id: number): Promise<YodeckPlaylist | null> {
    const cached = this.playlistCache.get(`playlist:${id}`);
    if (cached) return cached;

    const response = await this.request<YodeckPlaylist>(`/playlists/${id}`);
    if (response.ok && response.data) {
      this.playlistCache.set(`playlist:${id}`, response.data);
      return response.data;
    }
    return null;
  }

  async getLayout(id: number): Promise<YodeckLayout | null> {
    const cached = this.layoutCache.get(`layout:${id}`);
    if (cached) return cached;

    const response = await this.request<YodeckLayout>(`/layouts/${id}`);
    if (response.ok && response.data) {
      this.layoutCache.set(`layout:${id}`, response.data);
      return response.data;
    }
    return null;
  }

  async getSchedule(id: number): Promise<YodeckSchedule | null> {
    const cached = this.scheduleCache.get(`schedule:${id}`);
    if (cached) return cached;

    const response = await this.request<YodeckSchedule>(`/schedules/${id}`);
    if (response.ok && response.data) {
      this.scheduleCache.set(`schedule:${id}`, response.data);
      return response.data;
    }
    return null;
  }

  async getTagbasedPlaylist(id: number): Promise<YodeckTagbasedPlaylist | null> {
    const cached = this.tagbasedPlaylistCache.get(`tagbased:${id}`);
    if (cached) return cached;

    const response = await this.request<YodeckTagbasedPlaylist>(`/tagbased-playlists/${id}`);
    if (response.ok && response.data) {
      this.tagbasedPlaylistCache.set(`tagbased:${id}`, response.data);
      return response.data;
    }
    return null;
  }

  async getMediaIndex(): Promise<Map<number, YodeckMedia>> {
    const cached = this.mediaIndexCache.get("all");
    if (cached) {
      console.log(`[YodeckClient] Using cached media index (${cached.size} items)`);
      return cached;
    }

    console.log("[YodeckClient] Building media index...");
    const mediaList = await this.listAll<YodeckMedia>("/media");
    const index = new Map<number, YodeckMedia>();
    for (const media of mediaList) {
      index.set(media.id, media);
    }
    console.log(`[YodeckClient] Media index built with ${index.size} items`);
    
    this.mediaIndexCache.set("all", index);
    return index;
  }

  async getMediaByTags(workspaceId: number, tags: string[]): Promise<YodeckMedia[]> {
    if (tags.length === 0) return [];
    
    console.log(`[YodeckClient] Fetching media for workspace ${workspaceId} with tags: ${tags.join(", ")}`);
    const results = await this.listAll<YodeckMedia>("/media", {
      workspace: workspaceId,
      tags: tags.join(","),
    });
    console.log(`[YodeckClient] Found ${results.length} media items`);
    return results;
  }

  async getMedia(id: number): Promise<YodeckMedia | null> {
    const index = await this.getMediaIndex();
    return index.get(id) || null;
  }
}

let clientInstance: YodeckClient | null = null;

export async function getYodeckClient(): Promise<YodeckClient | null> {
  if (!clientInstance) {
    clientInstance = await YodeckClient.create();
  }
  return clientInstance;
}

export function clearYodeckClient(): void {
  if (clientInstance) {
    clientInstance.clearCaches();
  }
  clientInstance = null;
}
