/**
 * Revenue Allocation Service
 * Distributes advertiser revenue across screens based on weighted screen-days
 * 
 * Business Logic:
 * 1. For each advertiser, get total invoiced revenue for the month
 * 2. Determine which screens were active (via placements) during that month
 * 3. Calculate screen-days for each screen (number of active days)
 * 4. Apply visitor weight staffel based on location's visitorsPerWeek
 * 5. Calculate allocation score = screen-days × visitor-weight
 * 6. Distribute revenue proportionally based on allocation scores
 */

import { db } from "../db";
import { sql, eq, and, gte, lte, desc } from "drizzle-orm";
import * as schema from "@shared/schema";
import { format, startOfMonth, endOfMonth, differenceInDays, min, max } from "date-fns";

// Visitor weight staffels
const VISITOR_WEIGHT_STAFFELS = [
  { minVisitors: 0, maxVisitors: 300, weight: 0.8 },
  { minVisitors: 301, maxVisitors: 700, weight: 1.0 },
  { minVisitors: 701, maxVisitors: 1500, weight: 1.2 },
  { minVisitors: 1501, maxVisitors: Infinity, weight: 1.5 },
];

interface AllocationInput {
  periodYear: number;
  periodMonth: number;
  advertiserId?: string; // Optional: allocate for specific advertiser only
  dryRun?: boolean; // If true, don't save to database
}

interface ScreenAllocation {
  screenId: string;
  screenName: string;
  locationId: string | null;
  locationName: string | null;
  screenDays: number;
  visitorsPerWeek: number;
  visitorWeight: number;
  weightOverride: number | null;
  allocationScore: number;
  allocationPercent: number;
  allocatedRevenue: number;
}

interface AdvertiserAllocation {
  advertiserId: string;
  advertiserName: string;
  totalRevenue: number;
  screenAllocations: ScreenAllocation[];
  moneybirdInvoiceIds: string[];
}

interface AllocationResult {
  periodYear: number;
  periodMonth: number;
  advertiserAllocations: AdvertiserAllocation[];
  totalAllocated: number;
  createdAt: Date;
}

/**
 * Get visitor weight based on visitors per week
 */
function getVisitorWeight(visitorsPerWeek: number): number {
  for (const staffel of VISITOR_WEIGHT_STAFFELS) {
    if (visitorsPerWeek >= staffel.minVisitors && visitorsPerWeek <= staffel.maxVisitors) {
      return staffel.weight;
    }
  }
  return 1.0; // Default weight
}

/**
 * Calculate the number of days a placement was active in a given month
 */
function calculateScreenDays(
  placementStart: Date,
  placementEnd: Date | null,
  monthStart: Date,
  monthEnd: Date
): number {
  const effectiveStart = placementStart > monthStart ? placementStart : monthStart;
  const effectiveEnd = placementEnd && placementEnd < monthEnd ? placementEnd : monthEnd;
  
  if (effectiveStart > effectiveEnd) return 0;
  
  return differenceInDays(effectiveEnd, effectiveStart) + 1;
}

/**
 * Get total invoiced revenue for an advertiser in a given month
 * This queries the Moneybird invoice data synced to our database
 */
async function getAdvertiserMonthlyRevenue(
  advertiserId: string,
  periodYear: number,
  periodMonth: number
): Promise<{ totalRevenue: number; invoiceIds: string[] }> {
  // Get advertiser to find their Moneybird contact
  const [advertiser] = await db.select().from(schema.advertisers)
    .where(eq(schema.advertisers.id, advertiserId));
  
  if (!advertiser || !advertiser.moneybirdContactId) {
    return { totalRevenue: 0, invoiceIds: [] };
  }

  // Query invoices from our synced invoice data
  // Use periodStart/periodEnd for date filtering and amountExVat for revenue
  const monthStart = new Date(periodYear, periodMonth - 1, 1);
  const monthEnd = endOfMonth(monthStart);

  const invoices = await db.select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.advertiserId, advertiserId),
        gte(schema.invoices.periodStart, format(monthStart, "yyyy-MM-dd")),
        lte(schema.invoices.periodEnd, format(monthEnd, "yyyy-MM-dd"))
      )
    );

  const totalRevenue = invoices.reduce((sum, inv) => {
    return sum + parseFloat(inv.amountExVat || "0");
  }, 0);

  const invoiceIds = invoices.map(inv => inv.moneybirdInvoiceId).filter(Boolean) as string[];

  return { totalRevenue, invoiceIds };
}

