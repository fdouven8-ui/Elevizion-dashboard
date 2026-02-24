/**
 * Publish Queue Service
 * 
 * Centralized queue for managing the upload → review → publish flow
 * - Tracks ad assets through the entire pipeline
 * - Handles retries with exponential backoff
 * - Provides visibility into queue status
 * - Prevents duplicate publishes
 */

import { db } from "../db";
import { adAssets, uploadJobs, advertisers, screens, placements, PUBLISH_QUEUE_STATUS, PUBLISH_QUEUE_PRIORITY } from "@shared/schema";
import { eq, and, or, desc, asc, sql, inArray, isNull } from "drizzle-orm";
import { storage } from "../storage";

const LOG_PREFIX = "[PublishQueue]";

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 5,
  baseDelayMs: 5000,
  maxDelayMs: 300000, // 5 minutes
  backoffMultiplier: 2,
};

export interface QueueItem {
  id: string;
  adAssetId: string;
  advertiserId: string;
  status: string;
  priority: number;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  errorCode?: string;
  createdAt: Date;
  updatedAt: Date;
  scheduledFor?: Date;
  processedAt?: Date;
  completedAt?: Date;
  metadata?: any;
}

export interface QueueStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
  averageWaitTimeMs: number;
}

/**
 * Add an item to the publish queue
 */
