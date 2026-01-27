/**
 * Yodeck Autopilot Helpers
 * 
 * Core functions for ensuring content is properly set up:
 * - ensureAdsRegionBound: Binds ADS playlist to layout region
 * - ensureAdsPlaylistSeeded: Ensures playlist is never empty
 * - verifyScreenSetup: Full verification of screen content chain
 */

import { yodeckRequest } from "./yodeckLayoutService";
import { getSelfAdMediaId, getLayoutAdsRegionId, setLayoutAdsRegionId } from "./yodeckAutopilotConfig";

// Result types
export interface AutopilotResult {
  ok: boolean;
  action: "no_change" | "updated" | "created" | "failed";
  logs: string[];
  error?: string;
}

export interface RegionInfo {
  id: number;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  currentItem?: { type: string; id: number };
}

/**
 * Get layout regions info for mapping
 */
export async function getLayoutRegions(layoutId: number): Promise<{
  ok: boolean;
  layoutName?: string;
  regions: RegionInfo[];
  error?: string;
}> {
  const result = await yodeckRequest<any>(`/layouts/${layoutId}`);
  
  if (!result.ok || !result.data) {
    return { ok: false, regions: [], error: result.error || "Layout not found" };
  }
  
  const layout = result.data;
  const regions: RegionInfo[] = [];
  
  if (layout.regions && Array.isArray(layout.regions)) {
    for (let i = 0; i < layout.regions.length; i++) {
      const region = layout.regions[i];
      regions.push({
        id: i, // Region index as ID
        name: region.name,
        x: region.x || 0,
        y: region.y || 0,
        width: region.width || 0,
        height: region.height || 0,
        currentItem: region.item ? { type: region.item.type, id: region.item.id } : undefined,
      });
    }
  }
  
  return { ok: true, layoutName: layout.name, regions };
}

/**
 * Ensure the ADS region in a layout is bound to the correct playlist
 * 
 * IMPORTANT: This uses the stored adsRegionId mapping. If not set,
 * it will try to auto-detect based on region size (largest region that's not a widget).
 */
