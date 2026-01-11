/**
 * Monthly Reporting Service
 * Generates and sends monthly reports to advertisers and locations
 * 
 * Report Types:
 * - ADVERTISER: Active screens, invoice status, spending summary
 * - LOCATION: Allocated revenue, payout status, screen performance
 */

import { db } from "../db";
import { sql, eq, and, gte, lte, desc } from "drizzle-orm";
import * as schema from "@shared/schema";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { nl } from "date-fns/locale";
import { sendEmail, baseEmailTemplate, type BodyBlock } from "../email";

interface ReportPeriod {
  year: number;
  month: number;
}

interface AdvertiserReportData {
  advertiserId: string;
  advertiserName: string;
  contactEmail: string | null;
  contactName: string | null;
  activeScreens: {
    screenId: string;
    screenName: string;
    location: string;
    daysActive: number;
  }[];
  invoices: {
    invoiceNumber: string | null;
    amount: string;
    status: string;
  }[];
  totalSpent: number;
  periodLabel: string;
}

interface LocationReportData {
  locationId: string;
  locationName: string;
  contactEmail: string | null;
  contactName: string | null;
  allocatedRevenue: number;
  payoutAmount: number;
  payoutStatus: string;
  carriedOver: boolean;
  screens: {
    screenId: string;
    screenName: string;
    allocationPercent: number;
  }[];
  periodLabel: string;
}

/**
 * Generate advertiser monthly report
 */
async function generateAdvertiserReport(
  advertiserId: string,
  period: ReportPeriod
): Promise<AdvertiserReportData | null> {
  const [advertiser] = await db.select().from(schema.advertisers)
    .where(eq(schema.advertisers.id, advertiserId));
  
  if (!advertiser) return null;

  const monthStart = new Date(period.year, period.month - 1, 1);
  const monthEnd = endOfMonth(monthStart);
  const periodLabel = format(monthStart, "MMMM yyyy", { locale: nl });

  // Get invoices for this period
  const invoices = await db.select()
    .from(schema.invoices)
    .where(
      and(
        eq(schema.invoices.advertiserId, advertiserId),
        gte(schema.invoices.periodStart, format(monthStart, "yyyy-MM-dd")),
        lte(schema.invoices.periodEnd, format(monthEnd, "yyyy-MM-dd"))
      )
    );

  const totalSpent = invoices.reduce((sum, inv) => sum + parseFloat(inv.amountExVat || "0"), 0);

  // Get active screens via placements
  const contracts = await db.select().from(schema.contracts)
    .where(eq(schema.contracts.advertiserId, advertiserId));
  
  const activeScreens: AdvertiserReportData["activeScreens"] = [];
  
  for (const contract of contracts) {
    const placements = await db.select().from(schema.placements)
      .where(eq(schema.placements.contractId, contract.id));
    
    for (const placement of placements) {
      if (!placement.screenId) continue;
      
      const [screen] = await db.select().from(schema.screens)
        .where(eq(schema.screens.id, placement.screenId));
      
      if (screen) {
        let locationName = "Onbekende locatie";
        if (screen.locationId) {
          const [location] = await db.select().from(schema.locations)
            .where(eq(schema.locations.id, screen.locationId));
          if (location) locationName = location.name;
        }
        
        // Calculate days active in this period
        const placementStart = placement.startDate ? new Date(placement.startDate) : new Date(0);
        const placementEnd = placement.endDate ? new Date(placement.endDate) : monthEnd;
        const effectiveStart = placementStart > monthStart ? placementStart : monthStart;
        const effectiveEnd = placementEnd < monthEnd ? placementEnd : monthEnd;
        const daysActive = Math.max(0, Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1);

        activeScreens.push({
          screenId: screen.screenId,
          screenName: screen.name || screen.screenId,
          location: locationName,
          daysActive,
        });
      }
    }
  }

  return {
    advertiserId: advertiser.id,
    advertiserName: advertiser.companyName,
    contactEmail: advertiser.email,
    contactName: advertiser.contactName,
    activeScreens,
    invoices: invoices.map(inv => ({
      invoiceNumber: inv.invoiceNumber,
      amount: inv.amountExVat,
      status: inv.status,
    })),
    totalSpent,
    periodLabel,
  };
}

