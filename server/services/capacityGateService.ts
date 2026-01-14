/**
 * Capacity Gate Service
 * 
 * Checks if there is available capacity for a new advertiser placement
 * before allowing them to proceed to contract signing.
 * Uses PlacementEngine.dryRunSimulate() for consistent simulation logic.
 */

import { placementEngine } from "./placementEngineService";

export interface AvailabilityCheckInput {
  packageType: string; // SINGLE | TRIPLE | TEN | CUSTOM
  businessCategory: string;
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

// Package type to screen count mapping
const PACKAGE_SCREENS: Record<string, number> = {
  SINGLE: 1,
  TRIPLE: 3,
  TEN: 10,
  CUSTOM: 1, // Minimum for custom
};

/**
 * Check availability for a potential advertiser placement
 * Uses PlacementEngine.dryRunSimulate() for consistent capacity/exclusivity logic
 */
export async function checkCapacity(input: AvailabilityCheckInput): Promise<AvailabilityCheckResult> {
  const requiredCount = PACKAGE_SCREENS[input.packageType] || 1;
  
  // Use PlacementEngine's dry-run simulation
  const simulation = await placementEngine.dryRunSimulate({
    packageType: input.packageType,
    businessCategory: input.businessCategory,
    competitorGroup: input.competitorGroup || input.businessCategory,
    targetRegionCodes: input.targetRegionCodes || [],
    videoDurationSeconds: input.videoDurationSeconds || 15,
  });
  
  // Aggregate rejection reasons
  const rejectedReasons: Record<string, number> = {};
  for (const rejected of simulation.rejectedLocations) {
    rejectedReasons[rejected.reason] = (rejectedReasons[rejected.reason] || 0) + 1;
  }
  
  // Get top reasons for rejection
  const topReasons = Object.entries(rejectedReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason]) => reason);
  
  return {
    isAvailable: simulation.success,
    availableSlotCount: simulation.selectedLocations.length,
    requiredCount,
    topReasons,
    nextCheckAt: new Date(Date.now() + 30 * 60 * 1000), // Check again in 30 minutes
    details: {
      eligibleLocations: simulation.selectedLocations.length,
      rejectedReasons,
    },
  };
}

export const capacityGateService = {
  checkCapacity,
};