/**
 * Get active screens for an advertiser in a given month via placements
 */
async function getActiveScreensForAdvertiser(
  advertiserId: string,
  periodYear: number,
  periodMonth: number
): Promise<{
  screenId: string;
  screenName: string;
  locationId: string | null;
  locationName: string | null;
  visitorsPerWeek: number;
  screenDays: number;
  weightOverride: number | null;
}[]> {
  const monthStart = new Date(periodYear, periodMonth - 1, 1);
  const monthEnd = endOfMonth(monthStart);

  // Get contracts for this advertiser
  const contracts = await db.select().from(schema.contracts)
    .where(eq(schema.contracts.advertiserId, advertiserId));

  if (contracts.length === 0) return [];

  const contractIds = contracts.map(c => c.id);

  // Get placements for these contracts
  const placements = await db.select()
    .from(schema.placements)
    .where(sql`${schema.placements.contractId} = ANY(${contractIds})`);

  const screenAllocations: {
    screenId: string;
    screenName: string;
    locationId: string | null;
    locationName: string | null;
    visitorsPerWeek: number;
    screenDays: number;
    weightOverride: number | null;
  }[] = [];

  for (const placement of placements) {
    if (!placement.screenId) continue;

    // Check if placement was active during this month
    const placementStart = placement.startDate ? new Date(placement.startDate) : new Date(0);
    const placementEnd = placement.endDate ? new Date(placement.endDate) : null;

    const screenDays = calculateScreenDays(placementStart, placementEnd, monthStart, monthEnd);
    if (screenDays === 0) continue;

    // Get screen info
    const [screen] = await db.select().from(schema.screens)
      .where(eq(schema.screens.id, placement.screenId));
    
    if (!screen) continue;

    // Get location info if available
    let locationId: string | null = null;
    let locationName: string | null = null;
    let visitorsPerWeek = 500; // Default visitors

    if (screen.locationId) {
      const [location] = await db.select().from(schema.locations)
        .where(eq(schema.locations.id, screen.locationId));
      
      if (location) {
        locationId = location.id;
        locationName = location.name;
        visitorsPerWeek = location.visitorsPerWeek || 500;
      }
    }

    screenAllocations.push({
      screenId: screen.id,
      screenName: screen.name || screen.screenId,
      locationId,
      locationName,
      visitorsPerWeek,
      screenDays,
      weightOverride: null, // Can be overridden per allocation
    });
  }

  return screenAllocations;
}

/**
 * Main allocation function - calculate and optionally save revenue allocations
 */
