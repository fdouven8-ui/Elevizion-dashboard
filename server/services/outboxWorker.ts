/**
 * Integration Outbox Worker
 * 
 * Processes queued jobs from the integration_outbox table.
 * Runs as a background task with configurable interval.
 * 
 * FEATURES:
 * - Exponential backoff on failures
 * - Dev toggles for testing (FORCE_MONEYBIRD_FAIL, FORCE_YODECK_FAIL)
 * - Idempotent processing
 * - Audit logging
 */

import { storage } from "../storage";
import { markJobSucceeded, markJobFailed } from "./outboxService";
import type { IntegrationOutbox } from "@shared/schema";

const WORKER_INTERVAL_MS = 30 * 1000;
const BATCH_SIZE = 10;

let workerInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

/**
 * Check if a provider should force-fail (for testing)
 */
function shouldForceFail(provider: string): boolean {
  if (provider === "moneybird" && process.env.FORCE_MONEYBIRD_FAIL === "true") {
    return true;
  }
  if (provider === "yodeck" && process.env.FORCE_YODECK_FAIL === "true") {
    return true;
  }
  return false;
}

/**
 * Process a single Moneybird job
 */
async function processMoneybirdJob(job: IntegrationOutbox): Promise<{ success: boolean; externalId?: string; error?: string }> {
  if (shouldForceFail("moneybird")) {
    return { success: false, error: "FORCE_MONEYBIRD_FAIL enabled (dev toggle)" };
  }

  try {
    const { MoneybirdClient } = await import("./moneybirdClient");
    const client = await MoneybirdClient.create();
    
    if (!client) {
      return { success: false, error: "Moneybird niet geconfigureerd" };
    }

    switch (job.actionType) {
      case "create_contact":
      case "update_contact": {
        let entity: any = null;
        let contactData: any = {};

        if (job.entityType === "advertiser") {
          entity = await storage.getAdvertiser(job.entityId);
          if (!entity) return { success: false, error: "Adverteerder niet gevonden" };
          
          contactData = {
            company: entity.companyName,
            firstname: entity.contactName?.split(" ")[0] || "",
            lastname: entity.contactName?.split(" ").slice(1).join(" ") || "",
            email: entity.email,
            phone: entity.phone,
            address1: entity.street || entity.address,
            zipcode: entity.zipcode,
            city: entity.city,
            country: entity.country || "NL",
            chamber_of_commerce: entity.kvkNumber,
            tax_number: entity.vatNumber,
          };
        } else if (job.entityType === "location") {
          entity = await storage.getLocation(job.entityId);
          if (!entity) return { success: false, error: "Locatie niet gevonden" };

          contactData = {
            company: entity.name,
            firstname: entity.contactName?.split(" ")[0] || "",
            lastname: entity.contactName?.split(" ").slice(1).join(" ") || "",
            email: entity.email,
            phone: entity.phone,
            address1: entity.street || entity.address,
            zipcode: entity.zipcode,
            city: entity.city,
          };
        } else if (job.entityType === "screen") {
          entity = await storage.getScreen(job.entityId);
          if (!entity) return { success: false, error: "Scherm niet gevonden" };

          if (entity.moneybirdContactId) {
            return { success: true, externalId: entity.moneybirdContactId };
          }

          contactData = {
            company: entity.name,
            city: entity.city,
          };
        }

        const existingContactId = entity.moneybirdContactId;
        let result: any;

        if (existingContactId && job.actionType === "update_contact") {
          result = await client.updateContact(existingContactId, contactData);
        } else if (!existingContactId) {
          result = await client.createContact(contactData);
        } else {
          return { success: true, externalId: existingContactId };
        }

        const externalId = result?.id;
        if (externalId) {
          if (job.entityType === "advertiser") {
            await storage.updateAdvertiser(job.entityId, {
              moneybirdContactId: externalId,
              moneybirdSyncStatus: "synced",
              moneybirdSyncError: null,
              moneybirdLastSyncAt: new Date(),
            });
          } else if (job.entityType === "location") {
            await storage.updateLocation(job.entityId, {
              moneybirdContactId: externalId,
              moneybirdSyncStatus: "synced",
              moneybirdSyncError: null,
              moneybirdLastSyncAt: new Date(),
            });
          } else if (job.entityType === "screen") {
            await storage.updateScreen(job.entityId, {
              moneybirdContactId: externalId,
              moneybirdSyncStatus: "synced",
              moneybirdSyncError: null,
              moneybirdLastSyncAt: new Date(),
            });
          }
        }

        return { success: true, externalId };
      }

      default:
        return { success: false, error: `Onbekende actie: ${job.actionType}` };
    }
  } catch (error: any) {
    console.error(`[OutboxWorker] Moneybird job failed:`, error);
    return { success: false, error: error.message || "Onbekende fout" };
  }
}

