/**
 * Monthly Report Worker
 * 
 * Generates and sends monthly reports to active advertisers
 * - Runs daily but only sends on the 1st of each month (for previous month)
 * - Idempotent: uses ReportLog table to prevent duplicates
 * - Calculates estimated visitors/impressions based on placement data
 */

import { storage } from "../storage";
import { db } from "../db";
import { placements, locations, advertisers, DEFAULT_SYSTEM_SETTINGS } from "@shared/schema";
import { eq, and, sql, gt } from "drizzle-orm";

const MONTH_LABELS_NL: Record<number, string> = {
  0: "januari", 1: "februari", 2: "maart", 3: "april",
  4: "mei", 5: "juni", 6: "juli", 7: "augustus",
  8: "september", 9: "oktober", 10: "november", 11: "december"
};

interface ReportSettings {
  weeksPerMonth: number;
  viewFactor: number;
  maxVisitorsPerWeek: number;
}

async function getReportSettings(): Promise<ReportSettings> {
  const [weeksPerMonth, viewFactor, maxVisitorsPerWeek] = await Promise.all([
    storage.getSystemSettingNumber("reportWeeksPerMonth", DEFAULT_SYSTEM_SETTINGS.reportWeeksPerMonth),
    storage.getSystemSettingNumber("reportViewFactor", DEFAULT_SYSTEM_SETTINGS.reportViewFactor),
    storage.getSystemSettingNumber("maxVisitorsPerWeek", DEFAULT_SYSTEM_SETTINGS.maxVisitorsPerWeek),
  ]);
  return { weeksPerMonth, viewFactor, maxVisitorsPerWeek };
}

interface ReportData {
  advertiserId: string;
  advertiserEmail: string;
  contactName: string;
  companyName: string;
  periodKey: string;
  monthLabel: string;
  liveLocationsCount: number;
  estimatedVisitors: number;
  estimatedImpressions: number;
  regionsLabel: string;
  cappedLocationsCount: number;
}

async function generateReportData(advertiserId: string, periodKey: string, settings: ReportSettings): Promise<ReportData | null> {
  const advertiser = await storage.getAdvertiser(advertiserId);
  if (!advertiser || !advertiser.email) {
    console.log(`[MonthlyReport] Skipping advertiser ${advertiserId}: no email`);
    return null;
  }

  const [year, month] = periodKey.split("-").map(Number);
  const monthLabel = `${MONTH_LABELS_NL[month - 1]} ${year}`;
  
  const liveLocations = await db
    .select({
      locationId: placements.locationId,
      regionCode: locations.regionCode,
      visitorsPerWeek: locations.visitorsPerWeek,
    })
    .from(placements)
    .innerJoin(locations, eq(placements.locationId, locations.id))
    .where(and(
      eq(placements.advertiserId, advertiserId),
      eq(placements.status, "PUBLISHED")
    ));

  if (liveLocations.length === 0) {
    console.log(`[MonthlyReport] Skipping advertiser ${advertiserId}: no live placements`);
    return null;
  }

  const liveLocationsCount = liveLocations.length;
  let cappedLocationsCount = 0;
  
  const estimatedVisitors = Math.round(
    liveLocations.reduce((sum, loc) => {
      const rawVisitors = loc.visitorsPerWeek || 0;
      if (rawVisitors > settings.maxVisitorsPerWeek) {
        cappedLocationsCount++;
        return sum + settings.maxVisitorsPerWeek;
      }
      return sum + rawVisitors;
    }, 0) * settings.weeksPerMonth
  );
  
  const estimatedImpressions = Math.round(estimatedVisitors * settings.viewFactor);
  
  const uniqueRegions = [...new Set(liveLocations.map(l => l.regionCode).filter(Boolean))];
  const regionsLabel = uniqueRegions.length > 0 ? uniqueRegions.join(", ") : "Diverse regio's";

  return {
    advertiserId,
    advertiserEmail: advertiser.email,
    contactName: advertiser.contactName || "Beste klant",
    companyName: advertiser.companyName,
    periodKey,
    monthLabel,
    liveLocationsCount,
    estimatedVisitors,
    estimatedImpressions,
    regionsLabel,
    cappedLocationsCount,
  };
}