export async function calculateRevenueAllocations(input: AllocationInput): Promise<AllocationResult> {
  const { periodYear, periodMonth, advertiserId, dryRun = false } = input;

  const advertiserAllocations: AdvertiserAllocation[] = [];
  let totalAllocated = 0;

  // Get advertisers to process
  let advertisers: typeof schema.advertisers.$inferSelect[];
  if (advertiserId) {
    const [adv] = await db.select().from(schema.advertisers)
      .where(eq(schema.advertisers.id, advertiserId));
    advertisers = adv ? [adv] : [];
  } else {
    advertisers = await db.select().from(schema.advertisers)
      .where(eq(schema.advertisers.status, "active"));
  }

  for (const advertiser of advertisers) {
    // Get total revenue for this advertiser this month
    const { totalRevenue, invoiceIds } = await getAdvertiserMonthlyRevenue(
      advertiser.id,
      periodYear,
      periodMonth
    );

    if (totalRevenue === 0) continue; // No revenue to allocate

    // Get active screens
    const screenData = await getActiveScreensForAdvertiser(
      advertiser.id,
      periodYear,
      periodMonth
    );

    if (screenData.length === 0) continue; // No active screens

    // Calculate allocation scores
    const screenAllocations: ScreenAllocation[] = [];
    let totalScore = 0;

    for (const screen of screenData) {
      const visitorWeight = screen.weightOverride || getVisitorWeight(screen.visitorsPerWeek);
      const allocationScore = screen.screenDays * visitorWeight;
      totalScore += allocationScore;

      screenAllocations.push({
        screenId: screen.screenId,
        screenName: screen.screenName,
        locationId: screen.locationId,
        locationName: screen.locationName,
        screenDays: screen.screenDays,
        visitorsPerWeek: screen.visitorsPerWeek,
        visitorWeight,
        weightOverride: screen.weightOverride,
        allocationScore,
        allocationPercent: 0, // Will be calculated below
        allocatedRevenue: 0, // Will be calculated below
      });
    }

    // Calculate percentages and allocated revenue
    for (const allocation of screenAllocations) {
      allocation.allocationPercent = totalScore > 0 
        ? (allocation.allocationScore / totalScore) * 100 
        : 0;
      allocation.allocatedRevenue = totalScore > 0
        ? (allocation.allocationScore / totalScore) * totalRevenue
        : 0;
    }

    advertiserAllocations.push({
      advertiserId: advertiser.id,
      advertiserName: advertiser.companyName,
      totalRevenue,
      screenAllocations,
      moneybirdInvoiceIds: invoiceIds,
    });

    totalAllocated += totalRevenue;
  }

  // Save allocations to database if not dry run
  if (!dryRun) {
    for (const advAllocation of advertiserAllocations) {
      for (const screenAlloc of advAllocation.screenAllocations) {
        await db.execute(sql`
          INSERT INTO revenue_allocations (
            period_year, period_month, advertiser_id, screen_id, location_id,
            screen_days, visitor_weight, weight_override, allocation_score,
            total_score_for_advertiser, advertiser_revenue_month, allocated_revenue,
            moneybird_invoice_ids
          ) VALUES (
            ${periodYear}, ${periodMonth}, ${advAllocation.advertiserId}, ${screenAlloc.screenId}, ${screenAlloc.locationId},
            ${screenAlloc.screenDays}, ${screenAlloc.visitorWeight}, ${screenAlloc.weightOverride}, ${screenAlloc.allocationScore},
            ${advAllocation.screenAllocations.reduce((sum, s) => sum + s.allocationScore, 0)}, ${advAllocation.totalRevenue}, ${screenAlloc.allocatedRevenue},
            ${JSON.stringify(advAllocation.moneybirdInvoiceIds)}
          )
          ON CONFLICT DO NOTHING
        `);
      }
    }
  }

  return {
    periodYear,
    periodMonth,
    advertiserAllocations,
    totalAllocated,
    createdAt: new Date(),
  };
}

/**
 * Get allocations for a specific period
 */
export async function getAllocationsForPeriod(
  periodYear: number,
  periodMonth: number
): Promise<any[]> {
  const result = await db.execute(sql`
    SELECT 
      ra.*,
      a.company_name as advertiser_name,
      s.name as screen_name,
      l.name as location_name
    FROM revenue_allocations ra
    LEFT JOIN advertisers a ON ra.advertiser_id = a.id
    LEFT JOIN screens s ON ra.screen_id = s.id
    LEFT JOIN locations l ON ra.location_id = l.id
    WHERE ra.period_year = ${periodYear} AND ra.period_month = ${periodMonth}
    ORDER BY ra.advertiser_id, ra.allocated_revenue DESC
  `);
  return result.rows;
}

/**
 * Calculate location payouts based on allocations
 */
