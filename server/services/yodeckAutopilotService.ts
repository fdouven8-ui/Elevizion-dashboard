/**
 * Yodeck Autopilot Service
 * 
 * Main orchestrator for autopilot repairs. Handles the full chain:
 * 1. Ensure baseline layout exists
 * 2. Ensure ADS playlist exists
 * 3. Bind ADS region in layout to ADS playlist
 * 4. Seed ADS playlist with self-ad if empty
 * 5. Add approved ads to playlist
 * 6. Assign layout to screen
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { locations, screens, adAssets, contracts, placements, advertisers } from "@shared/schema";
import { yodeckRequest } from "./yodeckLayoutService";
import { ensureCanonicalPlaylist, findBaselineLayout, ensureBaselineLayoutOnScreen } from "./yodeckCanonicalService";
import { ensureAdsRegionBound, ensureAdsPlaylistSeeded, addMediaToPlaylistIfMissing, verifyScreenSetup } from "./yodeckAutopilotHelpers";
import { getSelfAdMediaId } from "./yodeckAutopilotConfig";

export interface FullRepairResult {
  ok: boolean;
  locationId: string;
  locationName: string;
  steps: {
    layoutFound: boolean;
    playlistCreated: boolean;
    regionBound: boolean;
    playlistSeeded: boolean;
    adsAdded: number;
    screenAssigned: boolean;
  };
  errors: string[];
  logs: string[];
}

/**
 * Perform full autopilot repair for a location
 * This is the main entry point for complete location setup
 */