export async function flagLocationsNeedingReview(): Promise<number> {
  const maxVisitors = await storage.getSystemSettingNumber(
    "maxVisitorsPerWeek", 
    DEFAULT_SYSTEM_SETTINGS.maxVisitorsPerWeek
  );
  
  const [result] = await db.update(locations)
    .set({ 
      needsReview: true,
      needsReviewReason: `Bezoekersaantal overschrijdt rapportage-limiet (${maxVisitors.toLocaleString("nl-NL")}/week)`
    })
    .where(and(
      gt(locations.visitorsPerWeek, maxVisitors),
      eq(locations.needsReview, false)
    ))
    .returning();
  
  const flaggedCount = result ? 1 : 0;
  
  const allFlagged = await db.select({ id: locations.id })
    .from(locations)
    .where(and(
      gt(locations.visitorsPerWeek, maxVisitors),
      eq(locations.needsReview, false)
    ));
  
  if (allFlagged.length > 0) {
    await db.update(locations)
      .set({ 
        needsReview: true,
        needsReviewReason: `Bezoekersaantal overschrijdt rapportage-limiet (${maxVisitors.toLocaleString("nl-NL")}/week)`
      })
      .where(gt(locations.visitorsPerWeek, maxVisitors));
  }
  
  return allFlagged.length;
}

