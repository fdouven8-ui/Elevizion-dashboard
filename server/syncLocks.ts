import { pgTable, text, varchar, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Distributed Sync Locks Table
 * Prevents race conditions across multiple server instances
 */
export const syncLocks = pgTable("sync_locks", {
  id: varchar("id").primaryKey(), // lock name, e.g., "yodeck_sync", "moneybird_sync"
  locked: boolean("locked").notNull().default(false),
  lockedAt: timestamp("locked_at"),
  lockedBy: text("locked_by"), // server instance identifier
  expiresAt: timestamp("expires_at"), // auto-expire locks after timeout
  lastSuccessAt: timestamp("last_success_at"),
  lastError: text("last_error"),
  retryCount: integer("retry_count").default(0),
  metadata: text("metadata"), // JSON string with extra info
}, (table) => ({
  // Index for fast lookup of expired locks
  expiresAtIdx: sql`CREATE INDEX IF NOT EXISTS sync_locks_expires_at_idx ON ${table} (expires_at)`,
}));

/**
 * Lock configuration per sync type
 */
export const SYNC_LOCK_CONFIG: Record<string, { timeoutMs: number; minIntervalMs: number }> = {
  yodeck_sync: {
    timeoutMs: 5 * 60 * 1000, // 5 minutes max lock duration
    minIntervalMs: 30 * 1000, // 30 seconds between syncs
  },
  moneybird_sync: {
    timeoutMs: 5 * 60 * 1000,
    minIntervalMs: 60 * 1000, // 1 minute
  },
  publish_queue: {
    timeoutMs: 10 * 60 * 1000,
    minIntervalMs: 10 * 1000, // 10 seconds
  },
};

const SERVER_ID = process.env.REPLIT_DEPLOYMENT_ID || process.env.HOSTNAME || `server-${Date.now()}`;

/**
 * Acquire a distributed lock
 * Returns true if lock was acquired, false otherwise
 */
export async function acquireLock(
  lockId: string,
  options?: { timeoutMs?: number; skipIntervalCheck?: boolean }
): Promise<{ ok: boolean; reason?: string; wasStale?: boolean }> {
  const config = SYNC_LOCK_CONFIG[lockId] || { timeoutMs: 5 * 60 * 1000, minIntervalMs: 30 * 1000 };
  const timeoutMs = options?.timeoutMs || config.timeoutMs;
  const expiresAt = new Date(Date.now() + timeoutMs);

  try {
    // Check if there's an active lock
    const [existing] = await db
      .select()
      .from(syncLocks)
      .where(sql`${syncLocks.id} = ${lockId}`)
      .limit(1);

    const now = new Date();

    if (existing?.locked) {
      // Check if lock is expired (stale)
      if (existing.expiresAt && new Date(existing.expiresAt) < now) {
        console.warn(`[SyncLock] Stale lock detected for ${lockId}, breaking it`);
        // Break stale lock
        await db
          .update(syncLocks)
          .set({
            locked: false,
            lockedAt: null,
            lockedBy: null,
            expiresAt: null,
            lastError: "Lock expired and was broken",
          })
          .where(sql`${syncLocks.id} = ${lockId}`);
      } else {
        // Active lock exists
        const remainingMs = existing.expiresAt 
          ? Math.max(0, new Date(existing.expiresAt).getTime() - Date.now())
          : timeoutMs;
        return {
          ok: false,
          reason: `Lock already held by ${existing.lockedBy}, expires in ${Math.ceil(remainingMs / 1000)}s`,
        };
      }
    }

    // Check min interval unless skipped
    if (!options?.skipIntervalCheck && existing?.lastSuccessAt) {
      const elapsed = Date.now() - new Date(existing.lastSuccessAt).getTime();
      if (elapsed < config.minIntervalMs) {
        const waitSecs = Math.ceil((config.minIntervalMs - elapsed) / 1000);
        return { ok: false, reason: `Te snel na vorige sync, wacht nog ${waitSecs}s` };
      }
    }

    // Acquire lock using upsert
    await db
      .insert(syncLocks)
      .values({
        id: lockId,
        locked: true,
        lockedAt: now,
        lockedBy: SERVER_ID,
        expiresAt,
        metadata: JSON.stringify({ timeoutMs }),
      })
      .onConflictDoUpdate({
        target: syncLocks.id,
        set: {
          locked: true,
          lockedAt: now,
          lockedBy: SERVER_ID,
          expiresAt,
          metadata: JSON.stringify({ timeoutMs }),
        },
      });

    return { ok: true, wasStale: existing?.expiresAt ? new Date(existing.expiresAt) < now : false };
  } catch (error) {
    console.error(`[SyncLock] Error acquiring lock ${lockId}:`, error);
    return { ok: false, reason: `Database error: ${error}` };
  }
}

/**
 * Release a distributed lock
 */
export async function releaseLock(
  lockId: string,
  options?: { success?: boolean; error?: string }
): Promise<void> {
  try {
    const updates: any = {
      locked: false,
      lockedAt: null,
      lockedBy: null,
      expiresAt: null,
    };

    if (options?.success) {
      updates.lastSuccessAt = new Date();
      updates.retryCount = 0;
    }

    if (options?.error) {
      updates.lastError = options.error;
      updates.retryCount = sql`${syncLocks.retryCount} + 1`;
    }

    await db
      .update(syncLocks)
      .set(updates)
      .where(sql`${syncLocks.id} = ${lockId}`);
  } catch (error) {
    console.error(`[SyncLock] Error releasing lock ${lockId}:`, error);
  }
}

/**
 * Force break a lock (admin use only)
 */
export async function forceBreakLock(lockId: string): Promise<void> {
  await db
    .update(syncLocks)
    .set({
      locked: false,
      lockedAt: null,
      lockedBy: null,
      expiresAt: null,
      lastError: "Manually broken by admin",
    })
    .where(sql`${syncLocks.id} = ${lockId}`);
  console.log(`[SyncLock] Lock ${lockId} manually broken`);
}

/**
 * Get lock status
 */
export async function getLockStatus(lockId: string): Promise<{
  locked: boolean;
  lockedBy?: string;
  lockedAt?: Date;
  expiresAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
  retryCount: number;
} | null> {
  const [lock] = await db
    .select()
    .from(syncLocks)
    .where(sql`${syncLocks.id} = ${lockId}`)
    .limit(1);

  return lock || null;
}

/**
 * Clean up all expired locks
 */
export async function cleanupExpiredLocks(): Promise<number> {
  const result = await db
    .update(syncLocks)
    .set({
      locked: false,
      lockedAt: null,
      lockedBy: null,
      expiresAt: null,
    })
    .where(sql`${syncLocks.locked} = true AND ${syncLocks.expiresAt} < NOW()`);

  return result.rowCount || 0;
}
