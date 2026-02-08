/**
 * YODECK PLAYBACK ENGINE
 * 
 * Canonical playlist-only architecture: baseline + ads = combined
 * Each screen has exactly THREE playlists:
 * - BASELINE: Fixed content (news/weather/house ads)
 * - ADS: Approved advertiser videos
 * - COMBINED: Merged playlist assigned to screen
 * 
 * NO LAYOUTS. NO SCHEDULES. PLAYLIST ONLY.
 */

import { db } from "../db";
import { screens } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getYodeckToken } from "./yodeckClient";
import { BASELINE_MEDIA_IDS } from "../config/contentPipeline";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";

type Screen = typeof screens.$inferSelect;

interface YodeckApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function yodeckRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<YodeckApiResult<T>> {
  const token = await getYodeckToken();
  if (!token.isValid || !token.value) {
    return { ok: false, error: token.error || "YODECK_AUTH_TOKEN not configured" };
  }

  try {
    const response = await fetch(`${YODECK_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Authorization": `Token ${token.value}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    
    if (!contentType.includes("application/json") || text.trim().startsWith("<")) {
      return { ok: false, error: `Yodeck returned HTML instead of JSON (status ${response.status})` };
    }

    if (!response.ok) {
      return { ok: false, error: `Yodeck API error ${response.status}: ${text}` };
    }

    try {
      const data = JSON.parse(text);
      return { ok: true, data };
    } catch {
      return { ok: false, error: "Yodeck returned invalid JSON" };
    }
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}

export interface PlaylistInfo {
  id: string;
  name: string;
}

export interface EnsurePlaylistsResult {
  ok: boolean;
  baselinePlaylist?: PlaylistInfo;
  adsPlaylist?: PlaylistInfo;
  combinedPlaylist?: PlaylistInfo;
  error?: string;
}

export interface SeedBaselineResult {
  ok: boolean;
  itemsAdded: number;
  totalItems: number;
  error?: string;
}

export interface RebuildCombinedResult {
  ok: boolean;
  baselineCount: number;
  adsCount: number;
  totalCount: number;
  error?: string;
}

export interface AssignResult {
  ok: boolean;
  pushed: boolean;
  error?: string;
}

export interface VerifyResult {
  ok: boolean;
  sourceType: string;
  sourceId: string | null;
  expectedId: string;
  mismatch: boolean;
  baselineCount: number;
  adsCount: number;
  error?: string;
}

export interface SelfHealResult {
  ok: boolean;
  wasOnLayout: boolean;
  healed: boolean;
  correlationId: string;
  error?: string;
}

async function findOrCreatePlaylist(name: string): Promise<{ ok: boolean; playlist?: PlaylistInfo; created?: boolean; error?: string }> {
  const listResult = await yodeckRequest<{ results: Array<{ id: number; name: string }> }>("/playlists/");
  
  if (!listResult.ok || !listResult.data) {
    return { ok: false, error: listResult.error };
  }

  const existing = listResult.data.results.find(p => p.name === name);
  if (existing) {
    return { ok: true, playlist: { id: String(existing.id), name: existing.name }, created: false };
  }

  const createResult = await yodeckRequest<{ id: number; name: string }>("/playlists/", {
    method: "POST",
    body: JSON.stringify({ name, items: [] }),
  });

  if (!createResult.ok || !createResult.data) {
    return { ok: false, error: createResult.error || "Failed to create playlist" };
  }

  return { ok: true, playlist: { id: String(createResult.data.id), name: createResult.data.name }, created: true };
}

async function getPlaylistItems(playlistId: string): Promise<{ ok: boolean; items?: string[]; error?: string }> {
  const result = await yodeckRequest<{ items: Array<{ id: number }> }>(`/playlists/${playlistId}/`);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  const items = (result.data.items || []).map(i => String(i.id));
  return { ok: true, items };
}

async function setPlaylistItems(playlistId: string, itemIds: string[]): Promise<{ ok: boolean; error?: string }> {
  const playlistItems = itemIds.map((id, index) => ({
    id: parseInt(id, 10),
    type: "media",
    duration: 15,
    priority: index + 1,
  }));
  
  const result = await yodeckRequest<any>(`/playlists/${playlistId}/`, {
    method: "PATCH",
    body: JSON.stringify({ items: playlistItems }),
  });

  return { ok: result.ok, error: result.error };
}

async function addItemToPlaylist(playlistId: string, itemId: string): Promise<{ ok: boolean; error?: string }> {
  const current = await getPlaylistItems(playlistId);
  if (!current.ok || !current.items) {
    return { ok: false, error: current.error };
  }

  if (current.items.includes(itemId)) {
    return { ok: true };
  }

  const newItems = [...current.items, itemId];
  return await setPlaylistItems(playlistId, newItems);
}

async function getScreenSource(yodeckPlayerId: string): Promise<{ ok: boolean; sourceType?: string; sourceId?: string; error?: string }> {
  const result = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`);
  
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error };
  }

  const content = result.data.screen_content;
  return {
    ok: true,
    sourceType: content?.source_type || "unknown",
    sourceId: content?.source_id ? String(content.source_id) : undefined,
  };
}

async function assignPlaylistToScreen(yodeckPlayerId: string, playlistId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/`, {
    method: "PATCH",
    body: JSON.stringify({
      screen_content: {
        source_type: "playlist",
        source_id: parseInt(playlistId, 10),
      },
    }),
  });

  return { ok: result.ok, error: result.error };
}

async function pushToScreen(yodeckPlayerId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await yodeckRequest<any>(`/screens/${yodeckPlayerId}/push/`, {
    method: "POST",
  });

  return { ok: result.ok, error: result.error };
}

/**
 * ENSURE SCREEN PLAYLISTS
 * Creates or finds the three canonical playlists for a screen.
 */
export async function ensureScreenPlaylists(screen: Screen): Promise<EnsurePlaylistsResult> {
  const playerId = screen.yodeckPlayerId;
  if (!playerId) {
    return { ok: false, error: "Screen has no yodeckPlayerId" };
  }

  const screenName = screen.name || screen.screenId;
  const baselineName = `EVZ | BASELINE | SCREEN | ${playerId}`;
  const adsName = `EVZ | ADS | SCREEN | ${playerId}`;
  const combinedName = `EVZ | COMBINED | SCREEN | ${playerId}`;

  const [baselineResult, adsResult, combinedResult] = await Promise.all([
    findOrCreatePlaylist(baselineName),
    findOrCreatePlaylist(adsName),
    findOrCreatePlaylist(combinedName),
  ]);

  if (!baselineResult.ok || !baselineResult.playlist) {
    return { ok: false, error: `Failed to ensure baseline playlist: ${baselineResult.error}` };
  }

  if (!adsResult.ok || !adsResult.playlist) {
    return { ok: false, error: `Failed to ensure ads playlist: ${adsResult.error}` };
  }

  if (!combinedResult.ok || !combinedResult.playlist) {
    return { ok: false, error: `Failed to ensure combined playlist: ${combinedResult.error}` };
  }

  await db.update(screens).set({
    baselinePlaylistId: baselineResult.playlist.id,
    baselinePlaylistName: baselineResult.playlist.name,
    adsPlaylistId: adsResult.playlist.id,
    adsPlaylistName: adsResult.playlist.name,
    combinedPlaylistId: combinedResult.playlist.id,
    combinedPlaylistName: combinedResult.playlist.name,
    playlistId: combinedResult.playlist.id,
    playlistName: combinedResult.playlist.name,
    updatedAt: new Date(),
  }).where(eq(screens.id, screen.id));

  return {
    ok: true,
    baselinePlaylist: baselineResult.playlist,
    adsPlaylist: adsResult.playlist,
    combinedPlaylist: combinedResult.playlist,
  };
}

/**
 * SEED BASELINE IF EMPTY
 * Ensures the baseline playlist has the required media items.
 */
export async function seedBaselineIfEmpty(screen: Screen): Promise<SeedBaselineResult> {
  const baselinePlaylistId = screen.baselinePlaylistId;
  if (!baselinePlaylistId) {
    return { ok: false, itemsAdded: 0, totalItems: 0, error: "No baselinePlaylistId on screen" };
  }

  const current = await getPlaylistItems(baselinePlaylistId);
  if (!current.ok || !current.items) {
    return { ok: false, itemsAdded: 0, totalItems: 0, error: current.error };
  }

  const missing = BASELINE_MEDIA_IDS.filter(id => !current.items!.includes(id));
  
  if (missing.length === 0) {
    return { ok: true, itemsAdded: 0, totalItems: current.items.length };
  }

  const allItems = [...current.items, ...missing];
  const setResult = await setPlaylistItems(baselinePlaylistId, allItems);
  
  if (!setResult.ok) {
    return { ok: false, itemsAdded: 0, totalItems: 0, error: setResult.error };
  }

  return { ok: true, itemsAdded: missing.length, totalItems: allItems.length };
}

/**
 * REBUILD COMBINED PLAYLIST
 * Combined = baseline items + ads items (no duplicates)
 */
export async function rebuildCombinedPlaylist(screen: Screen): Promise<RebuildCombinedResult> {
  const { baselinePlaylistId, adsPlaylistId, combinedPlaylistId } = screen;

  if (!baselinePlaylistId || !adsPlaylistId || !combinedPlaylistId) {
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, error: "Missing playlist IDs on screen" };
  }