/**
 * Generate location monthly report
 */
async function generateLocationReport(
  locationId: string,
  period: ReportPeriod
): Promise<LocationReportData | null> {
  const [location] = await db.select().from(schema.locations)
    .where(eq(schema.locations.id, locationId));
  
  if (!location) return null;

  const monthStart = new Date(period.year, period.month - 1, 1);
  const periodLabel = format(monthStart, "MMMM yyyy", { locale: nl });

  // Get allocations for this location
  const allocations = await db.execute(sql`
    SELECT 
      ra.screen_id,
      ra.allocated_revenue,
      ra.allocation_score,
      s.screen_id as screen_code,
      s.name as screen_name
    FROM revenue_allocations ra
    LEFT JOIN screens s ON ra.screen_id = s.id
    WHERE ra.location_id = ${locationId}
      AND ra.period_year = ${period.year}
      AND ra.period_month = ${period.month}
  `);

  const screens: LocationReportData["screens"] = [];
  let totalAllocated = 0;
  let totalScore = 0;

  for (const row of allocations.rows as any[]) {
    totalAllocated += parseFloat(row.allocated_revenue || "0");
    totalScore += parseFloat(row.allocation_score || "0");
  }

  for (const row of allocations.rows as any[]) {
    const allocationPercent = totalScore > 0 
      ? (parseFloat(row.allocation_score || "0") / totalScore) * 100 
      : 0;
    screens.push({
      screenId: row.screen_code || row.screen_id,
      screenName: row.screen_name || row.screen_code || "Onbekend",
      allocationPercent,
    });
  }

  // Get payout for this location
  const payouts = await db.execute(sql`
    SELECT * FROM location_payouts
    WHERE location_id = ${locationId}
      AND period_year = ${period.year}
      AND period_month = ${period.month}
    LIMIT 1
  `);

  const payout = payouts.rows[0] as any;

  return {
    locationId: location.id,
    locationName: location.name,
    contactEmail: location.email,
    contactName: location.contactName,
    allocatedRevenue: totalAllocated,
    payoutAmount: payout ? parseFloat(payout.payout_amount || "0") : 0,
    payoutStatus: payout?.status || "pending",
    carriedOver: payout?.carried_over || false,
    screens,
    periodLabel,
  };
}

/**
 * Generate HTML email for advertiser report
 */
function generateAdvertiserReportEmail(data: AdvertiserReportData): { html: string; text: string } {
  const blocks: BodyBlock[] = [
    { type: "paragraph", content: `Hallo ${data.contactName || ""},` },
    { type: "paragraph", content: `Hieronder vindt u het maandoverzicht voor ${data.periodLabel}.` },
  ];

  // Active screens section
  if (data.activeScreens.length > 0) {
    blocks.push({ type: "paragraph", content: "<strong>Actieve Schermen</strong>" });
    const screenItems = data.activeScreens.map(s => 
      `${s.screenName} (${s.location}) - ${s.daysActive} dagen actief`
    );
    blocks.push({ type: "bullets", items: screenItems });
  }

  // Invoice summary
  if (data.invoices.length > 0) {
    blocks.push({ type: "paragraph", content: "<strong>Facturen</strong>" });
    const invoiceRows = data.invoices.map(inv => ({
      label: inv.invoiceNumber || "Concept",
      value: `€ ${parseFloat(inv.amount).toFixed(2)} (${inv.status})`,
    }));
    blocks.push({ type: "infoCard", rows: invoiceRows });
  }

  // Total
  blocks.push({ 
    type: "infoCard", 
    rows: [{ label: "Totaal uitgegeven", value: `<strong>€ ${data.totalSpent.toFixed(2)}</strong>` }] 
  });

  blocks.push({ 
    type: "paragraph", 
    content: "Heeft u vragen over dit overzicht? Neem gerust contact met ons op." 
  });

  return baseEmailTemplate({
    subject: `Maandoverzicht ${data.periodLabel} – ${data.advertiserName}`,
    preheader: `Uw advertentie-overzicht voor ${data.periodLabel}`,
    title: "Maandoverzicht",
    bodyBlocks: blocks,
    footerNote: "Dit is een automatisch gegenereerd rapport van Elevizion.",
  });
}

