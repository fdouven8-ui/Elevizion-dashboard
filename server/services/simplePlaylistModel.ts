import { db } from "../db";
import { screens, advertisers, adAssets } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { storage } from "../storage";
import { yodeckPublishService } from "./yodeckPublishService";
import { ObjectStorageService } from "../objectStorage";

const LOG_PREFIX = "[SimplePlaylist]";
const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const BASE_PLAYLIST_NAME = "Basis playlist";

// ===============================================================
// TARGETING HELPER - Robust city/region matching
// ===============================================================

/**
 * Normalize a city/region string for comparison:
 * - lowercase, trim whitespace
 * - remove common Dutch prefixes ('s-, 't-)
 * - strip accents/diacritics
 */
function normalizeForTargeting(value: string | null | undefined): string {
  if (!value) return "";
  let normalized = value.toLowerCase().trim();
  // Remove Dutch prefixes like 's- and 't-
  normalized = normalized.replace(/^['']s-/i, "").replace(/^['']t-/i, "");
  // Remove diacritics
  normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return normalized;
}

/**
 * Parse targetCities from advertiser (handles both string and array formats)
 */
function parseTargetCities(targetCities: string | string[] | null | undefined): string[] {
  if (!targetCities) return [];
  if (Array.isArray(targetCities)) {
    return targetCities.map(c => normalizeForTargeting(c)).filter(Boolean);
  }
  // Comma-separated string
  return targetCities.split(",").map(c => normalizeForTargeting(c)).filter(Boolean);
}

/**
 * Check if screen location matches advertiser targeting
 * IMPORTANT: Both targetRegions and targetCities should be PRE-NORMALIZED before calling
 * Returns { match: boolean, reason: string }
 */
function checkTargetingMatch(
  screenCity: string,
  screenRegion: string,
  targetRegions: string[], // Pre-normalized
  targetCities: string[]   // Pre-normalized
): { match: boolean; reason: string } {
  const normCity = normalizeForTargeting(screenCity);
  const normRegion = normalizeForTargeting(screenRegion);
  
  // No targeting = matches all screens (nationwide advertiser)
  if (targetRegions.length === 0 && targetCities.length === 0) {
    return { match: true, reason: "no_targeting (matches all)" };
  }
  
  // No location = can't match geo-targeted advertisers
  if (!normCity && !normRegion) {
    return { match: false, reason: "screen_no_location" };
  }
  
  // Exact city match
  if (normCity && targetCities.includes(normCity)) {
    return { match: true, reason: `city_match: ${screenCity}` };
  }
  
  // City in targetRegions (region codes can contain city names)
  if (normCity && targetRegions.includes(normCity)) {
    return { match: true, reason: `regionCode_city_match: ${screenCity}` };
  }
  
  // Region match
  if (normRegion && targetRegions.includes(normRegion)) {
    return { match: true, reason: `region_match: ${screenRegion}` };
  }
  
  // Partial match (for city name variations like "den bosch" vs "'s-hertogenbosch")
  if (normCity) {
    const partialCityMatch = targetCities.some(t => 
      normCity.includes(t) || t.includes(normCity)
    );
    if (partialCityMatch) {
      return { match: true, reason: `partial_city_match: ${screenCity}` };
    }
    
    const partialRegionMatch = targetRegions.some(t => 
      normCity.includes(t) || t.includes(normCity)
    );
    if (partialRegionMatch) {
      return { match: true, reason: `partial_regionCode_match: ${screenCity}` };
    }
  }
  
  return { match: false, reason: "no_match" };
}

let cachedBasePlaylistId: number | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parse and validate YODECK_AUTH_TOKEN
 * Expected format: "label:apikey" (e.g., "myapp:abc123xyz")
 * Header format: "Authorization: Token label:apikey"
 */
interface ParsedToken {
  raw: string;
  label: string;
  value: string;
  isValid: boolean;
  error?: string;
  tokenPresent: boolean;
  tokenLength: number;
  tokenPrefix: string; // first 4 chars + "..."
}

function parseYodeckToken(): ParsedToken {
  const raw = process.env.YODECK_AUTH_TOKEN?.trim() || "";
  
  if (!raw) {
    return {
      raw: "",
      label: "",
      value: "",
      isValid: false,
      error: "YODECK_AUTH_TOKEN not configured (empty or missing)",
      tokenPresent: false,
      tokenLength: 0,
      tokenPrefix: "",
    };
  }
  
  const colonIndex = raw.indexOf(":");
  if (colonIndex === -1) {
    return {
      raw,
      label: "",
      value: "",
      isValid: false,
      error: "YODECK_AUTH_TOKEN missing colon separator (expected format: label:apikey)",
      tokenPresent: true,
      tokenLength: raw.length,
      tokenPrefix: raw.substring(0, 4) + "...",
    };
  }
  
  const label = raw.substring(0, colonIndex).trim();
  const value = raw.substring(colonIndex + 1).trim();
  
  if (!label) {
    return {
      raw,
      label: "",
      value,
      isValid: false,
      error: "YODECK_AUTH_TOKEN has empty label (expected format: label:apikey)",
      tokenPresent: true,
      tokenLength: raw.length,
      tokenPrefix: raw.substring(0, 4) + "...",
    };
  }
  
  if (!value) {
    return {
      raw,
      label,
      value: "",
      isValid: false,
      error: "YODECK_AUTH_TOKEN has empty value after colon (expected format: label:apikey)",
      tokenPresent: true,
      tokenLength: raw.length,
      tokenPrefix: raw.substring(0, 4) + "...",
    };
  }
  
  return {
    raw,
    label,
    value,
    isValid: true,
    tokenPresent: true,
    tokenLength: raw.length,
    tokenPrefix: raw.substring(0, 4) + "...",
  };
}

function getYodeckApiKey(): string {
  const parsed = parseYodeckToken();
  if (!parsed.isValid) {
    throw new Error(parsed.error || "YODECK_AUTH_TOKEN not configured");
  }
  // Return full token in label:value format for Authorization: Token header
  return parsed.raw;
}