export async function performFullLocationRepair(locationId: string): Promise<FullRepairResult> {
  const logs: string[] = [];
  const errors: string[] = [];
  const steps = {
    layoutFound: false,
    playlistCreated: false,
    regionBound: false,
    playlistSeeded: false,
    adsAdded: 0,
    screenAssigned: false,
  };

  logs.push(`[FullRepair] ═══════════════════════════════════════`);
  logs.push(`[FullRepair] Starting full repair for location ${locationId}`);

  // Get location
  const [location] = await db.select().from(locations).where(eq(locations.id, locationId));
  if (!location) {
    errors.push("Locatie niet gevonden");
    return { ok: false, locationId, locationName: "Unknown", steps, errors, logs };
  }

  logs.push(`[FullRepair] Locatie: ${location.name}`);

  // Get screen info (for yodeckDeviceId)
  let yodeckDeviceId: string | null = location.yodeckDeviceId;
  
  if (!yodeckDeviceId) {
    // Try to find from screens table
    const linkedScreens = await db.select({ yodeckPlayerId: screens.yodeckPlayerId })
      .from(screens)
      .where(eq(screens.locationId, locationId));
    
    if (linkedScreens.length > 0 && linkedScreens[0].yodeckPlayerId) {
      yodeckDeviceId = linkedScreens[0].yodeckPlayerId;
      logs.push(`[FullRepair] ✓ yodeckDeviceId gevonden via screens: ${yodeckDeviceId}`);
    }
  }

  // STEP 1: Find baseline layout
  logs.push(`[FullRepair] ─── STAP 1: Baseline layout zoeken ───`);
  const layoutResult = await findBaselineLayout();
  
  if (!layoutResult.ok || !layoutResult.layoutId) {
    errors.push(`BASELINE_LAYOUT_MISSING: ${layoutResult.error || "Layout niet gevonden"}`);
    logs.push(`[FullRepair] ❌ Baseline layout niet gevonden`);
    // Continue anyway - we might still be able to create playlists
  } else {
    steps.layoutFound = true;
    logs.push(`[FullRepair] ✓ Baseline layout: ${layoutResult.layoutName} (ID ${layoutResult.layoutId})`);
  }

  const layoutId = layoutResult.layoutId;

  // STEP 2: Ensure ADS playlist exists
  logs.push(`[FullRepair] ─── STAP 2: ADS playlist ───`);
  const playlistResult = await ensureCanonicalPlaylist(location.name, "ADS");
  logs.push(...playlistResult.logs);

  if (!playlistResult.ok || !playlistResult.playlistId) {
    errors.push(`ADS_PLAYLIST_FAILED: ${playlistResult.error || "Playlist kon niet worden aangemaakt"}`);
    logs.push(`[FullRepair] ❌ ADS playlist niet beschikbaar`);
    return { ok: false, locationId, locationName: location.name, steps, errors, logs };
  }

  steps.playlistCreated = true;
  const adsPlaylistId = playlistResult.playlistId;
  logs.push(`[FullRepair] ✓ ADS playlist: ${adsPlaylistId}`);

  // Update location with playlist ID
  if (location.yodeckPlaylistId !== adsPlaylistId) {
    await db.update(locations)
      .set({ yodeckPlaylistId: adsPlaylistId })
      .where(eq(locations.id, locationId));
    logs.push(`[FullRepair] ✓ Location bijgewerkt met ADS playlist ID`);
  }

  // STEP 3: Bind ADS region in layout to ADS playlist
  logs.push(`[FullRepair] ─── STAP 3: ADS region binding ───`);
  if (layoutId) {
    const regionResult = await ensureAdsRegionBound(layoutId, parseInt(adsPlaylistId));
    logs.push(...regionResult.logs);
    
    if (regionResult.ok) {
      steps.regionBound = true;
      logs.push(`[FullRepair] ✓ ADS region gebonden aan playlist`);
    } else {
      errors.push(`ADS_REGION_BIND_FAILED: ${regionResult.error}`);
      logs.push(`[FullRepair] ⚠️ ADS region binding mislukt`);
    }
  } else {
    logs.push(`[FullRepair] ⚠️ Geen layout - region binding overgeslagen`);
  }

  // STEP 4: Find and add approved ads
  logs.push(`[FullRepair] ─── STAP 4: Approved ads toevoegen ───`);
  const approvedAds = await findApprovedAdsForLocation(locationId);
  logs.push(`[FullRepair] ${approvedAds.length} goedgekeurde ads gevonden`);

  for (const ad of approvedAds) {
    if (ad.yodeckMediaId) {
      const addResult = await addMediaToPlaylistIfMissing(
        parseInt(adsPlaylistId),
        ad.yodeckMediaId,
        15
      );
      logs.push(...addResult.logs);
      
      if (addResult.ok && addResult.action === "updated") {
        steps.adsAdded++;
      }
    } else {
      logs.push(`[FullRepair] ⚠️ Ad ${ad.id} heeft geen yodeckMediaId`);
    }
  }

  // STEP 5: Seed playlist with self-ad if still empty
  logs.push(`[FullRepair] ─── STAP 5: Playlist seed check ───`);
  const seedResult = await ensureAdsPlaylistSeeded(parseInt(adsPlaylistId));
  logs.push(...seedResult.logs);
  
  if (seedResult.ok) {
    steps.playlistSeeded = true;
  } else if (seedResult.error !== "SELF_AD_NOT_CONFIGURED") {
    errors.push(`SEED_FAILED: ${seedResult.error}`);
  }

  // STEP 6: Assign layout to screen
  logs.push(`[FullRepair] ─── STAP 6: Layout toewijzen aan scherm ───`);
  if (layoutId && yodeckDeviceId) {
    // Validate it's a real Yodeck device ID (not mock)
    if (yodeckDeviceId.startsWith("yd_player_") || isNaN(parseInt(yodeckDeviceId))) {
      logs.push(`[FullRepair] ⚠️ Mock device ID: ${yodeckDeviceId} - overgeslagen`);
    } else {
      const assignResult = await ensureBaselineLayoutOnScreen(parseInt(yodeckDeviceId), layoutId, parseInt(adsPlaylistId));
      logs.push(...assignResult.logs);
      
      if (assignResult.ok) {
        steps.screenAssigned = true;
        logs.push(`[FullRepair] ✓ Layout toegewezen aan scherm`);
      } else {
        errors.push(`LAYOUT_ASSIGN_FAILED: ${assignResult.error}`);
        logs.push(`[FullRepair] ⚠️ Layout toewijzing mislukt`);
      }
    }
  } else if (!layoutId) {
    logs.push(`[FullRepair] ⚠️ Geen layout - toewijzing overgeslagen`);
  } else {
    logs.push(`[FullRepair] ⚠️ Geen Yodeck device ID - toewijzing overgeslagen`);
  }

  logs.push(`[FullRepair] ═══════════════════════════════════════`);
  logs.push(`[FullRepair] Resultaat:`);
  logs.push(`[FullRepair]   Layout gevonden: ${steps.layoutFound ? "JA" : "NEE"}`);
  logs.push(`[FullRepair]   Playlist aangemaakt: ${steps.playlistCreated ? "JA" : "NEE"}`);
  logs.push(`[FullRepair]   Region gebonden: ${steps.regionBound ? "JA" : "NEE"}`);
  logs.push(`[FullRepair]   Playlist geseeded: ${steps.playlistSeeded ? "JA" : "NEE"}`);
  logs.push(`[FullRepair]   Ads toegevoegd: ${steps.adsAdded}`);
  logs.push(`[FullRepair]   Scherm toegewezen: ${steps.screenAssigned ? "JA" : "NEE"}`);

  // Print all logs to console
  for (const log of logs) {
    console.log(log);
  }

  const ok = steps.layoutFound && steps.playlistCreated && 
             (steps.regionBound || !layoutId) && 
             (steps.screenAssigned || !yodeckDeviceId);

  return { ok, locationId, locationName: location.name, steps, errors, logs };
}

/**
 * Find approved ads for a location via the advertiser chain
 */