/**
 * Process a single Yodeck job
 */
async function processYodeckJob(job: IntegrationOutbox): Promise<{ success: boolean; externalId?: string; error?: string }> {
  if (shouldForceFail("yodeck")) {
    return { success: false, error: "FORCE_YODECK_FAIL enabled (dev toggle)" };
  }

  try {
    const { YodeckClient } = await import("./yodeckClient");
    const client = new YodeckClient();

    switch (job.actionType) {
      case "link_device":
      case "sync_status": {
        const screen = await storage.getScreen(job.entityId);
        if (!screen) return { success: false, error: "Scherm niet gevonden" };

        const payload = job.payloadJson as { yodeckPlayerId?: string } | null;
        const playerId = payload?.yodeckPlayerId || screen.yodeckPlayerId;

        if (!playerId) {
          return { success: false, error: "Geen Yodeck player ID gekoppeld" };
        }

        const result = await client.getPlayer(playerId);
        if (!result.ok) {
          return { success: false, error: result.error || "Yodeck API fout" };
        }

        const playerData = result.data;
        await storage.updateScreen(job.entityId, {
          yodeckPlayerId: playerId,
          yodeckPlayerName: playerData?.name,
          status: playerData?.is_online ? "online" : "offline",
          lastSeenAt: playerData?.last_seen_at ? new Date(playerData.last_seen_at) : undefined,
          yodeckSyncStatus: "synced",
          yodeckSyncError: null,
          yodeckLastSyncAt: new Date(),
        });

        return { success: true, externalId: playerId };
      }

      case "sync_content": {
        const screen = await storage.getScreen(job.entityId);
        if (!screen?.yodeckPlayerId) {
          return { success: false, error: "Scherm niet gekoppeld aan Yodeck" };
        }

        await storage.updateScreen(job.entityId, {
          yodeckSyncStatus: "synced",
          yodeckSyncError: null,
          yodeckLastSyncAt: new Date(),
        });

        return { success: true, externalId: screen.yodeckPlayerId };
      }

      default:
        return { success: false, error: `Onbekende actie: ${job.actionType}` };
    }
  } catch (error: any) {
    console.error(`[OutboxWorker] Yodeck job failed:`, error);
    return { success: false, error: error.message || "Onbekende fout" };
  }
}

/**
 * Process a single outbox job
 */