async function sendMonthlyReportEmail(data: ReportData): Promise<boolean> {
  try {
    const { sendEmailWithHTML } = await import("./postmarkService");
    
    const subject = `Maandrapportage Elevizion — ${data.monthLabel}`;
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #10b981; margin: 0; }
    .stats { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .stat-item { margin: 10px 0; }
    .stat-label { font-weight: bold; color: #64748b; }
    .stat-value { font-size: 18px; color: #1e293b; }
    .disclaimer { font-size: 12px; color: #94a3b8; margin-top: 20px; font-style: italic; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Elevizion</h1>
    <p>Maandrapportage</p>
  </div>
  
  <p>Hallo ${data.contactName},</p>
  
  <p>Hierbij je maandrapportage voor <strong>${data.monthLabel}</strong>.</p>
  
  <div class="stats">
    <div class="stat-item">
      <span class="stat-label">Actieve locaties:</span>
      <span class="stat-value">${data.liveLocationsCount}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Gebieden:</span>
      <span class="stat-value">${data.regionsLabel}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Geschatte bezoekers (indicatief):</span>
      <span class="stat-value">${data.estimatedVisitors.toLocaleString("nl-NL")}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">Geschatte weergaves (indicatief):</span>
      <span class="stat-value">${data.estimatedImpressions.toLocaleString("nl-NL")}</span>
    </div>
  </div>
  
  <p class="disclaimer">
    *Let op: dit zijn schattingen op basis van bezoekersdata per locatie. Hieraan kunnen geen rechten worden ontleend.*
  </p>
  
  <p>Vragen of aanpassingen? Mail <a href="mailto:info@elevizion.nl">info@elevizion.nl</a>.</p>
  
  <p>Groet,<br>Elevizion (Douven Services)</p>
  
  <div class="footer">
    KvK 90982541 · BTW NL004857473B37<br>
    <a href="https://elevizion.nl">www.elevizion.nl</a>
  </div>
</body>
</html>
    `.trim();
    
    const textBody = `
Hallo ${data.contactName},

Hierbij je maandrapportage voor ${data.monthLabel}.

- Actieve locaties: ${data.liveLocationsCount}
- Gebieden: ${data.regionsLabel}
- Geschatte bezoekers (indicatief): ${data.estimatedVisitors.toLocaleString("nl-NL")}
- Geschatte weergaves (indicatief): ${data.estimatedImpressions.toLocaleString("nl-NL")}

*Let op: dit zijn schattingen op basis van bezoekersdata per locatie. Hieraan kunnen geen rechten worden ontleend.*

Vragen of aanpassingen? Mail info@elevizion.nl.

Groet,
Elevizion (Douven Services)
KvK 90982541 · BTW NL004857473B37
    `.trim();
    
    await sendEmailWithHTML({
      to: data.advertiserEmail,
      subject,
      htmlBody,
      textBody,
      templateKey: "monthly_report_mvp_nl",
      entityType: "advertiser",
      entityId: data.advertiserId,
    });
    
    return true;
  } catch (error) {
    console.error(`[MonthlyReport] Email send failed for ${data.advertiserId}:`, error);
    return false;
  }
}

export async function runMonthlyReportWorker(options?: { 
  force?: boolean;
  periodKey?: string; 
}): Promise<{
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  periodKey: string;
}> {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const force = options?.force ?? false;
  
  if (dayOfMonth !== 1 && !force) {
    console.log(`[MonthlyReport] Not the 1st of the month (day ${dayOfMonth}), skipping. Use force=true for manual runs.`);
    return { processed: 0, sent: 0, skipped: 0, failed: 0, periodKey: "" };
  }
  
  if (force) {
    console.log(`[MonthlyReport] Force mode enabled - running outside scheduled time`);
  }
  
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodKey = options?.periodKey ?? `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  
  console.log(`[MonthlyReport] Starting monthly report run for period: ${periodKey}`);
  
  const settings = await getReportSettings();
  console.log(`[MonthlyReport] Using settings: weeksPerMonth=${settings.weeksPerMonth}, viewFactor=${settings.viewFactor}, maxVisitorsPerWeek=${settings.maxVisitorsPerWeek}`);
  
  const flaggedCount = await flagLocationsNeedingReview();
  if (flaggedCount > 0) {
    console.log(`[MonthlyReport] Flagged ${flaggedCount} locations with suspicious visitor counts`);
  }
  
  const allAdvertisers = await db.select({ id: advertisers.id })
    .from(advertisers)
    .where(eq(advertisers.onboardingStatus, "CONTRACT_SIGNED"));
  
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const { id: advertiserId } of allAdvertisers) {
    processed++;
    
    const existingLog = await storage.getReportLog(advertiserId, periodKey);
    if (existingLog && existingLog.status === "sent") {
      console.log(`[MonthlyReport] Already sent for ${advertiserId} ${periodKey}`);
      skipped++;
      continue;
    }
    
    const reportData = await generateReportData(advertiserId, periodKey, settings);
    if (!reportData) {
      skipped++;
      continue;
    }
    
    let reportLog = existingLog;
    if (!reportLog) {
      reportLog = await storage.createReportLog({
        advertiserId,
        periodKey,
        liveLocationsCount: reportData.liveLocationsCount,
        estimatedVisitors: reportData.estimatedVisitors,
        estimatedImpressions: reportData.estimatedImpressions,
        regionsLabel: reportData.regionsLabel,
        status: "pending",
      });
    }
    
    const success = await sendMonthlyReportEmail(reportData);
    
    if (success) {
      await storage.updateReportLog(reportLog.id, {
        status: "sent",
        sentAt: new Date(),
      });
      sent++;
      console.log(`[MonthlyReport] Sent report to ${reportData.advertiserEmail}`);
    } else {
      await storage.updateReportLog(reportLog.id, {
        status: "failed",
        errorMessage: "Email send failed",
      });
      failed++;
    }
  }
  
  console.log(`[MonthlyReport] Completed: processed=${processed} sent=${sent} skipped=${skipped} failed=${failed}`);
  return { processed, sent, skipped, failed, periodKey };
}

let workerInterval: NodeJS.Timeout | null = null;

// Singleton guard to prevent duplicate startups across hot reloads
declare global {
  var __monthlyReportWorkerStarted: boolean | undefined;
}

export function startMonthlyReportWorker(): void {
  // Singleton guard - prevent multiple startups per process
  if (globalThis.__monthlyReportWorkerStarted) {
    console.log("[MonthlyReport] Worker already started (singleton guard)");
    return;
  }

  if (workerInterval) {
    console.log("[MonthlyReport] Worker already running");
    return;
  }
  
  globalThis.__monthlyReportWorkerStarted = true;
  
  console.log("[MonthlyReport] Starting worker (daily check at 09:00)");
  
  const checkAndRun = () => {
    const now = new Date();
    if (now.getHours() === 9 && now.getMinutes() < 5) {
      runMonthlyReportWorker().catch(err => {
        console.error("[MonthlyReport] Worker error:", err);
      });
    }
  };
  
  workerInterval = setInterval(checkAndRun, 5 * 60 * 1000);
  
  // Delay initial check by 3 minutes to stagger with other workers
  const INITIAL_DELAY_MS = 3 * 60 * 1000;
  console.log(`[MonthlyReport] First check scheduled in ${INITIAL_DELAY_MS / 1000 / 60} minutes`);
  setTimeout(() => {
    if (new Date().getDate() === 1 && new Date().getHours() >= 9) {
      runMonthlyReportWorker().catch(err => {
        console.error("[MonthlyReport] Initial run error:", err);
      });
    }
  }, INITIAL_DELAY_MS);
}

export function stopMonthlyReportWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[MonthlyReport] Worker stopped");
  }
}