export async function ensureAdsRegionBound(
  layoutId: number,
  adsPlaylistId: number
): Promise<AutopilotResult> {
  const logs: string[] = [];
  logs.push(`[AdsRegionBound] Checking layout ${layoutId} for ADS playlist ${adsPlaylistId}`);
  
  // Get the layout
  const layoutResult = await yodeckRequest<any>(`/layouts/${layoutId}`);
  
  if (!layoutResult.ok || !layoutResult.data) {
    logs.push(`[AdsRegionBound] ❌ Failed to fetch layout: ${layoutResult.error}`);
    return { ok: false, action: "failed", logs, error: `LAYOUT_FETCH_FAILED: ${layoutResult.error}` };
  }
  
  const layout = layoutResult.data;
  logs.push(`[AdsRegionBound] Layout: ${layout.name}`);
  
  if (!layout.regions || !Array.isArray(layout.regions) || layout.regions.length === 0) {
    logs.push(`[AdsRegionBound] ⚠️ Layout has no regions`);
    return { ok: false, action: "failed", logs, error: "LAYOUT_NO_REGIONS" };
  }
  
  // Get stored ADS region ID
  let adsRegionIndex = await getLayoutAdsRegionId(layoutId);
  
  // If not stored, try to auto-detect
  if (adsRegionIndex === null) {
    logs.push(`[AdsRegionBound] No stored ADS region mapping, auto-detecting...`);
    
    // Find the largest region that could be for ADS (not a widget)
    let largestArea = 0;
    let largestIndex = -1;
    
    for (let i = 0; i < layout.regions.length; i++) {
      const region = layout.regions[i];
      const area = (region.width || 0) * (region.height || 0);
      
      // Skip if it's already bound to a widget
      if (region.item?.type === "widget") {
        logs.push(`[AdsRegionBound] Region ${i}: widget (${region.width}x${region.height}) - skipping`);
        continue;
      }
      
      logs.push(`[AdsRegionBound] Region ${i}: ${region.item?.type || "empty"} (${region.width}x${region.height})`);
      
      if (area > largestArea) {
        largestArea = area;
        largestIndex = i;
      }
    }
    
    if (largestIndex >= 0) {
      adsRegionIndex = largestIndex;
      logs.push(`[AdsRegionBound] Auto-detected ADS region: ${adsRegionIndex} (${largestArea}px²)`);
      
      // Store for future use
      await setLayoutAdsRegionId(layoutId, adsRegionIndex);
    } else {
      logs.push(`[AdsRegionBound] ❌ Could not auto-detect ADS region`);
      return { ok: false, action: "failed", logs, error: "ADS_REGION_MAPPING_MISSING" };
    }
  }
  
  // Validate region index
  if (adsRegionIndex < 0 || adsRegionIndex >= layout.regions.length) {
    logs.push(`[AdsRegionBound] ❌ Invalid region index: ${adsRegionIndex}`);
    return { ok: false, action: "failed", logs, error: "ADS_REGION_INDEX_INVALID" };
  }
  
  const targetRegion = layout.regions[adsRegionIndex];
  
  // Check if already bound to correct playlist
  if (targetRegion.item?.type === "playlist" && targetRegion.item?.id === adsPlaylistId) {
    logs.push(`[AdsRegionBound] ✓ Already bound to playlist ${adsPlaylistId}`);
    return { ok: true, action: "no_change", logs };
  }
  
  logs.push(`[AdsRegionBound] Current binding: ${JSON.stringify(targetRegion.item)}`);
  logs.push(`[AdsRegionBound] Updating region ${adsRegionIndex} to playlist ${adsPlaylistId}...`);
  
  // Clone layout and update region
  const updatedRegions = [...layout.regions];
  updatedRegions[adsRegionIndex] = {
    ...updatedRegions[adsRegionIndex],
    item: { type: "playlist", id: adsPlaylistId },
  };
  
  // PATCH the layout with updated regions
  const patchPayload = {
    regions: updatedRegions,
  };
  
  const patchResult = await yodeckRequest<any>(`/layouts/${layoutId}/`, "PATCH", patchPayload);
  
  if (!patchResult.ok) {
    logs.push(`[AdsRegionBound] ❌ Failed to update layout: ${patchResult.error}`);
    return { ok: false, action: "failed", logs, error: `LAYOUT_PATCH_FAILED: ${patchResult.error}` };
  }
  
  // Verify the update
  const verifyResult = await yodeckRequest<any>(`/layouts/${layoutId}`);
  if (verifyResult.ok && verifyResult.data?.regions?.[adsRegionIndex]?.item?.id === adsPlaylistId) {
    logs.push(`[AdsRegionBound] ✓ Successfully bound region ${adsRegionIndex} to playlist ${adsPlaylistId}`);
    return { ok: true, action: "updated", logs };
  }
  
  logs.push(`[AdsRegionBound] ⚠️ Update sent but verification failed`);
  return { ok: true, action: "updated", logs };
}

/**
 * Ensure ADS playlist is not empty (seed with self-ad if needed)
 */
export async function ensureAdsPlaylistSeeded(adsPlaylistId: number): Promise<AutopilotResult> {
  const logs: string[] = [];
  logs.push(`[AdsPlaylistSeed] Checking playlist ${adsPlaylistId}...`);
  
  // Get current playlist items
  const playlistResult = await yodeckRequest<any>(`/playlists/${adsPlaylistId}`);
  
  if (!playlistResult.ok || !playlistResult.data) {
    logs.push(`[AdsPlaylistSeed] ❌ Failed to fetch playlist: ${playlistResult.error}`);
    return { ok: false, action: "failed", logs, error: `PLAYLIST_FETCH_FAILED: ${playlistResult.error}` };
  }
  
  const playlist = playlistResult.data;
  const items = playlist.items || [];
  
  logs.push(`[AdsPlaylistSeed] Playlist "${playlist.name}" has ${items.length} items`);
  
  // If not empty, we're done
  if (items.length > 0) {
    logs.push(`[AdsPlaylistSeed] ✓ Playlist not empty, no seeding needed`);
    return { ok: true, action: "no_change", logs };
  }
  
  // Get self-ad media ID
  const selfAdMediaId = await getSelfAdMediaId();
  
  if (!selfAdMediaId) {
    logs.push(`[AdsPlaylistSeed] ⚠️ SELF_AD_NOT_CONFIGURED - playlist will remain empty`);
    logs.push(`[AdsPlaylistSeed] Set ELEVIZION_SELF_AD_MEDIA_ID env var or use admin config`);
    return { ok: false, action: "failed", logs, error: "SELF_AD_NOT_CONFIGURED" };
  }
  
  logs.push(`[AdsPlaylistSeed] Seeding with self-ad media ID: ${selfAdMediaId}`);
  
  // Add self-ad to playlist
  const newItems = [{
    id: selfAdMediaId,
    type: "media",
    priority: 1,
    duration: 15, // Default 15 seconds
  }];
  
  const patchResult = await yodeckRequest<any>(`/playlists/${adsPlaylistId}/`, "PATCH", {
    items: newItems,
  });
  
  if (!patchResult.ok) {
    logs.push(`[AdsPlaylistSeed] ❌ Failed to add self-ad: ${patchResult.error}`);
    return { ok: false, action: "failed", logs, error: `PLAYLIST_PATCH_FAILED: ${patchResult.error}` };
  }
  
  // Verify
  const verifyResult = await yodeckRequest<any>(`/playlists/${adsPlaylistId}`);
  const verifyItems = verifyResult.data?.items || [];
  
  if (verifyItems.length > 0) {
    logs.push(`[AdsPlaylistSeed] ✓ Playlist now has ${verifyItems.length} items`);
    return { ok: true, action: "updated", logs };
  }
  
  logs.push(`[AdsPlaylistSeed] ⚠️ Seed sent but verification shows 0 items`);
  return { ok: false, action: "failed", logs, error: "SEED_VERIFY_FAILED" };
}

