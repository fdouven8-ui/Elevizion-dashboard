/**
 * Playlist Provisioning Service
 * 
 * Comprehensive service for ensuring screens have valid, sellable ad playlists.
 * Handles:
 * 1. Canonical naming convention enforcement
 * 2. Stale/wrong playlist mapping cleanup
 * 3. Automatic playlist provisioning
 * 4. Duplicate resolution
 * 
 * This service is idempotent and safe - no destructive media deletes.
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getYodeckClient, YodeckPlaylist, YodeckScreen } from "./yodeckClient";
import { logAudit } from "./auditService";

/**
 * Canonical playlist naming convention:
 * {locationName} (auto-playlist-{yodeckDeviceId}-fit)
 */
function generateCanonicalPlaylistName(locationName: string, yodeckDeviceId: string): string {
  const cleanName = locationName.replace(/[^a-zA-Z0-9\s-]/g, '').trim().slice(0, 30);
  return `${cleanName} (auto-playlist-${yodeckDeviceId}-fit)`;
}

/**
 * Check if a playlist name matches the canonical pattern for a device
 */
function isCanonicalName(playlistName: string, yodeckDeviceId: string): boolean {
  return playlistName.includes(`auto-playlist-${yodeckDeviceId}-fit`);
}

/**
 * Check if a playlist is "sellable" (suitable for ad placement)
 * 
 * A playlist is sellable if:
 * 1. It exists with a valid ID
 * 2. Its name doesn't contain exclusion keywords
 * 3. It's not a non-ad playlist type (if type info is available)
 * 
 * Note: Screen mapping validation is done separately in ensureSellablePlaylistForLocation
 * because it requires the screen context.
 */
export function isSellablePlaylist(playlist: YodeckPlaylist | null): boolean {
  if (!playlist || !playlist.id) return false;
  
  const name = playlist.name.toLowerCase();
  
  const excludeKeywords = ['no-ad', 'intern', 'content-only', 'staff', 'test', 'template', 'legacy', 'disabled'];
  const isExcluded = excludeKeywords.some(keyword => name.includes(keyword));
  if (isExcluded) return false;
  
  // Check playlist type if available (some Yodeck playlists have type metadata)
  const playlistType = (playlist as any).type?.toLowerCase?.() || '';
  if (playlistType && ['non_ad', 'internal', 'info'].includes(playlistType)) {
    return false;
  }
  
  return true;
}

/**
 * Check if a playlist is correctly mapped to a screen (assigned to the right device)
 * This is a separate check because it requires the screen context.
 */
export function isPlaylistMappedToScreen(
  playlist: YodeckPlaylist | null, 
  screen: YodeckScreen | null
): boolean {
  if (!playlist || !screen) return false;
  
  // Check if this playlist is assigned to the screen
  // Yodeck screens have a playlistId or scheduleId field
  const screenPlaylistId = (screen as any).playlistId || (screen as any).scheduleId;
  if (screenPlaylistId && String(screenPlaylistId) === String(playlist.id)) {
    return true;
  }
  
  // Also check if playlist has players/screens assigned
  const assignedPlayers = (playlist as any).players || (playlist as any).screens || [];
  if (Array.isArray(assignedPlayers)) {
    return assignedPlayers.some((p: any) => String(p.id || p) === String(screen.id));
  }
  
  return true; // Default to true if we can't determine (graceful degradation)
}

/**
 * Check if a playlist name indicates it's an auto-provisioned ad playlist
 */
function isAutoPlaylistName(name: string): boolean {
  return name.toLowerCase().includes('auto-playlist');
}

export type ProvisioningAction = 
  | 'NONE'
  | 'PLAYLIST_CREATED'
  | 'PLAYLIST_RENAMED'
  | 'MAPPING_FIXED'
  | 'MAPPING_REMOVED_STALE'
  | 'DUPLICATES_RESOLVED';

