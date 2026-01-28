/**
 * AutoPlacementService - Automatically creates placements after ad approval
 * 
 * When an ad asset is APPROVED:
 * 1. Find the advertiser's active contract
 * 2. Determine target screens (from contract settings, region, or fallback to all)
 * 3. Create placement records for each target screen
 * 4. Trigger per-screen playlist sync to publish immediately
 * 
 * Idempotency: Approving twice does not create duplicate placements
 */

import { db } from "../db";
import { placements, contracts, screens, advertisers, adAssets } from "@shared/schema";
import { eq, and, isNotNull, or } from "drizzle-orm";
import { repairScreen } from "./screenPlaylistService";
import { getYodeckDeviceStatus } from "./unifiedDeviceStatusService";

export interface AutoPlacementResult {
  success: boolean;
  placementsCreated: number;
  screensPublished: number;
  targetScreens: string[];
  errors: string[];
  message: string;
}

export async function createAutoPlacementsForAsset(
  assetId: string,
  advertiserId: string
): Promise<AutoPlacementResult> {
  const errors: string[] = [];
  let placementsCreated = 0;
  let screensPublished = 0;
  const targetScreenIds: string[] = [];

  try {
    console.log(`[AutoPlacement] Starting for asset ${assetId}, advertiser ${advertiserId}`);

    // 1. Find the advertiser's active contract
    const activeContracts = await db.select()
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
        message: "Geen contract - placements niet aangemaakt"
      };
    }

    const contract = activeContracts[0];
    console.log(`[AutoPlacement] Found contract ${contract.id} (status: ${contract.status})`);

    // 2. Determine target screens (using Yodeck API as source of truth)
    const allScreensWithYodeck = await db.select({
      id: screens.id,
      screenId: screens.screenId,
      name: screens.name,
      yodeckPlayerId: screens.yodeckPlayerId,
    })
      .from(screens)
      .where(isNotNull(screens.yodeckPlayerId));

    if (allScreensWithYodeck.length === 0) {
      console.log(`[AutoPlacement] No screens with Yodeck linked`);
      return {
        success: false,
        placementsCreated: 0,
        screensPublished: 0,
        targetScreens: [],
        errors: ["Geen schermen met Yodeck gekoppeld"],
        message: "Geen schermen - placements niet aangemaakt"
      };
    }

    // Filter to only ONLINE screens using unified device status (Yodeck API as source)
    const onlineScreens: typeof allScreensWithYodeck = [];
    for (const screen of allScreensWithYodeck) {
      try {
        const deviceStatus = await getYodeckDeviceStatus(screen.yodeckPlayerId!);
        if (deviceStatus.status === "ONLINE") {
          onlineScreens.push(screen);
        } else {
          console.log(`[AutoPlacement] Screen ${screen.screenId || screen.name} is ${deviceStatus.status} - skipping`);
        }
      } catch (err: any) {
        // Include screen even if status check fails (fail open for placement)
        console.warn(`[AutoPlacement] Could not check status for ${screen.screenId}: ${err.message}, including anyway`);
        onlineScreens.push(screen);
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
        message: "Geen online schermen - placements niet aangemaakt"
      };
    }

    // For now: target ALL online screens (fallback behavior)
    // TODO: Add region/city filtering based on contract settings
    const targetScreens = onlineScreens;
    console.log(`[AutoPlacement] Targeting ${targetScreens.length} online screens (of ${allScreensWithYodeck.length} total)`);

    // 3. Create placements for each screen (with idempotency check)
    const today = new Date().toISOString().split('T')[0];
    
    for (const screen of targetScreens) {
      try {
        // Check if placement already exists for this contract+screen
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

        // Create new placement
        const [newPlacement] = await db.insert(placements)
          .values({
            contractId: contract.id,
            screenId: screen.id,
            source: "auto_approval",
            secondsPerLoop: 10,
            playsPerHour: 6,
            startDate: today,
            isActive: true,
            notes: `Auto-created on approval of asset ${assetId}`,
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

    // 4. Trigger per-screen playlist sync for each target screen
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
      ? `${placementsCreated} plaatsingen aangemaakt, ${screensPublished} schermen gepubliceerd`
      : `Plaatsingen bestonden al, ${screensPublished} schermen gesynchroniseerd`;

    console.log(`[AutoPlacement] Complete: ${placementsCreated} created, ${screensPublished} published`);

    return {
      success: true,
      placementsCreated,
      screensPublished,
      targetScreens: targetScreenIds,
      errors,
      message,
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
    };
  }
}