  const [baselineItems, adsItems] = await Promise.all([
    getPlaylistItems(baselinePlaylistId),
    getPlaylistItems(adsPlaylistId),
  ]);

  if (!baselineItems.ok || !baselineItems.items) {
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, error: `Failed to fetch baseline items: ${baselineItems.error}` };
  }

  if (!adsItems.ok || !adsItems.items) {
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, error: `Failed to fetch ads items: ${adsItems.error}` };
  }

  const combined = [...baselineItems.items];
  for (const adItem of adsItems.items) {
    if (!combined.includes(adItem)) {
      combined.push(adItem);
    }
  }

  const setResult = await setPlaylistItems(combinedPlaylistId, combined);
  if (!setResult.ok) {
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, error: setResult.error };
  }

  return {
    ok: true,
    baselineCount: baselineItems.items.length,
    adsCount: adsItems.items.length,
    totalCount: combined.length,
  };
}

/**
 * ASSIGN COMBINED PLAYLIST TO SCREEN
 * Forces screen into playlist mode with combined playlist.
 */
export async function assignCombinedPlaylistToScreen(screen: Screen): Promise<AssignResult> {
  const { yodeckPlayerId, combinedPlaylistId } = screen;

  if (!yodeckPlayerId || !combinedPlaylistId) {
    return { ok: false, pushed: false, error: "Missing yodeckPlayerId or combinedPlaylistId" };
  }

  const assignResult = await assignPlaylistToScreen(yodeckPlayerId, combinedPlaylistId);
  if (!assignResult.ok) {
    return { ok: false, pushed: false, error: assignResult.error };
  }

  const pushResult = await pushToScreen(yodeckPlayerId);
  
  await db.update(screens).set({
    lastPushAt: new Date(),
    lastPushResult: pushResult.ok ? "ok" : "failed",
    lastPushError: pushResult.ok ? null : pushResult.error,
    updatedAt: new Date(),
  }).where(eq(screens.id, screen.id));

  return { ok: true, pushed: pushResult.ok, error: pushResult.ok ? undefined : pushResult.error };
}

