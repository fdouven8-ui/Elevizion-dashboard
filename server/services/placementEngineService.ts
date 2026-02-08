/**
 * Placement Engine Service
 * 
 * Orchestrates the PROPOSE → SIMULATE → APPROVE → PUBLISH workflow for
 * auto-publishing ad assets to Yodeck screens.
 * 
 * Hard Constraints:
 * 1. Region match: location.regionCode must match advertiser.targetRegionCodes
 * 2. Category match: advertiser.category must match location.categoriesAllowed
 * 3. Online + linked: location must have yodeckPlaylistId (or auto-provisioned)
 * 4. Capacity: currentAdLoadSeconds + videoDuration <= adSlotCapacitySecondsPerLoop
 * 
 * Soft Ranking:
 * - Expected impressions (avgVisitorsPerWeek * viewFactor)
 * - Spread across different cities
 * 
 * Auto-Playlist Provisioning:
 * When a location has yodeckDeviceId but no yodeckPlaylistId, the engine
 * automatically provisions a new playlist via autoPlaylistService. This ensures
 * proposals never fail due to missing playlists for coupled screens.
 * 
 * Note: Playlist sellability is enforced during onboarding/sync, not simulation.
 * Auto-provisioned playlists are inherently sellable (contain 'auto-playlist' in name).
 * Per system design, availability MUST NOT depend on Yodeck mapping for capacity.
 */

import { db } from "../db";
import { 
  placementPlans, 
  placementTargets, 
  locations, 
  advertisers, 
  adAssets,
  type PlacementPlan,
  type InsertPlacementPlan,
} from "@shared/schema";
import { eq, and, inArray, or, isNull, gte, lte, sql, not } from "drizzle-orm";
import * as crypto from "crypto";
import { logAudit } from "./auditService";
import { provisionPlaylistForLocation } from "./autoPlaylistService";

const STALE_SYNC_THRESHOLD_MINUTES = 15;
const VIEW_FACTOR = 0.3; // 30% of visitors see the ad per week
const PACKAGE_COUNTS: Record<string, number> = {
  SINGLE: 1,
  TRIPLE: 3,
  TEN: 10,
};

type RejectionReason = 
  | "REGION_MISMATCH"
  | "CATEGORY_MISMATCH"
  | "NO_CAPACITY"
  | "OFFLINE"
  | "NO_PLAYLIST"
  | "STALE_SYNC"
  | "NOT_ACTIVE"
  | "COMPETITOR_CONFLICT";

interface EligibleLocation {
  id: string;
  name: string;
  city: string | null;
  regionCode: string | null;
  yodeckPlaylistId: string;
  avgVisitorsPerWeek: number;
  currentAdLoadSeconds: number;
  adSlotCapacitySecondsPerLoop: number;
  score: number;
  expectedImpressionsPerWeek: number;
  exclusivityMode: string;
}

interface RejectedLocation {
  locationId: string;
  locationName: string;
  reason: RejectionReason;
}

interface SimulationResult {
  success: boolean;
  selectedLocations: EligibleLocation[];
  rejectedLocations: RejectedLocation[];
  totalExpectedImpressions: number;
  message?: string;
}

interface ProposalResult {
  planId: string;
  status: string;
  proposedTargets: any[];
  simulationReport: any;
}

export class PlacementEngineService {
  