export async function calculateLocationPayouts(
  periodYear: number,
  periodMonth: number,
  dryRun = false
): Promise<{
  locationId: string;
  locationName: string;
  totalAllocatedRevenue: number;
  payoutType: string;
  revenueSharePercent: number | null;
  fixedAmount: number | null;
  payoutAmount: number;
  minimumThreshold: number;
  carriedOver: boolean;
}[]> {
  // Get all allocations for this period grouped by location
  const allocations = await db.execute(sql`
    SELECT 
      ra.location_id,
      l.name as location_name,
      l.payout_type,
      l.fixed_payout_amount,
      l.revenue_share_percent,
      SUM(ra.allocated_revenue) as total_allocated
    FROM revenue_allocations ra
    LEFT JOIN locations l ON ra.location_id = l.id
    WHERE ra.period_year = ${periodYear} AND ra.period_month = ${periodMonth}
      AND ra.location_id IS NOT NULL
    GROUP BY ra.location_id, l.name, l.payout_type, l.fixed_payout_amount, l.revenue_share_percent
  `);

  const payouts: {
    locationId: string;
    locationName: string;
    totalAllocatedRevenue: number;
    payoutType: string;
    revenueSharePercent: number | null;
    fixedAmount: number | null;
    payoutAmount: number;
    minimumThreshold: number;
    carriedOver: boolean;
  }[] = [];

  const MINIMUM_PAYOUT_THRESHOLD = 25.00; // Minimum €25 for payout

  for (const row of allocations.rows as any[]) {
    const totalAllocated = parseFloat(row.total_allocated || "0");
    const payoutType = row.payout_type || "revshare";
    const revenueSharePercent = row.revenue_share_percent ? parseFloat(row.revenue_share_percent) : 20; // Default 20%
    const fixedAmount = row.fixed_payout_amount ? parseFloat(row.fixed_payout_amount) : null;

    // Calculate payout based on type
    let payoutAmount: number;
    if (payoutType === "fixed" && fixedAmount !== null) {
      payoutAmount = fixedAmount;
    } else {
      payoutAmount = totalAllocated * (revenueSharePercent / 100);
    }

    // Check minimum threshold
    const carriedOver = payoutAmount < MINIMUM_PAYOUT_THRESHOLD;

    payouts.push({
      locationId: row.location_id,
      locationName: row.location_name || "Onbekende locatie",
      totalAllocatedRevenue: totalAllocated,
      payoutType,
      revenueSharePercent,
      fixedAmount,
      payoutAmount: carriedOver ? 0 : payoutAmount,
      minimumThreshold: MINIMUM_PAYOUT_THRESHOLD,
      carriedOver,
    });

    // Save to database if not dry run
    if (!dryRun) {
      await db.execute(sql`
        INSERT INTO location_payouts (
          period_year, period_month, location_id, allocated_revenue_total,
          payout_type, revenue_share_percent, fixed_amount, payout_amount,
          minimum_threshold, carried_over, status
        ) VALUES (
          ${periodYear}, ${periodMonth}, ${row.location_id}, ${totalAllocated},
          ${payoutType}, ${revenueSharePercent}, ${fixedAmount}, ${carriedOver ? 0 : payoutAmount},
          ${MINIMUM_PAYOUT_THRESHOLD}, ${carriedOver}, 'pending'
        )
        ON CONFLICT DO NOTHING
      `);
    }
  }

  return payouts;
}

/**
 * Get visitor weight staffels for display
 */
export function getVisitorWeightStaffels() {
  return VISITOR_WEIGHT_STAFFELS.map(s => ({
    minVisitors: s.minVisitors,
    maxVisitors: s.maxVisitors === Infinity ? null : s.maxVisitors,
    weight: s.weight,
    label: s.maxVisitors === Infinity 
      ? `${s.minVisitors}+ bezoekers/week` 
      : `${s.minVisitors}-${s.maxVisitors} bezoekers/week`,
  }));
}