/**
 * VERIFY SCREEN PLAYBACK
 * Confirms screen is on combined playlist with expected content.
 */
export async function verifyScreenPlayback(screen: Screen): Promise<VerifyResult> {
  const { yodeckPlayerId, combinedPlaylistId } = screen;

  if (!yodeckPlayerId || !combinedPlaylistId) {
    return { 
      ok: false, 
      sourceType: "unknown", 
      sourceId: null, 
      expectedId: combinedPlaylistId || "", 
      mismatch: true,
      baselineCount: 0,
      adsCount: 0,
      error: "Missing yodeckPlayerId or combinedPlaylistId" 
    };
  }

  const sourceResult = await getScreenSource(yodeckPlayerId);
  if (!sourceResult.ok) {
    return { 
      ok: false, 
      sourceType: "unknown", 
      sourceId: null, 
      expectedId: combinedPlaylistId, 
      mismatch: true,
      baselineCount: 0,
      adsCount: 0,
      error: sourceResult.error 
    };
  }

  const mismatch = sourceResult.sourceType !== "playlist" || sourceResult.sourceId !== combinedPlaylistId;

  let baselineCount = 0;
  let adsCount = 0;

  if (!mismatch && screen.baselinePlaylistId && screen.adsPlaylistId) {
    const [baselineItems, adsItems] = await Promise.all([
      getPlaylistItems(screen.baselinePlaylistId),
      getPlaylistItems(screen.adsPlaylistId),
    ]);
    baselineCount = baselineItems.items?.length || 0;
    adsCount = adsItems.items?.length || 0;
  }

  await db.update(screens).set({
    lastVerifyAt: new Date(),
    lastVerifyResult: mismatch ? "mismatch" : "ok",
    lastVerifyError: mismatch ? `Expected ${combinedPlaylistId}, got ${sourceResult.sourceType}:${sourceResult.sourceId}` : null,
    updatedAt: new Date(),
  }).where(eq(screens.id, screen.id));

  return {
    ok: !mismatch,
    sourceType: sourceResult.sourceType || "unknown",
    sourceId: sourceResult.sourceId || null,
    expectedId: combinedPlaylistId,
    mismatch,
    baselineCount,
    adsCount,
  };
}

