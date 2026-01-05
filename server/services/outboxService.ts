/**
 * Integration Outbox Service
 * 
 * SSOT Pattern: All writes to external APIs (Moneybird, Yodeck) go through
 * this outbox to ensure no data loss and retry capability.
 * 
 * DESIGN PRINCIPLES:
 * - Dashboard DB is the source of truth
 * - External API failures don't block local operations
 * - All operations are idempotent (no duplicate records)
 * - Full auditability of all external operations
 */

import { storage } from "../storage";
import type { IntegrationOutbox, InsertIntegrationOutbox } from "@shared/schema";

export type OutboxProvider = "moneybird" | "yodeck";
export type OutboxActionType = 
  | "create_contact" 
  | "update_contact" 
  | "delete_contact"
  | "create_invoice"
  | "link_device" 
  | "sync_status"
  | "sync_content";

export type OutboxEntityType = "advertiser" | "screen" | "location" | "invoice" | "contract";

export interface EnqueueOptions {
  provider: OutboxProvider;
  actionType: OutboxActionType;
  entityType: OutboxEntityType;
  entityId: string;
  payload?: Record<string, any>;
  maxAttempts?: number;
}

export interface EnqueueResult {
  success: boolean;
  job?: IntegrationOutbox;
  alreadyExists?: boolean;
  error?: string;
}

/**
 * Generate an idempotency key for an outbox job
 * Format: {provider}:{actionType}:{entityType}:{entityId}
 * 
 * This ensures the same operation cannot be queued twice
 */
export function generateIdempotencyKey(
  provider: OutboxProvider,
  actionType: OutboxActionType,
  entityType: OutboxEntityType,
  entityId: string
): string {
  return `${provider}:${actionType}:${entityType}:${entityId}`;
}

/**
 * Enqueue a job to the integration outbox
 * 
 * - If the same job already exists (by idempotency key), returns the existing job
 * - If it's a new job, creates it with status "queued"
 */
export async function enqueueOutboxJob(options: EnqueueOptions): Promise<EnqueueResult> {
  const { provider, actionType, entityType, entityId, payload, maxAttempts = 5 } = options;

  const idempotencyKey = generateIdempotencyKey(provider, actionType, entityType, entityId);

  try {
    const existingJob = await storage.getOutboxJobByIdempotencyKey(idempotencyKey);

    if (existingJob) {
      if (existingJob.status === "failed") {
        const updatedJob = await storage.updateOutboxJob(existingJob.id, {
          status: "queued",
          attempts: 0,
          lastError: null,
          nextRetryAt: null,
          payloadJson: payload || existingJob.payloadJson,
        });
        return { success: true, job: updatedJob || existingJob, alreadyExists: true };
      }

      return { success: true, job: existingJob, alreadyExists: true };
    }

    const jobData: InsertIntegrationOutbox = {
      provider,
      actionType,
      entityType,
      entityId,
      payloadJson: payload || null,
      idempotencyKey,
      status: "queued",
      attempts: 0,
      maxAttempts,
    };

    const job = await storage.createOutboxJob(jobData);
    return { success: true, job };

  } catch (error: any) {
    console.error(`[Outbox] Failed to enqueue job:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Enqueue a Moneybird contact sync job
 */
export async function enqueueMoneybirdContactSync(
  entityType: "advertiser" | "screen" | "location",
  entityId: string,
  isCreate: boolean = false
): Promise<EnqueueResult> {
  return enqueueOutboxJob({
    provider: "moneybird",
    actionType: isCreate ? "create_contact" : "update_contact",
    entityType,
    entityId,
  });
}

/**
 * Enqueue a Yodeck device link job
 */
export async function enqueueYodeckDeviceLink(
  screenId: string,
  yodeckPlayerId?: string
): Promise<EnqueueResult> {
  return enqueueOutboxJob({
    provider: "yodeck",
    actionType: "link_device",
    entityType: "screen",
    entityId: screenId,
    payload: yodeckPlayerId ? { yodeckPlayerId } : undefined,
  });
}

/**
 * Enqueue a Yodeck content sync job
 */
export async function enqueueYodeckContentSync(screenId: string): Promise<EnqueueResult> {
  return enqueueOutboxJob({
    provider: "yodeck",
    actionType: "sync_content",
    entityType: "screen",
    entityId: screenId,
  });
}

/**
 * Mark a job as succeeded and update entity sync status
 */
export async function markJobSucceeded(
  jobId: string,
  externalId?: string,
  response?: Record<string, any>
): Promise<IntegrationOutbox | undefined> {
  return storage.updateOutboxJob(jobId, {
    status: "succeeded",
    externalId: externalId || undefined,
    responseJson: response || undefined,
    processedAt: new Date(),
  });
}

/**
 * Mark a job as failed with retry scheduling
 */
export async function markJobFailed(
  jobId: string,
  error: string,
  currentAttempts: number,
  maxAttempts: number
): Promise<IntegrationOutbox | undefined> {
  const shouldRetry = currentAttempts < maxAttempts;
  const backoffMinutes = Math.pow(2, currentAttempts) * 5;
  const nextRetryAt = shouldRetry 
    ? new Date(Date.now() + backoffMinutes * 60 * 1000)
    : null;

  return storage.updateOutboxJob(jobId, {
    status: shouldRetry ? "queued" : "failed",
    lastError: error,
    attempts: currentAttempts + 1,
    nextRetryAt,
  });
}

/**
 * Retry all failed jobs for a specific provider
 */
export async function retryFailedJobs(provider?: OutboxProvider): Promise<number> {
  const failedJobs = await storage.getFailedOutboxJobs(provider);
  let retriedCount = 0;

  for (const job of failedJobs) {
    await storage.updateOutboxJob(job.id, {
      status: "queued",
      attempts: 0,
      lastError: null,
      nextRetryAt: null,
    });
    retriedCount++;
  }

  return retriedCount;
}

/**
 * Get sync status for an entity across all providers
 */
export async function getEntitySyncStatus(
  entityType: OutboxEntityType,
  entityId: string
): Promise<{
  moneybird: { status: string; lastJob?: IntegrationOutbox };
  yodeck: { status: string; lastJob?: IntegrationOutbox };
}> {
  const jobs = await storage.getOutboxJobsByEntity(entityType, entityId);

  const moneybirdJobs = jobs.filter(j => j.provider === "moneybird");
  const yodeckJobs = jobs.filter(j => j.provider === "yodeck");

  const getStatusFromJobs = (providerJobs: IntegrationOutbox[]) => {
    if (providerJobs.length === 0) return { status: "not_linked" };
    const lastJob = providerJobs[0];
    return { status: lastJob.status, lastJob };
  };

  return {
    moneybird: getStatusFromJobs(moneybirdJobs),
    yodeck: getStatusFromJobs(yodeckJobs),
  };
}

/**
 * Get outbox statistics
 */
export async function getOutboxStats() {
  return storage.getOutboxStats();
}
