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
 */
import * as Sentry from "@sentry/node";
import { logYodeckStep, traceExternalCall, sanitizeUrl, pickMediaFields } from "./yodeckTraceHelpers";
/**
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

/**
 * Parsed Yodeck token with label:value components
 */
export interface ParsedYodeckToken {
  label: string;
  value: string;
  source: 'YODECK_AUTH_TOKEN' | 'YODECK_V2_TOKEN' | 'LABEL+VALUE' | 'DB' | 'NONE';
  isValid: boolean;
  error?: string;
}

/**
 * Yodeck config status for diagnostics
 */
export interface YodeckConfigStatus {
  ok: boolean;
  activeSource: 'YODECK_AUTH_TOKEN' | 'YODECK_V2_TOKEN' | 'LABEL+VALUE' | 'DB' | 'NONE';
  parsedLabelPresent: boolean;
  parsedValuePresent: boolean;
  tokenFormatValid: boolean;
  formatError?: string;
  baseUrl: string;
  authFormatExample: string;
  envPriority: string[];
}

/**
 * Parse a combined token string in "label:value" format
 * Splits on the FIRST colon only, trims whitespace
 */
function parseTokenString(token: string): { label: string; value: string; valid: boolean; error?: string } {
  if (!token || token.trim().length === 0) {
    return { label: '', value: '', valid: false, error: 'Token is empty' };
  }
  
  const trimmed = token.trim();
  const colonIndex = trimmed.indexOf(':');
  
  if (colonIndex === -1) {
    return { label: '', value: '', valid: false, error: 'Yodeck token missing label:value format (no colon found)' };
  }
  
  const label = trimmed.substring(0, colonIndex).trim();
  const value = trimmed.substring(colonIndex + 1).trim();
  
  if (!label) {
    return { label: '', value, valid: false, error: 'Yodeck token has empty label (format: label:apikey)' };
  }
  
  if (!value) {
    return { label, value: '', valid: false, error: 'Yodeck token has empty value (format: label:apikey)' };
  }
  
  return { label, value, valid: true };
}

/**
 * Get the effective Yodeck token with full parsing and validation
 * Returns parsed token components and source information
 */
export async function getYodeckToken(): Promise<ParsedYodeckToken> {
  // Priority 1: YODECK_AUTH_TOKEN
  const authToken = process.env.YODECK_AUTH_TOKEN?.trim();
  if (authToken) {
    const parsed = parseTokenString(authToken);
    if (!parsed.valid) {
      console.warn(`[YodeckClient] YODECK_AUTH_TOKEN format error: ${parsed.error}`);
    }
    return {
      label: parsed.label,
      value: parsed.value,
      source: 'YODECK_AUTH_TOKEN',
      isValid: parsed.valid,
      error: parsed.error,
    };
  }
  
  // Priority 2: YODECK_V2_TOKEN
  const v2Token = process.env.YODECK_V2_TOKEN?.trim();
  if (v2Token) {
    const parsed = parseTokenString(v2Token);
    if (!parsed.valid) {
      console.warn(`[YodeckClient] YODECK_V2_TOKEN format error: ${parsed.error}`);
    }
    return {
      label: parsed.label,
      value: parsed.value,
      source: 'YODECK_V2_TOKEN',
      isValid: parsed.valid,
      error: parsed.error,
    };
  }
  
  // Priority 3: Separate YODECK_TOKEN_LABEL + YODECK_TOKEN_VALUE
  const label = process.env.YODECK_TOKEN_LABEL?.trim();
  const value = process.env.YODECK_TOKEN_VALUE?.trim();
  if (label && value) {
    return {
      label,
      value,
      source: 'LABEL+VALUE',
      isValid: true,
    };
  }
  if (label || value) {
    return {
      label: label || '',
      value: value || '',
      source: 'LABEL+VALUE',
      isValid: false,
      error: label ? 'YODECK_TOKEN_VALUE is missing' : 'YODECK_TOKEN_LABEL is missing',
    };
  }
  
  // Priority 4: Database config
  try {
    const config = await storage.getIntegrationConfig("yodeck");
    if (config?.encryptedCredentials) {
      const { decryptCredentials } = await import("../crypto");
      const credentials = decryptCredentials(config.encryptedCredentials);
      const dbToken = credentials.api_key;
      if (dbToken) {
        const parsed = parseTokenString(dbToken);
        if (!parsed.valid) {
          console.warn(`[YodeckClient] DB token format error: ${parsed.error}`);
        }
        return {
          label: parsed.label,
          value: parsed.value,
          source: 'DB',
          isValid: parsed.valid,
          error: parsed.error,
        };
      }
    }
  } catch (err) {
    // Ignore DB errors, fall through to NONE
  }
  
  return {
    label: '',
    value: '',
    source: 'NONE',
    isValid: false,
    error: 'No Yodeck token configured',
  };
}

/**
 * Get Yodeck configuration status for diagnostics endpoint
 */