export async function addToQueue(
  adAssetId: string,
  advertiserId: string,
  options?: {
    priority?: number;
    scheduledFor?: Date;
    metadata?: any;
  }
): Promise<{ ok: boolean; itemId?: string; error?: string }> {
  try {
    // Check if asset exists
    const [asset] = await db
      .select()
      .from(adAssets)
      .where(eq(adAssets.id, adAssetId));

    if (!asset) {
      return { ok: false, error: "Ad asset not found" };
    }

    // Check if already in queue with non-terminal status
    const [existingItem] = await db
      .select()
      .from(PUBLISH_QUEUE_STATUS)
      .where(
        and(
          eq(sql`metadata->>'adAssetId'`, adAssetId),
          or(
            eq(sql`status`, PUBLISH_QUEUE_STATUS.PENDING),
            eq(sql`status`, PUBLISH_QUEUE_STATUS.PROCESSING),
            eq(sql`status`, PUBLISH_QUEUE_STATUS.RETRYING)
          )
        )
      )
      .limit(1);

    if (existingItem) {
      console.log(`${LOG_PREFIX} Asset ${adAssetId} already in queue, skipping`);
      return { ok: true, itemId: existingItem.id };
    }

    // Create queue item using storage layer
    const itemId = await storage.createPublishQueueItem({
      adAssetId,
      advertiserId,
      status: PUBLISH_QUEUE_STATUS.PENDING,
      priority: options?.priority ?? PUBLISH_QUEUE_PRIORITY.NORMAL,
      retryCount: 0,
      maxRetries: RETRY_CONFIG.maxRetries,
      scheduledFor: options?.scheduledFor,
      metadata: {
        ...options?.metadata,
        adAssetId,
        advertiserId,
        addedAt: new Date().toISOString(),
      },
    });

    console.log(`${LOG_PREFIX} Added asset ${adAssetId} to queue, itemId=${itemId}`);
    return { ok: true, itemId };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error adding to queue:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Get next item from queue for processing
 */
export async function getNextQueueItem(): Promise<QueueItem | null> {
  try {
    // Get pending items that are scheduled for now or in the past
    const items = await db
      .select()
      .from(sql`publish_queue`)
      .where(
        and(
          eq(sql`status`, PUBLISH_QUEUE_STATUS.PENDING),
          or(
            isNull(sql`scheduled_for`),
            sql`scheduled_for <= NOW()`
          )
        )
      )
      .orderBy(
        asc(sql`priority`),
        asc(sql`created_at`)
      )
      .limit(1);

    if (!items || items.length === 0) {
      return null;
    }

    const item = items[0];

    // Mark as processing
    await db
      .update(sql`publish_queue`)
      .set({
        status: PUBLISH_QUEUE_STATUS.PROCESSING,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sql`id`, item.id));

    return {
      id: item.id,
      adAssetId: item.adAssetId,
      advertiserId: item.advertiserId,
      status: PUBLISH_QUEUE_STATUS.PROCESSING,
      priority: item.priority,
      retryCount: item.retryCount,
      maxRetries: item.maxRetries,
      createdAt: item.createdAt,
      updatedAt: new Date(),
      scheduledFor: item.scheduledFor,
      processedAt: new Date(),
      metadata: item.metadata,
    };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting next queue item:`, error);
    return null;
  }
}

/**
 * Mark queue item as completed
 */
export async function markQueueItemCompleted(
  itemId: string,
  result: { yodeckMediaId?: number; playlistIds?: number[] }
): Promise<void> {
  try {
    await db
      .update(sql`publish_queue`)
      .set({
        status: PUBLISH_QUEUE_STATUS.COMPLETED,
        completedAt: new Date(),
        updatedAt: new Date(),
        metadata: sql`metadata || ${JSON.stringify({ result, completedAt: new Date().toISOString() })}`,
      })
      .where(eq(sql`id`, itemId));

    console.log(`${LOG_PREFIX} Item ${itemId} marked as completed`);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error marking item completed:`, error);
  }
}

/**
 * Mark queue item as failed (with retry logic)
 */
export async function markQueueItemFailed(
  itemId: string,
  error: { code: string; message: string },
  options?: { canRetry?: boolean }
): Promise<void> {
  try {
    const [item] = await db
      .select()
      .from(sql`publish_queue`)
      .where(eq(sql`id`, itemId))
      .limit(1);

    if (!item) {
      console.warn(`${LOG_PREFIX} Cannot mark unknown item ${itemId} as failed`);
      return;
    }

    const canRetry = options?.canRetry !== false && item.retryCount < item.maxRetries;

    if (canRetry) {
      // Calculate next retry delay with exponential backoff
      const retryDelay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, item.retryCount),
        RETRY_CONFIG.maxDelayMs
      );

      const scheduledFor = new Date(Date.now() + retryDelay);

      await db
        .update(sql`publish_queue`)
        .set({
          status: PUBLISH_QUEUE_STATUS.RETRYING,
          retryCount: item.retryCount + 1,
          scheduledFor,
          errorMessage: error.message,
          errorCode: error.code,
          updatedAt: new Date(),
          metadata: sql`metadata || ${JSON.stringify({
            lastError: error,
            retryScheduledFor: scheduledFor.toISOString(),
          })}`,
        })
        .where(eq(sql`id`, itemId));

      console.log(`${LOG_PREFIX} Item ${itemId} scheduled for retry ${item.retryCount + 1}/${item.maxRetries} at ${scheduledFor.toISOString()}`);
    } else {
      // Max retries reached, mark as permanently failed
      await db
        .update(sql`publish_queue`)
        .set({
          status: PUBLISH_QUEUE_STATUS.FAILED,
          errorMessage: error.message,
          errorCode: error.code,
          updatedAt: new Date(),
          metadata: sql`metadata || ${JSON.stringify({ finalError: error, failedAt: new Date().toISOString() })}`,
        })
        .where(eq(sql`id`, itemId));

      console.log(`${LOG_PREFIX} Item ${itemId} permanently failed after ${item.retryCount} retries: ${error.message}`);

      // Update ad asset status
      await db
        .update(adAssets)
        .set({
          status: "publish_failed",
          publishError: error.message,
        })
        .where(eq(adAssets.id, item.adAssetId));
    }
  } catch (updateError: any) {
    console.error(`${LOG_PREFIX} Error marking item failed:`, updateError);
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  try {
    const result = await db
      .select({
        status: sql`status`,
        count: sql`COUNT(*)`,
      })
      .from(sql`publish_queue`)
      .groupBy(sql`status`);

    const stats: QueueStats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retrying: 0,
      averageWaitTimeMs: 0,
    };

    for (const row of result) {
      const count = parseInt(row.count as string, 10);
      stats.total += count;

      switch (row.status) {
        case PUBLISH_QUEUE_STATUS.PENDING:
          stats.pending = count;
          break;
        case PUBLISH_QUEUE_STATUS.PROCESSING:
          stats.processing = count;
          break;
        case PUBLISH_QUEUE_STATUS.COMPLETED:
          stats.completed = count;
          break;
        case PUBLISH_QUEUE_STATUS.FAILED:
          stats.failed = count;
          break;
        case PUBLISH_QUEUE_STATUS.RETRYING:
          stats.retrying = count;
          break;
      }
    }

    // Calculate average wait time for completed items
    const waitTimeResult = await db
      .select({
        avgWaitMs: sql`AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)`,
      })
      .from(sql`publish_queue`)
      .where(
        and(
          eq(sql`status`, PUBLISH_QUEUE_STATUS.COMPLETED),
          sql`completed_at IS NOT NULL`
        )
      );

    if (waitTimeResult && waitTimeResult.length > 0) {
      stats.averageWaitTimeMs = Math.round(parseFloat(waitTimeResult[0].avgWaitMs as string) || 0);
    }

    return stats;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting queue stats:`, error);
    return {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      retrying: 0,
      averageWaitTimeMs: 0,
    };
  }
}

/**
 * Get all queue items with filtering
 */
export async function getQueueItems(options?: {
  status?: string;
  advertiserId?: string;
  limit?: number;
  offset?: number;
}): Promise<QueueItem[]> {
  try {
    let query = db
      .select()
      .from(sql`publish_queue`);

    if (options?.status) {
      query = query.where(eq(sql`status`, options.status)) as any;
    }

    if (options?.advertiserId) {
      query = query.where(eq(sql`advertiser_id`, options.advertiserId)) as any;
    }

    query = query
      .orderBy(desc(sql`created_at`))
      .limit(options?.limit ?? 100)
      .offset(options?.offset ?? 0);

    const items = await query;

    return items.map(item => ({
      id: item.id,
      adAssetId: item.adAssetId,
      advertiserId: item.advertiserId,
      status: item.status,
      priority: item.priority,
      retryCount: item.retryCount,
      maxRetries: item.maxRetries,
      errorMessage: item.errorMessage,
      errorCode: item.errorCode,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      scheduledFor: item.scheduledFor,
      processedAt: item.processedAt,
      completedAt: item.completedAt,
      metadata: item.metadata,
    }));
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error getting queue items:`, error);
    return [];
  }
}