/**
 * Add a media item to playlist if not already present (idempotent)
 */
export async function addMediaToPlaylistIfMissing(
  playlistId: number,
  mediaId: number,
  duration: number = 15
): Promise<AutopilotResult> {
  const logs: string[] = [];
  logs.push(`[AddToPlaylist] Adding media ${mediaId} to playlist ${playlistId}...`);
  
  // Get current playlist
  const playlistResult = await yodeckRequest<any>(`/playlists/${playlistId}`);
  
  if (!playlistResult.ok || !playlistResult.data) {
    logs.push(`[AddToPlaylist] ❌ Failed to fetch playlist: ${playlistResult.error}`);
    return { ok: false, action: "failed", logs, error: `PLAYLIST_FETCH_FAILED: ${playlistResult.error}` };
  }
  
  const playlist = playlistResult.data;
  const items = playlist.items || [];
  
  // Check if media already exists
  const existingItem = items.find((item: any) => {
    // Handle different item formats
    const itemId = typeof item === "number" ? item : item.id;
    return itemId === mediaId;
  });
  
  if (existingItem) {
    logs.push(`[AddToPlaylist] ✓ Media ${mediaId} already in playlist`);
    return { ok: true, action: "no_change", logs };
  }
  
  // Calculate next priority
  let maxPriority = 0;
  for (const item of items) {
    const priority = typeof item === "number" ? 1 : (item.priority || 1);
    if (priority > maxPriority) maxPriority = priority;
  }
  
  // Add new item
  const newItem = {
    id: mediaId,
    type: "media",
    priority: maxPriority + 1,
    duration,
  };
  
  const updatedItems = [...items, newItem];
  
  const patchResult = await yodeckRequest<any>(`/playlists/${playlistId}/`, "PATCH", {
    items: updatedItems,
  });
  
  if (!patchResult.ok) {
    logs.push(`[AddToPlaylist] ❌ Failed to add media: ${patchResult.error}`);
    return { ok: false, action: "failed", logs, error: `PLAYLIST_PATCH_FAILED: ${patchResult.error}` };
  }
  
  logs.push(`[AddToPlaylist] ✓ Added media ${mediaId} to playlist (priority: ${maxPriority + 1})`);
  return { ok: true, action: "updated", logs };
}

/**
 * Check media encoding status with polling
 */
export async function waitForMediaReady(
  mediaId: number,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 2000
): Promise<{ ok: boolean; status: string; logs: string[] }> {
  const logs: string[] = [];
  logs.push(`[MediaStatus] Checking media ${mediaId} status...`);
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const result = await yodeckRequest<any>(`/media/${mediaId}/status`);
    
    if (!result.ok) {
      logs.push(`[MediaStatus] ⚠️ Failed to get status: ${result.error}`);
      // Continue polling, might be transient
      await new Promise(r => setTimeout(r, pollIntervalMs));
      continue;
    }
    
    const status = result.data?.status || "unknown";
    logs.push(`[MediaStatus] Status: ${status}`);
    
    if (status === "ready" || status === "completed") {
      logs.push(`[MediaStatus] ✓ Media is ready`);
      return { ok: true, status, logs };
    }
    
    if (status === "failed" || status === "error") {
      logs.push(`[MediaStatus] ❌ Media encoding failed`);
      return { ok: false, status, logs };
    }
    
    // Still encoding, wait and retry
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  
  logs.push(`[MediaStatus] ⚠️ Timeout waiting for media to be ready`);
  return { ok: false, status: "timeout", logs };
}