export async function getYodeckConfigStatus(): Promise<YodeckConfigStatus> {
  const token = await getYodeckToken();
  
  return {
    ok: token.isValid,
    activeSource: token.source,
    parsedLabelPresent: Boolean(token.label),
    parsedValuePresent: Boolean(token.value),
    tokenFormatValid: token.isValid,
    formatError: token.error,
    baseUrl: YODECK_BASE_URL,
    authFormatExample: 'Authorization: Token <label>:<value>',
    envPriority: [
      '1. YODECK_AUTH_TOKEN (format: label:apikey)',
      '2. YODECK_V2_TOKEN (format: label:apikey)',
      '3. YODECK_TOKEN_LABEL + YODECK_TOKEN_VALUE',
      '4. Database integration config',
    ],
  };
}

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
  takeover_content?: {
    source_type: "playlist" | "layout" | "schedule" | "tagbased-playlist" | "tagbased_playlist" | null;
    source_id: number | null;
    source_name?: string | null;
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
  status?: string;
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

  delete(key: string): void {
    this.cache.delete(key);
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
      // Use centralized token parsing
      const token = await getYodeckToken();
      
      if (!token.isValid) {
        if (token.source !== 'NONE') {
          console.warn(`[YodeckClient] Token from ${token.source} is invalid: ${token.error}`);
        }
        return null;
      }
      
      console.log(`[YodeckClient] Using token from ${token.source}`);
      return new YodeckClient(`${token.label}:${token.value}`);
    } catch (err: any) {
      console.error(`[YodeckClient] Error creating client: ${err.message}`);
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

  async patchScreenContent(screenId: number, playlistId: number): Promise<{ ok: boolean; data?: any; error?: string }> {
    console.log(`[YodeckClient] PATCH /screens/${screenId} screen_content → playlist ${playlistId}`);
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/screens/${screenId}/`, {
          method: "PATCH",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            screen_content: { source_type: "playlist", source_id: playlistId },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text();
          console.error(`[YodeckClient] PATCH screen ${screenId} FAILED: HTTP ${response.status}`, text);
          return { ok: false, error: `HTTP ${response.status}: ${text}` };
        }
        const data = await response.json();
        console.log(`[YodeckClient] PATCH screen ${screenId} OK`);
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async pushToScreen(screenId: number, useDownloadTimeslots = true): Promise<{ ok: boolean; data?: any; error?: string }> {
    console.log(`[YodeckClient] POST /screens/${screenId}/push`);
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/screens/${screenId}/push/`, {
          method: "POST",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ use_download_timeslots: useDownloadTimeslots }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text();
          console.error(`[YodeckClient] PUSH screen ${screenId} FAILED: HTTP ${response.status}`, text);
          return { ok: false, error: `HTTP ${response.status}: ${text}` };
        }
        const data = await response.json().catch(() => ({}));
        console.log(`[YodeckClient] PUSH screen ${screenId} OK`);
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
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
  
  async getPlaylistFresh(id: number): Promise<YodeckPlaylist | null> {
    this.playlistCache.delete(`playlist:${id}`);
    const response = await this.request<YodeckPlaylist>(`/playlists/${id}`);
    if (response.ok && response.data) {
      this.playlistCache.set(`playlist:${id}`, response.data);
      return response.data;
    }
    return null;
  }

  /**
   * PATCH a Yodeck playlist.
   *
   * IMPORTANT — Yodeck Media PK vs Playlist Item PK:
   *   GET /playlists/{id} returns items like: { id: <playlistItemPK>, media: <mediaPK>, type, priority, duration, name }
   *   PATCH /playlists/{id} expects items as: { id: <mediaPK>, type, priority, duration }
   *   The "id" in PATCH payload refers to the MEDIA PK (the Yodeck media object),
   *   NOT the playlist-item's own PK. Yodeck reuses the field name "id" with different semantics.
   *   If you pass a media PK that does not exist (404 on GET /media/{id}), Yodeck returns
   *   HTTP 400 err_1003 with details: items.media = ["Invalid pk ... object does not exist."]
   *   Always verify media existence (GET /media/{id} → 200, status=finished) before patching.
   */
  async patchPlaylist(id: number, payload: Record<string, any>): Promise<{ ok: boolean; data?: any; error?: string }> {
    console.log(`[YodeckClient] PATCH /playlists/${id}`);
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/playlists/${id}/`, {
          method: "PATCH",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text();
          console.error(`[YodeckClient] PATCH playlist ${id} FAILED: HTTP ${response.status}`, text);
          return { ok: false, error: `HTTP ${response.status}: ${text}` };
        }
        const data = await response.json();
        this.playlistCache.delete(`playlist:${id}`);
        console.log(`[YodeckClient] PATCH playlist ${id} OK`);
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async getPlaylists(): Promise<YodeckPlaylist[]> {
    console.log("[YodeckClient] Fetching all playlists...");
    const playlists = await this.listAll<YodeckPlaylist>("/playlists");
    console.log(`[YodeckClient] Found ${playlists.length} playlists`);
    return playlists;
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

  async listMediaPaginated(params?: { search?: string; page?: number }): Promise<YodeckMedia[]> {
    const maxPages = params?.page || 10;
    const allMedia: YodeckMedia[] = [];
    let offset = 0;

    for (let page = 0; page < maxPages; page++) {
      const queryParams: Record<string, string | number> = { limit: DEFAULT_LIMIT, offset };
      if (params?.search) queryParams.search = params.search;

      const response = await this.request<YodeckListResponse<YodeckMedia>>("/media", queryParams);
      if (!response.ok || !response.data) break;

      allMedia.push(...response.data.results);
      if (!response.data.next) break;
      offset += DEFAULT_LIMIT;
    }

    console.log(`[YodeckClient] listMediaPaginated: found ${allMedia.length} items (search=${params?.search || "none"})`);
    return allMedia;
  }

  async findMediaByNameExact(name: string): Promise<YodeckMedia | null> {
    const corrId = Math.random().toString(36).substring(2, 8);
    console.log(`[YodeckClient][${corrId}] findMediaByNameExact: searching for "${name}"`);

    const results = await this.listMediaPaginated({ search: name });
    const exactMatches = results.filter(m => m.name === name);

    if (exactMatches.length === 0) {
      console.log(`[YodeckClient][${corrId}] findMediaByNameExact: NOT_FOUND (checked ${results.length} results)`);
      return null;
    }

    const finished = exactMatches.filter(m => m.status === "finished");
    const best = finished.length > 0
      ? finished.sort((a, b) => (b.id || 0) - (a.id || 0))[0]
      : exactMatches.sort((a, b) => (b.id || 0) - (a.id || 0))[0];

    console.log(`[YodeckClient][${corrId}] findMediaByNameExact: FOUND id=${best.id} status=${best.status || "?"} (${exactMatches.length} matches, ${finished.length} finished)`);
    return best;
  }

  async findMediaByTag(tag: string): Promise<YodeckMedia | null> {
    const corrId = Math.random().toString(36).substring(2, 8);
    console.log(`[YodeckClient][${corrId}] findMediaByTag: searching for tag="${tag}"`);

    const results = await this.listMediaPaginated();
    const match = results.find(m => m.tags && m.tags.includes(tag));

    if (match) {
      console.log(`[YodeckClient][${corrId}] findMediaByTag: FOUND id=${match.id} name="${match.name}"`);
    } else {
      console.log(`[YodeckClient][${corrId}] findMediaByTag: NOT_FOUND (checked ${results.length} media items)`);
    }

    return match || null;
  }

  static extractMediaId(createRes: any): number | null {
    const id =
      createRes?.id ??
      createRes?.media?.id ??
      createRes?.data?.id ??
      createRes?.body?.id ??
      null;
    if (typeof id === "number" && id > 0) return id;
    if (typeof id === "string" && !isNaN(Number(id)) && Number(id) > 0) return Number(id);
    return null;
  }

  /**
   * Ensures a Yodeck media ID is valid, existing, and has status=finished.
   * If the given mediaId is invalid/missing/not-finished, resolves by exact name search.
   * Returns a guaranteed existing, finished media ID — or null if unresolvable.
   *
   * @param mediaId - The stored media ID to verify
   * @param expectedName - The expected Yodeck media name for fallback search
   * @returns Resolution result with resolvedId, method, and diagnostic details
   */
  async ensureMediaReadyAndExists(params: {
    mediaId: number;
    expectedName?: string;
    searchNames?: string[];
  }): Promise<{
    resolvedId: number | null;
    method: "direct" | "name_search" | "poll" | "unresolved";
    originalId: number;
    status?: string;
    name?: string;
    searchTerm?: string;
    candidateCount?: number;
    pollAttempts?: number;
    staleCleaned?: boolean;
    notes: string[];
  }> {
    const { mediaId, expectedName, searchNames = [] } = params;
    const corrId = Math.random().toString(36).substring(2, 8);
    const notes: string[] = [];
    const log = (msg: string) => {
      const line = `[ensureMedia][${corrId}] ${msg}`;
      console.log(line);
      notes.push(msg);
    };

    log(`Checking mediaId=${mediaId} expectedName="${expectedName || "?"}"...`);

    const direct = await this.fetchMediaRaw(mediaId);
    if (direct.ok && direct.data && direct.data.status === "finished") {
      log(`DIRECT OK: id=${mediaId} name="${direct.data.name}" status=finished`);
      return { resolvedId: mediaId, method: "direct", originalId: mediaId, status: "finished", name: direct.data.name, notes };
    }

    if (direct.ok && direct.data) {
      const st = direct.data.status;
      const origin = direct.data.media_origin;
      const args = direct.data.arguments || {};
      const originSource = typeof origin === 'object' ? origin?.source : origin;
      const isStale = (st === 'initialized' || st === 'processing') &&
        (originSource !== 'local' || args.buffering === true);

      if (isStale) {
        log(`STALE_MEDIA DETECTED: id=${mediaId} status="${st}" origin.source="${originSource}" buffering=${args.buffering}`);
        console.log(`[YodeckRecovery] DELETE_STALE mediaId=${mediaId} reason=${st}_not_local origin=${originSource} buffering=${args.buffering}`);
        const delResult = await this.deleteMedia(mediaId);
        log(`DELETE_STALE result: ok=${delResult.ok} status=${delResult.status}`);
        if (delResult.ok) {
          return { resolvedId: null, method: "unresolved", originalId: mediaId, staleCleaned: true, notes };
        }
        log(`DELETE_STALE FAILED — proceeding to name search fallback`);
      }

      log(`DIRECT EXISTS but status="${st}" (not finished) — trying name search`);
    } else {
      log(`DIRECT FAILED: id=${mediaId} status=${direct.status} — searching by name`);
    }

    const nameSet = new Set<string>();
    if (expectedName) nameSet.add(expectedName);
    searchNames.forEach(n => nameSet.add(n));
    const allSearchNames = Array.from(nameSet);

    for (const name of allSearchNames) {
      try {
        const found = await this.findMediaByNameExact(name);
        if (found && found.status === "finished") {
          log(`NAME_SEARCH OK: "${name}" → id=${found.id} status=finished`);
          return { resolvedId: found.id, method: "name_search", originalId: mediaId, status: "finished", name: found.name, searchTerm: name, notes };
        }
        if (found) {
          log(`NAME_SEARCH: "${name}" → id=${found.id} but status="${found.status}"`);
        }
      } catch (err: any) {
        log(`NAME_SEARCH ERROR for "${name}": ${err.message}`);
      }
    }

    for (const name of allSearchNames) {
      try {
        const results = await this.listMediaPaginated({ search: name });
        const candidates = results
          .filter(m => m.name && m.name.includes(name) && m.status === "finished")
          .sort((a, b) => (b.id || 0) - (a.id || 0));
        if (candidates.length > 0) {
          const best = candidates[0];
          log(`PARTIAL_SEARCH OK: "${name}" → id=${best.id} name="${best.name}" (${candidates.length} candidates)`);
          return { resolvedId: best.id, method: "name_search", originalId: mediaId, status: "finished", name: best.name, searchTerm: name, candidateCount: candidates.length, notes };
        }
      } catch (err: any) {
        log(`PARTIAL_SEARCH ERROR for "${name}": ${err.message}`);
      }
    }

    log(`Polling mediaId=${mediaId} (may be recently uploaded)...`);
    for (let attempt = 1; attempt <= 6; attempt++) {
      const delay = Math.min(300 * Math.pow(2, attempt - 1), 3000);
      await new Promise(r => setTimeout(r, delay));
      const poll = await this.fetchMediaRaw(mediaId);
      if (poll.ok && poll.data && poll.data.status === "finished") {
        log(`POLL OK after ${attempt} attempt(s): id=${mediaId} status=finished`);
        return { resolvedId: mediaId, method: "poll", originalId: mediaId, status: "finished", name: poll.data.name, pollAttempts: attempt, notes };
      }
      if (poll.ok && poll.data) {
        log(`POLL attempt ${attempt}: status="${poll.data.status}" (not finished yet)`);
      }
    }

    log(`UNRESOLVED: could not find valid finished media for id=${mediaId}`);
    return { resolvedId: null, method: "unresolved", originalId: mediaId, notes };
  }

  async createMediaFromUrl(opts: {
    name: string;
    downloadUrl: string;
    type?: string;
    tags?: string[];
  }): Promise<{ ok: boolean; mediaId?: number; data?: any; error?: string; httpStatus?: number }> {
    const corrId = Math.random().toString(36).substring(2, 8);
    await semaphore.acquire();

    try {
      if (!opts.downloadUrl) {
        throw new Error(`createMediaFromUrl: downloadUrl is missing or null for name="${opts.name}"`);
      }

      const mediaType = opts.type || "video";
      const body: Record<string, any> = {
        name: opts.name,
        media_origin: {
          type: mediaType,
          source: "url",
          format: null,
        },
        arguments: {
          download_from_url: opts.downloadUrl,
        },
      };
      console.log(`[YodeckClient][${corrId}] createMediaFromUrl payload keys: ${Object.keys(body).join(",")} media_origin.type=${mediaType} media_origin.source=url`);
      if (opts.tags && opts.tags.length > 0) {
        body.tags = opts.tags;
      }

      console.log(`[YodeckClient][${corrId}] createMediaFromUrl: name="${opts.name}" url=${opts.downloadUrl.substring(0, 80)}...`);
      console.log(`[YodeckClient][${corrId}] createMediaFromUrl BODY:`, JSON.stringify(body, null, 2));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const fetchStart = Date.now();
        const response = await fetch(`${YODECK_BASE_URL}/media/`, {
          method: "POST",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const fetchDurationMs = Date.now() - fetchStart;
        const respText = await response.text();
        const respBody = respText.substring(0, 12000);

        traceExternalCall({
          correlationId: corrId, method: "POST", url: `${YODECK_BASE_URL}/media/`,
          statusCode: response.status, durationMs: fetchDurationMs,
        });

        console.log(`[YodeckClient][${corrId}] createMediaFromUrl RESPONSE: status=${response.status} body=${respBody.substring(0, 2048)}`);

        if (response.status >= 200 && response.status < 300) {
          const data = JSON.parse(respText);
          const mediaId = YodeckClient.extractMediaId(data);
          console.log(`[YodeckClient][${corrId}] createMediaFromUrl extractMediaId: raw.id=${data?.id} extracted=${mediaId} download_from_url=${data?.media_origin?.download_from_url ?? data?.download_from_url ?? 'MISSING'}`);
          if (mediaId) {
            const returnedDownloadUrl = data?.media_origin?.download_from_url ?? data?.download_from_url;
            if (!returnedDownloadUrl) {
              console.error(`[YodeckClient][${corrId}] createMediaFromUrl: Yodeck returned download_from_url=null for mediaId=${mediaId}, deleting stale media`);
              try {
                await fetch(`${YODECK_BASE_URL}/media/${mediaId}/`, {
                  method: "DELETE",
                  headers: { "Authorization": `Token ${this.apiKey}` },
                });
                console.log(`[YodeckClient][${corrId}] Deleted stale media ${mediaId}`);
              } catch (delErr: any) {
                console.warn(`[YodeckClient][${corrId}] Failed to delete stale media ${mediaId}: ${delErr.message}`);
              }
              return { ok: false, error: `Yodeck created media ${mediaId} but download_from_url is null — deleted`, httpStatus: response.status };
            }
            return { ok: true, mediaId, data, httpStatus: response.status };
          }
          return { ok: false, error: `HTTP ${response.status} but no mediaId extracted from response`, data, httpStatus: response.status };
        }

        const sanitizedBody = { ...body };
        if (sanitizedBody.media_origin?.download_from_url) {
          const u = sanitizedBody.media_origin.download_from_url;
          sanitizedBody.media_origin = { ...sanitizedBody.media_origin, download_from_url: u.split('?')[0] + '?[REDACTED]' };
        }
        const respContentType = response.headers.get('content-type') || 'unknown';
        console.error(`[YODECK_CREATE_MEDIA_ERROR][${corrId}] HTTP ${response.status} | content-type=${respContentType} | body=${respBody}`);
        console.error(`[YODECK_CREATE_MEDIA_ERROR][${corrId}] request payload: ${JSON.stringify(sanitizedBody)}`);
        Sentry.captureMessage('Yodeck POST /media failed (createMediaFromUrl)', {
          level: 'error',
          extra: {
            correlationId: corrId,
            statusCode: response.status,
            responseBody: respBody,
            responseContentType: respContentType,
            requestPayload: sanitizedBody,
            mediaName: opts.name,
            method: 'createMediaFromUrl',
          },
        });
        return { ok: false, error: `HTTP ${response.status}: ${respBody}`, httpStatus: response.status };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err: any) {
      console.error(`[YodeckClient][${corrId}] createMediaFromUrl ERROR: ${err.message}`);
      return { ok: false, error: err.message };
    } finally {
      semaphore.release();
    }
  }

  /**
   * Create a new playlist in Yodeck
   */
  async createPlaylist(name: string, workspaceId?: number, opts?: { adminMaintenance?: boolean }): Promise<{ ok: boolean; data?: YodeckPlaylist; error?: string }> {
    const FORBIDDEN_PATTERNS = ["EMPTY (reset)", "EVZ "];
    const isForbidden = FORBIDDEN_PATTERNS.some(p => name.includes(p));
    if (isForbidden && !opts?.adminMaintenance) {
      const msg = `PUBLISH_GUARD: Blocked playlist creation with forbidden name "${name}". This is only allowed via admin maintenance routes.`;
      console.error(`[YodeckClient] ${msg}`);
      return { ok: false, error: msg };
    }

    await semaphore.acquire();
    
    try {
      const body: Record<string, any> = { 
        name,
        items: [],
        add_gaps: false,
        shuffle_content: false,
      };
      if (workspaceId) {
        body.workspace = workspaceId;
      }
      console.log(`[YodeckClient] Creating playlist "${name}" with items: [] (required field)`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(`${YODECK_BASE_URL}/playlists/`, {
          method: "POST",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text();
          console.error(`[YodeckClient] Failed to create playlist: HTTP ${response.status}`, text);
          return { ok: false, error: `HTTP ${response.status}: ${text}` };
        }

        const data = await response.json() as YodeckPlaylist;
        console.log(`[YodeckClient] Created playlist "${name}" with ID ${data.id}`);
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
          return { ok: false, error: "timeout" };
        }
        throw err;
      }
    } catch (err: any) {
      console.error(`[YodeckClient] Error creating playlist:`, err);
      return { ok: false, error: err.message || "unknown_error" };
    } finally {
      semaphore.release();
    }
  }

  /**
   * Assign content to a screen (playlist, layout, or schedule)
   */
  async assignContentToScreen(
    screenId: number,
    contentType: "playlist" | "layout" | "schedule" | "tagbased-playlist",
    contentId: number
  ): Promise<{ ok: boolean; error?: string }> {
    await semaphore.acquire();
    
    try {
      const body = {
        screen_content: {
          source_type: contentType,
          source_id: contentId,
        },
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(`${YODECK_BASE_URL}/screens/${screenId}/`, {
          method: "PATCH",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text();
          console.error(`[YodeckClient] Failed to assign content to screen ${screenId}: HTTP ${response.status}`, text);
          return { ok: false, error: `HTTP ${response.status}: ${text}` };
        }

        console.log(`[YodeckClient] Assigned ${contentType} ${contentId} to screen ${screenId}`);
        return { ok: true };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
          return { ok: false, error: "timeout" };
        }
        throw err;
      }
    } catch (err: any) {
      console.error(`[YodeckClient] Error assigning content to screen:`, err);
      return { ok: false, error: err.message || "unknown_error" };
    } finally {
      semaphore.release();
    }
  }

  /**
   * Rename a playlist in Yodeck
   */
  async renamePlaylist(playlistId: number, newName: string): Promise<{ ok: boolean; error?: string }> {
    await semaphore.acquire();
    
    try {
      const body = { name: newName };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(`${YODECK_BASE_URL}/playlists/${playlistId}/`, {
          method: "PATCH",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text();
          console.error(`[YodeckClient] Failed to rename playlist ${playlistId}: HTTP ${response.status}`, text);
          return { ok: false, error: `HTTP ${response.status}: ${text}` };
        }

        // Invalidate cache for this playlist
        this.playlistCache.clear();
        
        console.log(`[YodeckClient] Renamed playlist ${playlistId} to "${newName}"`);
        return { ok: true };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
          return { ok: false, error: "timeout" };
        }
        throw err;
      }
    } catch (err: any) {
      console.error(`[YodeckClient] Error renaming playlist:`, err);
      return { ok: false, error: err.message || "unknown_error" };
    } finally {
      semaphore.release();
    }
  }

  async patchMedia(mediaId: number, patch: Record<string, any>): Promise<{ ok: boolean; status?: number; error?: string }> {
    await semaphore.acquire();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/`, {
          method: "PATCH",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(patch),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 429) {
          console.log(`[YodeckClient] patchMedia rate limited for mediaId=${mediaId}, skipping`);
          return { ok: false, status: 429, error: "Rate limited" };
        }

        if (!response.ok) {
          const text = await response.text();
          return { ok: false, status: response.status, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
        }

        return { ok: true, status: response.status };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError") {
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

  async fetchMediaRaw(mediaId: number): Promise<{ ok: boolean; data?: any; error?: string; status?: number }> {
    const url = `${YODECK_BASE_URL}/media/${mediaId}/`;
    console.log(`[YODECK_GET_MEDIA] url=${url} mediaId=${mediaId}`);
    const result = await this.request<any>(`/media/${mediaId}`);
    if (!result.ok) {
      console.error(`[YODECK_GET_MEDIA] FAILED mediaId=${mediaId} status=${result.status} error=${result.error}`);
    } else {
      console.log(`[YODECK_GET_MEDIA] OK mediaId=${mediaId} name=${result.data?.name || "?"} status=${result.data?.status || "?"}`);
    }
    return result;
  }

  async patchMediaSafe(mediaId: number, partialArgs: Record<string, any>): Promise<{ ok: boolean; mediaId: number; code?: string; message?: string; patchedArgs?: any; beforeArgs?: any; yodeckError?: any }> {
    const LOG = `[patchMediaSafe] mediaId=${mediaId}`;
    const fetchResult = await this.fetchMediaRaw(mediaId);
    if (!fetchResult.ok || !fetchResult.data) {
      return { ok: false, mediaId, code: "MEDIA_FETCH_FAILED", message: fetchResult.error || "Could not fetch media" };
    }

    const existingArgs = fetchResult.data.arguments || {};
    console.log(`${LOG} BEFORE args=${JSON.stringify({ buffering: existingArgs.buffering, play_from_url: existingArgs.play_from_url ?? null, download_from_url: existingArgs.download_from_url ?? null })}`);

    const safeArgs: Record<string, any> = { ...partialArgs };

    // For file-based (local) media: do NOT require or preserve play_from_url/download_from_url
    // These URL fields are only needed for URL-imported media
    const origin = fetchResult.data.media_origin;
    const isLocalMedia = (typeof origin === "object" && origin?.source === "local") ||
                         (typeof origin === "string" && (origin === "my_device" || origin === "local"));
    const hasFile = fetchResult.data.file != null;

    if (isLocalMedia || hasFile) {
      // Local/file-based media: strip URL fields, they should be null
      console.log(`${LOG} LOCAL_MEDIA detected (source=${typeof origin === "object" ? origin?.source : origin}, hasFile=${hasFile}) - NOT preserving URL fields`);
      delete safeArgs.play_from_url;
      delete safeArgs.download_from_url;
    } else {
      // URL-based media: preserve existing URL fields (legacy compat)
      delete safeArgs.play_from_url;
      const existingPlay = existingArgs.play_from_url;
      const existingDownload = existingArgs.download_from_url;

      if (typeof existingDownload === "string" && existingDownload.length > 0) {
        safeArgs.download_from_url = existingDownload;
      }
      if (typeof existingPlay === "string" && existingPlay.length > 0) {
        safeArgs.play_from_url = existingPlay;
      }

      if (!safeArgs.download_from_url && !safeArgs.play_from_url) {
        console.error(`${LOG} FAIL: URL-based media has no play_from_url or download_from_url`);
        return { ok: false, mediaId, code: "NO_URL_FIELDS", message: "URL-based media requires play_from_url or download_from_url but neither exists", beforeArgs: existingArgs };
      }
    }

    Object.keys(safeArgs).forEach(k => {
      if (safeArgs[k] === null || safeArgs[k] === undefined) {
        delete safeArgs[k];
      }
    });

    console.log(`${LOG} PATCH payload args=${JSON.stringify(safeArgs)}`);
    const patchResult = await this.patchMedia(mediaId, { arguments: safeArgs });
    if (!patchResult.ok) {
      let yodeckError: any = null;
      try {
        if (patchResult.error) {
          const parsed = JSON.parse(patchResult.error);
          yodeckError = { code: parsed.error_code, message: parsed.message || parsed.detail, missing_key: parsed.missing_key, invalid_field: parsed.invalid_field };
        }
      } catch {}
      console.error(`${LOG} PATCH_FAILED http=${patchResult.status} error=${patchResult.error?.substring(0, 300)}`);
      return { ok: false, mediaId, code: "PATCH_FAILED", message: patchResult.error || `HTTP ${patchResult.status}`, beforeArgs: existingArgs, patchedArgs: safeArgs, yodeckError };
    }

    const afterFetch = await this.fetchMediaRaw(mediaId);
    const afterArgs = afterFetch.ok && afterFetch.data ? afterFetch.data.arguments || {} : {};
    console.log(`${LOG} AFTER args=${JSON.stringify({ buffering: afterArgs.buffering, play_from_url: afterArgs.play_from_url ?? null, download_from_url: afterArgs.download_from_url ?? null })}`);

    return { ok: true, mediaId, beforeArgs: existingArgs, patchedArgs: safeArgs };
  }

  /**
   * Get all screens (for finding which screen a playlist is assigned to)
   */
  async getScreensWithPlaylist(playlistId: number): Promise<YodeckScreen[]> {
    const screens = await this.getScreens();
    return screens.filter(s => 
      s.screen_content?.source_type === 'playlist' && 
      s.screen_content?.source_id === playlistId
    );
  }

  async getMediaById(mediaId: number): Promise<{ ok: boolean; data?: any; error?: string }> {
    return this.fetchMediaRaw(mediaId);
  }

  async createMediaVideoLocal(params: {
    name: string;
    default_duration?: number;
    arguments?: Record<string, any>;
    workspace?: any;
    parent_folder?: any;
  }): Promise<{ ok: boolean; mediaId?: number; data?: any; error?: string }> {
    await semaphore.acquire();
    try {
      const payload: Record<string, any> = {
        name: params.name.endsWith(".mp4") ? params.name : `${params.name}.mp4`,
        description: "",
        media_origin: { type: "video", source: "local", format: null },
        arguments: {
          resolution: "highest",
          ...(params.arguments || {}),
          buffering: params.arguments?.buffering ?? false,
        },
      };
      if (params.default_duration) payload.default_duration = params.default_duration;
      if (params.workspace) payload.workspace = params.workspace;
      if (params.parent_folder) payload.parent_folder = params.parent_folder;

      console.log(`[YodeckClient] createMediaVideoLocal payload=${JSON.stringify(payload)}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/media/`, {
          method: "POST",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await response.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 500) }; }

        if (!response.ok) {
          console.error(`[YodeckClient] createMediaVideoLocal FAILED http=${response.status} body=${text.substring(0, 300)}`);
          return { ok: false, error: `HTTP ${response.status}: ${text.substring(0, 300)}` };
        }

        const mediaId = data.id;
        if (!mediaId) {
          return { ok: false, error: "No id in create response", data };
        }

        console.log(`[YodeckClient] createMediaVideoLocal OK mediaId=${mediaId}`);
        return { ok: true, mediaId, data };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async getUploadUrl(mediaId: number): Promise<{ ok: boolean; uploadUrl?: string; error?: string }> {
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/upload`, {
          method: "GET",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const text = await response.text();
        let data: any;
        try { data = JSON.parse(text); } catch { data = {}; }

        if (!response.ok) {
          return { ok: false, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
        }

        const uploadUrl = data.upload_url;
        if (!uploadUrl) {
          return { ok: false, error: "No upload_url in response" };
        }

        console.log(`[YodeckClient] getUploadUrl mediaId=${mediaId} host=${new URL(uploadUrl).host}`);
        return { ok: true, uploadUrl };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async uploadToSignedUrl(uploadUrl: string, bytes: Buffer, contentType: string = "video/mp4"): Promise<{ ok: boolean; status?: number; error?: string }> {
    const startTime = Date.now();
    try {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "Content-Length": bytes.length.toString(),
        },
        body: bytes,
      });

      const durationMs = Date.now() - startTime;
      console.log(`[YodeckClient] uploadToSignedUrl status=${response.status} bytes=${bytes.length} duration=${durationMs}ms`);

      if (response.status !== 200 && response.status !== 204) {
        const text = await response.text();
        return { ok: false, status: response.status, error: `PUT ${response.status}: ${text.substring(0, 200)}` };
      }
      return { ok: true, status: response.status };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  async completeUpload(mediaId: number, uploadUrl: string): Promise<{ ok: boolean; status?: number; error?: string }> {
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/upload/complete`, {
          method: "PUT",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ upload_url: uploadUrl }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const status = response.status;
        console.log(`[YodeckClient] completeUpload mediaId=${mediaId} status=${status}`);
        if (status !== 200) {
          const text = await response.text();
          return { ok: false, status, error: `COMPLETE ${status}: ${text.substring(0, 200)}` };
        }
        return { ok: true, status };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async pollMediaUntilReady(mediaId: number, timeoutMs: number = 180000): Promise<{ ok: boolean; status?: string; polls?: number; reason?: string }> {
    const READY = ["finished", "ready", "done", "encoded", "active", "ok", "completed"];
    const FAILED = ["failed", "error", "aborted", "rejected"];
    const INTERVALS = [2000, 3000, 5000, 8000, 10000, 15000, 15000, 15000, 15000, 15000];
    const startTime = Date.now();
    let attempt = 0;

    while (Date.now() - startTime < timeoutMs) {
      const delay = INTERVALS[Math.min(attempt, INTERVALS.length - 1)];
      await new Promise(r => setTimeout(r, delay));
      attempt++;

      const result = await this.fetchMediaRaw(mediaId);
      if (!result.ok) {
        if (result.error?.includes("404")) return { ok: false, reason: "POLL_404" };
        continue;
      }
      const status = (result.data?.status || "").toLowerCase();
      console.log(`[YodeckClient] pollMedia mediaId=${mediaId} attempt=${attempt} status=${status}`);

      if (READY.includes(status)) return { ok: true, status, polls: attempt };
      if (FAILED.includes(status)) return { ok: false, status, reason: `STATUS_${status.toUpperCase()}` };
      if (status === "initialized" && attempt > 20) return { ok: false, reason: "INIT_STUCK" };
    }
    return { ok: false, reason: "TIMEOUT" };
  }

  async waitUntilMediaHasFile(
    mediaId: number,
    opts?: { timeoutMs?: number; intervalMs?: number }
  ): Promise<{ ok: boolean; hasFile: boolean; size: number; status: string; polls: number; error?: string }> {
    const timeoutMs = opts?.timeoutMs ?? 60000;
    const intervalMs = opts?.intervalMs ?? 2000;
    const startTime = Date.now();
    let attempt = 0;
    let lastStatus = "unknown";
    let lastHasFile = false;
    let lastSize = 0;

    while (Date.now() - startTime < timeoutMs) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, intervalMs));
      }
      attempt++;

      try {
        const resp = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/`, {
          headers: { "Authorization": `Token ${this.apiKey}` },
        });

        if (resp.status === 404) {
          return { ok: false, hasFile: false, size: 0, status: "404", polls: attempt, error: "MEDIA_NOT_FOUND" };
        }
        if (!resp.ok) {
          console.warn(`[YodeckClient] waitUntilMediaHasFile mediaId=${mediaId} poll=${attempt} http=${resp.status}`);
          continue;
        }

        const data = await resp.json();
        const status = (data.status || "").toLowerCase();
        const fileObj = data.file;
        const size = fileObj?.size || fileObj?.file_size || data.filesize || data.file_size || 0;
        const hasFile = fileObj != null && size > 0;
        lastStatus = status;
        lastHasFile = hasFile;
        lastSize = size;

        console.log(`[YodeckClient] waitUntilMediaHasFile mediaId=${mediaId} poll=${attempt} status=${status} hasFile=${hasFile} size=${size} name=${data.name}`);

        if (hasFile) {
          console.log(`[YodeckUploadReady] mediaId=${mediaId} hasFile=true size=${size} name=${data.name}`);
          return { ok: true, hasFile: true, size, status, polls: attempt };
        }

        const FAILED = ["failed", "error", "aborted", "rejected"];
        if (FAILED.includes(status)) {
          console.error(`[YodeckUploadNotReady] mediaId=${mediaId} hasFile=false size=null status=${status}`);
          return { ok: false, hasFile: false, size: 0, status, polls: attempt, error: `YODECK_STATUS_${status.toUpperCase()}` };
        }
      } catch (err: any) {
        console.warn(`[YodeckClient] waitUntilMediaHasFile mediaId=${mediaId} poll=${attempt} error=${err.message}`);
      }
    }

    console.error(`[YodeckUploadNotReady] mediaId=${mediaId} hasFile=${lastHasFile} size=${lastSize || "null"} status=${lastStatus} polls=${attempt}`);
    return {
      ok: false,
      hasFile: lastHasFile,
      size: lastSize,
      status: lastStatus,
      polls: attempt,
      error: "UPLOAD_NOT_READY",
    };
  }

  async deleteMedia(mediaId: number): Promise<{ ok: boolean; status?: number; error?: string }> {
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/media/${mediaId}/`, {
          method: "DELETE",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.status === 429) {
          return { ok: false, status: 429, error: "Rate limited" };
        }
        if (!response.ok && response.status !== 204) {
          const text = await response.text().catch(() => "");
          return { ok: false, status: response.status, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
        }
        return { ok: true, status: response.status };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async deletePlaylist(playlistId: number): Promise<{ ok: boolean; status?: number; error?: string }> {
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/playlists/${playlistId}/`, {
          method: "DELETE",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (response.status === 429) {
          return { ok: false, status: 429, error: "Rate limited" };
        }
        if (!response.ok && response.status !== 204) {
          const text = await response.text().catch(() => "");
          return { ok: false, status: response.status, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
        }
        return { ok: true, status: response.status };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async updatePlaylist(playlistId: number, payload: Record<string, any>): Promise<{ ok: boolean; data?: YodeckPlaylist; error?: string; status?: number }> {
    await semaphore.acquire();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(`${YODECK_BASE_URL}/playlists/${playlistId}/`, {
          method: "PUT",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          return { ok: false, status: response.status, error: `HTTP ${response.status}: ${text.substring(0, 200)}` };
        }
        const data = await response.json() as YodeckPlaylist;
        this.playlistCache.clear();
        return { ok: true, data, status: response.status };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.name === "AbortError" ? "timeout" : err.message };
      }
    } finally {
      semaphore.release();
    }
  }

  async pushScreen(screenIdOrPlayerId: number, opts?: { use_download_timeslots?: boolean }): Promise<{ ok: boolean; data?: any; error?: string; status?: number }> {
    await semaphore.acquire();
    try {
      const url = `${YODECK_BASE_URL}/screens/${screenIdOrPlayerId}/push`;
      const body = { use_download_timeslots: opts?.use_download_timeslots ?? false };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Authorization": `Token ${this.apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          return { ok: false, status: response.status, error: `HTTP ${response.status}: ${errText.substring(0, 300)}` };
        }
        const data = await response.json().catch(() => ({}));
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        return { ok: false, error: err.message };
      }
    } finally {
      semaphore.release();
    }
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

// ============================================================================
// CONTENT RESOLVER - Resolves all content types recursively
// ============================================================================

export interface ResolvedMediaItem {
  id: number;
  name: string;
  type: "media";
  duration: number;
  mediaType?: string;
}

export interface ResolvedContent {
  status: "has_content" | "empty" | "unknown" | "error" | "unknown_tagbased";
  uniqueMediaCount: number;
  totalItemsInStructure: number;
  mediaItems: ResolvedMediaItem[];
  mediaIds: number[];
  sourceType?: string;
  sourceId?: number;
  sourceName?: string;
  items: Array<{ type: string; id: number; name: string }>;
  topItems: string[];
  fillerContent?: { sourceType: string; sourceId: number; sourceName?: string };
  takeoverContent?: { sourceType: string; sourceId: number; sourceName?: string; active: boolean };
  warnings: string[];
  lastFetchedAt: string;
}

const MAX_DEPTH = 3;

export class ContentResolver {
  private client: YodeckClient;
  private visited: Set<string> = new Set();
  private mediaItems: Map<number, ResolvedMediaItem> = new Map();
  private items: Array<{ type: string; id: number; name: string }> = [];
  private warnings: string[] = [];
  private fillerContent?: { sourceType: string; sourceId: number; sourceName?: string };

  constructor(client: YodeckClient) {
    this.client = client;
  }

  async resolveScreenContent(screen: YodeckScreen): Promise<ResolvedContent> {
    this.visited.clear();
    this.mediaItems.clear();
    this.items = [];
    this.warnings = [];
    this.fillerContent = undefined;

    const sc = screen.screen_content;
    if (!sc || !sc.source_type || !sc.source_id) {
      return {
        status: "unknown",
        uniqueMediaCount: 0,
        totalItemsInStructure: 0,
        mediaItems: [],
        mediaIds: [],
        items: [],
        topItems: [],
        warnings: ["No screen_content found"],
        lastFetchedAt: new Date().toISOString(),
      };
    }

    const sourceType = String(sc.source_type).toLowerCase().replace("_", "-");
    const sourceId = sc.source_id;
    const sourceName = sc.source_name || undefined;

    try {
      await this.resolveSource(sourceType, sourceId, sourceName, 0);
    } catch (err: any) {
      this.warnings.push(`Error resolving ${sourceType} ${sourceId}: ${err.message}`);
    }

    const mediaIds = Array.from(this.mediaItems.keys());
    const mediaItemsArr = Array.from(this.mediaItems.values()).sort((a, b) => 
      a.name.localeCompare(b.name)
    );

    // Determine status
    let status: ResolvedContent["status"] = "has_content";
    if (mediaItemsArr.length === 0 && this.items.length === 0) {
      status = "empty";
    }
    if (sourceType === "tagbased-playlist" && mediaItemsArr.length === 0) {
      status = "unknown_tagbased";
    }

    // Generate topItems (top 5 media names formatted as "media: <name>")
    const topItems = mediaItemsArr.slice(0, 5).map(m => `media: ${m.name}`);

    // Check for takeover content
    let takeoverContent: ResolvedContent["takeoverContent"] = undefined;
    const tc = (screen as any).takeover_content;
    if (tc?.source_type && tc?.source_id) {
      const now = new Date();
      const start = tc.start_datetime ? new Date(tc.start_datetime) : null;
      const end = tc.end_datetime ? new Date(tc.end_datetime) : null;
      const active = (!start || now >= start) && (!end || now <= end);
      takeoverContent = {
        sourceType: tc.source_type,
        sourceId: tc.source_id,
        sourceName: tc.source_name,
        active,
      };
    }

    return {
      status,
      uniqueMediaCount: mediaIds.length,
      totalItemsInStructure: this.items.length,
      mediaItems: mediaItemsArr,
      mediaIds,
      sourceType,
      sourceId,
      sourceName,
      items: this.items,
      topItems,
      fillerContent: this.fillerContent,
      takeoverContent,
      warnings: this.warnings,
      lastFetchedAt: new Date().toISOString(),
    };
  }

  private async resolveSource(
    type: string,
    id: number,
    name?: string,
    depth: number = 0
  ): Promise<void> {
    const key = `${type}:${id}`;
    if (this.visited.has(key)) {
      this.warnings.push(`Cycle detected: ${key} already visited`);
      return;
    }
    if (depth > MAX_DEPTH) {
      this.warnings.push(`Max depth (${MAX_DEPTH}) reached at ${key}`);
      return;
    }

    this.visited.add(key);
    this.items.push({ type, id, name: name || `${type} ${id}` });

    switch (type) {
      case "playlist":
        await this.resolvePlaylist(id, depth);
        break;
      case "tagbased-playlist":
      case "tagbased_playlist":
        await this.resolveTagbasedPlaylist(id, depth);
        break;
      case "layout":
        await this.resolveLayout(id, depth);
        break;
      case "schedule":
        await this.resolveSchedule(id, depth);
        break;
      case "media":
        await this.resolveMedia(id);
        break;
      case "widget":
      case "app":
      case "webpage":
        // Widgets/apps/webpages don't contribute to media count
        break;
      default:
        this.warnings.push(`Unknown source type: ${type}`);
    }
  }

  private async resolvePlaylist(id: number, depth: number): Promise<void> {
    const playlist = await this.client.getPlaylist(id);
    if (!playlist) {
      this.warnings.push(`Playlist ${id} not found`);
      return;
    }

    for (const item of playlist.items || []) {
      if (!item.id) continue;

      const itemType = String(item.type || "media").toLowerCase();
      if (itemType === "media") {
        await this.resolveMedia(item.id, item.duration);
      } else if (itemType === "playlist") {
        await this.resolveSource("playlist", item.id, item.name, depth + 1);
      } else if (itemType === "layout") {
        await this.resolveSource("layout", item.id, item.name, depth + 1);
      } else if (itemType === "tagbased-playlist" || itemType === "tagbased_playlist") {
        await this.resolveSource("tagbased-playlist", item.id, item.name, depth + 1);
      } else {
        this.items.push({ type: itemType, id: item.id, name: item.name || `${itemType} ${item.id}` });
      }
    }
  }

  private async resolveTagbasedPlaylist(id: number, _depth: number): Promise<void> {
    const tagbased = await this.client.getTagbasedPlaylist(id);
    if (!tagbased) {
      this.warnings.push(`Tagbased playlist ${id} not found`);
      return;
    }

    // Best-effort resolution using tags
    const tags = tagbased.tags?.map(t => t.name) || [];
    const workspaceId = tagbased.workspaces?.[0]?.id;

    if (tags.length === 0) {
      this.warnings.push(`Tagbased playlist ${id} has no tags, cannot resolve media`);
      return;
    }

    if (workspaceId) {
      try {
        const mediaList = await this.client.getMediaByTags(workspaceId, tags);
        const excludedIds = new Set(tagbased.excludes?.media || []);
        
        for (const media of mediaList) {
          if (!excludedIds.has(media.id)) {
            this.addMediaItem(media.id, media.name, undefined, media.media_origin?.type);
          }
        }
      } catch (err: any) {
        this.warnings.push(`Error fetching media for tagbased playlist ${id}: ${err.message}`);
      }
    } else {
      this.warnings.push(`Tagbased playlist ${id} has no workspace, cannot fetch media`);
    }
  }

  private async resolveLayout(id: number, depth: number): Promise<void> {
    const layout = await this.client.getLayout(id);
    if (!layout) {
      this.warnings.push(`Layout ${id} not found`);
      return;
    }

    for (const region of layout.regions || []) {
      if (!region.item?.id) continue;

      const itemType = String(region.item.type || "media").toLowerCase();
      if (itemType === "media") {
        await this.resolveMedia(region.item.id);
      } else if (itemType === "playlist") {
        await this.resolveSource("playlist", region.item.id, undefined, depth + 1);
      } else if (itemType === "layout") {
        await this.resolveSource("layout", region.item.id, undefined, depth + 1);
      } else if (itemType === "tagbased-playlist" || itemType === "tagbased_playlist") {
        await this.resolveSource("tagbased-playlist", region.item.id, undefined, depth + 1);
      } else {
        this.items.push({ type: itemType, id: region.item.id, name: `${itemType} ${region.item.id}` });
      }
    }
  }

  private async resolveSchedule(id: number, depth: number): Promise<void> {
    const schedule = await this.client.getSchedule(id);
    if (!schedule) {
      this.warnings.push(`Schedule ${id} not found`);
      return;
    }

    for (const event of schedule.events || []) {
      if (!event.source?.source_id) continue;

      const sourceType = String(event.source.source_type || "playlist").toLowerCase();
      if (sourceType === "playlist") {
        await this.resolveSource("playlist", event.source.source_id, event.source.source_name, depth + 1);
      } else if (sourceType === "layout") {
        await this.resolveSource("layout", event.source.source_id, event.source.source_name, depth + 1);
      }
    }

    // Store filler content info (but don't include in main count)
    if (schedule.filler_content?.source_id) {
      this.fillerContent = {
        sourceType: schedule.filler_content.source_type,
        sourceId: schedule.filler_content.source_id,
        sourceName: schedule.filler_content.source_name || undefined,
      };
      this.items.push({
        type: `filler:${schedule.filler_content.source_type}`,
        id: schedule.filler_content.source_id,
        name: schedule.filler_content.source_name || "Filler content",
      });
    }
  }

  private async resolveMedia(id: number, duration?: number): Promise<void> {
    if (this.mediaItems.has(id)) return;

    const media = await this.client.getMedia(id);
    if (media) {
      this.addMediaItem(id, media.name, duration, media.media_origin?.type);
    } else {
      this.addMediaItem(id, `Media ${id}`, duration, undefined);
      this.warnings.push(`Media ${id} not found in index`);
    }
  }

  private addMediaItem(id: number, name: string, duration?: number, mediaType?: string): void {
    if (this.mediaItems.has(id)) return;

    this.mediaItems.set(id, {
      id,
      name,
      type: "media",
      duration: duration && duration > 0 ? duration : -1,
      mediaType,
    });
  }
}
