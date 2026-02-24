/**
 * Publish Queue Worker
 * 
 * Background worker that processes the publish queue
 * - Runs continuously with configurable interval
 * - Processes items in priority order
 * - Handles errors and retries
 * - Provides health checks
 */

import { processNextQueueItem, getQueueStats } from "../services/publishQueueService";
import { acquireLock, releaseLock } from "../syncLocks";

const LOG_PREFIX = "[PublishQueueWorker]";

// Configuration
const DEFAULT_INTERVAL_MS = 10000; // 10 seconds between checks
const LOCK_TIMEOUT_MS = 30000; // 30 seconds max processing time per item
const LOCK_ID = "publish_queue_worker";

let isRunning = false;
let workerInterval: NodeJS.Timeout | null = null;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Process a single queue item with locking
 */
async function processWithLock(): Promise<void> {
  // Try to acquire distributed lock
  const lockResult = await acquireLock(LOCK_ID, { 
    timeoutMs: LOCK_TIMEOUT_MS,
    skipIntervalCheck: true 
  });

  if (!lockResult.ok) {
    // Another instance is processing
    console.log(`${LOG_PREFIX} Skipping cycle - lock held by another instance`);
    return;
  }

  try {
    const result = await processNextQueueItem();
    
    if (result.processed) {
      console.log(`${LOG_PREFIX} Successfully processed queue item`);
      consecutiveErrors = 0; // Reset error counter
    } else {
      // No items to process
      console.log(`${LOG_PREFIX} No items in queue`);
    }
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Error processing queue:`, error);
    consecutiveErrors++;

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`${LOG_PREFIX} Too many consecutive errors (${consecutiveErrors}), pausing worker`);
      stopWorker();
      // Auto-restart after 60 seconds
      setTimeout(() => {
        console.log(`${LOG_PREFIX} Auto-restarting after error pause`);
        startWorker();
      }, 60000);
    }
  } finally {
    await releaseLock(LOCK_ID, { success: consecutiveErrors === 0 });
  }
}

/**
 * Start the publish queue worker
 */
export function startWorker(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (isRunning) {
    console.log(`${LOG_PREFIX} Worker already running`);
    return;
  }

  isRunning = true;
  consecutiveErrors = 0;
  console.log(`${LOG_PREFIX} Starting worker with ${intervalMs}ms interval`);

  // Process immediately on start
  processWithLock();

  // Set up interval
  workerInterval = setInterval(processWithLock, intervalMs);
}

/**
 * Stop the publish queue worker
 */
export function stopWorker(): void {
  if (!isRunning) {
    return;
  }

  isRunning = false;
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
  console.log(`${LOG_PREFIX} Worker stopped`);
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
  return isRunning;
}

/**
 * Get worker health status
 */
export async function getWorkerHealth(): Promise<{
  running: boolean;
  consecutiveErrors: number;
  queueStats: Awaited<ReturnType<typeof getQueueStats>>;
}> {
  return {
    running: isRunning,
    consecutiveErrors,
    queueStats: await getQueueStats(),
  };
}

/**
 * Manually trigger queue processing (bypasses interval)
 */
export async function manualProcess(): Promise<{ processed: boolean; error?: string }> {
  const lockResult = await acquireLock(LOCK_ID, { 
    timeoutMs: LOCK_TIMEOUT_MS,
    skipIntervalCheck: true 
  });

  if (!lockResult.ok) {
    return { processed: false, error: "Another instance is processing" };
  }

  try {
    const result = await processNextQueueItem();
    return result;
  } catch (error: any) {
    return { processed: false, error: error.message };
  } finally {
    await releaseLock(LOCK_ID, { success: true });
  }
}

// Auto-start worker if not in test mode
if (process.env.NODE_ENV !== "test" && process.env.DISABLE_PUBLISH_QUEUE !== "true") {
  // Delay start to allow server initialization
  setTimeout(() => {
    startWorker();
  }, 5000);
}
