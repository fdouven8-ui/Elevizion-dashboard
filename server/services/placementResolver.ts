/**
 * PLACEMENT RESOLVER
 * 
 * Determines which screens should receive an advertiser's ad.
 * Priority: portalPlacements (customer-selected) > package-based targeting.
 */

import { db } from "../db";
import { screens, advertisers, locations, portalPlacements, PORTAL_PLACEMENT_STATUS } from "@shared/schema";
import { eq, and, isNotNull, inArray, ne } from "drizzle-orm";

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
  errorCode?: "NO_ADVERTISER" | "NO_PACKAGE" | "NO_TARGET_SCREENS" | "NO_PORTAL_PLACEMENTS";
  source?: "PORTAL_PLACEMENTS" | "PACKAGE_TARGETING";
}

/**
 * Resolve target screens from portalPlacements (customer screen selections).
 * Returns null if no portal placements exist for this advertiser.
 */
async function resolveFromPortalPlacements(advertiserId: string): Promise<TargetScreen[] | null> {
  const pps = await db.select({
    screenId: portalPlacements.screenId,
  })
    .from(portalPlacements)
    .where(and(
      eq(portalPlacements.advertiserId, advertiserId),
      ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
    ));

  if (pps.length === 0) return null;

  const screenIds = pps.map(p => p.screenId);
  const matchedScreens = await db.select()
    .from(screens)
    .where(and(
      inArray(screens.id, screenIds),
      isNotNull(screens.yodeckPlayerId),
      eq(screens.isActive, true),
    ));

  if (matchedScreens.length === 0) return null;

  return matchedScreens.map(s => ({
    id: s.id,
    screenId: s.screenId,
    name: s.name,
    yodeckPlayerId: s.yodeckPlayerId!,
    locationId: s.locationId,
    city: s.city,
  }));
}

/**
 * Resolve which screens should receive an advertiser's ad.
 * Priority: portalPlacements first, then package-based targeting.
 */
export async function resolveTargetScreensForAdvertiser(advertiserId: string): Promise<ResolveTargetsResult> {
  const advertiser = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId)).then(r => r[0]);
  
  if (!advertiser) {
    return { ok: false, errorCode: "NO_ADVERTISER", error: `Advertiser ${advertiserId} not found` };
  }

  const portalTargets = await resolveFromPortalPlacements(advertiserId);
  if (portalTargets && portalTargets.length > 0) {
    console.log(`[PlacementResolver] advertiserId=${advertiserId} source=PORTAL_PLACEMENTS count=${portalTargets.length}`);
    return { ok: true, targets: portalTargets, source: "PORTAL_PLACEMENTS" };
  }

  const screensIncluded = advertiser.screensIncluded || 0;
  if (screensIncluded <= 0) {
    return { ok: false, errorCode: "NO_PACKAGE", error: "Advertiser has no screens in package (screensIncluded = 0) and no portal placements" };
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

  console.log(`[PlacementResolver] advertiserId=${advertiserId} source=PACKAGE_TARGETING count=${targets.length}`);
  return { ok: true, targets, source: "PACKAGE_TARGETING" };
}

/**
 * Get portal placement screen info for an advertiser (for admin display).
 */
export async function getPortalPlacementScreens(advertiserId: string): Promise<{ screenId: string; name: string; city: string | null; status: string }[]> {
  const pps = await db.select({
    screenId: portalPlacements.screenId,
    status: portalPlacements.status,
  })
    .from(portalPlacements)
    .where(and(
      eq(portalPlacements.advertiserId, advertiserId),
      ne(portalPlacements.status, PORTAL_PLACEMENT_STATUS.REMOVED),
    ));

  if (pps.length === 0) return [];

  const screenIds = pps.map(p => p.screenId);
  const scrs = await db.select({ id: screens.id, name: screens.name, city: screens.city })
    .from(screens)
    .where(inArray(screens.id, screenIds));

  const screenMap = new Map(scrs.map(s => [s.id, s]));

  return pps.map(p => ({
    screenId: p.screenId,
    name: screenMap.get(p.screenId)?.name || "Onbekend",
    city: screenMap.get(p.screenId)?.city || null,
    status: p.status,
  }));
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