  /**
   * Create a new placement plan for an advertiser with a valid ad asset
   */
  async createPlan(advertiserId: string, adAssetId: string): Promise<ProposalResult | null> {
    const advertiser = await db.query.advertisers.findFirst({
      where: eq(advertisers.id, advertiserId),
    });
    
    if (!advertiser) {
      console.error("[PlacementEngine] Advertiser not found:", advertiserId);
      return null;
    }
    
    const asset = await db.query.adAssets.findFirst({
      where: and(
        eq(adAssets.id, adAssetId),
        eq(adAssets.validationStatus, "valid")
      ),
    });
    
    if (!asset) {
      console.error("[PlacementEngine] Valid ad asset not found:", adAssetId);
      return null;
    }
    
    // Safety check: Only APPROVED assets can create placement plans
    if (asset.approvalStatus !== "APPROVED") {
      console.error("[PlacementEngine] Asset not approved, cannot create plan:", adAssetId, "status:", asset.approvalStatus);
      return null;
    }
    
    const packageType = advertiser.packageType || "SINGLE";
    const requiredCount = PACKAGE_COUNTS[packageType] || 1;
    
    const [plan] = await db.insert(placementPlans).values({
      advertiserId,
      adAssetId,
      linkKey: advertiser.linkKey || "",
      status: "PROPOSED",
      packageType,
      requiredTargetCount: requiredCount,
    }).returning();
    
    console.log("[PlacementEngine] Created plan:", plan.id);
    
    const simulation = await this.simulate(plan.id);
    
    return {
      planId: plan.id,
      status: simulation.success ? "SIMULATED_OK" : "SIMULATED_FAIL",
      proposedTargets: simulation.selectedLocations.map(loc => ({
        locationId: loc.id,
        locationName: loc.name,
        yodeckPlaylistId: loc.yodeckPlaylistId,
        score: loc.score,
        expectedImpressionsPerWeek: loc.expectedImpressionsPerWeek,
        capacityBefore: loc.currentAdLoadSeconds,
        capacityAfter: loc.currentAdLoadSeconds + (advertiser.videoDurationSeconds || 15),
      })),
      simulationReport: {
        selectedCount: simulation.selectedLocations.length,
        rejectedCount: simulation.rejectedLocations.length,
        totalExpectedImpressions: simulation.totalExpectedImpressions,
        rejectedReasons: simulation.rejectedLocations,
        simulatedAt: new Date().toISOString(),
        isFresh: true,
      },
    };
  }
  
  /**
   * Run simulation for a placement plan
   * Evaluates all locations against hard constraints and ranks by score
   */
  async simulate(planId: string): Promise<SimulationResult> {
    const plan = await db.query.placementPlans.findFirst({
      where: eq(placementPlans.id, planId),
    });
    
    if (!plan) {
      return { success: false, selectedLocations: [], rejectedLocations: [], totalExpectedImpressions: 0, message: "Plan not found" };
    }
    
    const advertiser = await db.query.advertisers.findFirst({
      where: eq(advertisers.id, plan.advertiserId),
    });
    
    if (!advertiser) {
      return { success: false, selectedLocations: [], rejectedLocations: [], totalExpectedImpressions: 0, message: "Advertiser not found" };
    }
    
    const videoDuration = advertiser.videoDurationSeconds || 15;
    const targetRegions = advertiser.targetRegionCodes || [];
    const advertiserCategory = advertiser.category || null;
    const anyRegion = targetRegions.length === 0;
    const advertiserCompetitorGroup = advertiser.competitorGroup || advertiser.businessCategory || null;
    
    const allLocations = await db.query.locations.findMany({
      where: eq(locations.status, "active"),
    });
    
    // Build a map of location -> competitorGroup -> count of live placements
    // Query all active placement targets
    const existingPlacements = await db.query.placementTargets.findMany({
      where: eq(placementTargets.status, "live"),
    });
    
    // Build plan -> advertiser map for competitor lookup
    const planIds = Array.from(new Set(existingPlacements.map(p => p.planId)));
    const planAdvertiserMap = new Map<string, { competitorGroup: string | null; businessCategory: string | null }>();
    
    if (planIds.length > 0) {
      const plans = await db.query.placementPlans.findMany({
        where: inArray(placementPlans.id, planIds),
      });
      
      const advertiserIds = Array.from(new Set(plans.map(p => p.advertiserId)));
      const advList = advertiserIds.length > 0 
        ? await db.query.advertisers.findMany({ where: inArray(advertisers.id, advertiserIds) })
        : [];
      const advertiserMap = new Map(advList.map(a => [a.id, a]));
      
      for (const plan of plans) {
        const adv = advertiserMap.get(plan.advertiserId);
        if (adv) {
          planAdvertiserMap.set(plan.id, {
            competitorGroup: adv.competitorGroup || null,
            businessCategory: adv.businessCategory || null,
          });
        }
      }
    }
    
    // Map locationId -> competitorGroup -> count
    const locationCompetitorCounts = new Map<string, Map<string, number>>();
    for (const placement of existingPlacements) {
      const advData = planAdvertiserMap.get(placement.planId);
      if (advData) {
        const locId = placement.locationId;
        const compGroup = advData.competitorGroup || advData.businessCategory;
        if (compGroup) {
          if (!locationCompetitorCounts.has(locId)) {
            locationCompetitorCounts.set(locId, new Map());
          }
          const groupCounts = locationCompetitorCounts.get(locId)!;
          groupCounts.set(compGroup, (groupCounts.get(compGroup) || 0) + 1);
        }
      }
    }
    
    const eligibleLocations: EligibleLocation[] = [];
    const rejectedLocations: RejectedLocation[] = [];
    const staleThreshold = new Date(Date.now() - STALE_SYNC_THRESHOLD_MINUTES * 60 * 1000);
    
    for (const loc of allLocations) {
      if (loc.status !== "active") {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NOT_ACTIVE" });
        continue;
      }
      
      let playlistId = loc.yodeckPlaylistId;
      if (!playlistId) {
        if (loc.yodeckDeviceId) {
          console.log(`[PlacementEngine] Location ${loc.id} has no playlist, attempting auto-provision...`);
          const provisionResult = await provisionPlaylistForLocation(loc.id);
          if (provisionResult.success && provisionResult.playlistId) {
            playlistId = provisionResult.playlistId;
            console.log(`[PlacementEngine] Auto-provisioned playlist ${playlistId} for ${loc.name}`);
          } else {
            rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NO_PLAYLIST" });
            continue;
          }
        } else {
          rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NO_PLAYLIST" });
          continue;
        }
      }
      
      // Region matching: use regionCode if set, otherwise fall back to lowercase city
      const effectiveRegion = loc.regionCode || (loc.city ? loc.city.toLowerCase() : null);
      if (!anyRegion && effectiveRegion && !targetRegions.includes(effectiveRegion)) {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "REGION_MISMATCH" });
        continue;
      }
      