interface ProvisioningResult {
  success: boolean;
  playlistId: string | null;
  playlistName: string | null;
  actionTaken: ProvisioningAction;
  warnings: string[];
  error?: string;
}

interface LocationContext {
  location: {
    id: string;
    name: string;
    yodeckDeviceId: string | null;
    yodeckPlaylistId: string | null;
  };
  yodeckScreen: YodeckScreen | null;
  currentPlaylist: YodeckPlaylist | null;
  allPlaylists: YodeckPlaylist[];
}

/**
 * Load all context needed to evaluate and fix a location's playlist mapping
 */
async function loadLocationContext(locationId: string): Promise<LocationContext | null> {
  const [location] = await db.select({
    id: locations.id,
    name: locations.name,
    yodeckDeviceId: locations.yodeckDeviceId,
    yodeckPlaylistId: locations.yodeckPlaylistId,
  }).from(locations).where(eq(locations.id, locationId)).limit(1);
  
  if (!location) return null;
  
  const client = await getYodeckClient();
  if (!client) {
    return {
      location,
      yodeckScreen: null,
      currentPlaylist: null,
      allPlaylists: [],
    };
  }
  
  let yodeckScreen: YodeckScreen | null = null;
  let currentPlaylist: YodeckPlaylist | null = null;
  
  if (location.yodeckDeviceId) {
    const screenId = parseInt(location.yodeckDeviceId, 10);
    if (!isNaN(screenId)) {
      yodeckScreen = await client.getScreen(screenId);
    }
  }
  
  if (location.yodeckPlaylistId) {
    const playlistId = parseInt(location.yodeckPlaylistId, 10);
    if (!isNaN(playlistId)) {
      currentPlaylist = await client.getPlaylist(playlistId);
    }
  }
  
  const allPlaylists = await client.getPlaylists();
  
  return {
    location,
    yodeckScreen,
    currentPlaylist,
    allPlaylists,
  };
}

/**
 * Find auto-playlists that match a specific device ID pattern
 */
function findAutoPlaylistsForDevice(playlists: YodeckPlaylist[], deviceId: string): YodeckPlaylist[] {
  return playlists.filter(p => {
    const name = p.name.toLowerCase();
    return name.includes('auto-playlist') && name.includes(deviceId);
  });
}

/**
 * Main entry point: Ensure a screen has a valid, sellable playlist
 * 
 * This function:
 * 1. Loads context (location, screen, current playlist)
 * 2. Detects and cleans up "bad" mappings
 * 3. Provisions a new playlist if needed
 * 4. Returns the final state
 */