async function findApprovedAdsForLocation(locationId: string): Promise<Array<{
  id: string;
  advertiserId: string;
  yodeckMediaId: number | null;
  filename: string;
}>> {
  const approvedAds: Array<{
    id: string;
    advertiserId: string;
    yodeckMediaId: number | null;
    filename: string;
  }> = [];

  try {
    // Get screens for this location
    const locationScreens = await db.select({ id: screens.id })
      .from(screens)
      .where(eq(screens.locationId, locationId));
    
    if (locationScreens.length === 0) {
      console.log(`[FindAds] Geen schermen gevonden voor locatie ${locationId}`);
      return approvedAds;
    }

    const screenIds = locationScreens.map(s => s.id);

    // Get placements for these screens
    const screenPlacements = await db.select({ contractId: placements.contractId })
      .from(placements)
      .where(eq(placements.screenId, screenIds[0])); // Simplified for now

    if (screenPlacements.length === 0) {
      console.log(`[FindAds] Geen plaatsingen gevonden voor schermen`);
      return approvedAds;
    }

    // Get contracts and advertisers
    const contractIds = [...new Set(screenPlacements.map(p => p.contractId).filter(Boolean))];
    
    for (const contractId of contractIds) {
      if (!contractId) continue;
      
      const [contract] = await db.select({ advertiserId: contracts.advertiserId })
        .from(contracts)
        .where(eq(contracts.id, contractId));
      
      if (contract?.advertiserId) {
        // Get approved ads for this advertiser
        const advertiserAds = await db.select()
          .from(adAssets)
          .where(eq(adAssets.advertiserId, contract.advertiserId));
        
        for (const ad of advertiserAds) {
          if (ad.approvalStatus === 'APPROVED') {
            approvedAds.push({
              id: ad.id,
              advertiserId: ad.advertiserId,
              yodeckMediaId: ad.yodeckMediaId,
              filename: ad.originalFileName,
            });
          }
        }
      }
    }

    return approvedAds;
  } catch (error: any) {
    console.error(`[FindAds] Error: ${error.message}`);
    return approvedAds;
  }
}

/**
 * Enhanced approve flow - called after admin approves an ad
 * Ensures the full chain is set up for all target locations
 */
export async function publishApprovedAdToAllLocations(
  assetId: string
): Promise<{
  ok: boolean;
  locationsProcessed: number;
  locationsSuccess: number;
  locationsFailed: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let locationsProcessed = 0;
  let locationsSuccess = 0;
  let locationsFailed = 0;

  logs.push(`[Publish] Starting publish for asset ${assetId}`);

  // Get the asset
  const [asset] = await db.select().from(adAssets).where(eq(adAssets.id, assetId));
  if (!asset) {
    logs.push(`[Publish] ❌ Asset niet gevonden`);
    return { ok: false, locationsProcessed, locationsSuccess, locationsFailed, logs };
  }

  if (asset.approvalStatus !== 'APPROVED') {
    logs.push(`[Publish] ❌ Asset is niet goedgekeurd (status: ${asset.approvalStatus})`);
    return { ok: false, locationsProcessed, locationsSuccess, locationsFailed, logs };
  }

  // Check if we have a Yodeck media ID
  if (!asset.yodeckMediaId) {
    logs.push(`[Publish] ⚠️ Asset heeft nog geen yodeckMediaId - probeer eerst te zoeken...`);
    
    // Try to find in Yodeck
    const { findYodeckMediaByName } = await import("./yodeckCanonicalService");
    const searchTerm = asset.storedFilename?.replace(/\.[^/.]+$/, "") || 
                       asset.originalFileName.replace(/\.[^/.]+$/, "");
    const searchResult = await findYodeckMediaByName(searchTerm);
    logs.push(...searchResult.logs);
    
    if (searchResult.mediaId) {
      await db.update(adAssets)
        .set({ yodeckMediaId: searchResult.mediaId, yodeckUploadedAt: new Date() })
        .where(eq(adAssets.id, assetId));
      logs.push(`[Publish] ✓ yodeckMediaId gevonden en opgeslagen: ${searchResult.mediaId}`);
    } else {
      logs.push(`[Publish] ❌ Media niet gevonden in Yodeck`);
      return { ok: false, locationsProcessed, locationsSuccess, locationsFailed, logs };
    }
  }

  // Find all target locations for this advertiser
  const { findLocationsForAdvertiser } = await import("./yodeckCanonicalService");
  const targetLocationIds = await findLocationsForAdvertiser(asset.advertiserId);
  logs.push(`[Publish] ${targetLocationIds.length} locaties gevonden voor adverteerder`);

  // Process each location
  for (const locationId of targetLocationIds) {
    locationsProcessed++;
    
    try {
      // Add a small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 1000));
      
      const repairResult = await performFullLocationRepair(locationId);
      logs.push(...repairResult.logs);
      
      if (repairResult.ok) {
        locationsSuccess++;
      } else {
        locationsFailed++;
        logs.push(`[Publish] ⚠️ Locatie ${repairResult.locationName} had problemen`);
      }
    } catch (error: any) {
      locationsFailed++;
      logs.push(`[Publish] ❌ Fout bij locatie ${locationId}: ${error.message}`);
    }
  }

  logs.push(`[Publish] ═══════════════════════════════════════`);
  logs.push(`[Publish] Resultaat: ${locationsSuccess}/${locationsProcessed} locaties succesvol`);

  return {
    ok: locationsFailed === 0,
    locationsProcessed,
    locationsSuccess,
    locationsFailed,
    logs,
  };
}