/**
 * Generate HTML email for location report
 */
function generateLocationReportEmail(data: LocationReportData): { html: string; text: string } {
  const blocks: BodyBlock[] = [
    { type: "paragraph", content: `Hallo ${data.contactName || ""},` },
    { type: "paragraph", content: `Hieronder vindt u het uitbetalingsoverzicht voor ${data.periodLabel}.` },
  ];

  // Revenue summary
  blocks.push({ 
    type: "infoCard", 
    rows: [
      { label: "Toegerekende omzet", value: `€ ${data.allocatedRevenue.toFixed(2)}` },
      { label: "Uw uitbetaling", value: `<strong>€ ${data.payoutAmount.toFixed(2)}</strong>` },
      { label: "Status", value: data.carriedOver ? "Overgedragen (onder minimum)" : data.payoutStatus },
    ] 
  });

  // Screen breakdown
  if (data.screens.length > 0) {
    blocks.push({ type: "paragraph", content: "<strong>Verdeling per Scherm</strong>" });
    const screenItems = data.screens.map(s => 
      `${s.screenName}: ${s.allocationPercent.toFixed(1)}%`
    );
    blocks.push({ type: "bullets", items: screenItems });
  }

  if (data.carriedOver) {
    blocks.push({ 
      type: "paragraph", 
      content: "<em>Het uit te betalen bedrag is onder het minimum (€25). Het bedrag wordt overgedragen naar de volgende periode.</em>" 
    });
  }

  blocks.push({ 
    type: "paragraph", 
    content: "Heeft u vragen over dit overzicht? Neem gerust contact met ons op." 
  });

  return baseEmailTemplate({
    subject: `Uitbetalingsoverzicht ${data.periodLabel} – ${data.locationName}`,
    preheader: `Uw uitbetalingsoverzicht voor ${data.periodLabel}`,
    title: "Uitbetalingsoverzicht",
    bodyBlocks: blocks,
    footerNote: "Dit is een automatisch gegenereerd rapport van Elevizion.",
  });
}

/**
 * Generate and optionally send all advertiser reports for a period
 */
export async function generateAdvertiserReports(
  period: ReportPeriod,
  sendEmails = false
): Promise<{ generated: number; sent: number; errors: string[] }> {
  const advertisers = await db.select().from(schema.advertisers)
    .where(eq(schema.advertisers.status, "active"));

  let generated = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const advertiser of advertisers) {
    try {
      const reportData = await generateAdvertiserReport(advertiser.id, period);
      if (!reportData) continue;

      // Save report to database
      await db.execute(sql`
        INSERT INTO monthly_reports (
          period_year, period_month, report_type, entity_id, entity_name,
          report_data, status, generated_at
        ) VALUES (
          ${period.year}, ${period.month}, 'advertiser', ${advertiser.id}, ${advertiser.companyName},
          ${JSON.stringify(reportData)}, 'generated', NOW()
        )
        ON CONFLICT DO NOTHING
      `);

      generated++;

      // Send email if requested and email available
      if (sendEmails && reportData.contactEmail) {
        try {
          const { html, text } = generateAdvertiserReportEmail(reportData);
          await sendEmail({
            to: reportData.contactEmail,
            subject: `Maandoverzicht ${reportData.periodLabel} – ${reportData.advertiserName}`,
            html,
            text,
            templateKey: "monthly_report_advertiser",
          });

          await db.execute(sql`
            UPDATE monthly_reports
            SET status = 'sent', sent_at = NOW(), sent_to_email = ${reportData.contactEmail}
            WHERE period_year = ${period.year} AND period_month = ${period.month}
              AND entity_id = ${advertiser.id} AND report_type = 'advertiser'
          `);

          sent++;
        } catch (emailError: any) {
          errors.push(`Email naar ${advertiser.companyName}: ${emailError.message}`);
        }
      }
    } catch (error: any) {
      errors.push(`Rapport ${advertiser.companyName}: ${error.message}`);
    }
  }

  return { generated, sent, errors };
}

