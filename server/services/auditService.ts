/**
 * Audit Service - Log important events for traceability
 * 
 * Events tracked:
 * - ASSET_UPLOADED
 * - PROPOSAL_GENERATED (optional, on approve)
 * - ASSET_APPROVED
 * - ASSET_REJECTED
 * - PLAN_APPROVED
 * - PLAN_PUBLISHED
 * - PLAN_FAILED
 */

import { db } from "../db";
import { auditLogs } from "@shared/schema";

export type AuditEventType = 
  | "ASSET_UPLOADED"
  | "PROPOSAL_GENERATED"
  | "ASSET_APPROVED"
  | "ASSET_REJECTED"
  | "PLAN_APPROVED"
  | "PLAN_PUBLISH_STARTED"
  | "PLAN_PUBLISHED"
  | "PLAN_PUBLISH_FAILED"
  | "PLAN_FAILED"
  | "PLAYLIST_AUTO_CREATED"
  | "PLAYLIST_RENAMED"
  | "PLAYLIST_MAPPING_FIXED"
  | "PLAYLIST_MAPPING_REMOVED_STALE"
  | "PLAYLIST_DUPLICATES_RESOLVED";

export interface AuditContext {
  actorUserId?: string;
  advertiserId?: string;
  assetId?: string;
  planId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event
 */
export async function logAudit(
  eventType: AuditEventType,
  context: AuditContext
): Promise<void> {
  try {
    const entityType = context.planId 
      ? "placement_plan" 
      : context.assetId 
        ? "ad_asset" 
        : context.advertiserId 
          ? "advertiser" 
          : "system";
    
    const entityId = context.planId || context.assetId || context.advertiserId || "system";
    
    await db.insert(auditLogs).values({
      entityType,
      entityId,
      action: eventType,
      actorType: context.actorUserId ? "user" : "system",
      actorId: context.actorUserId || null,
      metadata: {
        ...context.metadata,
        advertiserId: context.advertiserId,
        assetId: context.assetId,
        planId: context.planId,
        timestamp: new Date().toISOString(),
      },
    });
    
    console.log(`[Audit] ${eventType} logged for ${entityType}:${entityId}`);
  } catch (error) {
    console.error("[Audit] Failed to log event:", eventType, error);
  }
}

/**
 * Get audit events for an advertiser
 */
export async function getAuditEventsForAdvertiser(
  advertiserId: string,
  limit: number = 50
) {
  const { eq, desc, or, sql } = await import("drizzle-orm");
  
  return db.select()
    .from(auditLogs)
    .where(
      or(
        eq(auditLogs.entityId, advertiserId),
        sql`${auditLogs.metadata}->>'advertiserId' = ${advertiserId}`
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/**
 * Get audit events for a placement plan
 */
export async function getAuditEventsForPlan(
  planId: string,
  limit: number = 50
) {
  const { eq, desc, or, sql } = await import("drizzle-orm");
  
  return db.select()
    .from(auditLogs)
    .where(
      or(
        eq(auditLogs.entityId, planId),
        sql`${auditLogs.metadata}->>'planId' = ${planId}`
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/**
 * Get recent audit events
 */
export async function getRecentAuditEvents(limit: number = 100) {
  const { desc } = await import("drizzle-orm");
  
  return db.select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