/**
 * Retry a failed queue item manually
 */
export async function retryQueueItem(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const [item] = await db
      .select()
      .from(sql`publish_queue`)
      .where(eq(sql`id`, itemId))
      .limit(1);

    if (!item) {
      return { ok: false, error: "Queue item not found" };
    }

    if (item.status !== PUBLISH_QUEUE_STATUS.FAILED && item.status !== PUBLISH_QUEUE_STATUS.RETRYING) {
      return { ok: false, error: `Cannot retry item with status ${item.status}` };
    }

    await db
      .update(sql`publish_queue`)
      .set({
        status: PUBLISH_QUEUE_STATUS.PENDING,
        retryCount: 0,
        errorMessage: null,
        errorCode: null,
        scheduledFor: null,
        updatedAt: new Date(),
      })
      .where(eq(sql`id`, itemId));

    console.log(`${LOG_PREFIX} Manually retried item ${itemId}`);
    return { ok: true };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error retrying item:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Cancel a pending queue item
 */
export async function cancelQueueItem(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const [item] = await db
      .select()
      .from(sql`publish_queue`)
      .where(eq(sql`id`, itemId))
      .limit(1);

    if (!item) {
      return { ok: false, error: "Queue item not found" };
    }

    if (item.status === PUBLISH_QUEUE_STATUS.COMPLETED) {
      return { ok: false, error: "Cannot cancel completed item" };
    }

    await db
      .delete(sql`publish_queue`)
      .where(eq(sql`id`, itemId));

    console.log(`${LOG_PREFIX} Cancelled item ${itemId}`);
    return { ok: true };
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error cancelling item:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Process the next item in the queue (called by worker)
 */
export async function processNextQueueItem(): Promise<{ processed: boolean; error?: string }> {
  const item = await getNextQueueItem();
  if (!item) {
    return { processed: false };
  }

  console.log(`${LOG_PREFIX} Processing queue item ${item.id}, asset ${item.adAssetId}`);

  try {
    // Get the ad asset
    const [asset] = await db
      .select()
      .from(adAssets)
      .where(eq(adAssets.id, item.adAssetId));

    if (!asset) {
      await markQueueItemFailed(item.id, { code: "ASSET_NOT_FOUND", message: "Ad asset no longer exists" }, { canRetry: false });
      return { processed: true, error: "Asset not found" };
    }

    // Check if asset is approved for publishing
    if (asset.adminStatus !== "approved") {
      await markQueueItemFailed(
        item.id,
        { code: "NOT_APPROVED", message: `Asset status is ${asset.adminStatus}, expected approved` },
        { canRetry: false }
      );
      return { processed: true, error: "Asset not approved" };
    }

    // Trigger the publish flow
    const { publishAssetToYodeck } = await import("./yodeckPublishService");
    const result = await publishAssetToYodeck(item.adAssetId, item.advertiserId);

    if (result.ok) {
      await markQueueItemCompleted(item.id, {
        yodeckMediaId: result.yodeckMediaId,
        playlistIds: result.playlistIds,
      });
      return { processed: true };
    } else {
      await markQueueItemFailed(
        item.id,
        { code: result.errorCode || "PUBLISH_FAILED", message: result.error || "Unknown error" },
        { canRetry: true }
      );
      return { processed: true, error: result.error };
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing queue item ${item.id}:`, error);
    await markQueueItemFailed(
      item.id,
      { code: "PROCESSING_ERROR", message: error.message },
      { canRetry: true }
    );
    return { processed: true, error: error.message };
  }
}
