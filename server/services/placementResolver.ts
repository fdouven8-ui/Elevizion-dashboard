/**
 * PLACEMENT RESOLVER
 * 
 * Determines which screens should receive an advertiser's ad.
 * Uses package screensIncluded, targeting rules, and location readiness.
 */

import { db } from "../db";
import { screens, advertisers, locations } from "@shared/schema";
import { eq, and, isNotNull, inArray } from "drizzle-orm";

type Screen = typeof screens.$inferSelect;

export interface TargetScreen {
  id: string;
  screenId: string;
  name: string;
  yodeckPlayerId: string;
  locationId: string | null;
  city: string | null;
}

export interface ResolveTargetsResult {
  ok: boolean;
  targets?: TargetScreen[];
  error?: string;
  errorCode?: "NO_ADVERTISER" | "NO_PACKAGE" | "NO_TARGET_SCREENS";
}

/**
 * Resolve which screens should receive an advertiser's ad.
 */
export async function resolveTargetScreensForAdvertiser(advertiserId: string): Promise<ResolveTargetsResult> {
  const advertiser = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId)).then(r => r[0]);
  
  if (!advertiser) {
    return { ok: false, errorCode: "NO_ADVERTISER", error: `Advertiser ${advertiserId} not found` };
  }

  const screensIncluded = advertiser.screensIncluded || 0;
  if (screensIncluded <= 0) {
    return { ok: false, errorCode: "NO_PACKAGE", error: "Advertiser has no screens in package (screensIncluded = 0)" };
  }

  const allScreens = await db.select()
    .from(screens)
    .where(
      and(
        isNotNull(screens.yodeckPlayerId),
        eq(screens.isActive, true)
      )
    );

  if (allScreens.length === 0) {
    return { ok: false, errorCode: "NO_TARGET_SCREENS", error: "No active screens with Yodeck player found" };
  }

  const readyLocations = await db.select({ id: locations.id })
    .from(locations)
    .where(eq(locations.readyForAds, true));
  
  const readyLocationIds = new Set(readyLocations.map(l => l.id));

  let targetScreens = allScreens.filter(s => 
    s.locationId && readyLocationIds.has(s.locationId)
  );

  if (targetScreens.length === 0) {
    targetScreens = allScreens;
  }

  const limitedTargets = targetScreens.slice(0, screensIncluded);

  if (limitedTargets.length === 0) {
    return { ok: false, errorCode: "NO_TARGET_SCREENS", error: "No eligible screens found after filtering" };
  }

  const targets: TargetScreen[] = limitedTargets.map(s => ({
    id: s.id,
    screenId: s.screenId,
    name: s.name,
    yodeckPlayerId: s.yodeckPlayerId!,
    locationId: s.locationId,
    city: s.city,
  }));

  return { ok: true, targets };
}

/**
 * Get all screens for a specific location.
 */
export async function getScreensForLocation(locationId: string): Promise<Screen[]> {
  return await db.select()
    .from(screens)
    .where(
      and(
        eq(screens.locationId, locationId),
        isNotNull(screens.yodeckPlayerId),
        eq(screens.isActive, true)
      )
    );
}

/**
 * Get all active screens with Yodeck player.
 */
export async function getAllActiveScreens(): Promise<Screen[]> {
  return await db.select()
    .from(screens)
    .where(
      and(
        isNotNull(screens.yodeckPlayerId),
        eq(screens.isActive, true)
      )
    );
}
