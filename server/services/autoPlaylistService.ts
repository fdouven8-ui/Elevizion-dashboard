/**
 * Auto-Playlist Provisioning Service
 * 
 * Automatically creates and assigns ad playlists for screens that are coupled
 * to Yodeck but don't have a sellable playlist assigned.
 * 
 * This ensures proposals never fail due to missing playlists.
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { getYodeckClient, YodeckPlaylist } from "./yodeckClient";
import { logAudit } from "./auditService";

/**
 * Check if a playlist is suitable for ad placement
 * A playlist is "sellable" if:
 * - It exists and has a valid ID
 * - Its name suggests it's for ads (contains 'ad', 'advertentie', 'reclame', 'auto-playlist')
 * - Or it's a general-purpose playlist that can hold ads
 */
export function isSellablePlaylist(playlist: YodeckPlaylist | null): boolean {
  if (!playlist || !playlist.id) return false;
  
  const name = playlist.name.toLowerCase();
  const adKeywords = ['ad', 'advertentie', 'reclame', 'adverteren', 'commercial', 'auto-playlist', 'mixed'];
  
  const isAdPlaylist = adKeywords.some(keyword => name.includes(keyword));
  
  // Also accept general playlists that don't have "no-ads", "intern", "content-only" type keywords
  const excludeKeywords = ['no-ad', 'intern', 'content-only', 'staff', 'test', 'template'];
  const isExcluded = excludeKeywords.some(keyword => name.includes(keyword));
  
  // Accept if it's an ad playlist OR if it's not explicitly excluded
  return isAdPlaylist || !isExcluded;
}

/**
 * Generate a unique playlist name for a location
 */
function generatePlaylistName(locationName: string, locationId: string): string {
  const shortId = locationId.slice(-8);
  const cleanName = locationName.replace(/[^a-zA-Z0-9\s-]/g, '').trim().slice(0, 30);
  return `${cleanName} (auto-playlist-${shortId})`;
}

interface ProvisionResult {
  success: boolean;
  playlistId?: string;
  playlistName?: string;
  error?: string;
  alreadyExists?: boolean;
}

/**
 * Provision an ad playlist for a location
 * 
 * 1. Check if location already has a playlist
 * 2. If not, check if location has a yodeckDeviceId
 * 3. Create a new playlist in Yodeck
 * 4. Assign it to the screen
 * 5. Update the location record
 */
export async function provisionPlaylistForLocation(locationId: string): Promise<ProvisionResult> {
  console.log(`[AutoPlaylist] Starting provisioning for location ${locationId}`);
  
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId)).limit(1);
  
  if (!location) {
    return { success: false, error: "Location not found" };
  }
  
  if (location.yodeckPlaylistId) {
    console.log(`[AutoPlaylist] Location ${locationId} already has playlist ${location.yodeckPlaylistId}`);
    return { success: true, playlistId: location.yodeckPlaylistId, alreadyExists: true };
  }
  
  const yodeckDeviceId = location.yodeckDeviceId;
  if (!yodeckDeviceId) {
    return { success: false, error: "Location not linked to Yodeck screen" };
  }
  
  const client = await getYodeckClient();
  if (!client) {
    return { success: false, error: "Yodeck client not available" };
  }
  
  try {
    const screenId = parseInt(yodeckDeviceId, 10);
    if (isNaN(screenId)) {
      return { success: false, error: "Invalid Yodeck device ID" };
    }
    
    const screen = await client.getScreen(screenId);
    if (!screen) {
      return { success: false, error: `Screen ${screenId} not found in Yodeck` };
    }
    
    if (screen.screen_content?.source_type === 'playlist' && screen.screen_content?.source_id) {
      const existingPlaylistId = String(screen.screen_content.source_id);
      console.log(`[AutoPlaylist] Screen already has playlist ${existingPlaylistId}, updating location record`);
      
      await db.update(locations)
        .set({ 
          yodeckPlaylistId: existingPlaylistId,
          updatedAt: new Date(),
        })
        .where(eq(locations.id, locationId));
      
      return { 
        success: true, 
        playlistId: existingPlaylistId, 
        playlistName: screen.screen_content.source_name || undefined,
        alreadyExists: true 
      };
    }
    
    const playlistName = generatePlaylistName(location.name, locationId);
    console.log(`[AutoPlaylist] Creating playlist "${playlistName}" for screen ${screenId}`);
    
    const workspaceId = screen.workspace?.id;
    const createResult = await client.createPlaylist(playlistName, workspaceId);
    
    if (!createResult.ok || !createResult.data) {
      return { success: false, error: createResult.error || "Failed to create playlist" };
    }
    
    const newPlaylistId = String(createResult.data.id);
    console.log(`[AutoPlaylist] Created playlist ${newPlaylistId}, assigning to screen ${screenId}`);
    
    const assignResult = await client.assignContentToScreen(screenId, 'playlist', createResult.data.id);
    
    if (!assignResult.ok) {
      console.error(`[AutoPlaylist] Failed to assign playlist to screen: ${assignResult.error}`);
      return { success: false, error: `Failed to assign playlist to screen: ${assignResult.error}` };
    }
    
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
        playlistName,
        screenId: screenId,
        workspaceId,
      },
    });
    
    console.log(`[AutoPlaylist] Successfully provisioned playlist ${newPlaylistId} for location ${locationId}`);
    
    return { 
      success: true, 
      playlistId: newPlaylistId, 
      playlistName 
    };
  } catch (err: any) {
    console.error(`[AutoPlaylist] Error provisioning playlist for ${locationId}:`, err);
    return { success: false, error: err.message || "Unknown error" };
  }
}

/**
 * Provision playlists for all locations that need them
 * Used by sync jobs and batch operations
 */
export async function provisionPlaylistsForAllLocations(): Promise<{
  processed: number;
  created: number;
  failed: number;
  errors: string[];
}> {
  console.log("[AutoPlaylist] Starting batch provisioning...");
  
  const allLocations = await db.select()
    .from(locations)
    .where(eq(locations.status, "active"));
  
  const needsProvisioning = allLocations.filter(
    loc => loc.yodeckDeviceId && !loc.yodeckPlaylistId
  );
  
  console.log(`[AutoPlaylist] Found ${needsProvisioning.length} locations needing playlist provisioning`);
  
  let created = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (const location of needsProvisioning) {
    const result = await provisionPlaylistForLocation(location.id);
    if (result.success && !result.alreadyExists) {
      created++;
    } else if (!result.success) {
      failed++;
      errors.push(`${location.name}: ${result.error}`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`[AutoPlaylist] Batch complete: ${created} created, ${failed} failed`);
  
  return {
    processed: needsProvisioning.length,
    created,
    failed,
    errors,
  };
}

/**
 * Try to provision a playlist for a location during proposal generation
 * Returns true if playlist was successfully provisioned or already exists
 */
export async function ensureLocationHasPlaylist(locationId: string): Promise<boolean> {
  const result = await provisionPlaylistForLocation(locationId);
  return result.success;
}
