/**
 * AutoPlacementService - Automatically creates placements after ad approval
 * 
 * TARGETING RULES (safety-first approach):
 * 1. Primary: Match screens to ADVERTISER targeting (targetRegionCodes)
 *    Note: Targeting is defined at advertiser level, not contract level in current schema.
 *    This allows one advertiser to have consistent targeting across all their contracts.
 * 2. Test mode: If TEST_MODE=true OR advertiser is internal/test, AND no regions configured,
 *    allow all online screens. This prevents wrong placements when targeting IS configured.
 * 3. Fallback: Use TEST_SCREEN_ID only (with TEST_FALLBACK_USED flag)
 * 
 * SAFETY: Never place to "all screens" if targeting is configured but has no matches.
 * This prevents ads from appearing on wrong screens.
 * 
 * Idempotency: Approving twice does not create duplicate placements
 */

import { db } from "../db";
import { placements, contracts, screens, advertisers, locations, systemSettings } from "@shared/schema";
import { eq, and, isNotNull, or, inArray } from "drizzle-orm";
import { repairScreen } from "./screenPlaylistService";
import { getYodeckDeviceStatus } from "./unifiedDeviceStatusService";

const TEST_MODE = process.env.TEST_MODE === "TRUE" || process.env.NODE_ENV === "development";

export interface AutoPlacementResult {
  success: boolean;
  placementsCreated: number;
  screensPublished: number;
  targetScreens: string[];
  errors: string[];
  message: string;
  testFallbackUsed?: boolean;
  targetingMethod: "CITY_MATCH" | "REGION_MATCH" | "TEST_MODE_ALL" | "TEST_FALLBACK" | "NO_MATCH";
  targetingSource: "CONTRACT_OVERRIDE" | "ADVERTISER_DEFAULT" | "NONE";
}

interface ScreenWithLocation {
  id: string;
  screenId: string | null;
  name: string;
  yodeckPlayerId: string;
  locationId: string | null;
  locationCity: string | null;
  locationRegion: string | null;
}

async function getTestScreenId(): Promise<string | null> {
  const setting = await db.select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "TEST_SCREEN_ID"))
    .limit(1);
  return setting[0]?.value || process.env.TEST_SCREEN_ID || null;
}

async function isAdvertiserTest(advertiserId: string): Promise<boolean> {
  const advertiser = await db.select({ 
    companyName: advertisers.companyName,
    notes: advertisers.notes,
    status: advertisers.status,
  })
    .from(advertisers)
    .where(eq(advertisers.id, advertiserId))
    .limit(1);
  
  if (!advertiser[0]) return false;
  
  // Check if marked as internal/test via notes or company name
  const name = advertiser[0].companyName?.toLowerCase() || "";
  const notes = advertiser[0].notes?.toLowerCase() || "";
  return name.includes("test") || name.includes("internal") || 
         notes.includes("[test]") || notes.includes("[internal]");
}

