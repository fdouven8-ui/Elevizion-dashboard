/**
 * Unified Availability Service
 * 
 * Single source of truth for capacity calculations across the entire flow.
 * Uses count-based capacity: MAX_ADS_PER_SCREEN = 20
 * A location has space if activeAdsCount < 20
 * 
 * SELLABLE screens = locations where:
 *   - status = 'active'
 *   - readyForAds = true (fully set up, approved for ads)
 * 
 * LIVE placements (tightened definition) = placements where:
 *   - isActive = true
 *   - startDate IS NULL OR startDate <= current_date
 *   - endDate IS NULL OR endDate >= current_date
 *   - Contract is signed (signedAt IS NOT NULL OR status IN ('signed', 'active'))
 *     = spot reserved immediately on signature
 * 
 * Excluded: queued, proposed, simulated, approved-not-published placements
 */

import { db } from "../db";
import { locations, screens, placements, contracts } from "@shared/schema";
import { eq, and, sql, isNotNull, or, inArray } from "drizzle-orm";
import { MAX_ADS_PER_SCREEN } from "@shared/regions";

// ============================================================================
// AVAILABILITY CACHE (45s TTL with manual invalidation)
// ============================================================================
interface AvailabilityCacheEntry {
  data: CityAvailability[];
  timestamp: number;
}

let availabilityCache: AvailabilityCacheEntry | null = null;
const AVAILABILITY_CACHE_TTL_MS = 45_000; // 45 seconds

/**
 * Invalidate the availability cache
 * Call this when capacity-changing events occur:
 * - Contract signed/cancelled
 * - Location activated/deactivated
 * - readyForAds flag changed
 */
export function invalidateAvailabilityCache(): void {
  availabilityCache = null;
  console.log("[AvailabilityService] Cache invalidated");
}

function getCachedAvailability(): CityAvailability[] | null {
  if (!availabilityCache) return null;
  if (Date.now() - availabilityCache.timestamp > AVAILABILITY_CACHE_TTL_MS) {
    availabilityCache = null;
    return null;
  }
  return availabilityCache.data;
}

function setCachedAvailability(data: CityAvailability[]): void {
  availabilityCache = { data, timestamp: Date.now() };
}

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
 * Get LIVE ads count per location
 * Tightened definition: only counts placements where contract is signed
 * Excludes: queued, proposed, simulated, approved-not-published
 */
export async function getLocationPlacementCounts(): Promise<Map<string, number>> {
  const placementCounts = await db.select({
    locationId: screens.locationId,
    activeAdsCount: sql<number>`count(${placements.id})::int`.as("activeAdsCount"),
  })
    .from(placements)
    .innerJoin(screens, eq(placements.screenId, screens.id))
    .innerJoin(contracts, eq(placements.contractId, contracts.id))
    .where(and(
      eq(placements.isActive, true),
      sql`(${placements.startDate} IS NULL OR ${placements.startDate}::date <= current_date)`,
      sql`(${placements.endDate} IS NULL OR ${placements.endDate}::date >= current_date)`,
      // Only count LIVE placements: contract must be signed
      or(
        isNotNull(contracts.signedAt),
        inArray(contracts.status, ["signed", "active"])
      )
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
 * Get all SELLABLE locations with their availability status
 * SELLABLE = status='active' AND readyForAds=true
 */
export async function getLocationsWithAvailability(): Promise<LocationAvailability[]> {
  // Sellable = status='active' AND readyForAds=true AND (city OR regionCode exists)
  const sellableLocations = await db.select({
    id: locations.id,
    city: locations.city,
    regionCode: locations.regionCode,
  })
    .from(locations)
    .where(and(
      eq(locations.status, "active"),
      eq(locations.readyForAds, true),
      // Must have either city or regionCode (not both empty)
      or(
        and(isNotNull(locations.city), sql`${locations.city} != ''`),
        and(isNotNull(locations.regionCode), sql`${locations.regionCode} != ''`)
      ),
    ));

  console.log(`[AvailabilityService] Found ${sellableLocations.length} sellable locations`);

  const adsCountMap = await getLocationPlacementCounts();

  return sellableLocations.map(loc => {
    const activeAdsCount = adsCountMap.get(loc.id) || 0;
    const hasSpace = activeAdsCount < MAX_ADS_PER_SCREEN;
    // Use city if available, otherwise use regionCode as fallback
    const effectiveCity = (loc.city && loc.city.trim()) || (loc.regionCode && loc.regionCode.trim()) || "";
    return {
      locationId: loc.id,
      city: effectiveCity,
      regionCode: loc.regionCode,
      activeAdsCount,
      hasSpace,
      availableSlots: Math.max(0, MAX_ADS_PER_SCREEN - activeAdsCount),
    };
  });
}

/**
 * Get availability aggregated by city (with caching)
 */
export async function getCityAvailability(): Promise<CityAvailability[]> {
  // Check cache first
  const cached = getCachedAvailability();
  if (cached) {
    return cached;
  }

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

  const result = Array.from(cityMap.values())
    .sort((a, b) => {
      if (b.screensWithSpace !== a.screensWithSpace) {
        return b.screensWithSpace - a.screensWithSpace;
      }
      return a.label.localeCompare(b.label, "nl");
    });

  // Cache the result
  setCachedAvailability(result);
  return result;
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

/**
 * Get availability monitoring stats for System Health
 */
export async function getAvailabilityStats(): Promise<{
  totalSellableScreens: number;
  totalScreensWithSpace: number;
  totalScreensFull: number;
  citiesWithZeroSpace: string[];
}> {
  const cityAvailability = await getCityAvailability();
  
  let totalSellableScreens = 0;
  let totalScreensWithSpace = 0;
  let totalScreensFull = 0;
  const citiesWithZeroSpace: string[] = [];
  
  for (const city of cityAvailability) {
    totalSellableScreens += city.screensTotal;
    totalScreensWithSpace += city.screensWithSpace;
    totalScreensFull += city.screensFull;
    if (city.screensWithSpace === 0) {
      citiesWithZeroSpace.push(city.label);
    }
  }
  
  return {
    totalSellableScreens,
    totalScreensWithSpace,
    totalScreensFull,
    citiesWithZeroSpace,
  };
}

export const availabilityService = {
  getLocationPlacementCounts,
  getLocationsWithAvailability,
  getCityAvailability,
  checkCapacity,
  getAvailabilityStats,
  invalidateAvailabilityCache,
};
