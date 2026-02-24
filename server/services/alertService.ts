/**
 * Alert Service
 * 
 * Centralized alerting system for Yodeck and other integration errors
 * - Logs alerts to database
 * - Sends notifications when thresholds are exceeded
 * - Prevents alert spam with deduplication
 */

import { db } from "../db";
import { sql, eq, and, desc, gt } from "drizzle-orm";

const LOG_PREFIX = "[AlertService]";

// Alert severity levels
export const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
} as const;

export type AlertSeverity = typeof ALERT_SEVERITY[keyof typeof ALERT_SEVERITY];

// Alert categories
export const ALERT_CATEGORY = {
  YODECK_API: "yodeck_api",
  YODECK_PUBLISH: "yodeck_publish",
  YODECK_SYNC: "yodeck_sync",
  UPLOAD: "upload",
  INTEGRATION: "integration",
  SYSTEM: "system",
} as const;

export type AlertCategory = typeof ALERT_CATEGORY[keyof typeof ALERT_CATEGORY];

// Alert deduplication window (5 minutes)
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

// Thresholds for escalation
const ERROR_THRESHOLD = {
  WARNING: 5,   // 5 errors in window = warning
  CRITICAL: 10, // 10 errors in window = critical
  WINDOW_MS: 15 * 60 * 1000, // 15 minute window
};

export interface Alert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  source: string;
  message: string;
  details?: any;
  dedupKey?: string;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  createdAt: Date;
}

/**
 * Create an alert
 */
