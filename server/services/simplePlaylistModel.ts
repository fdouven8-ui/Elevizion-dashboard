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
  
  console.log(`${LOG_PREFIX} Found basePlaylistId=${exactMatch.id} "${exactMatch.name}"`);
  
  return { 
    ok: true, 
    basePlaylistId: exactMatch.id, 
    basePlaylistName: exactMatch.name,
    itemCount: 0 
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
  console.log(`${LOG_PREFIX} Creating new playlist: "${canonicalName}"`);
  
  const createResult = await yodeckRequest<{ id: number; name: string }>("/playlists/", "POST", {
    name: canonicalName,
    description: `Screen playlist for player ${playerId}`,
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

  // 2. Fetch items from base playlist
  const baseItemsResult = await yodeckRequest<{ count: number; results: Array<{ media: number; duration: number }> }>(
    `/playlists/${baseResult.basePlaylistId}/items/`
  );

  if (!baseItemsResult.ok || !baseItemsResult.data) {
    return { 
      ok: false, 
      baseMediaIds: [], 
      itemsReplaced: 0,
      error: baseItemsResult.error || "Failed to fetch base playlist items" 
    };
  }

  const baseItems = baseItemsResult.data.results || [];
  const baseMediaIds = baseItems.map(item => item.media);
  
  console.log(`${LOG_PREFIX} Base playlist has ${baseItems.length} items: ${baseMediaIds.join(", ")}`);

  // 3. Clear current screen playlist items
  const currentItemsResult = await yodeckRequest<{ count: number; results: Array<{ id: number; media: number }> }>(
    `/playlists/${screenPlaylistId}/items/`
  );

  if (currentItemsResult.ok && currentItemsResult.data) {
    for (const item of currentItemsResult.data.results || []) {
      await yodeckRequest(`/playlists/${screenPlaylistId}/items/${item.id}/`, "DELETE");
    }
    console.log(`${LOG_PREFIX} Cleared ${currentItemsResult.data.results?.length || 0} existing items`);
  }

  // 4. Add base items to screen playlist
  for (const item of baseItems) {
    const addResult = await yodeckRequest(`/playlists/${screenPlaylistId}/items/`, "POST", {
      media: item.media,
      duration: item.duration || 10,
    });
    if (!addResult.ok) {
      console.warn(`${LOG_PREFIX} Failed to add media ${item.media}: ${addResult.error}`);
    }
  }

  console.log(`${LOG_PREFIX} Added ${baseItems.length} base items to playlist ${screenPlaylistId}`);
  
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
  if (adMediaIds.length === 0) {
    console.log(`${LOG_PREFIX} No ads to add`);
    return { ok: true, adsAdded: 0, finalCount: 0 };
  }

  console.log(`${LOG_PREFIX} Adding ${adMediaIds.length} ads to playlist ${screenPlaylistId}`);

  // Get current items to check for duplicates
  const currentItemsResult = await yodeckRequest<{ count: number; results: Array<{ id: number; media: number }> }>(
    `/playlists/${screenPlaylistId}/items/`
  );

  const existingMediaIds = new Set(
    (currentItemsResult.data?.results || []).map(item => item.media)
  );

  let adsAdded = 0;
  for (const mediaId of adMediaIds) {
    if (existingMediaIds.has(mediaId)) {
      console.log(`${LOG_PREFIX} Media ${mediaId} already in playlist, skipping`);
      continue;
    }

    const addResult = await yodeckRequest(`/playlists/${screenPlaylistId}/items/`, "POST", {
      media: mediaId,
      duration: 15, // Default ad duration
    });

    if (addResult.ok) {
      adsAdded++;
      console.log(`${LOG_PREFIX} Added ad media ${mediaId}`);
    } else {
      console.warn(`${LOG_PREFIX} Failed to add ad media ${mediaId}: ${addResult.error}`);
    }
  }

  // Get final count
  const finalItemsResult = await yodeckRequest<{ count: number }>(`/playlists/${screenPlaylistId}/items/`);
  const finalCount = finalItemsResult.data?.count || 0;

  console.log(`${LOG_PREFIX} Added ${adsAdded} ads, final playlist count: ${finalCount}`);
  
  return { ok: true, adsAdded, finalCount };
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

  // 1. Set player content source to playlist
  const patchResult = await yodeckRequest(`/screens/${playerId}/`, "PATCH", {
    source_type: "playlist",
    source_id: screenPlaylistId,
  });

  if (!patchResult.ok) {
    return { 
      ok: false, 
      pushed: false, 
      verified: false,
      actualSourceType: null,
      actualSourceId: null,
      error: patchResult.error 
    };
  }

  console.log(`${LOG_PREFIX} Set player ${playerId} source to playlist ${screenPlaylistId}`);

  // 2. Verify by reading player status
  const verifyResult = await yodeckRequest<{ source_type: string; source_id: number }>(
    `/screens/${playerId}/`
  );

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

  const actualSourceType = verifyResult.data.source_type;
  const actualSourceId = verifyResult.data.source_id;
  const verified = actualSourceType === "playlist" && actualSourceId === screenPlaylistId;

  console.log(`${LOG_PREFIX} Verify: source_type=${actualSourceType}, source_id=${actualSourceId}, correct=${verified}`);

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
  screenId: string;
  playerId: string | null;
  basePlaylistId: number | null;
  screenPlaylistId: number | null;
  baseCount: number;
  adsCount: number;
  finalCount: number;
  verifyOk: boolean;
  actions: string[];
  error?: string;
}

export async function rebuildScreenPlaylist(screenId: string): Promise<RebuildPlaylistResult> {
  const correlationId = `rebuild_${screenId}_${Date.now()}`;
  const actions: string[] = [];
  
  console.log(`${LOG_PREFIX} [${correlationId}] Starting rebuild for screen ${screenId}`);
  actions.push(`Starting rebuild for screen ${screenId}`);

  // 1. Get screen
  const screen = await storage.getScreen(screenId);
  if (!screen) {
    return {
      ok: false,
      screenId,
      playerId: null,
      basePlaylistId: null,
      screenPlaylistId: null,
      baseCount: 0,
      adsCount: 0,
      finalCount: 0,
      verifyOk: false,
      actions,
      error: "Screen not found",
    };
  }

  if (!screen.yodeckPlayerId) {
    return {
      ok: false,
      screenId,
      playerId: null,
      basePlaylistId: null,
      screenPlaylistId: null,
      baseCount: 0,
      adsCount: 0,
      finalCount: 0,
      verifyOk: false,
      actions,
      error: "Screen has no yodeckPlayerId",
    };
  }

  const playerId = screen.yodeckPlayerId;
  actions.push(`Player ID: ${playerId}`);

  // 2. Get base playlist
  const baseResult = await getBasePlaylistId();
  if (!baseResult.ok || !baseResult.basePlaylistId) {
    actions.push(`Base playlist error: ${baseResult.error}`);
    return {
      ok: false,
      screenId,
      playerId,
      basePlaylistId: null,
      screenPlaylistId: null,
      baseCount: 0,
      adsCount: 0,
      finalCount: 0,
      verifyOk: false,
      actions,
      error: baseResult.error,
    };
  }
  actions.push(`Base playlist: ${baseResult.basePlaylistId}`);

  // 3. Ensure screen playlist
  const ensureResult = await ensureScreenPlaylist(screen);
  if (!ensureResult.ok || !ensureResult.screenPlaylistId) {
    actions.push(`Ensure playlist error: ${ensureResult.error}`);
    return {
      ok: false,
      screenId,
      playerId,
      basePlaylistId: baseResult.basePlaylistId,
      screenPlaylistId: null,
      baseCount: 0,
      adsCount: 0,
      finalCount: 0,
      verifyOk: false,
      actions,
      error: ensureResult.error,
    };
  }
  actions.push(`Screen playlist: ${ensureResult.screenPlaylistId} (created: ${ensureResult.wasCreated})`);

  // 4. Sync from base
  const syncResult = await syncScreenPlaylistFromBase(ensureResult.screenPlaylistId);
  if (!syncResult.ok) {
    actions.push(`Sync error: ${syncResult.error}`);
    return {
      ok: false,
      screenId,
      playerId,
      basePlaylistId: baseResult.basePlaylistId,
      screenPlaylistId: ensureResult.screenPlaylistId,
      baseCount: 0,
      adsCount: 0,
      finalCount: 0,
      verifyOk: false,
      actions,
      error: syncResult.error,
    };
  }
  actions.push(`Synced ${syncResult.baseMediaIds.length} base items`);

  // 5. Collect ad media IDs for this screen
  const adMediaIds: number[] = [];
  const advertisers = await storage.getAdvertisers();
  
  for (const advertiser of advertisers) {
    // Check status
    if (!["approved", "ready_for_yodeck", "ready_for_publish"].includes(advertiser.assetStatus || "")) {
      continue;
    }
    
    // Check if has canonical media ID
    if (!advertiser.yodeckMediaIdCanonical) {
      actions.push(`Advertiser ${advertiser.id} has no yodeckMediaIdCanonical, skipping`);
      continue;
    }

    // Simple targeting: include all approved ads for now
    // TODO: Add proper targeting based on location/city/region
    const mediaId = advertiser.yodeckMediaIdCanonical;
    adMediaIds.push(mediaId);
    actions.push(`Including ad from advertiser ${advertiser.id}: mediaId=${mediaId}`);
  }

  // 6. Add ads
  const addAdsResult = await addAdsToScreenPlaylist(ensureResult.screenPlaylistId, adMediaIds);
  actions.push(`Added ${addAdsResult.adsAdded} ads`);

  // 7. Apply and push
  const pushResult = await applyPlayerSourceAndPush(playerId, ensureResult.screenPlaylistId);
  actions.push(`Push: ${pushResult.pushed ? "OK" : "FAILED"}, Verify: ${pushResult.verified ? "OK" : "FAILED"}`);

  if (!pushResult.ok) {
    actions.push(`Push/verify error: ${pushResult.error}`);
  }

  // 8. Update screen DB
  await db.update(screens).set({
    playlistId: String(ensureResult.screenPlaylistId),
    playbackMode: "playlist",
    lastPushAt: new Date(),
  }).where(eq(screens.id, screenId));

  return {
    ok: pushResult.verified,
    screenId,
    playerId,
    basePlaylistId: baseResult.basePlaylistId,
    screenPlaylistId: ensureResult.screenPlaylistId,
    baseCount: syncResult.baseMediaIds.length,
    adsCount: adMediaIds.length,
    finalCount: addAdsResult.finalCount,
    verifyOk: pushResult.verified,
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