async function processJob(job: IntegrationOutbox): Promise<void> {
  console.log(`[OutboxWorker] Processing job ${job.id}: ${job.provider}:${job.actionType}:${job.entityType}`);

  await storage.updateOutboxJob(job.id, { status: "processing" });

  let result: { success: boolean; externalId?: string; error?: string };

  if (job.provider === "moneybird") {
    result = await processMoneybirdJob(job);
  } else if (job.provider === "yodeck") {
    result = await processYodeckJob(job);
  } else {
    result = { success: false, error: `Onbekende provider: ${job.provider}` };
  }

  if (result.success) {
    await markJobSucceeded(job.id, result.externalId, { processedAt: new Date().toISOString() });
    console.log(`[OutboxWorker] Job ${job.id} succeeded`);
  } else {
    await markJobFailed(job.id, result.error || "Onbekende fout", job.attempts, job.maxAttempts);
    console.log(`[OutboxWorker] Job ${job.id} failed: ${result.error}`);

    if (job.entityType === "advertiser") {
      await storage.updateAdvertiser(job.entityId, {
        moneybirdSyncStatus: job.attempts + 1 >= job.maxAttempts ? "failed" : "pending",
        moneybirdSyncError: result.error,
      });
    } else if (job.entityType === "location" && job.provider === "moneybird") {
      await storage.updateLocation(job.entityId, {
        moneybirdSyncStatus: job.attempts + 1 >= job.maxAttempts ? "failed" : "pending",
        moneybirdSyncError: result.error,
      });
    } else if (job.entityType === "screen") {
      if (job.provider === "moneybird") {
        await storage.updateScreen(job.entityId, {
          moneybirdSyncStatus: job.attempts + 1 >= job.maxAttempts ? "failed" : "pending",
          moneybirdSyncError: result.error,
        });
      } else if (job.provider === "yodeck") {
        await storage.updateScreen(job.entityId, {
          yodeckSyncStatus: job.attempts + 1 >= job.maxAttempts ? "failed" : "pending",
          yodeckSyncError: result.error,
        });
      }
    }
  }
}

/**
 * Process a batch of queued jobs
 */
export async function processOutboxBatch(limit: number = BATCH_SIZE): Promise<{ processed: number; succeeded: number; failed: number }> {
  if (isProcessing) {
    console.log("[OutboxWorker] Already processing, skipping...");
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  isProcessing = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const jobs = await storage.getQueuedOutboxJobs(limit);
    
    if (jobs.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    console.log(`[OutboxWorker] Processing ${jobs.length} jobs...`);

    for (const job of jobs) {
      try {
        await processJob(job);
        const updatedJob = await storage.getOutboxJob(job.id);
        if (updatedJob?.status === "succeeded") {
          succeeded++;
        } else {
          failed++;
        }
        processed++;
      } catch (error) {
        console.error(`[OutboxWorker] Error processing job ${job.id}:`, error);
        failed++;
        processed++;
      }
    }

    console.log(`[OutboxWorker] Batch complete: ${processed} processed, ${succeeded} succeeded, ${failed} failed`);
  } finally {
    isProcessing = false;
  }

  return { processed, succeeded, failed };
}

// Singleton guard to prevent duplicate startups across hot reloads
declare global {
  var __outboxWorkerStarted: boolean | undefined;
}

/**
 * Start the background worker
 */
export function startOutboxWorker(): void {
  // Singleton guard - prevent multiple startups per process
  if (globalThis.__outboxWorkerStarted) {
    console.log("[OutboxWorker] Worker already started (singleton guard)");
    return;
  }

  if (workerInterval) {
    console.log("[OutboxWorker] Worker already running");
    return;
  }

  globalThis.__outboxWorkerStarted = true;

  console.log(`[OutboxWorker] Starting worker (interval: ${WORKER_INTERVAL_MS / 1000}s)`);
  
  // Delay initial run by 30 seconds to avoid memory pressure at boot
  const INITIAL_DELAY_MS = 30 * 1000;
  console.log(`[OutboxWorker] First run scheduled in ${INITIAL_DELAY_MS / 1000} seconds`);
  setTimeout(() => processOutboxBatch().catch(console.error), INITIAL_DELAY_MS);

  workerInterval = setInterval(() => {
    processOutboxBatch().catch(console.error);
  }, WORKER_INTERVAL_MS);
}

/**
 * Stop the background worker
 */
export function stopOutboxWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[OutboxWorker] Worker stopped");
  }
}

/**
 * Get worker status
 */
export function getWorkerStatus(): { running: boolean; processing: boolean } {
  return {
    running: workerInterval !== null,
    processing: isProcessing,
  };
}