/**
 * SELF-HEAL IF LAYOUT
 * If screen is in layout mode, automatically restore to playlist mode.
 */
export async function selfHealIfLayout(screen: Screen): Promise<SelfHealResult> {
  const correlationId = `heal-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;

  if (!screen.yodeckPlayerId) {
    return { ok: false, wasOnLayout: false, healed: false, correlationId, error: "No yodeckPlayerId" };
  }

  const sourceResult = await getScreenSource(screen.yodeckPlayerId);
  if (!sourceResult.ok) {
    return { ok: false, wasOnLayout: false, healed: false, correlationId, error: sourceResult.error };
  }

  const wasOnLayout = sourceResult.sourceType === "layout";
  const needsHeal = sourceResult.sourceType !== "playlist" || sourceResult.sourceId !== screen.combinedPlaylistId;

  if (!needsHeal) {
    return { ok: true, wasOnLayout: false, healed: false, correlationId };
  }

  console.log(`[PlaybackEngine] ${correlationId} SELF-HEAL START screen=${screen.id} player=${screen.yodeckPlayerId}`);
  console.log(`[PlaybackEngine] ${correlationId} Was on ${sourceResult.sourceType}:${sourceResult.sourceId}`);

  if (wasOnLayout) {
    console.error(`[PlaybackEngine] ${correlationId} LAYOUT_FORBIDDEN detected - forcing to playlist`);
  }

  const ensureResult = await ensureScreenPlaylists(screen);
  if (!ensureResult.ok) {
    console.error(`[PlaybackEngine] ${correlationId} ENSURE failed: ${ensureResult.error}`);
    return { ok: false, wasOnLayout, healed: false, correlationId, error: ensureResult.error };
  }

  const refreshedScreen = await db.select().from(screens).where(eq(screens.id, screen.id)).then(r => r[0]);
  if (!refreshedScreen) {
    return { ok: false, wasOnLayout, healed: false, correlationId, error: "Screen not found after ensure" };
  }

  const seedResult = await seedBaselineIfEmpty(refreshedScreen);
  if (!seedResult.ok) {
    console.error(`[PlaybackEngine] ${correlationId} SEED failed: ${seedResult.error}`);
    return { ok: false, wasOnLayout, healed: false, correlationId, error: seedResult.error };
  }

  const rebuildResult = await rebuildCombinedPlaylist(refreshedScreen);
  if (!rebuildResult.ok) {
    console.error(`[PlaybackEngine] ${correlationId} REBUILD failed: ${rebuildResult.error}`);
    return { ok: false, wasOnLayout, healed: false, correlationId, error: rebuildResult.error };
  }

  const assignResult = await assignCombinedPlaylistToScreen(refreshedScreen);
  if (!assignResult.ok) {
    console.error(`[PlaybackEngine] ${correlationId} ASSIGN failed: ${assignResult.error}`);
    return { ok: false, wasOnLayout, healed: false, correlationId, error: assignResult.error };
  }

  const verifyResult = await verifyScreenPlayback(refreshedScreen);
  if (!verifyResult.ok) {
    console.error(`[PlaybackEngine] ${correlationId} VERIFY failed: ${verifyResult.error}`);
    return { ok: false, wasOnLayout, healed: false, correlationId, error: `Verification failed: still on ${verifyResult.sourceType}:${verifyResult.sourceId}` };
  }

  console.log(`[PlaybackEngine] ${correlationId} SELF-HEAL SUCCESS baseline=${rebuildResult.baselineCount} ads=${rebuildResult.adsCount}`);

  return { ok: true, wasOnLayout, healed: true, correlationId };
}

/**
 * ADD AD TO SCREEN
 * Adds a media item to the screen's ads playlist.
 */
export async function addAdToScreen(screen: Screen, yodeckMediaId: string): Promise<{ ok: boolean; alreadyPresent?: boolean; error?: string }> {
  if (!screen.adsPlaylistId) {
    return { ok: false, error: "Screen has no adsPlaylistId" };
  }

  const current = await getPlaylistItems(screen.adsPlaylistId);
  if (!current.ok || !current.items) {
    return { ok: false, error: current.error };
  }

  if (current.items.includes(yodeckMediaId)) {
    return { ok: true, alreadyPresent: true };
  }

  const result = await addItemToPlaylist(screen.adsPlaylistId, yodeckMediaId);
  return { ok: result.ok, alreadyPresent: false, error: result.error };
}

/**
 * REMOVE AD FROM SCREEN
 * Removes a media item from the screen's ads playlist.
 */
export async function removeAdFromScreen(screen: Screen, yodeckMediaId: string): Promise<{ ok: boolean; error?: string }> {
  if (!screen.adsPlaylistId) {
    return { ok: false, error: "Screen has no adsPlaylistId" };
  }

  const current = await getPlaylistItems(screen.adsPlaylistId);
  if (!current.ok || !current.items) {
    return { ok: false, error: current.error };
  }

  const newItems = current.items.filter(id => id !== yodeckMediaId);
  
  if (newItems.length === current.items.length) {
    return { ok: true };
  }

  return await setPlaylistItems(screen.adsPlaylistId, newItems);
}

/**
 * FULL PUBLISH PIPELINE FOR A SCREEN
 * Ensures playlists, seeds baseline, adds ad, rebuilds combined, assigns, verifies.
 */
export async function publishAdToScreen(
  screen: Screen, 
  yodeckMediaId: string, 
  correlationId: string
): Promise<{
  ok: boolean;
  baselineCount: number;
  adsCount: number;
  totalCount: number;
  pushed: boolean;
  verified: boolean;
  sourceType?: string;
  sourceId?: string;
  error?: string;
}> {
  console.log(`[Publish] ${correlationId} TARGET screen=${screen.id} player=${screen.yodeckPlayerId}`);

  const ensureResult = await ensureScreenPlaylists(screen);
  if (!ensureResult.ok) {
    console.error(`[Publish] ${correlationId} ENSURE failed: ${ensureResult.error}`);
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, pushed: false, verified: false, error: ensureResult.error };
  }
  console.log(`[Playback] ${correlationId} ENSURE playlists ok`);

  const refreshedScreen = await db.select().from(screens).where(eq(screens.id, screen.id)).then(r => r[0]);
  if (!refreshedScreen) {
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, pushed: false, verified: false, error: "Screen not found" };
  }

  const seedResult = await seedBaselineIfEmpty(refreshedScreen);
  if (!seedResult.ok) {
    console.error(`[Publish] ${correlationId} SEED failed: ${seedResult.error}`);
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, pushed: false, verified: false, error: seedResult.error };
  }

  const addResult = await addAdToScreen(refreshedScreen, yodeckMediaId);
  if (!addResult.ok) {
    console.error(`[Publish] ${correlationId} ADD AD failed: ${addResult.error}`);
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, pushed: false, verified: false, error: addResult.error };
  }
  console.log(`[Playback] ${correlationId} ADS add ok (alreadyPresent=${addResult.alreadyPresent})`);

  const rebuildResult = await rebuildCombinedPlaylist(refreshedScreen);
  if (!rebuildResult.ok) {
    console.error(`[Publish] ${correlationId} REBUILD failed: ${rebuildResult.error}`);
    return { ok: false, baselineCount: 0, adsCount: 0, totalCount: 0, pushed: false, verified: false, error: rebuildResult.error };
  }
  console.log(`[Playback] ${correlationId} COMBINED rebuild baseline=${rebuildResult.baselineCount} ads=${rebuildResult.adsCount}`);

  const assignResult = await assignCombinedPlaylistToScreen(refreshedScreen);
  if (!assignResult.ok) {
    console.error(`[Publish] ${correlationId} ASSIGN failed: ${assignResult.error}`);
    return { ok: false, baselineCount: rebuildResult.baselineCount, adsCount: rebuildResult.adsCount, totalCount: rebuildResult.totalCount, pushed: false, verified: false, error: assignResult.error };
  }
  console.log(`[Playback] ${correlationId} ASSIGN ok pushed=${assignResult.pushed}`);

  const verifyResult = await verifyScreenPlayback(refreshedScreen);
  console.log(`[Playback] ${correlationId} VERIFY ${verifyResult.ok ? "ok" : "FAILED"}`);

  return {
    ok: verifyResult.ok,
    baselineCount: rebuildResult.baselineCount,
    adsCount: rebuildResult.adsCount,
    totalCount: rebuildResult.totalCount,
    pushed: assignResult.pushed,
    verified: verifyResult.ok,
    sourceType: verifyResult.sourceType,
    sourceId: verifyResult.sourceId || undefined,
    error: verifyResult.ok ? undefined : `Verification failed: ${verifyResult.sourceType}:${verifyResult.sourceId}`,
  };
}
