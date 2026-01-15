/**
 * Capacity Gate Service
 * 
 * Checks if there is available capacity for a new advertiser placement
 * before allowing them to proceed to contract signing.
 * 
 * Uses the unified availability service with count-based capacity:
 * MAX_ADS_PER_SCREEN = 20, based on active placements count.
 * Does NOT require Yodeck mapping or online status.
 */

import { availabilityService } from "./availabilityService";

export interface AvailabilityCheckInput {
  packageType: string; // SINGLE | TRIPLE | TEN | CUSTOM
  businessCategory?: string;
  competitorGroup?: string;
  targetRegionCodes?: string[];
  videoDurationSeconds?: number;
}

export interface AvailabilityCheckResult {
  isAvailable: boolean;
  availableSlotCount: number;
  requiredCount: number;
  topReasons: string[];
  nextCheckAt: Date;
  details?: {
    eligibleLocations: number;
    rejectedReasons: Record<string, number>;
  };
}

/**
 * Check availability for a potential advertiser placement
 * Uses unified count-based capacity logic (MAX_ADS_PER_SCREEN = 20)
 */
export async function checkCapacity(input: AvailabilityCheckInput): Promise<AvailabilityCheckResult> {
  const result = await availabilityService.checkCapacity({
    packageType: input.packageType,
    targetRegionCodes: input.targetRegionCodes,
  });

  // Build rejected reasons map for backward compatibility
  const rejectedReasons: Record<string, number> = {};
  for (const reason of result.topReasons) {
    rejectedReasons[reason] = 1;
  }

  return {
    isAvailable: result.isAvailable,
    availableSlotCount: result.availableScreens,
    requiredCount: result.requiredScreens,
    topReasons: result.topReasons,
    nextCheckAt: result.nextCheckAt,
    details: {
      eligibleLocations: result.availableScreens,
      rejectedReasons,
    },
  };
}

export const capacityGateService = {
  checkCapacity,
};