      if (advertiserCategory && loc.categoriesAllowed && loc.categoriesAllowed.length > 0) {
        if (!loc.categoriesAllowed.includes(advertiserCategory)) {
          rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "CATEGORY_MISMATCH" });
          continue;
        }
      }
      
      const currentLoad = loc.currentAdLoadSeconds || 0;
      const capacity = loc.adSlotCapacitySecondsPerLoop || 120;
      if (currentLoad + videoDuration > capacity) {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NO_CAPACITY" });
        continue;
      }
      
      if (loc.lastSyncAt && loc.lastSyncAt < staleThreshold) {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "STALE_SYNC" });
        continue;
      }
      
      // Competitor exclusion check based on exclusivityMode
      // STRICT = max 1 per competitorGroup, RELAXED = max 2
      if (advertiserCompetitorGroup) {
        const groupCounts = locationCompetitorCounts.get(loc.id);
        const existingCount = groupCounts?.get(advertiserCompetitorGroup) || 0;
        const threshold = loc.exclusivityMode === "RELAXED" ? 2 : 1;
        if (existingCount >= threshold) {
          rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "COMPETITOR_CONFLICT" });
          continue;
        }
      }
      
      const avgVisitors = loc.avgVisitorsPerWeek || 100;
      const expectedImpressions = Math.round(avgVisitors * VIEW_FACTOR);
      const score = expectedImpressions;
      
      eligibleLocations.push({
        id: loc.id,
        name: loc.name,
        city: loc.city,
        regionCode: loc.regionCode,
        yodeckPlaylistId: playlistId!,
        avgVisitorsPerWeek: avgVisitors,
        currentAdLoadSeconds: currentLoad,
        adSlotCapacitySecondsPerLoop: capacity,
        score,
        expectedImpressionsPerWeek: expectedImpressions,
        exclusivityMode: loc.exclusivityMode,
      });
    }
    
    eligibleLocations.sort((a, b) => b.score - a.score);
    
    const selectedLocations = this.selectWithSpread(
      eligibleLocations,
      plan.requiredTargetCount
    );
    
    const totalExpectedImpressions = selectedLocations.reduce(
      (sum, loc) => sum + loc.expectedImpressionsPerWeek,
      0
    );
    
    const success = selectedLocations.length >= plan.requiredTargetCount;
    const newStatus = success ? "SIMULATED_OK" : "SIMULATED_FAIL";
    
    await db.update(placementPlans)
      .set({
        status: newStatus,
        proposedTargets: selectedLocations.map(loc => ({
          locationId: loc.id,
          locationName: loc.name,
          yodeckPlaylistId: loc.yodeckPlaylistId,
          score: loc.score,
          expectedImpressionsPerWeek: loc.expectedImpressionsPerWeek,
          capacityBefore: loc.currentAdLoadSeconds,
          capacityAfter: loc.currentAdLoadSeconds + videoDuration,
        })),
        simulationReport: {
          selectedCount: selectedLocations.length,
          rejectedCount: rejectedLocations.length,
          totalExpectedImpressions,
          rejectedReasons: rejectedLocations,
          capacitySnapshot: selectedLocations.map(loc => ({
            locationId: loc.id,
            before: loc.currentAdLoadSeconds,
            after: loc.currentAdLoadSeconds + videoDuration,
            max: loc.adSlotCapacitySecondsPerLoop,
          })),
          simulatedAt: new Date().toISOString(),
          isFresh: true,
        },
        simulatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(placementPlans.id, planId));
    
    console.log(`[PlacementEngine] Simulation complete: ${selectedLocations.length}/${plan.requiredTargetCount} locations, status=${newStatus}`);
    
    return {
      success,
      selectedLocations,
      rejectedLocations,
      totalExpectedImpressions,
      message: success
        ? `${selectedLocations.length} locaties geselecteerd`
        : `Onvoldoende locaties: ${selectedLocations.length}/${plan.requiredTargetCount}`,
    };
  }
  
  /**
   * Select locations with city spread for multi-screen packages
   */
  private selectWithSpread(locations: EligibleLocation[], count: number): EligibleLocation[] {
    if (count <= 1) {
      return locations.slice(0, count);
    }
    
    const selected: EligibleLocation[] = [];
    const usedCities = new Set<string>();
    
    for (const loc of locations) {
      if (selected.length >= count) break;
      
      const city = loc.city || "unknown";
      if (!usedCities.has(city)) {
        selected.push(loc);
        usedCities.add(city);
      }
    }
    
    for (const loc of locations) {
      if (selected.length >= count) break;
      if (!selected.includes(loc)) {
        selected.push(loc);
      }
    }
    
    return selected;
  }
  
  /**
   * Approve a placement plan (admin action)
   */
  async approve(planId: string, userId: string): Promise<boolean> {
    const plan = await db.query.placementPlans.findFirst({
      where: eq(placementPlans.id, planId),
    });
    
    if (!plan) {
      console.log(`[PlacementPlanApproveUpdate] planId=${planId} updated=false prevStatus=NOT_FOUND newStatus=NOT_FOUND`);
      return false;
    }
    
    if (plan.status === "APPROVED" || plan.status === "PUBLISHING" || plan.status === "PUBLISHED") {
      console.log(`[PlacementPlanApproveUpdate] planId=${planId} updated=false prevStatus=${plan.status} newStatus=${plan.status} (already approved)`);
      return true;
    }
    
    if (plan.status !== "SIMULATED_OK") {
      console.log(`[PlacementPlanApproveUpdate] planId=${planId} updated=false prevStatus=${plan.status} newStatus=${plan.status} (wrong status)`);
      return false;
    }
    
    const result = await db.update(placementPlans)
      .set({
        status: "APPROVED",
        approvedTargets: plan.proposedTargets,
        approvedAt: new Date(),
        approvedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(and(eq(placementPlans.id, planId), eq(placementPlans.status, "SIMULATED_OK")))
      .returning({ id: placementPlans.id, status: placementPlans.status, approvedAt: placementPlans.approvedAt });
    
    const updated = result.length > 0;
    console.log(`[PlacementPlanApproveUpdate] planId=${planId} updated=${updated} prevStatus=SIMULATED_OK newStatus=${updated ? result[0].status : "SIMULATED_OK"}`);
    
    if (!updated) {
      const recheck = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });
      if (recheck && (recheck.status === "APPROVED" || recheck.status === "PUBLISHING" || recheck.status === "PUBLISHED")) {
        return true;
      }
      return false;
    }
    
    if (plan.proposedTargets && Array.isArray(plan.proposedTargets)) {
      for (const target of plan.proposedTargets) {
        try {
          await db.insert(placementTargets).values({
            planId,
            locationId: (target as any).locationId,
            yodeckPlaylistId: (target as any).yodeckPlaylistId,
            status: "PENDING",
            expectedImpressionsPerWeek: (target as any).expectedImpressionsPerWeek,
            score: String((target as any).score),
          });
        } catch (targetErr: any) {
          if (targetErr.code === "23505") {
            continue;
          }
          throw targetErr;
        }
      }
    }
    
    console.log("[PlacementEngine] Plan approved:", planId);
    return true;
  }
  
  /**
   * Get all placement plans (for admin queue)
   */
  async getPlans(status?: string): Promise<PlacementPlan[]> {
    if (status) {
      return await db.query.placementPlans.findMany({
        where: eq(placementPlans.status, status),
        orderBy: (plans, { desc }) => [desc(plans.createdAt)],
      });
    }
    // By default, filter out PUBLISHED and CANCELED plans (cleanup requirement)
    // Only show actionable plans in the queue
    return await db.query.placementPlans.findMany({
      where: and(
        not(eq(placementPlans.status, "PUBLISHED")),
        not(eq(placementPlans.status, "CANCELED")),
      ),
      orderBy: (plans, { desc }) => [desc(plans.createdAt)],
    });
  }
  
  /**
   * Get a single placement plan with details
   */
  async getPlan(planId: string): Promise<PlacementPlan | null> {
    const plan = await db.query.placementPlans.findFirst({
      where: eq(placementPlans.id, planId),
    });
    return plan || null;
  }
  
  /**
   * Get plan targets
   */
  async getPlanTargets(planId: string) {
    return await db.query.placementTargets.findMany({
      where: eq(placementTargets.planId, planId),
    });
  }
  
  /**
   * Get advertiser for a plan
   */
  async getPlanAdvertiser(planId: string) {
    const plan = await this.getPlan(planId);
    if (!plan) return null;
    
    return await db.query.advertisers.findFirst({
      where: eq(advertisers.id, plan.advertiserId),
    });
  }
  
  /**
   * Get ad asset for a plan
   */
  async getPlanAsset(planId: string) {
    const plan = await this.getPlan(planId);
    if (!plan) return null;
    
    return await db.query.adAssets.findFirst({
      where: eq(adAssets.id, plan.adAssetId),
    });
  }
  
  /**
   * Normalize/backfill publish error fields from publishReport
   * For plans that have status=FAILED with publishReport.error but empty lastError* fields
   * This ensures data consistency for legacy failed plans
   */
  async normalizePublishState(planId: string): Promise<{ updated: boolean; plan: PlacementPlan | null }> {
    const plan = await db.query.placementPlans.findFirst({
      where: eq(placementPlans.id, planId),
    });
    
    if (!plan) {
      return { updated: false, plan: null };
    }
    
    // Only normalize FAILED plans that have incomplete error fields
    if (plan.status !== "FAILED") {
      return { updated: false, plan };
    }
    
    const publishReport = plan.publishReport as any;
    const hasLegacyError = publishReport?.error && !plan.lastErrorCode;
    const needsFailedAt = !plan.failedAt;
    const needsLastAttemptAt = !plan.lastAttemptAt;
    
    if (!hasLegacyError && !needsFailedAt && !needsLastAttemptAt) {
      // Already normalized
      return { updated: false, plan };
    }
    
    // Parse error code from publishReport.error
    let errorCode = "YODECK_UPLOAD_FAILED";
    const errorMessage = publishReport?.error || "Unknown error";
    
    if (errorMessage.includes("UPLOAD_OK_BUT_NOT_IN_PLAYLIST")) {
      errorCode = "UPLOAD_OK_BUT_NOT_IN_PLAYLIST";
    } else if (errorMessage.includes("playlist")) {
      errorCode = "PLAYLIST_ADD_FAILED";
    } else if (errorMessage.includes("Asset not found")) {
      errorCode = "ASSET_NOT_FOUND";
    } else if (errorMessage.includes("Unsupported media type")) {
      errorCode = "YODECK_UPLOAD_FAILED";
    }
    
    // Determine timestamps
    const completedAt = publishReport?.completedAt 
      ? new Date(publishReport.completedAt) 
      : plan.updatedAt || new Date();
    
    const updateData: Record<string, any> = {};
    
    if (hasLegacyError) {
      updateData.lastErrorCode = errorCode;
      updateData.lastErrorMessage = errorMessage.substring(0, 500);
      updateData.lastErrorDetails = publishReport;
    }
    
    if (needsFailedAt) {
      updateData.failedAt = completedAt;
    }
    
    if (needsLastAttemptAt) {
      updateData.lastAttemptAt = completedAt;
    }
    
    if (Object.keys(updateData).length === 0) {
      return { updated: false, plan };
    }
    
    const [updated] = await db.update(placementPlans)
      .set(updateData)
      .where(eq(placementPlans.id, planId))
      .returning();
    
    console.log(`[PlacementEngine] Normalized plan ${planId}: ${JSON.stringify(updateData)}`);
    return { updated: true, plan: updated };
  }
  
  /**
   * Normalize all FAILED plans that have incomplete error fields
   * Returns count of updated plans
   */
  async normalizeAllFailedPlans(): Promise<{ updatedCount: number; processedCount: number }> {
    // Find all FAILED plans
    const failedPlans = await db.query.placementPlans.findMany({
      where: eq(placementPlans.status, "FAILED"),
    });
    
    let updatedCount = 0;
    
    for (const plan of failedPlans) {
      const result = await this.normalizePublishState(plan.id);
      if (result.updated) {
        updatedCount++;
      }
    }
    
    console.log(`[PlacementEngine] Normalized ${updatedCount}/${failedPlans.length} failed plans`);
    return { updatedCount, processedCount: failedPlans.length };
  }
  
  /**
   * Dry-run simulation for capacity gating
   * Same logic as simulate() but without creating or updating records
   */
  async dryRunSimulate(input: {
    packageType: string;
    businessCategory: string;
    competitorGroup?: string;
    targetRegionCodes?: string[];
    videoDurationSeconds?: number;
  }): Promise<SimulationResult> {
    const requiredCount = PACKAGE_COUNTS[input.packageType] || 1;
    const videoDuration = input.videoDurationSeconds || 15;
    const targetRegions = input.targetRegionCodes || [];
    const advertiserCategory = input.businessCategory;
    const anyRegion = targetRegions.length === 0;
    const advertiserCompetitorGroup = input.competitorGroup || input.businessCategory;
    
    const allLocations = await db.query.locations.findMany({
      where: eq(locations.status, "active"),
    });
    
    // Build a map of location -> competitorGroup -> count of live placements
    const existingPlacements = await db.query.placementTargets.findMany({
      where: eq(placementTargets.status, "live"),
    });
    
    // Build plan -> advertiser map for competitor lookup
    const dryRunPlanIds = Array.from(new Set(existingPlacements.map(p => p.planId)));
    const dryRunPlanAdvMap = new Map<string, { competitorGroup: string | null; businessCategory: string | null }>();
    
    if (dryRunPlanIds.length > 0) {
      const plans = await db.query.placementPlans.findMany({
        where: inArray(placementPlans.id, dryRunPlanIds),
      });
      
      const advIds = Array.from(new Set(plans.map(p => p.advertiserId)));
      const advList = advIds.length > 0 
        ? await db.query.advertisers.findMany({ where: inArray(advertisers.id, advIds) })
        : [];
      const advMap = new Map(advList.map(a => [a.id, a]));
      
      for (const plan of plans) {
        const adv = advMap.get(plan.advertiserId);
        if (adv) {
          dryRunPlanAdvMap.set(plan.id, {
            competitorGroup: adv.competitorGroup || null,
            businessCategory: adv.businessCategory || null,
          });
        }
      }
    }
    
    const locationCompetitorCounts = new Map<string, Map<string, number>>();
    for (const placement of existingPlacements) {
      const advData = dryRunPlanAdvMap.get(placement.planId);
      if (advData) {
        const locId = placement.locationId;
        const compGroup = advData.competitorGroup || advData.businessCategory;
        if (compGroup) {
          if (!locationCompetitorCounts.has(locId)) {
            locationCompetitorCounts.set(locId, new Map());
          }
          const groupCounts = locationCompetitorCounts.get(locId)!;
          groupCounts.set(compGroup, (groupCounts.get(compGroup) || 0) + 1);
        }
      }
    }
    
    const eligibleLocations: EligibleLocation[] = [];
    const rejectedLocations: RejectedLocation[] = [];
    const staleThreshold = new Date(Date.now() - STALE_SYNC_THRESHOLD_MINUTES * 60 * 1000);
    
    for (const loc of allLocations) {
      if (loc.status !== "active") {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NOT_ACTIVE" });
        continue;
      }
      
      let playlistId = loc.yodeckPlaylistId;
      if (!playlistId) {
        if (loc.yodeckDeviceId) {
          console.log(`[PlacementEngine] Location ${loc.id} has no playlist, attempting auto-provision...`);
          const provisionResult = await provisionPlaylistForLocation(loc.id);
          if (provisionResult.success && provisionResult.playlistId) {
            playlistId = provisionResult.playlistId;
            console.log(`[PlacementEngine] Auto-provisioned playlist ${playlistId} for ${loc.name}`);
          } else {
            rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NO_PLAYLIST" });
            continue;
          }
        } else {
          rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NO_PLAYLIST" });
          continue;
        }
      }
      
      // Region matching: use regionCode if set, otherwise fall back to lowercase city
      const effectiveRegion = loc.regionCode || (loc.city ? loc.city.toLowerCase() : null);
      if (!anyRegion && effectiveRegion && !targetRegions.includes(effectiveRegion)) {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "REGION_MISMATCH" });
        continue;
      }
      
      if (advertiserCategory && loc.categoriesAllowed && loc.categoriesAllowed.length > 0) {
        if (!loc.categoriesAllowed.includes(advertiserCategory)) {
          rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "CATEGORY_MISMATCH" });
          continue;
        }
      }
      
      const currentLoad = loc.currentAdLoadSeconds || 0;
      const capacity = loc.adSlotCapacitySecondsPerLoop || 120;
      if (currentLoad + videoDuration > capacity) {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "NO_CAPACITY" });
        continue;
      }
      
      if (loc.lastSyncAt && loc.lastSyncAt < staleThreshold) {
        rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "STALE_SYNC" });
        continue;
      }
      
      // Competitor exclusion check
      if (advertiserCompetitorGroup) {
        const groupCounts = locationCompetitorCounts.get(loc.id);
        const existingCount = groupCounts?.get(advertiserCompetitorGroup) || 0;
        const threshold = loc.exclusivityMode === "RELAXED" ? 2 : 1;
        if (existingCount >= threshold) {
          rejectedLocations.push({ locationId: loc.id, locationName: loc.name, reason: "COMPETITOR_CONFLICT" });
          continue;
        }
      }
      
      const avgVisitors = loc.avgVisitorsPerWeek || 100;
      const expectedImpressions = Math.round(avgVisitors * VIEW_FACTOR);
      const score = expectedImpressions;
      
      eligibleLocations.push({
        id: loc.id,
        name: loc.name,
        city: loc.city,
        regionCode: loc.regionCode,
        yodeckPlaylistId: playlistId!,
        avgVisitorsPerWeek: avgVisitors,
        currentAdLoadSeconds: currentLoad,
        adSlotCapacitySecondsPerLoop: capacity,
        score,
        expectedImpressionsPerWeek: expectedImpressions,
        exclusivityMode: loc.exclusivityMode,
      });
    }
    
    eligibleLocations.sort((a, b) => b.score - a.score);
    
    const selectedLocations = this.selectWithSpread(eligibleLocations, requiredCount);
    
    const totalExpectedImpressions = selectedLocations.reduce(
      (sum, loc) => sum + loc.expectedImpressionsPerWeek,
      0
    );
    
    const success = selectedLocations.length >= requiredCount;
    
    return {
      success,
      selectedLocations,
      rejectedLocations,
      totalExpectedImpressions,
      message: success 
        ? `${selectedLocations.length} locaties beschikbaar` 
        : `Slechts ${selectedLocations.length} van ${requiredCount} locaties beschikbaar`,
    };
  }
}

export const placementEngine = new PlacementEngineService();