export async function createAutoPlacementsForAsset(
  assetId: string,
  advertiserId: string
): Promise<AutoPlacementResult> {
  const errors: string[] = [];
  let placementsCreated = 0;
  let screensPublished = 0;
  const targetScreenIds: string[] = [];
  let testFallbackUsed = false;
  let targetingMethod: AutoPlacementResult["targetingMethod"] = "NO_MATCH";
  let targetingSource: AutoPlacementResult["targetingSource"] = "NONE";

  try {
    console.log(`[AutoPlacement] Starting for asset ${assetId}, advertiser ${advertiserId}`);

    // 1. Find the advertiser's active contract WITH targeting overrides
    const activeContracts = await db.select({
      id: contracts.id,
      status: contracts.status,
      advertiserId: contracts.advertiserId,
      targetRegionCodesOverride: contracts.targetRegionCodesOverride,
      targetCitiesOverride: contracts.targetCitiesOverride,
    })
      .from(contracts)
      .where(and(
        eq(contracts.advertiserId, advertiserId),
        or(
          eq(contracts.status, "signed"),
          eq(contracts.status, "active")
        )
      ));

    if (activeContracts.length === 0) {
      console.log(`[AutoPlacement] No active contract for advertiser ${advertiserId}`);
      return {
        success: false,
        placementsCreated: 0,
        screensPublished: 0,
        targetScreens: [],
        errors: ["Geen actief contract gevonden voor deze adverteerder"],
        message: "Geen contract - placements niet aangemaakt",
        targetingMethod: "NO_MATCH",
        targetingSource: "NONE"
      };
    }

    const contract = activeContracts[0];
    console.log(`[AutoPlacement] Found contract ${contract.id} (status: ${contract.status})`);

    // 2. Get advertiser targeting preferences
    const advertiserData = await db.select({
      targetRegionCodes: advertisers.targetRegionCodes,
      targetCities: advertisers.targetCities,
      companyName: advertisers.companyName,
      notes: advertisers.notes,
    })
      .from(advertisers)
      .where(eq(advertisers.id, advertiserId))
      .limit(1);

    const advertiser = advertiserData[0];
    const isTestAdvertiser = await isAdvertiserTest(advertiserId);
    
    // 3. Determine effective targeting (contract override OR advertiser default)
    const hasContractOverride = (contract.targetRegionCodesOverride && contract.targetRegionCodesOverride.length > 0) ||
                                 (contract.targetCitiesOverride && contract.targetCitiesOverride.trim().length > 0);
    
    targetingSource = hasContractOverride ? "CONTRACT_OVERRIDE" : "ADVERTISER_DEFAULT";
    
    // Parse targeting - contract override takes precedence
    const targetRegions = hasContractOverride && contract.targetRegionCodesOverride?.length 
      ? contract.targetRegionCodesOverride 
      : (advertiser?.targetRegionCodes || []);
    
    // Parse cities from CSV (trim, lowercase, normalize)
    const parseCityCsv = (csv: string | null | undefined): string[] => {
      if (!csv || csv.trim() === "") return [];
      return csv.split(",").map(c => c.trim().toLowerCase()).filter(c => c.length > 0);
    };
    
    const targetCities = hasContractOverride && contract.targetCitiesOverride
      ? parseCityCsv(contract.targetCitiesOverride)
      : parseCityCsv(advertiser?.targetCities);
    
    console.log(`[AutoPlacement] Targeting source: ${targetingSource}`);
    console.log(`[AutoPlacement] Target regions: ${JSON.stringify(targetRegions)}, cities: ${JSON.stringify(targetCities)}`);
    console.log(`[AutoPlacement] Advertiser ${advertiser?.companyName}: isTest=${isTestAdvertiser}`);

    // 3. Get all screens with location info for targeting
    const allScreensWithLocations = await db.select({
      id: screens.id,
      screenId: screens.screenId,
      name: screens.name,
      yodeckPlayerId: screens.yodeckPlayerId,
      locationId: screens.locationId,
    })
      .from(screens)
      .where(isNotNull(screens.yodeckPlayerId));

    if (allScreensWithLocations.length === 0) {
      console.log(`[AutoPlacement] No screens with Yodeck linked`);
      return {
        success: false,
        placementsCreated: 0,
        screensPublished: 0,
        targetScreens: [],
        errors: ["Geen schermen met Yodeck gekoppeld"],
        message: "Geen schermen - placements niet aangemaakt",
        targetingMethod: "NO_MATCH",
        targetingSource: "NONE"
      };
    }

    // 4. Enrich screens with location data
    const locationIds = allScreensWithLocations
      .map(s => s.locationId)
      .filter((id): id is string => id !== null);
    
    const locationsData = locationIds.length > 0 
      ? await db.select({ id: locations.id, city: locations.city, regionCode: locations.regionCode })
          .from(locations)
          .where(inArray(locations.id, locationIds))
      : [];
    
    const locationMap = new Map(locationsData.map(l => [l.id, l]));

    const enrichedScreens: ScreenWithLocation[] = allScreensWithLocations.map(s => ({
      ...s,
      yodeckPlayerId: s.yodeckPlayerId!,
      locationCity: s.locationId ? locationMap.get(s.locationId)?.city || null : null,
      locationRegion: s.locationId ? locationMap.get(s.locationId)?.regionCode || null : null,
    }));

    // 5. Filter to ONLINE screens (Yodeck API as source of truth)
    const onlineScreens: ScreenWithLocation[] = [];
    for (const screen of enrichedScreens) {
      try {
        const deviceStatus = await getYodeckDeviceStatus(screen.yodeckPlayerId);
        if (deviceStatus.status === "ONLINE") {
          onlineScreens.push(screen);
        } else {
          console.log(`[AutoPlacement] Screen ${screen.screenId || screen.name} is ${deviceStatus.status} - skipping`);
        }
      } catch (err: any) {
        console.warn(`[AutoPlacement] Could not check status for ${screen.screenId}: ${err.message}`);
        // Do NOT fail open - skip screens with unknown status
      }
    }

    if (onlineScreens.length === 0) {
      console.log(`[AutoPlacement] No online screens found via Yodeck API`);
      return {
        success: false,
        placementsCreated: 0,
        screensPublished: 0,
        targetScreens: [],
        errors: ["Geen online schermen gevonden (Yodeck status check)"],
        message: "Geen online schermen - placements niet aangemaakt",
        targetingMethod: "NO_MATCH",
        targetingSource
      };
    }

    // 6. Apply targeting rules - PRIORITY ORDER: City > Region > Test fallback
    let targetScreens: ScreenWithLocation[] = [];
    const hasAnyTargeting = targetCities.length > 0 || targetRegions.length > 0;

    // Step 1: Try CITY matching first (most specific)
    if (targetCities.length > 0) {
      const cityMatches = onlineScreens.filter(s => {
        if (!s.locationCity) return false;
        const normalizedCity = s.locationCity.trim().toLowerCase();
        return targetCities.includes(normalizedCity);
      });
      
      if (cityMatches.length > 0) {
        targetScreens = cityMatches;
        targetingMethod = "CITY_MATCH";
        console.log(`[AutoPlacement] CITY_MATCH: ${targetScreens.length} screens in cities ${JSON.stringify(targetCities)}`);
      }
    }

    // Step 2: If no city matches (or no city targeting), try REGION matching
    if (targetScreens.length === 0 && targetRegions.length > 0) {
      const regionMatches = onlineScreens.filter(s => 
        s.locationRegion && targetRegions.includes(s.locationRegion)
      );
      
      if (regionMatches.length > 0) {
        targetScreens = regionMatches;
        targetingMethod = "REGION_MATCH";
        console.log(`[AutoPlacement] REGION_MATCH: ${targetScreens.length} screens in regions ${JSON.stringify(targetRegions)}`);
      }
    }

    // Step 3: Fallback to TEST_MODE_ALL only if NO targeting was configured
    // SAFETY: Never fallback to "all" when targeting exists but has no matches
    if (targetScreens.length === 0 && !hasAnyTargeting && (TEST_MODE || isTestAdvertiser)) {
      targetScreens = onlineScreens;
      targetingMethod = "TEST_MODE_ALL";
      targetingSource = "NONE"; // No targeting configured
      console.log(`[AutoPlacement] TEST_MODE_ALL: Using all ${targetScreens.length} online screens (no targeting configured)`);
    }

    // Step 4: Final fallback to TEST_SCREEN_ID only
    if (targetScreens.length === 0) {
      const testScreenId = await getTestScreenId();
      if (testScreenId) {
        const testScreen = onlineScreens.find(s => s.id === testScreenId || s.screenId === testScreenId);
        if (testScreen) {
          targetScreens = [testScreen];
          testFallbackUsed = true;
          targetingMethod = "TEST_FALLBACK";
          console.log(`[AutoPlacement] TEST_FALLBACK: Using test screen ${testScreenId} (targeting=${JSON.stringify({cities: targetCities, regions: targetRegions})} had no matches)`);
        }
      }
    }

    // No targets found at all
    if (targetScreens.length === 0) {
      console.log(`[AutoPlacement] NO_MATCH: No screens matched targeting`);
      return {
        success: false,
        placementsCreated: 0,
        screensPublished: 0,
        targetScreens: [],
        errors: [`Geen schermen gevonden voor targeting: cities=${JSON.stringify(targetCities)}, regions=${JSON.stringify(targetRegions)}`],
        message: "Geen matching schermen - placements niet aangemaakt",
        targetingMethod: "NO_MATCH",
        targetingSource
      };
    }

    console.log(`[AutoPlacement] Targeting ${targetScreens.length} screens via ${targetingMethod} (source: ${targetingSource})`);

    // 7. Create placements for each target screen (with idempotency check)
    const today = new Date().toISOString().split('T')[0];
    
    for (const screen of targetScreens) {
      try {
        const existingPlacement = await db.select()
          .from(placements)
          .where(and(
            eq(placements.contractId, contract.id),
            eq(placements.screenId, screen.id),
            eq(placements.isActive, true)
          ))
          .limit(1);

        if (existingPlacement.length > 0) {
          console.log(`[AutoPlacement] Placement already exists for screen ${screen.screenId || screen.name}`);
          targetScreenIds.push(screen.id);
          continue;
        }

        const [newPlacement] = await db.insert(placements)
          .values({
            contractId: contract.id,
            screenId: screen.id,
            source: testFallbackUsed ? "auto_test_fallback" : "auto_approval",
            secondsPerLoop: 10,
            playsPerHour: 6,
            startDate: today,
            isActive: true,
            notes: testFallbackUsed 
              ? `TEST_FALLBACK: Auto-created for asset ${assetId}`
              : `Auto-created on approval of asset ${assetId} (${targetingMethod})`,
          })
          .returning();

        placementsCreated++;
        targetScreenIds.push(screen.id);
        console.log(`[AutoPlacement] ✓ Created placement ${newPlacement.id} for screen ${screen.screenId || screen.name}`);
      } catch (err: any) {
        errors.push(`Screen ${screen.screenId || screen.name}: ${err.message}`);
        console.error(`[AutoPlacement] ✗ Failed for screen ${screen.screenId}:`, err.message);
      }
    }

    // 8. Trigger per-screen playlist sync for each target screen
    console.log(`[AutoPlacement] Publishing to ${targetScreenIds.length} screens...`);
    
    for (const screenId of targetScreenIds) {
      try {
        const result = await repairScreen(screenId);
        if (result.ok) {
          screensPublished++;
          console.log(`[AutoPlacement] ✓ Published to screen ${screenId}`);
        } else {
          errors.push(`Publish ${screenId}: ${result.errorReason}`);
          console.warn(`[AutoPlacement] ⚠️ Publish failed for ${screenId}: ${result.errorReason}`);
        }
      } catch (err: any) {
        errors.push(`Publish ${screenId}: ${err.message}`);
      }
    }

    const message = placementsCreated > 0
      ? `${placementsCreated} plaatsingen aangemaakt via ${targetingMethod}, ${screensPublished} schermen gepubliceerd`
      : `Plaatsingen bestonden al, ${screensPublished} schermen gesynchroniseerd`;

    console.log(`[AutoPlacement] Complete: ${placementsCreated} created, ${screensPublished} published, method=${targetingMethod}`);

    return {
      success: true,
      placementsCreated,
      screensPublished,
      targetScreens: targetScreenIds,
      errors,
      message: `${message} (bron: ${targetingSource})`,
      testFallbackUsed,
      targetingMethod,
      targetingSource,
    };
  } catch (error: any) {
    console.error("[AutoPlacement] Fatal error:", error);
    return {
      success: false,
      placementsCreated,
      screensPublished,
      targetScreens: targetScreenIds,
      errors: [error.message],
      message: "Fout bij auto-placement: " + error.message,
      targetingMethod: "NO_MATCH",
      targetingSource: "NONE"
    };
  }
}
