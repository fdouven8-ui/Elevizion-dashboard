import { db } from "../db";
import { screens } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";

const LOG_PREFIX = "[SimplePlaylist]";
const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const BASE_PLAYLIST_NAME = "Basis playlist";

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
    skipped: Array<{ reason: string; advertiserId: string }>;
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
  const skippedAds: Array<{ reason: string; advertiserId: string }> = [];
  
  // Helper to create error response
  const errorResponse = (step: string, message: string, partial: Partial<RebuildPlaylistResult> = {}): RebuildPlaylistResult => ({
    ok: false,
    correlationId,
    screenId,
    base: { found: false, basePlaylistId: null, baseItemCount: 0 },
    screenPlaylist: { existed: false, created: false, screenPlaylistId: null, screenPlaylistName: null },
    copy: { ok: false, copiedCount: 0 },
    ads: { candidates: 0, included: 0, skipped: skippedAds },
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

  // 5. Collect ad media IDs for this screen
  actions.push(`Step 5: Collecting approved advertiser ads...`);
  const adMediaIds: number[] = [];
  const advertisers = await storage.getAdvertisers();
  let adCandidates = 0;
  
  for (const advertiser of advertisers) {
    // Check status
    const status = advertiser.assetStatus || "";
    if (!["approved", "ready_for_yodeck", "ready_for_publish"].includes(status)) {
      continue;
    }
    
    adCandidates++;
    
    // Check if has canonical media ID
    if (!advertiser.yodeckMediaIdCanonical) {
      skippedAds.push({ reason: "no_yodeck_media_id", advertiserId: advertiser.id });
      actions.push(`Skipped advertiser ${advertiser.id}: no yodeckMediaIdCanonical`);
      continue;
    }

    const mediaId = advertiser.yodeckMediaIdCanonical;
    adMediaIds.push(mediaId);
    actions.push(`Including ad from advertiser ${advertiser.id}: mediaId=${mediaId}`);
  }
  actions.push(`Ads: ${adCandidates} candidates, ${adMediaIds.length} included, ${skippedAds.length} skipped`);

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
      ads: { candidates: adCandidates, included: adMediaIds.length, skipped: skippedAds },
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
    ads: { candidates: adCandidates, included: adMediaIds.length, skipped: skippedAds },
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
  isCorrect: boolean;
  itemCount: number;
  error?: string;
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
      isCorrect: false,
      itemCount: 0,
      error: "Screen has no yodeckPlayerId",
    };
  }

  // Get screen status from Yodeck (READ ONLY - no create!)
  const screenResult = await yodeckRequest<{ source_type: string; source_id: number }>(
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
      isCorrect: false,
      itemCount: 0,
      error: screenResult.error,
    };
  }

  const actualSourceType = screenResult.data.source_type;
  const actualSourceId = screenResult.data.source_id;
  const expectedPlaylistId = screen.playlistId ? parseInt(screen.playlistId, 10) : null;

  const isCorrect = actualSourceType === "playlist" && 
                    expectedPlaylistId !== null && 
                    actualSourceId === expectedPlaylistId;

  // Get playlist item count if in playlist mode
  let itemCount = 0;
  if (actualSourceType === "playlist" && actualSourceId) {
    const itemsResult = await yodeckRequest<{ count: number }>(`/playlists/${actualSourceId}/items/`);
    if (itemsResult.ok && itemsResult.data) {
      itemCount = itemsResult.data.count || 0;
    }
  }

  return {
    ok: true,
    screenId,
    playerId: screen.yodeckPlayerId,
    expectedPlaylistId: screen.playlistId,
    actualSourceType,
    actualSourceId,
    isCorrect,
    itemCount,
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
