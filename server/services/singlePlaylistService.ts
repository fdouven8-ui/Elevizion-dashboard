import { db } from "../db";
import { screens } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { storage } from "../storage";

const LOG_PREFIX = "[SinglePlaylist]";

const BASELINE_MEDIA_IDS = [
  30399637, // NOS algemeen nieuws
  30399638, // Weer goed  
  30399639, // NOS sport algemeen
  30399640, // 1Limburg
];

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

function getYodeckApiKey(): string | null {
  return process.env.YODECK_AUTH_TOKEN || null;
}

async function yodeckRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: any
): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const apiKey = getYodeckApiKey();
  if (!apiKey) {
    return { ok: false, error: "YODECK_AUTH_TOKEN not configured" };
  }

  try {
    const options: RequestInit = {
      method,
      headers: {
        "Authorization": `Api-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const url = `${YODECK_BASE_URL}${endpoint}`;
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, error: `HTTP ${response.status}: ${text}`, status: response.status };
    }

    if (response.status === 204) {
      return { ok: true, data: undefined, status: 204 };
    }

    const data = await response.json();
    return { ok: true, data, status: response.status };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export interface CanonicalPlaylistResult {
  ok: boolean;
  playlistId: string | null;
  playlistName: string | null;
  wasCreated: boolean;
  error?: string;
}

export async function getCanonicalScreenPlaylist(
  screen: { id: string; yodeckPlayerId: string | null; playlistId?: string | null },
  options: { allowCreate?: boolean } = {}
): Promise<CanonicalPlaylistResult> {
  const { allowCreate = false } = options;
  const playerId = screen.yodeckPlayerId;
  
  if (!playerId) {
    return { ok: false, playlistId: null, playlistName: null, wasCreated: false, error: "Screen has no yodeckPlayerId" };
  }

  const canonicalName = `EVZ | SCREEN | ${playerId}`;

  // 1. Check if screen already has playlistId in DB
  const existingScreen = await storage.getScreen(screen.id);
  if (existingScreen?.playlistId) {
    console.log(`${LOG_PREFIX} Screen ${screen.id} already has playlistId=${existingScreen.playlistId}`);
    return { 
      ok: true, 
      playlistId: existingScreen.playlistId, 
      playlistName: canonicalName,
      wasCreated: false 
    };
  }

  // 2. Search Yodeck for existing playlist with canonical name
  const searchResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>(
    `/playlists/?search=${encodeURIComponent(canonicalName)}`
  );

  if (searchResult.ok && searchResult.data) {
    const exactMatch = searchResult.data.results.find(
      (p) => p.name.toLowerCase() === canonicalName.toLowerCase()
    );
    
    if (exactMatch) {
      console.log(`${LOG_PREFIX} Found existing playlist in Yodeck: ${exactMatch.id} "${exactMatch.name}"`);
      // Update DB with found playlist
      await db.update(screens).set({ playlistId: String(exactMatch.id) }).where(eq(screens.id, screen.id));
      return { 
        ok: true, 
        playlistId: String(exactMatch.id), 
        playlistName: exactMatch.name,
        wasCreated: false 
      };
    }
  }

  // 3. If not allowed to create, return not found
  if (!allowCreate) {
    console.log(`${LOG_PREFIX} No playlist found for screen ${screen.id}, creation not allowed`);
    return { 
      ok: false, 
      playlistId: null, 
      playlistName: null, 
      wasCreated: false,
      error: "Playlist not found and creation not allowed" 
    };
  }

  // 4. Create new playlist (ONLY allowed in specific admin contexts)
  console.log(`${LOG_PREFIX} Creating new playlist: "${canonicalName}"`);
  
  const createResult = await yodeckRequest<{ id: number; name: string }>("/playlists/", "POST", {
    name: canonicalName,
    description: `Canonical playlist for screen ${screen.id}`,
  });

  if (!createResult.ok || !createResult.data?.id) {
    return { 
      ok: false, 
      playlistId: null, 
      playlistName: null, 
      wasCreated: false,
      error: createResult.error || "Failed to create playlist" 
    };
  }

  const newPlaylistId = String(createResult.data.id);
  
  // Update DB
  await db.update(screens).set({ playlistId: newPlaylistId }).where(eq(screens.id, screen.id));
  
  console.log(`${LOG_PREFIX} Created playlist ${newPlaylistId} for screen ${screen.id}`);
  return { 
    ok: true, 
    playlistId: newPlaylistId, 
    playlistName: canonicalName,
    wasCreated: true 
  };
}

export interface ReconcileResult {
  ok: boolean;
  playlistId: string | null;
  playlistName: string | null;
  baselineCount: number;
  adsCount: number;
  finalCount: number;
  includedMediaIds: number[];
  pushResult: "success" | "skipped" | "failed";
  actions: string[];
  error?: string;
}

export async function reconcileScreenPlaylist(
  screenId: string,
  options: { dryRun?: boolean; forceCreate?: boolean } = {}
): Promise<ReconcileResult> {
  const { dryRun = false, forceCreate = false } = options;
  const actions: string[] = [];
  
  console.log(`${LOG_PREFIX} [Reconcile] Starting for screen ${screenId} (dryRun=${dryRun})`);
  actions.push(`Starting reconcile for screen ${screenId}`);

  // 1. Get screen
  const screen = await storage.getScreen(screenId);
  if (!screen) {
    return {
      ok: false,
      playlistId: null,
      playlistName: null,
      baselineCount: 0,
      adsCount: 0,
      finalCount: 0,
      includedMediaIds: [],
      pushResult: "skipped",
      actions,
      error: "Screen not found",
    };
  }

  if (!screen.yodeckPlayerId) {
    return {
      ok: false,
      playlistId: null,
      playlistName: null,
      baselineCount: 0,
      adsCount: 0,
      finalCount: 0,
      includedMediaIds: [],
      pushResult: "skipped",
      actions,
      error: "Screen has no yodeckPlayerId",
    };
  }

  // 2. Get or create canonical playlist
  const playlistResult = await getCanonicalScreenPlaylist(screen, { allowCreate: forceCreate });
  
  if (!playlistResult.ok || !playlistResult.playlistId) {
    actions.push(`Playlist resolution failed: ${playlistResult.error}`);
    return {
      ok: false,
      playlistId: null,
      playlistName: null,
      baselineCount: 0,
      adsCount: 0,
      finalCount: 0,
      includedMediaIds: [],
      pushResult: "skipped",
      actions,
      error: playlistResult.error,
    };
  }

  const playlistId = playlistResult.playlistId;
  const playlistName = playlistResult.playlistName;
  actions.push(`Resolved playlist: ${playlistId} "${playlistName}" (created: ${playlistResult.wasCreated})`);

  // 3. Determine target media IDs
  // Baseline items (always include)
  const baselineMediaIds = [...BASELINE_MEDIA_IDS];
  actions.push(`Baseline media: ${baselineMediaIds.length} items`);

  // 4. Find approved ads targeting this screen
  const adMediaIds: number[] = [];
  
  // Get all advertisers with approved assets
  const advertisers = await storage.getAdvertisers();
  const approvedAdvertisers = advertisers.filter(
    (a) => a.assetStatus === "approved" || a.assetStatus === "ready_for_yodeck" || a.assetStatus === "ready_for_publish"
  );

  for (const advertiser of approvedAdvertisers) {
    // Check if advertiser has a yodeckMediaIdCanonical
    const mediaId = advertiser.yodeckMediaIdCanonical;
    if (!mediaId) {
      actions.push(`Advertiser ${advertiser.id} has no media ID, skipping`);
      continue;
    }

    // Check targeting - for now, include all approved ads
    // TODO: Add proper targeting logic based on location/city/region
    const numericMediaId = typeof mediaId === "string" ? parseInt(mediaId, 10) : mediaId;
    if (!isNaN(numericMediaId)) {
      adMediaIds.push(numericMediaId);
      actions.push(`Including ad from advertiser ${advertiser.id}: mediaId=${numericMediaId}`);
    }
  }

  // 5. Combine: baseline + ads (no duplicates)
  const uniqueMediaIds = new Set([...baselineMediaIds, ...adMediaIds]);
  const allMediaIds = Array.from(uniqueMediaIds);
  actions.push(`Final media list: ${allMediaIds.length} items (${baselineMediaIds.length} baseline + ${adMediaIds.length} ads)`);

  if (dryRun) {
    return {
      ok: true,
      playlistId,
      playlistName,
      baselineCount: baselineMediaIds.length,
      adsCount: adMediaIds.length,
      finalCount: allMediaIds.length,
      includedMediaIds: allMediaIds,
      pushResult: "skipped",
      actions,
    };
  }

  // 6. Get current playlist items from Yodeck
  const currentItemsResult = await yodeckRequest<{ count: number; results: Array<{ id: number; media: number }> }>(
    `/playlists/${playlistId}/items/`
  );

  if (!currentItemsResult.ok) {
    actions.push(`Failed to get current playlist items: ${currentItemsResult.error}`);
    return {
      ok: false,
      playlistId,
      playlistName,
      baselineCount: baselineMediaIds.length,
      adsCount: adMediaIds.length,
      finalCount: 0,
      includedMediaIds: [],
      pushResult: "failed",
      actions,
      error: currentItemsResult.error,
    };
  }

  const currentMediaIds = (currentItemsResult.data?.results || []).map((item) => item.media);
  actions.push(`Current playlist has ${currentMediaIds.length} items`);

  // 7. Calculate diff
  const mediaToAdd = allMediaIds.filter((id) => !currentMediaIds.includes(id));
  const mediaToRemove = currentMediaIds.filter((id) => !allMediaIds.includes(id));
  
  actions.push(`To add: ${mediaToAdd.length}, to remove: ${mediaToRemove.length}`);

  // 8. Remove items that shouldn't be there
  if (mediaToRemove.length > 0) {
    const currentItems = currentItemsResult.data?.results || [];
    for (const mediaId of mediaToRemove) {
      const item = currentItems.find((i) => i.media === mediaId);
      if (item) {
        const deleteResult = await yodeckRequest(`/playlists/${playlistId}/items/${item.id}/`, "DELETE");
        if (deleteResult.ok) {
          actions.push(`Removed item ${item.id} (media ${mediaId})`);
        } else {
          actions.push(`Failed to remove item ${item.id}: ${deleteResult.error}`);
        }
      }
    }
  }

  // 9. Add missing items
  for (const mediaId of mediaToAdd) {
    const addResult = await yodeckRequest(`/playlists/${playlistId}/items/`, "POST", {
      media: mediaId,
      duration: 10,
    });
    if (addResult.ok) {
      actions.push(`Added media ${mediaId}`);
    } else {
      actions.push(`Failed to add media ${mediaId}: ${addResult.error}`);
    }
  }

  // 10. Push to screen
  const pushResult = await yodeckRequest(`/screens/${screen.yodeckPlayerId}/`, "PATCH", {
    source_type: "playlist",
    source_id: parseInt(playlistId, 10),
  });

  let pushStatus: "success" | "skipped" | "failed" = "failed";
  if (pushResult.ok) {
    pushStatus = "success";
    actions.push(`Pushed playlist ${playlistId} to screen ${screen.yodeckPlayerId}`);
    
    // Update DB
    await db.update(screens).set({
      playlistId,
      playbackMode: "playlist",
      lastPushAt: new Date(),
    }).where(eq(screens.id, screenId));
  } else {
    actions.push(`Failed to push to screen: ${pushResult.error}`);
  }

  // 11. Verify
  const verifyResult = await yodeckRequest<{ source_type: string; source_id: number }>(
    `/screens/${screen.yodeckPlayerId}/`
  );
  
  if (verifyResult.ok && verifyResult.data) {
    const isPlaylist = verifyResult.data.source_type === "playlist";
    const correctPlaylist = verifyResult.data.source_id === parseInt(playlistId, 10);
    actions.push(`Verify: source_type=${verifyResult.data.source_type}, source_id=${verifyResult.data.source_id}, correct=${isPlaylist && correctPlaylist}`);
  }

  return {
    ok: true,
    playlistId,
    playlistName,
    baselineCount: baselineMediaIds.length,
    adsCount: adMediaIds.length,
    finalCount: allMediaIds.length,
    includedMediaIds: allMediaIds,
    pushResult: pushStatus,
    actions,
  };
}

export interface OrphanPlaylistsResult {
  ok: boolean;
  totalPlaylists: number;
  canonicalPlaylists: Array<{ id: number; name: string; screenId: string }>;
  orphanedPlaylists: Array<{ id: number; name: string; reason: string }>;
  error?: string;
}

export async function detectOrphanedPlaylists(): Promise<OrphanPlaylistsResult> {
  console.log(`${LOG_PREFIX} [Cleanup] Detecting orphaned playlists...`);

  // 1. Get all playlists from Yodeck
  const allPlaylistsResult = await yodeckRequest<{ count: number; results: Array<{ id: number; name: string }> }>(
    "/playlists/?page_size=500"
  );

  if (!allPlaylistsResult.ok || !allPlaylistsResult.data) {
    return {
      ok: false,
      totalPlaylists: 0,
      canonicalPlaylists: [],
      orphanedPlaylists: [],
      error: allPlaylistsResult.error,
    };
  }

  const allPlaylists = allPlaylistsResult.data.results || [];
  console.log(`${LOG_PREFIX} [Cleanup] Found ${allPlaylists.length} playlists in Yodeck`);

  // 2. Get all screens with their playlistIds
  const allScreens = await storage.getScreens();
  const canonicalPlaylistIds = new Set<number>();
  const canonicalPlaylists: Array<{ id: number; name: string; screenId: string }> = [];

  for (const screen of allScreens) {
    if (screen.playlistId) {
      const pid = parseInt(screen.playlistId, 10);
      canonicalPlaylistIds.add(pid);
      const playlist = allPlaylists.find((p) => p.id === pid);
      canonicalPlaylists.push({
        id: pid,
        name: playlist?.name || "unknown",
        screenId: screen.id,
      });
    }
  }

  // 3. Also whitelist system playlists (baseline template, etc.)
  const systemPlaylistPatterns = [
    /^Baseline\s*\|/i,
    /^EVZ\s*\|\s*BASELINE$/i,
  ];

  // 4. Identify orphaned playlists
  const orphanedPlaylists: Array<{ id: number; name: string; reason: string }> = [];

  for (const playlist of allPlaylists) {
    // Skip if it's a canonical screen playlist
    if (canonicalPlaylistIds.has(playlist.id)) {
      continue;
    }

    // Skip if it matches system patterns
    const isSystem = systemPlaylistPatterns.some((pattern) => pattern.test(playlist.name));
    if (isSystem) {
      continue;
    }

    // Check if it's an EVZ playlist that's not assigned
    const isEvzPlaylist = playlist.name.startsWith("EVZ |");
    const reason = isEvzPlaylist 
      ? "EVZ playlist not assigned to any screen"
      : "Non-canonical playlist";

    orphanedPlaylists.push({
      id: playlist.id,
      name: playlist.name,
      reason,
    });
  }

  console.log(`${LOG_PREFIX} [Cleanup] Found ${orphanedPlaylists.length} orphaned playlists`);

  return {
    ok: true,
    totalPlaylists: allPlaylists.length,
    canonicalPlaylists,
    orphanedPlaylists,
  };
}

export interface NowPlayingResult {
  ok: boolean;
  screenId: string;
  yodeckPlayerId: string | null;
  expectedPlaylistId: string | null;
  actualSourceType: string | null;
  actualSourceId: number | null;
  isCorrect: boolean;
  currentMedia: Array<{ id: number; name: string }>;
  itemCount: number;
  error?: string;
}

export async function getScreenNowPlayingSimple(screenId: string): Promise<NowPlayingResult> {
  const screen = await storage.getScreen(screenId);
  
  if (!screen) {
    return {
      ok: false,
      screenId,
      yodeckPlayerId: null,
      expectedPlaylistId: null,
      actualSourceType: null,
      actualSourceId: null,
      isCorrect: false,
      currentMedia: [],
      itemCount: 0,
      error: "Screen not found",
    };
  }

  if (!screen.yodeckPlayerId) {
    return {
      ok: false,
      screenId,
      yodeckPlayerId: null,
      expectedPlaylistId: screen.playlistId,
      actualSourceType: null,
      actualSourceId: null,
      isCorrect: false,
      currentMedia: [],
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
      yodeckPlayerId: screen.yodeckPlayerId,
      expectedPlaylistId: screen.playlistId,
      actualSourceType: null,
      actualSourceId: null,
      isCorrect: false,
      currentMedia: [],
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

  // Get playlist items if in playlist mode
  let currentMedia: Array<{ id: number; name: string }> = [];
  let itemCount = 0;

  if (actualSourceType === "playlist" && actualSourceId) {
    const itemsResult = await yodeckRequest<{ count: number; results: Array<{ media: number }> }>(
      `/playlists/${actualSourceId}/items/`
    );
    if (itemsResult.ok && itemsResult.data) {
      itemCount = itemsResult.data.count || 0;
      currentMedia = (itemsResult.data.results || []).map((item) => ({
        id: item.media,
        name: `Media ${item.media}`,
      }));
    }
  }

  return {
    ok: true,
    screenId,
    yodeckPlayerId: screen.yodeckPlayerId,
    expectedPlaylistId: screen.playlistId,
    actualSourceType,
    actualSourceId,
    isCorrect,
    currentMedia,
    itemCount,
  };
}