async function yodeckRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: any
): Promise<{ ok: boolean; data?: T; error?: string; status?: number; authDiagnostics?: any }> {
  const parsed = parseYodeckToken();
  
  // Log sanitized diagnostics before request
  const diagnostics = {
    tokenPresent: parsed.tokenPresent,
    tokenLength: parsed.tokenLength,
    tokenPrefix: parsed.tokenPrefix,
    hasLabel: Boolean(parsed.label),
    hasValue: Boolean(parsed.value),
    isValid: parsed.isValid,
    error: parsed.error,
  };
  
  if (!parsed.isValid) {
    console.error(`${LOG_PREFIX} [AUTH] Token validation failed:`, diagnostics);
    return { 
      ok: false, 
      error: parsed.error || "Invalid token",
      authDiagnostics: diagnostics,
    };
  }
  
  const apiKey = parsed.raw; // Full "label:value" format

  try {
    const url = `${YODECK_BASE_URL}${endpoint}`;
    
    // Log sanitized request info (NEVER log full token)
    console.log(`${LOG_PREFIX} [API] ${method} ${endpoint} | tokenPresent=${parsed.tokenPresent} tokenLength=${parsed.tokenLength} hasAuthHeader=true`);
    
    const options: RequestInit = {
      method,
      headers: {
        // CORRECT FORMAT: "Token label:value" NOT "Api-Key" or "Bearer"
        "Authorization": `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    // Log sanitized response
    console.log(`${LOG_PREFIX} [API] ${method} ${endpoint} -> status=${response.status} ok=${response.ok}`);
    
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const truncatedError = text.substring(0, 500);
      console.error(`${LOG_PREFIX} [API] ${method} ${endpoint} -> ${response.status}: ${truncatedError}`);
      
      // Add auth hint for 401 errors
      if (response.status === 401) {
        return { 
          ok: false, 
          error: `HTTP 401 Unauthorized: ${truncatedError}`, 
          status: response.status,
          authDiagnostics: {
            ...diagnostics,
            hint: "Check YODECK_AUTH_TOKEN format (label:apikey) and validity",
          },
        };
      }
      
      return { ok: false, error: `HTTP ${response.status}: ${truncatedError}`, status: response.status };
    }

    if (response.status === 204) {
      return { ok: true, data: undefined, status: 204 };
    }

    const data = await response.json();
    return { ok: true, data, status: response.status };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} [API] ${method} ${endpoint} -> ERROR: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export interface BasePlaylistResult {
  ok: boolean;
  basePlaylistId: number | null;
  basePlaylistName: string | null;
  itemCount: number;
  error?: string;
}

export async function getBasePlaylistId(): Promise<BasePlaylistResult> {
  const now = Date.now();
  
  if (cachedBasePlaylistId && now < cacheExpiry) {
    console.log(`${LOG_PREFIX} Using cached basePlaylistId=${cachedBasePlaylistId}`);
    return { 
      ok: true, 
      basePlaylistId: cachedBasePlaylistId, 
      basePlaylistName: BASE_PLAYLIST_NAME,
      itemCount: 0 
    };
  }

  console.log(`${LOG_PREFIX} Searching for "${BASE_PLAYLIST_NAME}" in Yodeck...`);
  
  const searchResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>(
    `/playlists/?search=${encodeURIComponent(BASE_PLAYLIST_NAME)}`
  );

  if (!searchResult.ok || !searchResult.data) {
    return { 
      ok: false, 
      basePlaylistId: null, 
      basePlaylistName: null,
      itemCount: 0,
      error: searchResult.error || "Failed to search playlists" 
    };
  }

  const exactMatch = searchResult.data.results.find(
    (p) => p.name === BASE_PLAYLIST_NAME
  );

  if (!exactMatch) {
    console.error(`${LOG_PREFIX} BASE_PLAYLIST_NOT_FOUND: No playlist named "${BASE_PLAYLIST_NAME}"`);
    return { 
      ok: false, 
      basePlaylistId: null, 
      basePlaylistName: null,
      itemCount: 0,
      error: `BASE_PLAYLIST_NOT_FOUND: Create a playlist named "${BASE_PLAYLIST_NAME}" in Yodeck first` 
    };
  }

  cachedBasePlaylistId = exactMatch.id;
  cacheExpiry = now + CACHE_TTL_MS;
  
  // Fetch full playlist to get item count
  const fullPlaylist = await yodeckRequest<{ id: number; name: string; items: any[] }>(
    `/playlists/${exactMatch.id}/`
  );
  const itemCount = fullPlaylist.ok && fullPlaylist.data?.items ? fullPlaylist.data.items.length : 0;
  
  console.log(`${LOG_PREFIX} Found basePlaylistId=${exactMatch.id} "${exactMatch.name}" with ${itemCount} items`);
  
  return { 
    ok: true, 
    basePlaylistId: exactMatch.id, 
    basePlaylistName: exactMatch.name,
    itemCount 
  };
}

export interface EnsureScreenPlaylistResult {
  ok: boolean;
  screenPlaylistId: number | null;
  screenPlaylistName: string | null;
  wasCreated: boolean;
  error?: string;
}

export async function ensureScreenPlaylist(
  screen: { id: string; yodeckPlayerId: string | null; playlistId?: string | null }
): Promise<EnsureScreenPlaylistResult> {
  const playerId = screen.yodeckPlayerId;
  
  if (!playerId) {
    return { 
      ok: false, 
      screenPlaylistId: null, 
      screenPlaylistName: null, 
      wasCreated: false,
      error: "Screen has no yodeckPlayerId" 
    };
  }

  const canonicalName = `EVZ | SCREEN | ${playerId}`;

  // 1. Check if screen already has playlistId in DB
  const existingScreen = await storage.getScreen(screen.id);
  if (existingScreen?.playlistId) {
    const playlistId = parseInt(existingScreen.playlistId, 10);
    
    // Verify it still exists in Yodeck
    const verifyResult = await yodeckRequest<{ id: number; name: string }>(`/playlists/${playlistId}/`);
    
    if (verifyResult.ok && verifyResult.data) {
      console.log(`${LOG_PREFIX} Screen ${screen.id} already has valid playlistId=${playlistId}`);
      return { 
        ok: true, 
        screenPlaylistId: playlistId, 
        screenPlaylistName: verifyResult.data.name,
        wasCreated: false 
      };
    }
    
    console.warn(`${LOG_PREFIX} Screen ${screen.id} playlistId=${playlistId} no longer exists in Yodeck, recreating...`);
  }

  // 2. Search Yodeck for existing playlist with canonical name
  const searchResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>(
    `/playlists/?search=${encodeURIComponent(canonicalName)}`
  );

  if (searchResult.ok && searchResult.data) {
    const exactMatch = searchResult.data.results.find(
      (p) => p.name === canonicalName
    );
    
    if (exactMatch) {
      console.log(`${LOG_PREFIX} Found existing playlist in Yodeck: ${exactMatch.id} "${exactMatch.name}"`);
      await db.update(screens).set({ playlistId: String(exactMatch.id) }).where(eq(screens.id, screen.id));
      return { 
        ok: true, 
        screenPlaylistId: exactMatch.id, 
        screenPlaylistName: exactMatch.name,
        wasCreated: false 
      };
    }
  }

  // 3. Create new playlist
  // CRITICAL: Yodeck API v2 requires "items" field (empty array is fine)
  console.log(`${LOG_PREFIX} Creating new playlist: "${canonicalName}"`);
  
  const createResult = await yodeckRequest<{ id: number; name: string }>("/playlists/", "POST", {
    name: canonicalName,
    description: `Screen playlist for player ${playerId}`,
    items: [],  // Required by Yodeck API v2
    add_gaps: false,
    shuffle_content: false,
  });

  if (!createResult.ok || !createResult.data?.id) {
    return { 
      ok: false, 
      screenPlaylistId: null, 
      screenPlaylistName: null, 
      wasCreated: false,
      error: createResult.error || "Failed to create playlist" 
    };
  }

  const newPlaylistId = createResult.data.id;
  
  await db.update(screens).set({ playlistId: String(newPlaylistId) }).where(eq(screens.id, screen.id));
  
  console.log(`${LOG_PREFIX} Created playlist ${newPlaylistId} for screen ${screen.id}`);
  return { 
    ok: true, 
    screenPlaylistId: newPlaylistId, 
    screenPlaylistName: canonicalName,
    wasCreated: true 
  };
}

export interface SyncFromBaseResult {
  ok: boolean;
  baseMediaIds: number[];
  itemsReplaced: number;
  error?: string;
}

interface PlaylistItem {
  id: number;
  priority: number;
  duration: number;
  name: string;
  type: "media" | "widget" | "layout" | "playlist";
}

interface PlaylistResponse {
  id: number;
  name: string;
  items: PlaylistItem[];
}

export async function syncScreenPlaylistFromBase(screenPlaylistId: number): Promise<SyncFromBaseResult> {
  console.log(`${LOG_PREFIX} Syncing playlist ${screenPlaylistId} from base...`);
  
  // 1. Get base playlist ID
  const baseResult = await getBasePlaylistId();
  if (!baseResult.ok || !baseResult.basePlaylistId) {
    return { 
      ok: false, 
      baseMediaIds: [], 
      itemsReplaced: 0,
      error: baseResult.error 
    };
  }

  // 2. Fetch base playlist (items are included in response, not separate endpoint)
  const basePlaylistResult = await yodeckRequest<PlaylistResponse>(
    `/playlists/${baseResult.basePlaylistId}/`
  );

  if (!basePlaylistResult.ok || !basePlaylistResult.data) {
    return { 
      ok: false, 
      baseMediaIds: [], 
      itemsReplaced: 0,
      error: basePlaylistResult.error || "Failed to fetch base playlist" 
    };
  }

  const baseItems = basePlaylistResult.data.items || [];
  // The item.id is the playlist item ID, not the media ID
  // We need to copy the item structure to the screen playlist
  const baseMediaIds = baseItems.map(item => item.id);
  
  console.log(`${LOG_PREFIX} Base playlist has ${baseItems.length} items: ${baseItems.map(i => `${i.name}(${i.id})`).join(", ")}`);

  // 3. Get current screen playlist
  const currentPlaylistResult = await yodeckRequest<PlaylistResponse>(
    `/playlists/${screenPlaylistId}/`
  );

  // 4. Replace screen playlist items with base items
  // Use PATCH to replace the entire items array
  const patchResult = await yodeckRequest(`/playlists/${screenPlaylistId}/`, "PATCH", {
    items: baseItems.map((item, index) => ({
      id: item.id,  // Keep the media/widget ID reference
      priority: index + 1,
      duration: item.duration || 10,
      type: item.type,
    })),
  });

  if (!patchResult.ok) {
    console.error(`${LOG_PREFIX} Failed to patch playlist items: ${patchResult.error}`);
    return { 
      ok: false, 
      baseMediaIds: [], 
      itemsReplaced: 0,
      error: patchResult.error || "Failed to replace playlist items" 
    };
  }

  console.log(`${LOG_PREFIX} Replaced items in playlist ${screenPlaylistId} with ${baseItems.length} base items`);
  
  return { 
    ok: true, 
    baseMediaIds, 
    itemsReplaced: baseItems.length 
  };
}

export interface EnsureMediaUploadResult {
  ok: boolean;
  advertiserId: string;
  mediaId: number | null;
  wasAlreadyUploaded: boolean;
  error?: string;
}

export async function ensureAdvertiserMediaUploaded(advertiserId: string): Promise<EnsureMediaUploadResult> {
  console.log(`${LOG_PREFIX} Ensuring media uploaded for advertiser ${advertiserId}...`);
  
  // Get advertiser
  const advertiser = await storage.getAdvertiser(advertiserId);
  if (!advertiser) {
    return { ok: false, advertiserId, mediaId: null, wasAlreadyUploaded: false, error: "Advertiser not found" };
  }
  
  // If already has canonical media ID, we're done
  if (advertiser.yodeckMediaIdCanonical) {
    console.log(`${LOG_PREFIX} Advertiser ${advertiserId} already has mediaId=${advertiser.yodeckMediaIdCanonical}`);
    return { ok: true, advertiserId, mediaId: advertiser.yodeckMediaIdCanonical, wasAlreadyUploaded: true };
  }
  
  // Find approved ad asset for this advertiser
  const [asset] = await db
    .select()
    .from(adAssets)
    .where(
      and(
        eq(adAssets.advertiserId, advertiserId),
        eq(adAssets.approvalStatus, "APPROVED"),
        eq(adAssets.isSuperseded, false)
      )
    )
    .orderBy(desc(adAssets.createdAt))
    .limit(1);
  
  if (!asset) {
    return { ok: false, advertiserId, mediaId: null, wasAlreadyUploaded: false, error: "No approved ad asset found" };
  }
  
  // Get the file path (prefer normalized/converted, fall back to original)
  const storagePath = asset.normalizedStoragePath || asset.convertedStoragePath || asset.storagePath;
  if (!storagePath) {
    return { ok: false, advertiserId, mediaId: null, wasAlreadyUploaded: false, error: "No storage path for ad asset" };
  }
  
  console.log(`${LOG_PREFIX} Found approved asset: id=${asset.id}, path=${storagePath}`);
  
  try {
    // Download file from object storage
    const objectStorage = new ObjectStorageService();
    const file = await objectStorage.getFileByPath(storagePath);
    
    if (!file) {
      return { ok: false, advertiserId, mediaId: null, wasAlreadyUploaded: false, error: "File not found in object storage" };
    }
    
    const [fileBuffer] = await file.download();
    console.log(`${LOG_PREFIX} Downloaded ${fileBuffer.length} bytes`);
    
    // Upload to Yodeck using the publish service singleton
    const mediaName = advertiser.linkKey 
      ? `${advertiser.linkKey}.mp4`
      : `ADV-${advertiserId.substring(0, 8)}.mp4`;
    
    const uploadResult = await yodeckPublishService.uploadMediaWithRetry({
      bytes: fileBuffer,
      name: mediaName,
      contentType: 'video/mp4',
    });
    
    if (!uploadResult.ok || !uploadResult.mediaId) {
      const lastError = uploadResult.diagnostics?.lastError;
      const errorMsg = typeof lastError === 'string' 
        ? lastError 
        : (lastError?.message || "Upload failed");
      console.error(`${LOG_PREFIX} Upload failed for advertiser ${advertiserId}: ${errorMsg}`);
      return { ok: false, advertiserId, mediaId: null, wasAlreadyUploaded: false, error: errorMsg };
    }
    
    const yodeckMediaId = uploadResult.mediaId;
    console.log(`${LOG_PREFIX} Uploaded to Yodeck: mediaId=${yodeckMediaId}`);
    
    // Update advertiser with canonical media ID
    await db.update(advertisers)
      .set({
        yodeckMediaIdCanonical: yodeckMediaId,
        yodeckMediaIdCanonicalUpdatedAt: new Date(),
        assetStatus: "live",
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));
    
    // Update ad asset with Yodeck info
    await db.update(adAssets)
      .set({
        yodeckMediaId: yodeckMediaId,
        yodeckUploadedAt: new Date(),
        approvalStatus: "PUBLISHED",
      })
      .where(eq(adAssets.id, asset.id));
    
    console.log(`${LOG_PREFIX} Updated advertiser and asset with yodeckMediaId=${yodeckMediaId}`);
    
    return { ok: true, advertiserId, mediaId: yodeckMediaId, wasAlreadyUploaded: false };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Error uploading media for advertiser ${advertiserId}:`, err);
    return { ok: false, advertiserId, mediaId: null, wasAlreadyUploaded: false, error: err.message };
  }
}

export interface AddAdsResult {
  ok: boolean;
  adsAdded: number;
  finalCount: number;
  error?: string;
}

export async function addAdsToScreenPlaylist(
  screenPlaylistId: number, 
  adMediaIds: number[]
): Promise<AddAdsResult> {
  // Get current playlist with items
  const playlistResult = await yodeckRequest<PlaylistResponse>(
    `/playlists/${screenPlaylistId}/`
  );

  if (!playlistResult.ok || !playlistResult.data) {
    return { ok: false, adsAdded: 0, finalCount: 0, error: "Failed to fetch current playlist" };
  }

  const currentItems = playlistResult.data.items || [];
  const existingIds = new Set(currentItems.map(item => item.id));
  
  if (adMediaIds.length === 0) {
    console.log(`${LOG_PREFIX} No ads to add, playlist has ${currentItems.length} items`);
    return { ok: true, adsAdded: 0, finalCount: currentItems.length };
  }

  console.log(`${LOG_PREFIX} Adding ${adMediaIds.length} ads to playlist ${screenPlaylistId}`);

  // Filter out duplicates
  const newAdIds = adMediaIds.filter(id => !existingIds.has(id));
  const duplicateCount = adMediaIds.length - newAdIds.length;
  
  if (duplicateCount > 0) {
    console.log(`${LOG_PREFIX} Skipping ${duplicateCount} ads already in playlist`);
  }

  if (newAdIds.length === 0) {
    console.log(`${LOG_PREFIX} All ads already in playlist`);
    return { ok: true, adsAdded: 0, finalCount: currentItems.length };
  }

  // Build new items array: keep base items + add new ads
  const newItems = [
    ...currentItems.map((item, index) => ({
      id: item.id,
      priority: index + 1,
      duration: item.duration || 10,
      type: item.type,
    })),
    ...newAdIds.map((mediaId, index) => ({
      id: mediaId,  // Media ID to add
      priority: currentItems.length + index + 1,
      duration: 15,  // Default ad duration
      type: "media" as const,
    })),
  ];

  // PATCH the playlist with updated items
  const patchResult = await yodeckRequest(`/playlists/${screenPlaylistId}/`, "PATCH", {
    items: newItems,
  });

  if (!patchResult.ok) {
    console.error(`${LOG_PREFIX} Failed to add ads: ${patchResult.error}`);
    return { ok: false, adsAdded: 0, finalCount: currentItems.length, error: patchResult.error };
  }

  console.log(`${LOG_PREFIX} Added ${newAdIds.length} ads, final playlist has ${newItems.length} items`);
  
  return { ok: true, adsAdded: newAdIds.length, finalCount: newItems.length };
}

export interface ApplyAndPushResult {
  ok: boolean;
  pushed: boolean;
  verified: boolean;
  actualSourceType: string | null;
  actualSourceId: number | null;
  error?: string;
}

export async function applyPlayerSourceAndPush(
  playerId: string,
  screenPlaylistId: number
): Promise<ApplyAndPushResult> {
  console.log(`${LOG_PREFIX} Applying playlist ${screenPlaylistId} to player ${playerId}...`);

  // 1. Set player content source to playlist using screen_content wrapper
  // CRITICAL: Yodeck API v2 requires screen_content object, not top-level fields
  const patchResult = await yodeckRequest(`/screens/${playerId}/`, "PATCH", {
    screen_content: {
      source_type: "playlist",
      source_id: screenPlaylistId,
    },
  });

  if (!patchResult.ok) {
    console.error(`${LOG_PREFIX} PATCH failed for player ${playerId}: ${patchResult.error}`);
    return { 
      ok: false, 
      pushed: false, 
      verified: false,
      actualSourceType: null,
      actualSourceId: null,
      error: `PATCH failed: ${patchResult.error}` 
    };
  }

  console.log(`${LOG_PREFIX} PATCH OK - set player ${playerId} source to playlist ${screenPlaylistId}`);

  // 2. Verify by reading player status
  interface ScreenResponse {
    id: number;
    name: string;
    screen_content?: {
      source_type: string | null;
      source_id: number | null;
      source_name: string | null;
    };
  }
  
  const verifyResult = await yodeckRequest<ScreenResponse>(`/screens/${playerId}/`);

  if (!verifyResult.ok || !verifyResult.data) {
    return { 
      ok: false, 
      pushed: true, 
      verified: false,
      actualSourceType: null,
      actualSourceId: null,
      error: verifyResult.error || "Failed to verify player status" 
    };
  }

  // Extract from screen_content object
  const actualSourceType = verifyResult.data.screen_content?.source_type || null;
  const actualSourceId = verifyResult.data.screen_content?.source_id || null;
  const verified = actualSourceType === "playlist" && actualSourceId === screenPlaylistId;

  console.log(`${LOG_PREFIX} Verify: source_type=${actualSourceType}, source_id=${actualSourceId}, correct=${verified}`);

  if (!verified) {
    console.error(`${LOG_PREFIX} Verification FAILED: expected playlist ${screenPlaylistId}, got ${actualSourceType}/${actualSourceId}`);
  }

  return { 
    ok: verified, 
    pushed: true, 
    verified,
    actualSourceType,
    actualSourceId,
    error: verified ? undefined : `Verification failed: expected playlist ${screenPlaylistId}, got ${actualSourceType}/${actualSourceId}`
  };
}

export interface RebuildPlaylistResult {
  ok: boolean;
  correlationId: string;
  screenId: string;
  base: {
    found: boolean;
    basePlaylistId: number | null;
    baseItemCount: number;
  };
  screenPlaylist: {
    existed: boolean;
    created: boolean;
    screenPlaylistId: number | null;
    screenPlaylistName: string | null;
  };
  copy: {
    ok: boolean;
    copiedCount: number;
  };
  ads: {
    candidates: number;
    included: number;
    skipped: Array<{ reason: string; advertiserId: string; detail?: string }>;
    adsAdded: Array<{ advertiserId: string; mediaId: number; companyName: string }>;
  };
  assign: {
    ok: boolean;
    screenSourceType: string | null;
    screenSourceId: number | null;
  };
  push: {
    ok: boolean;
  };
  verify: {
    ok: boolean;
    actualSourceType: string | null;
    actualSourceId: number | null;
    actualPlaylistItemCount: number;
  };
  error: { step: string; message: string } | null;
  actions: string[];
}

export async function rebuildScreenPlaylist(screenId: string): Promise<RebuildPlaylistResult> {
  const correlationId = `rebuild_${screenId}_${Date.now()}`;
  const actions: string[] = [];
  const skippedAds: Array<{ reason: string; advertiserId: string; detail?: string }> = [];
  
  // Helper to create error response
  const errorResponse = (step: string, message: string, partial: Partial<RebuildPlaylistResult> = {}): RebuildPlaylistResult => ({
    ok: false,
    correlationId,
    screenId,
    base: { found: false, basePlaylistId: null, baseItemCount: 0 },
    screenPlaylist: { existed: false, created: false, screenPlaylistId: null, screenPlaylistName: null },
    copy: { ok: false, copiedCount: 0 },
    ads: { candidates: 0, included: 0, skipped: skippedAds, adsAdded: [] },
    assign: { ok: false, screenSourceType: null, screenSourceId: null },
    push: { ok: false },
    verify: { ok: false, actualSourceType: null, actualSourceId: null, actualPlaylistItemCount: 0 },
    error: { step, message },
    actions,
    ...partial,
  });
  
  console.log(`${LOG_PREFIX} [${correlationId}] Starting rebuild for screen ${screenId}`);
  actions.push(`[${correlationId}] Starting rebuild for screen ${screenId}`);

  // 1. Get screen
  const screen = await storage.getScreen(screenId);
  if (!screen) {
    actions.push(`ERROR: Screen not found`);
    return errorResponse("get_screen", "Screen not found");
  }

  if (!screen.yodeckPlayerId) {
    actions.push(`ERROR: Screen has no yodeckPlayerId`);
    return errorResponse("get_screen", "Screen has no yodeckPlayerId");
  }

  const playerId = screen.yodeckPlayerId;
  actions.push(`Player ID: ${playerId}`);

  // 2. Get base playlist
  actions.push(`Step 2: Finding base playlist "${BASE_PLAYLIST_NAME}"...`);
  const baseResult = await getBasePlaylistId();
  if (!baseResult.ok || !baseResult.basePlaylistId) {
    actions.push(`ERROR: Base playlist not found: ${baseResult.error}`);
    return errorResponse("get_base_playlist", baseResult.error || "BASE_PLAYLIST_NOT_FOUND");
  }
  actions.push(`Base playlist found: id=${baseResult.basePlaylistId}, items=${baseResult.itemCount}`);

  // 3. Ensure screen playlist
  const screenPlaylistName = `EVZ | SCREEN | ${playerId}`;
  actions.push(`Step 3: Ensuring screen playlist "${screenPlaylistName}"...`);
  const ensureResult = await ensureScreenPlaylist(screen);
  if (!ensureResult.ok || !ensureResult.screenPlaylistId) {
    actions.push(`ERROR: Failed to ensure screen playlist: ${ensureResult.error}`);
    return errorResponse("ensure_screen_playlist", ensureResult.error || "Failed to ensure screen playlist", {
      base: { found: true, basePlaylistId: baseResult.basePlaylistId, baseItemCount: baseResult.itemCount },
    });
  }
  actions.push(`Screen playlist: id=${ensureResult.screenPlaylistId} (existed=${!ensureResult.wasCreated}, created=${ensureResult.wasCreated})`);

  // 4. Sync from base
  actions.push(`Step 4: Copying items from base playlist...`);
  const syncResult = await syncScreenPlaylistFromBase(ensureResult.screenPlaylistId);
  if (!syncResult.ok) {
    actions.push(`ERROR: Failed to sync from base: ${syncResult.error}`);
    return errorResponse("copy_base_items", syncResult.error || "Failed to copy base items", {
      base: { found: true, basePlaylistId: baseResult.basePlaylistId, baseItemCount: baseResult.itemCount },
      screenPlaylist: { existed: !ensureResult.wasCreated, created: ensureResult.wasCreated, screenPlaylistId: ensureResult.screenPlaylistId, screenPlaylistName },
    });
  }
  actions.push(`Copied ${syncResult.baseMediaIds.length} base items`);

  // 5. Collect ad media IDs for this screen using TARGETING (not placements)
  actions.push(`Step 5: Collecting ads via targeting...`);
  const MAX_ADS_PER_SCREEN = 20;
  const adMediaIds: number[] = [];
  const adsAdded: Array<{ advertiserId: string; mediaId: number; companyName: string }> = [];
  
  // Get screen's location for targeting
  const location = screen.locationId ? await storage.getLocation(screen.locationId) : null;
  const screenCity = (location?.city || "").toLowerCase().trim();
  const screenRegion = (location?.region || "").toLowerCase().trim();
  actions.push(`Screen location: city="${screenCity}", region="${screenRegion}"`);
  
  const allAdvertisers = await storage.getAdvertisers();
  let adCandidates = 0;
  let uploadAttempts = 0;
  let uploadSuccesses = 0;
  let targetingMatches = 0;
  
  for (const advertiser of allAdvertisers) {
    // Check advertiser status is active
    if (advertiser.status !== "active") {
      continue;
    }
    
    // Check asset status - must be in approved/ready states
    const assetStatus = advertiser.assetStatus || "";
    if (!["approved", "ready_for_yodeck", "ready_for_publish", "live", "uploaded"].includes(assetStatus)) {
      continue;
    }
    
    adCandidates++;
    
    // TARGETING CHECK using normalized matching helpers
    const targetRegions = Array.isArray(advertiser.targetRegionCodes) 
      ? advertiser.targetRegionCodes.map(r => normalizeForTargeting(r))
      : [];
    const targetCitiesList = parseTargetCities(advertiser.targetCities);
    
    const targetCheck = checkTargetingMatch(screenCity, screenRegion, targetRegions, targetCitiesList);
    
    if (!targetCheck.match) {
      if (targetCheck.reason === "screen_no_location") {
        skippedAds.push({ reason: "screen_no_location", advertiserId: advertiser.id });
      } else {
        skippedAds.push({ reason: "targeting_mismatch", advertiserId: advertiser.id });
      }
      continue;
    }
    
    const matchReason = targetCheck.reason;
    
    targetingMatches++;
    
    // Check capacity
    if (adMediaIds.length >= MAX_ADS_PER_SCREEN) {
      skippedAds.push({ reason: "capacity_limit", advertiserId: advertiser.id });
      actions.push(`Skipped ${advertiser.companyName}: capacity limit (${MAX_ADS_PER_SCREEN})`);
      continue;
    }
    
    // Check if has canonical media ID - if not, try to upload automatically
    let mediaId = advertiser.yodeckMediaIdCanonical;
    
    if (!mediaId && ["ready_for_yodeck", "approved", "uploaded"].includes(assetStatus)) {
      // Attempt automatic upload to Yodeck
      actions.push(`Advertiser ${advertiser.companyName} has status=${assetStatus} but no mediaId - attempting upload...`);
      uploadAttempts++;
      
      const uploadResult = await ensureAdvertiserMediaUploaded(advertiser.id);
      
      if (uploadResult.ok && uploadResult.mediaId) {
        mediaId = uploadResult.mediaId;
        uploadSuccesses++;
        actions.push(`Upload SUCCESS for ${advertiser.companyName}: mediaId=${mediaId}`);
      } else {
        skippedAds.push({ 
          reason: "upload_failed", 
          advertiserId: advertiser.id, 
          detail: uploadResult.error 
        });
        actions.push(`Upload FAILED for ${advertiser.companyName}: ${uploadResult.error}`);
        continue;
      }
    } else if (!mediaId) {
      skippedAds.push({ reason: "no_yodeck_media_id", advertiserId: advertiser.id });
      actions.push(`Skipped ${advertiser.companyName}: no yodeckMediaIdCanonical and status=${assetStatus}`);
      continue;
    }

    adMediaIds.push(mediaId);
    adsAdded.push({ 
      advertiserId: advertiser.id, 
      mediaId, 
      companyName: advertiser.companyName || advertiser.id 
    });
    actions.push(`Including ad from ${advertiser.companyName}: mediaId=${mediaId} (${matchReason})`);
  }
  
  console.log(`[RebuildPlaylist] baseItems=${syncResult.baseMediaIds.length}`);
  console.log(`[RebuildPlaylist] candidateAds=${adCandidates}`);
  console.log(`[RebuildPlaylist] targetingMatches=${targetingMatches}`);
  console.log(`[RebuildPlaylist] uploadAttempts=${uploadAttempts}, uploadSuccesses=${uploadSuccesses}`);
  console.log(`[RebuildPlaylist] appendedAds=${adMediaIds.length}`);
  
  if (uploadAttempts > 0) {
    actions.push(`Auto-upload summary: ${uploadSuccesses}/${uploadAttempts} succeeded`);
  }
  actions.push(`Targeting: ${targetingMatches} matches from ${adCandidates} candidates, ${adMediaIds.length} ads to add`);

  // 6. Add ads to playlist
  actions.push(`Step 6: Adding ${adMediaIds.length} ads to screen playlist...`);
  const addAdsResult = await addAdsToScreenPlaylist(ensureResult.screenPlaylistId, adMediaIds);
  actions.push(`Added ${addAdsResult.adsAdded} new ads, final playlist has ${addAdsResult.finalCount} items`);

  // 7. Assign screen content source to playlist (CRITICAL STEP)
  actions.push(`Step 7: Assigning screen content to playlist ${ensureResult.screenPlaylistId}...`);
  const pushResult = await applyPlayerSourceAndPush(playerId, ensureResult.screenPlaylistId);
  
  if (!pushResult.ok) {
    actions.push(`ERROR: Assign/push failed: ${pushResult.error}`);
    return {
      ok: false,
      correlationId,
      screenId,
      base: { found: true, basePlaylistId: baseResult.basePlaylistId, baseItemCount: baseResult.itemCount },
      screenPlaylist: { existed: !ensureResult.wasCreated, created: ensureResult.wasCreated, screenPlaylistId: ensureResult.screenPlaylistId, screenPlaylistName },
      copy: { ok: true, copiedCount: syncResult.baseMediaIds.length },
      ads: { candidates: adCandidates, included: adMediaIds.length, skipped: skippedAds, adsAdded },
      assign: { ok: false, screenSourceType: pushResult.actualSourceType, screenSourceId: pushResult.actualSourceId },
      push: { ok: pushResult.pushed },
      verify: { ok: false, actualSourceType: pushResult.actualSourceType, actualSourceId: pushResult.actualSourceId, actualPlaylistItemCount: addAdsResult.finalCount },
      error: { step: "assign_screen", message: pushResult.error || "Failed to assign screen content" },
      actions,
    };
  }
  actions.push(`Assign OK: source_type=${pushResult.actualSourceType}, source_id=${pushResult.actualSourceId}`);

  // 8. Verify final state
  actions.push(`Step 8: Verifying final state...`);
  const verifyPlaylistResult = await yodeckRequest<PlaylistResponse>(`/playlists/${ensureResult.screenPlaylistId}/`);
  const actualPlaylistItemCount = verifyPlaylistResult.ok && verifyPlaylistResult.data?.items 
    ? verifyPlaylistResult.data.items.length 
    : 0;
  actions.push(`Final verification: playlist has ${actualPlaylistItemCount} items, screen content correctly assigned`);

  // 9. Update screen DB
  await db.update(screens).set({
    playlistId: String(ensureResult.screenPlaylistId),
    playbackMode: "playlist",
    lastPushAt: new Date(),
  }).where(eq(screens.id, screenId));
  actions.push(`DB updated: playlistId=${ensureResult.screenPlaylistId}, playbackMode=playlist`);

  console.log(`${LOG_PREFIX} [${correlationId}] Rebuild complete: ok=true, verify=${pushResult.verified}`);

  return {
    ok: true,
    correlationId,
    screenId,
    base: { found: true, basePlaylistId: baseResult.basePlaylistId, baseItemCount: baseResult.itemCount },
    screenPlaylist: { existed: !ensureResult.wasCreated, created: ensureResult.wasCreated, screenPlaylistId: ensureResult.screenPlaylistId, screenPlaylistName },
    copy: { ok: true, copiedCount: syncResult.baseMediaIds.length },
    ads: { candidates: adCandidates, included: adMediaIds.length, skipped: skippedAds, adsAdded },
    assign: { ok: true, screenSourceType: pushResult.actualSourceType, screenSourceId: pushResult.actualSourceId },
    push: { ok: true },
    verify: { ok: pushResult.verified, actualSourceType: pushResult.actualSourceType, actualSourceId: pushResult.actualSourceId, actualPlaylistItemCount },
    error: null,
    actions,
  };
}

export interface NowPlayingSimpleResult {
  ok: boolean;
  screenId: string;
  playerId: string | null;
  expectedPlaylistId: string | null;
  actualSourceType: string | null;
  actualSourceId: number | null;
  actualSourceName: string | null;
  isCorrect: boolean;
  itemCount: number;
  topItems?: string[];
  error?: string;
}

interface ScreenSourceInfo {
  sourceType: string | null;
  sourceId: number | null;
  extractedFrom: string;
}

function extractScreenSource(screenJson: any): ScreenSourceInfo {
  // Try multiple known Yodeck response structures
  
  // Path A: screen_content.source_type / source_id (Yodeck v2)
  if (screenJson?.screen_content?.source_type !== undefined) {
    return {
      sourceType: screenJson.screen_content.source_type,
      sourceId: screenJson.screen_content.source_id,
      extractedFrom: "screen_content",
    };
  }
  
  // Path B: content.source_type / source_id
  if (screenJson?.content?.source_type !== undefined) {
    return {
      sourceType: screenJson.content.source_type,
      sourceId: screenJson.content.source_id,
      extractedFrom: "content",
    };
  }
  
  // Path C: top-level source_type / source_id
  if (screenJson?.source_type !== undefined) {
    return {
      sourceType: screenJson.source_type,
      sourceId: screenJson.source_id,
      extractedFrom: "top_level",
    };
  }
  
  // Path D: current_content (legacy)
  if (screenJson?.current_content?.source_type !== undefined) {
    return {
      sourceType: screenJson.current_content.source_type,
      sourceId: screenJson.current_content.source_id,
      extractedFrom: "current_content",
    };
  }
  
  // Path E: playlist_id directly (some responses)
  if (screenJson?.playlist_id !== undefined) {
    return {
      sourceType: "playlist",
      sourceId: screenJson.playlist_id,
      extractedFrom: "playlist_id",
    };
  }
  
  // Log available keys for debugging
  const keys = screenJson ? Object.keys(screenJson) : [];
  console.log(`${LOG_PREFIX} extractScreenSource: No known source path found. Keys: ${keys.join(", ")}`);
  
  return { sourceType: null, sourceId: null, extractedFrom: "none" };
}

export async function getScreenNowPlayingSimple(screenId: string): Promise<NowPlayingSimpleResult> {
  const screen = await storage.getScreen(screenId);
  
  if (!screen) {
    return {
      ok: false,
      screenId,
      playerId: null,
      expectedPlaylistId: null,
      actualSourceType: null,
      actualSourceId: null,
      actualSourceName: null,
      isCorrect: false,
      itemCount: 0,
      error: "Screen not found",
    };
  }

  if (!screen.yodeckPlayerId) {
    return {
      ok: false,
      screenId,
      playerId: null,
      expectedPlaylistId: screen.playlistId,
      actualSourceType: null,
      actualSourceId: null,
      actualSourceName: null,
      isCorrect: false,
      itemCount: 0,
      error: "Screen has no yodeckPlayerId",
    };
  }

  // Get screen status from Yodeck (READ ONLY - no create!)
  const screenResult = await yodeckRequest<any>(
    `/screens/${screen.yodeckPlayerId}/`
  );

  if (!screenResult.ok || !screenResult.data) {
    return {
      ok: false,
      screenId,
      playerId: screen.yodeckPlayerId,
      expectedPlaylistId: screen.playlistId,
      actualSourceType: null,
      actualSourceId: null,
      actualSourceName: null,
      isCorrect: false,
      itemCount: 0,
      error: screenResult.error,
    };
  }

  // Use robust source extraction for multiple Yodeck API response formats
  const sourceInfo = extractScreenSource(screenResult.data);
  console.log(`${LOG_PREFIX} now-playing: screen=${screen.yodeckPlayerId}, extracted from=${sourceInfo.extractedFrom}, type=${sourceInfo.sourceType}, id=${sourceInfo.sourceId}`);
  
  const actualSourceType = sourceInfo.sourceType;
  const actualSourceId = sourceInfo.sourceId;
  const expectedPlaylistId = screen.playlistId ? parseInt(screen.playlistId, 10) : null;

  const isCorrect = actualSourceType === "playlist" && 
                    expectedPlaylistId !== null && 
                    actualSourceId === expectedPlaylistId;

  // Get playlist info if in playlist mode
  let itemCount = 0;
  let topItems: string[] = [];
  let actualSourceName: string | null = null;
  
  if (actualSourceType === "playlist" && actualSourceId) {
    const playlistResult = await yodeckRequest<PlaylistResponse>(`/playlists/${actualSourceId}/`);
    if (playlistResult.ok && playlistResult.data) {
      actualSourceName = playlistResult.data.name || null;
      if (playlistResult.data.items) {
        itemCount = playlistResult.data.items.length;
        // Get top 5 item names
        topItems = playlistResult.data.items
          .slice(0, 5)
          .map(item => item.name || `Media ${item.id}`)
          .filter(Boolean);
      }
    }
  }

  return {
    ok: true,
    screenId,
    playerId: screen.yodeckPlayerId,
    expectedPlaylistId: screen.playlistId,
    actualSourceType,
    actualSourceId,
    actualSourceName,
    isCorrect,
    itemCount,
    topItems: topItems.length > 0 ? topItems : undefined,
  };
}

export interface AuthStatusResult {
  ok: boolean;
  tokenPresent: boolean;
  tokenLength: number;
  tokenPrefix: string;
  hasLabel: boolean;
  hasValue: boolean;
  baseUrl: string;
  authHeaderScheme: string;
  probeEndpoint: string;
  status?: number;
  screenCount?: number;
  responseSample?: any;
  error?: string;
}

export async function validateYodeckAuth(): Promise<AuthStatusResult> {
  const parsed = parseYodeckToken();
  
  const baseResult: AuthStatusResult = {
    ok: false,
    tokenPresent: parsed.tokenPresent,
    tokenLength: parsed.tokenLength,
    tokenPrefix: parsed.tokenPrefix,
    hasLabel: Boolean(parsed.label),
    hasValue: Boolean(parsed.value),
    baseUrl: YODECK_BASE_URL,
    authHeaderScheme: "Token",
    probeEndpoint: "/screens/",
  };
  
  // Early exit if token is invalid
  if (!parsed.isValid) {
    console.error(`${LOG_PREFIX} [AUTH-STATUS] Token validation failed:`, {
      tokenPresent: parsed.tokenPresent,
      tokenLength: parsed.tokenLength,
      error: parsed.error,
    });
    return {
      ...baseResult,
      error: parsed.error,
    };
  }
  
  try {
    const result = await yodeckRequest<{ count: number; results: any[] }>("/screens/");
    
    if (result.ok && result.data) {
      console.log(`${LOG_PREFIX} [AUTH-STATUS] SUCCESS - API accessible, ${result.data.count} screens`);
      return {
        ...baseResult,
        ok: true,
        status: result.status,
        screenCount: result.data.count,
        responseSample: {
          count: result.data.count,
          firstScreenName: result.data.results?.[0]?.name || null,
        },
      };
    }
    
    console.error(`${LOG_PREFIX} [AUTH-STATUS] FAILED: ${result.error}`);
    return {
      ...baseResult,
      ok: false,
      status: result.status,
      error: result.error,
    };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} [AUTH-STATUS] EXCEPTION: ${err.message}`);
    return {
      ...baseResult,
      ok: false,
      error: err.message,
    };
  }
}