export async function createAlert(params: {
  severity: AlertSeverity;
  category: AlertCategory;
  source: string;
  message: string;
  details?: any;
  dedupKey?: string;
}): Promise<{ ok: boolean; alertId?: string; deduped?: boolean; error?: string }> {
  try {
    // Check for recent duplicate if dedupKey provided
    if (params.dedupKey) {
      const [recentAlert] = await db
        .select()
        .from(sql`alerts`)
        .where(
          and(
            eq(sql`dedup_key`, params.dedupKey),
            gt(sql`created_at`, new Date(Date.now() - DEDUP_WINDOW_MS))
          )
        )
        .orderBy(desc(sql`created_at`))
        .limit(1);

      if (recentAlert) {
        // Update duplicate count
        await db
          .update(sql`alerts`)
          .set({
            duplicateCount: sql`duplicate_count + 1`,
            updatedAt: new Date(),
          })
          .where(eq(sql`id`, recentAlert.id));

        console.log(`${LOG_PREFIX} Alert deduplicated: ${params.dedupKey}`);
        return { ok: true, alertId: recentAlert.id, deduped: true };
      }
    }

    // Check if we need to escalate severity based on error rate
    const severity = await calculateSeverity(params.category, params.source, params.severity);

    // Create the alert
    const [alert] = await db
      .insert(sql`alerts`)
      .values({
        id: sql`gen_random_uuid()`,
        severity,
        category: params.category,
        source: params.source,
        message: params.message,
        details: params.details ? JSON.stringify(params.details) : null,
        dedupKey: params.dedupKey,
        acknowledged: false,
        duplicateCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log(`${LOG_PREFIX} Alert created: ${alert.id} [${severity}] ${params.message}`);

    // If critical, also log to console for immediate attention
    if (severity === ALERT_SEVERITY.CRITICAL) {
      console.error(`\n🚨 CRITICAL ALERT: ${params.message}\nSource: ${params.source}\nCategory: ${params.category}\n`);
    }

    return { ok: true, alertId: alert.id };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error creating alert:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Calculate severity based on error rate
 */
async function calculateSeverity(
  category: string,
  source: string,
  baseSeverity: AlertSeverity
): Promise<AlertSeverity> {
  // Count recent errors
  const [result] = await db
    .select({ count: sql`COUNT(*)` })
    .from(sql`alerts`)
    .where(
      and(
        eq(sql`category`, category),
        eq(sql`source`, source),
        gt(sql`created_at`, new Date(Date.now() - ERROR_THRESHOLD.WINDOW_MS))
      )
    );

  const count = parseInt(result?.count as string || "0", 10);

  if (count >= ERROR_THRESHOLD.CRITICAL) {
    return ALERT_SEVERITY.CRITICAL;
  } else if (count >= ERROR_THRESHOLD.WARNING && baseSeverity !== ALERT_SEVERITY.CRITICAL) {
    return ALERT_SEVERITY.ERROR;
  }

  return baseSeverity;
}

/**
 * Get active (unacknowledged) alerts
 */
export async function getActiveAlerts(options?: {
  category?: AlertCategory;
  severity?: AlertSeverity;
  limit?: number;
}): Promise<Alert[]> {
  try {
    let query = db
      .select()
      .from(sql`alerts`)
      .where(eq(sql`acknowledged`, false))
      .orderBy(desc(sql`created_at`));

    if (options?.category) {
      query = query.where(eq(sql`category`, options.category)) as any;
    }

    if (options?.severity) {
      query = query.where(eq(sql`severity`, options.severity)) as any;
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const alerts = await query;

    return alerts.map(row => ({
      id: row.id,
      severity: row.severity,
      category: row.category,
      source: row.source,
      message: row.message,
      details: row.details ? JSON.parse(row.details) : undefined,
      dedupKey: row.dedupKey,
      acknowledged: row.acknowledged,
      acknowledgedAt: row.acknowledgedAt,
      acknowledgedBy: row.acknowledgedBy,
      createdAt: row.createdAt,
    }));
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting alerts:`, error);
    return [];
  }
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(
  alertId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await db
      .update(sql`alerts`)
      .set({
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(sql`id`, alertId));

    console.log(`${LOG_PREFIX} Alert ${alertId} acknowledged by ${userId}`);
    return { ok: true };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error acknowledging alert:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Get alert statistics
 */
export async function getAlertStats(timeWindowMs: number = 24 * 60 * 60 * 1000): Promise<{
  total: number;
  bySeverity: Record<AlertSeverity, number>;
  byCategory: Record<string, number>;
  active: number;
}> {
  try {
    const since = new Date(Date.now() - timeWindowMs);

    const [totalResult] = await db
      .select({ count: sql`COUNT(*)` })
      .from(sql`alerts`)
      .where(gt(sql`created_at`, since));

    const bySeverityResult = await db
      .select({
        severity: sql`severity`,
        count: sql`COUNT(*)`,
      })
      .from(sql`alerts`)
      .where(gt(sql`created_at`, since))
      .groupBy(sql`severity`);

    const byCategoryResult = await db
      .select({
        category: sql`category`,
        count: sql`COUNT(*)`,
      })
      .from(sql`alerts`)
      .where(gt(sql`created_at`, since))
      .groupBy(sql`category`);

    const [activeResult] = await db
      .select({ count: sql`COUNT(*)` })
      .from(sql`alerts`)
      .where(eq(sql`acknowledged`, false));

    const bySeverity: Record<string, number> = {};
    for (const row of bySeverityResult) {
      bySeverity[row.severity as string] = parseInt(row.count as string, 10);
    }

    const byCategory: Record<string, number> = {};
    for (const row of byCategoryResult) {
      byCategory[row.category as string] = parseInt(row.count as string, 10);
    }

    return {
      total: parseInt(totalResult?.count as string || "0", 10),
      bySeverity,
      byCategory,
      active: parseInt(activeResult?.count as string || "0", 10),
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting stats:`, error);
    return { total: 0, bySeverity: {}, byCategory: {}, active: 0 };
  }
}

/**
 * Convenience function for Yodeck API errors
 */
export async function alertYodeckApiError(
  operation: string,
  error: { message: string; status?: number; code?: string },
  details?: any
): Promise<void> {
  await createAlert({
    severity: error.status === 429 || error.status >= 500 ? ALERT_SEVERITY.WARNING : ALERT_SEVERITY.ERROR,
    category: ALERT_CATEGORY.YODECK_API,
    source: `yodeck:${operation}`,
    message: `Yodeck API error: ${error.message}`,
    details: { status: error.status, code: error.code, ...details },
    dedupKey: `yodeck:${operation}:${error.code || error.status}:${error.message.substring(0, 50)}`,
  });
}

/**
 * Convenience function for Yodeck publish errors
 */
export async function alertYodeckPublishError(
  assetId: string,
  error: { message: string; code?: string },
  details?: any
): Promise<void> {
  await createAlert({
    severity: ALERT_SEVERITY.ERROR,
    category: ALERT_CATEGORY.YODECK_PUBLISH,
    source: `publish:${assetId}`,
    message: `Publish failed: ${error.message}`,
    details: { assetId, errorCode: error.code, ...details },
    dedupKey: `publish:${assetId}:${error.code || "unknown"}`,
  });
}

/**
 * Convenience function for upload errors
 */
export async function alertUploadError(
  advertiserId: string,
  error: { message: string; code?: string },
  details?: any
): Promise<void> {
  await createAlert({
    severity: ALERT_SEVERITY.ERROR,
    category: ALERT_CATEGORY.UPLOAD,
    source: `upload:${advertiserId}`,
    message: `Upload failed: ${error.message}`,
    details: { advertiserId, errorCode: error.code, ...details },
    dedupKey: `upload:${advertiserId}:${error.code || "unknown"}`,
  });
}

/**
 * Clean up old acknowledged alerts (keep last 30 days)
 */
export async function cleanupOldAlerts(): Promise<number> {
  try {
    const result = await db
      .delete(sql`alerts`)
      .where(
        and(
          eq(sql`acknowledged`, true),
          gt(sql`created_at`, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        )
      );

    const count = result.rowCount || 0;
    console.log(`${LOG_PREFIX} Cleaned up ${count} old alerts`);
    return count;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error cleaning up alerts:`, error);
    return 0;
  }
}