/**
 * Full verification of screen setup chain
 */
export async function verifyScreenSetup(
  screenId: number,
  expectedLayoutId?: number,
  expectedPlaylistId?: number
): Promise<{
  ok: boolean;
  screenAssigned: boolean;
  layoutAssigned: boolean;
  adsRegionBound: boolean;
  playlistHasItems: boolean;
  details: any;
  logs: string[];
}> {
  const logs: string[] = [];
  logs.push(`[VerifySetup] Checking screen ${screenId}...`);
  
  const details: any = {};
  let screenAssigned = false;
  let layoutAssigned = false;
  let adsRegionBound = false;
  let playlistHasItems = false;
  
  // Get screen info
  const screenResult = await yodeckRequest<any>(`/screens/${screenId}`);
  
  if (!screenResult.ok || !screenResult.data) {
    logs.push(`[VerifySetup] ❌ Screen not found`);
    return { ok: false, screenAssigned, layoutAssigned, adsRegionBound, playlistHasItems, details, logs };
  }
  
  const screen = screenResult.data;
  screenAssigned = true;
  details.screen = {
    id: screen.id,
    name: screen.name,
    screen_content: screen.screen_content,
  };
  
  // Check screen_content
  const content = screen.screen_content;
  const isLayoutMode = content?.source_type === "layout";
  const layoutId = content?.source_id;
  
  if (!isLayoutMode || !layoutId) {
    logs.push(`[VerifySetup] ⚠️ Screen not in layout mode`);
    details.issue = "NOT_LAYOUT_MODE";
    return { ok: false, screenAssigned, layoutAssigned, adsRegionBound, playlistHasItems, details, logs };
  }
  
  logs.push(`[VerifySetup] Screen using layout ${layoutId}`);
  layoutAssigned = true;
  
  if (expectedLayoutId && layoutId !== expectedLayoutId) {
    logs.push(`[VerifySetup] ⚠️ Layout mismatch: expected ${expectedLayoutId}`);
  }
  
  // Get layout info
  const layoutResult = await yodeckRequest<any>(`/layouts/${layoutId}`);
  
  if (!layoutResult.ok || !layoutResult.data) {
    logs.push(`[VerifySetup] ❌ Layout not found`);
    return { ok: false, screenAssigned, layoutAssigned, adsRegionBound, playlistHasItems, details, logs };
  }
  
  const layout = layoutResult.data;
  details.layout = {
    id: layout.id,
    name: layout.name,
    regionCount: layout.regions?.length || 0,
  };
  
  // Find ADS region
  const adsRegionIndex = await getLayoutAdsRegionId(layoutId);
  if (adsRegionIndex !== null && layout.regions?.[adsRegionIndex]) {
    const region = layout.regions[adsRegionIndex];
    if (region.item?.type === "playlist") {
      adsRegionBound = true;
      const boundPlaylistId = region.item.id;
      details.adsPlaylistId = boundPlaylistId;
      logs.push(`[VerifySetup] ADS region bound to playlist ${boundPlaylistId}`);
      
      // Check playlist items
      const playlistResult = await yodeckRequest<any>(`/playlists/${boundPlaylistId}`);
      if (playlistResult.ok && playlistResult.data) {
        const itemCount = playlistResult.data.items?.length || 0;
        details.playlistItemCount = itemCount;
        playlistHasItems = itemCount > 0;
        logs.push(`[VerifySetup] Playlist has ${itemCount} items`);
      }
    } else {
      logs.push(`[VerifySetup] ⚠️ ADS region not bound to playlist`);
    }
  } else {
    logs.push(`[VerifySetup] ⚠️ ADS region mapping not configured`);
  }
  
  const allOk = screenAssigned && layoutAssigned && adsRegionBound && playlistHasItems;
  logs.push(`[VerifySetup] Result: ${allOk ? "✓ All OK" : "⚠️ Issues found"}`);
  
  return { ok: allOk, screenAssigned, layoutAssigned, adsRegionBound, playlistHasItems, details, logs };
}
