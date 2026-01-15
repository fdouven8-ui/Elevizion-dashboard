/**
 * Unified Availability Service
 * 
 * Single source of truth for capacity calculations across the entire flow.
 * Uses count-based capacity: MAX_ADS_PER_SCREEN = 20
 * A location has space if activeAdsCount < 20
 * 
 * Active ads = placements where:
 *   - isActive = true
 *   - startDate IS NULL OR startDate <= current_date
 *   - endDate IS NULL OR endDate >= current_date
 */

import { db } from "../db";
import { locations, screens, placements } from "@shared/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import { MAX_ADS_PER_SCREEN } from "@shared/regions";

export interface LocationAvailability {
  locationId: string;
  city: string;
  regionCode: string | null;
  activeAdsCount: number;
  hasSpace: boolean;
  availableSlots: number;
}

export interface CityAvailability {
  code: string;
  label: string;
  screensTotal: number;
  screensWithSpace: number;
  screensFull: number;
}

export interface CapacityCheckResult {
  isAvailable: boolean;
  availableScreens: number;
  requiredScreens: number;
  topReasons: string[];
  nextCheckAt: Date;
  details?: {
    locationAvailability: LocationAvailability[];
  };
}

const PACKAGE_SCREENS: Record<string, number> = {
  SINGLE: 1,
  TRIPLE: 3,
  TEN: 10,
  CUSTOM: 1,
};

/**
 * Get active ads count per location
 * Uses the canonical definition: isActive=true, within date range
 */
export async function getLocationPlacementCounts(): Promise<Map<string, number>> {
  const placementCounts = await db.select({
    locationId: screens.locationId,
    activeAdsCount: sql<number>`count(${placements.id})::int`.as("activeAdsCount"),
  })
    .from(placements)
    .innerJoin(screens, eq(placements.screenId, screens.id))
    .where(and(
      eq(placements.isActive, true),
      sql`(${placements.startDate} IS NULL OR ${placements.startDate}::date <= current_date)`,
      sql`(${placements.endDate} IS NULL OR ${placements.endDate}::date >= current_date)`,
    ))
    .groupBy(screens.locationId);

  const countMap = new Map<string, number>();
  for (const pc of placementCounts) {
    if (pc.locationId) {
      countMap.set(pc.locationId, pc.activeAdsCount);
    }
  }
  return countMap;
}

/**
 * Get all active locations with their availability status
 */
export async function getLocationsWithAvailability(): Promise<LocationAvailability[]> {
  const activeLocations = await db.select({
    id: locations.id,
    city: locations.city,
    regionCode: locations.regionCode,
  })
    .from(locations)
    .where(and(
      eq(locations.status, "active"),
      isNotNull(locations.city),
      sql`${locations.city} != ''`,
    ));

  const adsCountMap = await getLocationPlacementCounts();

  return activeLocations.map(loc => {
    const activeAdsCount = adsCountMap.get(loc.id) || 0;
    const hasSpace = activeAdsCount < MAX_ADS_PER_SCREEN;
    return {
      locationId: loc.id,
      city: loc.city || "",
      regionCode: loc.regionCode,
      activeAdsCount,
      hasSpace,
      availableSlots: Math.max(0, MAX_ADS_PER_SCREEN - activeAdsCount),
    };
  });
}

/**
 * Get availability aggregated by city
 */
export async function getCityAvailability(): Promise<CityAvailability[]> {
  const locationsWithAvailability = await getLocationsWithAvailability();

  const cityMap = new Map<string, CityAvailability>();

  for (const loc of locationsWithAvailability) {
    const normalizedCity = loc.city.toLowerCase().trim();
    const label = loc.city.trim();

    if (!cityMap.has(normalizedCity)) {
      cityMap.set(normalizedCity, {
        code: normalizedCity,
        label,
        screensTotal: 0,
        screensWithSpace: 0,
        screensFull: 0,
      });
    }

    const entry = cityMap.get(normalizedCity)!;
    entry.screensTotal++;
    if (loc.hasSpace) {
      entry.screensWithSpace++;
    } else {
      entry.screensFull++;
    }
    if (entry.label.length < label.length) {
      entry.label = label;
    }
  }

  return Array.from(cityMap.values())
    .sort((a, b) => {
      if (b.screensWithSpace !== a.screensWithSpace) {
        return b.screensWithSpace - a.screensWithSpace;
      }
      return a.label.localeCompare(b.label, "nl");
    });
}

/**
 * Check capacity for a potential advertiser placement
 * Uses the unified count-based logic (MAX_ADS_PER_SCREEN = 20)
 * Does NOT require Yodeck mapping or online status
 */
export async function checkCapacity(input: {
  packageType: string;
  targetRegionCodes?: string[];
}): Promise<CapacityCheckResult> {
  const requiredScreens = PACKAGE_SCREENS[input.packageType] || 1;
  const targetCities = input.targetRegionCodes || [];

  const locationsWithAvailability = await getLocationsWithAvailability();

  // Filter locations by selected cities (city codes are lowercase normalized)
  const matchingLocations = targetCities.length > 0
    ? locationsWithAvailability.filter(loc => 
        targetCities.includes(loc.city.toLowerCase().trim())
      )
    : locationsWithAvailability;

  const screensWithSpace = matchingLocations.filter(loc => loc.hasSpace);
  const availableScreens = screensWithSpace.length;

  // Determine reasons if not available
  const topReasons: string[] = [];
  if (availableScreens < requiredScreens) {
    const fullScreens = matchingLocations.filter(loc => !loc.hasSpace).length;
    if (fullScreens > 0) {
      topReasons.push("capacity_full");
    }
    if (targetCities.length > 0 && matchingLocations.length < requiredScreens) {
      topReasons.push("insufficient_locations_in_region");
    }
  }

  console.log(`[AvailabilityService] Capacity check:`, {
    packageType: input.packageType,
    targetCities,
    requiredScreens,
    availableScreens,
    matchingLocations: matchingLocations.length,
    decision: availableScreens >= requiredScreens ? "PROCEED" : "WAITLIST",
  });

  return {
    isAvailable: availableScreens >= requiredScreens,
    availableScreens,
    requiredScreens,
    topReasons,
    nextCheckAt: new Date(Date.now() + 30 * 60 * 1000),
    details: {
      locationAvailability: matchingLocations,
    },
  };
}

export const availabilityService = {
  getLocationPlacementCounts,
  getLocationsWithAvailability,
  getCityAvailability,
  checkCapacity,
};