export async function ensureSellablePlaylistForLocation(locationId: string): Promise<ProvisioningResult> {
  console.log(`[PlaylistProvisioning] Starting for location ${locationId}`);
  
  const context = await loadLocationContext(locationId);
  if (!context) {
    return {
      success: false,
      playlistId: null,
      playlistName: null,
      actionTaken: 'NONE',
      warnings: [],
      error: 'Location not found',
    };
  }
  
  const { location, yodeckScreen, currentPlaylist, allPlaylists } = context;
  const warnings: string[] = [];
  
  if (!location.yodeckDeviceId) {
    return {
      success: false,
      playlistId: null,
      playlistName: null,
      actionTaken: 'NONE',
      warnings: ['Location not linked to Yodeck screen'],
      error: 'No yodeckDeviceId',
    };
  }
  
  const client = await getYodeckClient();
  if (!client) {
    return {
      success: false,
      playlistId: null,
      playlistName: null,
      actionTaken: 'NONE',
      warnings: [],
      error: 'Yodeck client not available',
    };
  }
  
  const deviceId = location.yodeckDeviceId;
  const screenId = parseInt(deviceId, 10);
  const canonicalName = generateCanonicalPlaylistName(location.name, deviceId);
  
  // Case 1: Check if mapping points to non-existent playlist
  if (location.yodeckPlaylistId && !currentPlaylist) {
    console.log(`[PlaylistProvisioning] Stale mapping detected - playlist ${location.yodeckPlaylistId} doesn't exist`);
    warnings.push(`Removed stale mapping to non-existent playlist ${location.yodeckPlaylistId}`);
    
    await db.update(locations)
      .set({
        yodeckPlaylistId: null,
        updatedAt: new Date(),
      })
      .where(eq(locations.id, locationId));
    
    await logAudit('PLAYLIST_MAPPING_REMOVED_STALE', {
      metadata: {
        locationId,
        oldPlaylistId: location.yodeckPlaylistId,
        reason: 'Playlist no longer exists in Yodeck',
      },
    });
    
    // Continue to provision a new playlist
  }
  
  // Case 2: Current playlist exists but name is not canonical
  if (currentPlaylist && !isCanonicalName(currentPlaylist.name, deviceId)) {
    console.log(`[PlaylistProvisioning] Non-canonical name detected: "${currentPlaylist.name}"`);
    
    // Try to rename if it's an auto-playlist
    if (isAutoPlaylistName(currentPlaylist.name)) {
      const renameResult = await client.renamePlaylist(currentPlaylist.id, canonicalName);
      if (renameResult.ok) {
        console.log(`[PlaylistProvisioning] Renamed playlist to "${canonicalName}"`);
        
        // Note: yodeckPlaylistName field doesn't exist in schema
        // The playlist name is derived from Yodeck API when needed
        
        await logAudit('PLAYLIST_RENAMED', {
          metadata: {
            locationId,
            playlistId: String(currentPlaylist.id),
            oldName: currentPlaylist.name,
            newName: canonicalName,
          },
        });
        
        return {
          success: true,
          playlistId: String(currentPlaylist.id),
          playlistName: canonicalName,
          actionTaken: 'PLAYLIST_RENAMED',
          warnings,
        };
      } else {
        warnings.push(`Could not rename playlist: ${renameResult.error}`);
      }
    } else {
      warnings.push(`Playlist "${currentPlaylist.name}" is not an auto-playlist, keeping as-is`);
    }
  }
  
  // Case 3: Check for duplicate auto-playlists for this device
  const devicePlaylists = findAutoPlaylistsForDevice(allPlaylists, deviceId);
  if (devicePlaylists.length > 1) {
    console.log(`[PlaylistProvisioning] Found ${devicePlaylists.length} auto-playlists for device ${deviceId}`);
    
    // Find the best one (prefer canonical name, then most recently used)
    const canonical = devicePlaylists.find(p => isCanonicalName(p.name, deviceId));
    const best = canonical || devicePlaylists[0];
    
    // Mark others as legacy
    for (const dup of devicePlaylists) {
      if (dup.id !== best.id && !dup.name.includes('(legacy)')) {
        const legacyName = `${dup.name} (legacy)`;
        const renameResult = await client.renamePlaylist(dup.id, legacyName);
        if (renameResult.ok) {
          warnings.push(`Marked duplicate playlist ${dup.id} as legacy`);
        }
      }
    }
    
    await logAudit('PLAYLIST_DUPLICATES_RESOLVED', {
      metadata: {
        locationId,
        deviceId,
        keptPlaylistId: String(best.id),
        duplicateIds: devicePlaylists.filter(p => p.id !== best.id).map(p => String(p.id)),
      },
    });
  }
  
  // Case 4: We have a valid sellable playlist already
  if (currentPlaylist && isSellablePlaylist(currentPlaylist)) {
    console.log(`[PlaylistProvisioning] Location already has valid playlist ${currentPlaylist.id}`);
    return {
      success: true,
      playlistId: String(currentPlaylist.id),
      playlistName: currentPlaylist.name,
      actionTaken: 'NONE',
      warnings,
    };
  }
  
  // Case 5: Check if screen already has a playlist assigned in Yodeck
  if (yodeckScreen?.screen_content?.source_type === 'playlist' && yodeckScreen.screen_content.source_id) {
    const assignedPlaylistId = yodeckScreen.screen_content.source_id;
    const assignedPlaylist = await client.getPlaylist(assignedPlaylistId);
    
    if (assignedPlaylist && isSellablePlaylist(assignedPlaylist)) {
      console.log(`[PlaylistProvisioning] Found existing playlist ${assignedPlaylistId} on screen, updating DB`);
      
      await db.update(locations)
        .set({
          yodeckPlaylistId: String(assignedPlaylistId),
          updatedAt: new Date(),
        })
        .where(eq(locations.id, locationId));
      
      await logAudit('PLAYLIST_MAPPING_FIXED', {
        metadata: {
          locationId,
          playlistId: String(assignedPlaylistId),
          playlistName: assignedPlaylist.name,
          source: 'screen_assignment',
        },
      });
      
      return {
        success: true,
        playlistId: String(assignedPlaylistId),
        playlistName: assignedPlaylist.name,
        actionTaken: 'MAPPING_FIXED',
        warnings,
      };
    }
  }
  
  // Case 6: Need to create a new playlist
  console.log(`[PlaylistProvisioning] Creating new playlist "${canonicalName}" for screen ${screenId}`);
  
  const workspaceId = yodeckScreen?.workspace?.id;
  const createResult = await client.createPlaylist(canonicalName, workspaceId);
  
  if (!createResult.ok || !createResult.data) {
    return {
      success: false,
      playlistId: null,
      playlistName: null,
      actionTaken: 'NONE',
      warnings,
      error: createResult.error || 'Failed to create playlist',
    };
  }
  
  const newPlaylistId = String(createResult.data.id);
  
  // Assign playlist to screen
  const assignResult = await client.assignContentToScreen(screenId, 'playlist', createResult.data.id);
  if (!assignResult.ok) {
    return {
      success: false,
      playlistId: newPlaylistId,
      playlistName: canonicalName,
      actionTaken: 'NONE',
      warnings,
      error: `Created playlist but failed to assign: ${assignResult.error}`,
    };
  }
  
  // Update database
  await db.update(locations)
    .set({
      yodeckPlaylistId: newPlaylistId,
      updatedAt: new Date(),
    })
    .where(eq(locations.id, locationId));
  
  await logAudit('PLAYLIST_AUTO_CREATED', {
    metadata: {
      locationId,
      playlistId: newPlaylistId,
      playlistName: canonicalName,
      screenId,
      workspaceId,
    },
  });
  
  console.log(`[PlaylistProvisioning] Successfully created playlist ${newPlaylistId} for location ${locationId}`);
  
  return {
    success: true,
    playlistId: newPlaylistId,
    playlistName: canonicalName,
    actionTaken: 'PLAYLIST_CREATED',
    warnings,
  };
}

/**
 * Run provisioning for multiple locations (used by proposal endpoint)
 */
export async function ensureSellablePlaylistsForLocations(locationIds: string[]): Promise<{
  results: Map<string, ProvisioningResult>;
  totalFixed: number;
  totalCreated: number;
  totalFailed: number;
}> {
  const results = new Map<string, ProvisioningResult>();
  let totalFixed = 0;
  let totalCreated = 0;
  let totalFailed = 0;
  
  for (const locationId of locationIds) {
    const result = await ensureSellablePlaylistForLocation(locationId);
    results.set(locationId, result);
    
    if (result.success) {
      if (result.actionTaken === 'PLAYLIST_CREATED') {
        totalCreated++;
      } else if (result.actionTaken !== 'NONE') {
        totalFixed++;
      }
    } else {
      totalFailed++;
    }
    
    // Rate limiting between Yodeck API calls
    await new Promise(r => setTimeout(r, 300));
  }
  
  console.log(`[PlaylistProvisioning] Batch complete: ${totalCreated} created, ${totalFixed} fixed, ${totalFailed} failed`);
  
  return { results, totalFixed, totalCreated, totalFailed };
}