/**
 * Generate and optionally send all location reports for a period
 */
export async function generateLocationReports(
  period: ReportPeriod,
  sendEmails = false
): Promise<{ generated: number; sent: number; errors: string[] }> {
  const locations = await db.select().from(schema.locations)
    .where(eq(schema.locations.status, "active"));

  let generated = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const location of locations) {
    try {
      const reportData = await generateLocationReport(location.id, period);
      if (!reportData) continue;

      // Save report to database
      await db.execute(sql`
        INSERT INTO monthly_reports (
          period_year, period_month, report_type, entity_id, entity_name,
          report_data, status, generated_at
        ) VALUES (
          ${period.year}, ${period.month}, 'location', ${location.id}, ${location.name},
          ${JSON.stringify(reportData)}, 'generated', NOW()
        )
        ON CONFLICT DO NOTHING
      `);

      generated++;

      // Send email if requested and email available
      if (sendEmails && reportData.contactEmail) {
        try {
          const { html, text } = generateLocationReportEmail(reportData);
          await sendEmail({
            to: reportData.contactEmail,
            subject: `Uitbetalingsoverzicht ${reportData.periodLabel} – ${reportData.locationName}`,
            html,
            text,
            templateKey: "monthly_report_location",
          });

          await db.execute(sql`
            UPDATE monthly_reports
            SET status = 'sent', sent_at = NOW(), sent_to_email = ${reportData.contactEmail}
            WHERE period_year = ${period.year} AND period_month = ${period.month}
              AND entity_id = ${location.id} AND report_type = 'location'
          `);

          sent++;
        } catch (emailError: any) {
          errors.push(`Email naar ${location.name}: ${emailError.message}`);
        }
      }
    } catch (error: any) {
      errors.push(`Rapport ${location.name}: ${error.message}`);
    }
  }

  return { generated, sent, errors };
}

/**
 * Get all reports for a period
 */
export async function getReportsForPeriod(
  period: ReportPeriod,
  reportType?: "advertiser" | "location"
): Promise<any[]> {
  let query = sql`
    SELECT * FROM monthly_reports
    WHERE period_year = ${period.year} AND period_month = ${period.month}
  `;

  if (reportType) {
    query = sql`
      SELECT * FROM monthly_reports
      WHERE period_year = ${period.year} AND period_month = ${period.month}
        AND report_type = ${reportType}
    `;
  }

  const result = await db.execute(query);
  return result.rows;
}

/**
 * Resend a specific report
 */
export async function resendReport(reportId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT * FROM monthly_reports WHERE id = ${reportId}
  `);

  const report = result.rows[0] as any;
  if (!report) return false;

  const reportData = report.report_data as any;
  if (!reportData.contactEmail) return false;

  const { html, text } = report.report_type === "advertiser"
    ? generateAdvertiserReportEmail(reportData)
    : generateLocationReportEmail(reportData);

  await sendEmail({
    to: reportData.contactEmail,
    subject: report.report_type === "advertiser"
      ? `Maandoverzicht ${reportData.periodLabel} – ${reportData.advertiserName}`
      : `Uitbetalingsoverzicht ${reportData.periodLabel} – ${reportData.locationName}`,
    html,
    text,
    templateKey: `monthly_report_${report.report_type}`,
  });

  await db.execute(sql`
    UPDATE monthly_reports
    SET status = 'sent', sent_at = NOW(), sent_to_email = ${reportData.contactEmail}
    WHERE id = ${reportId}
  `);

  return true;
}
