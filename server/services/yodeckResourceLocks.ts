/**
 * Yodeck Resource Lock Manager
 * 
 * Provides per-resource locking to prevent concurrent API calls
 * to the same Yodeck resource (screen, layout, playlist)
 */

type ResourceType = "screen" | "layout" | "playlist" | "media";

interface Lock {
  resource: string;
  acquiredAt: number;
  expiresAt: number;
}

const locks = new Map<string, Lock>();
const DEFAULT_LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds
const LOCK_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// Cleanup expired locks periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  const keysToDelete: string[] = [];
  locks.forEach((lock, key) => {
    if (lock.expiresAt < now) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => {
    locks.delete(key);
    cleaned++;
  });
  if (cleaned > 0) {
    console.log(`[ResourceLocks] Cleaned up ${cleaned} expired locks`);
  }
}, LOCK_CLEANUP_INTERVAL_MS);

/**
 * Generate lock key for a resource
 */
function getLockKey(type: ResourceType, id: string | number): string {
  return `${type}:${id}`;
}

/**
 * Try to acquire a lock on a resource
 * Returns true if lock acquired, false if already locked
 */
export function tryAcquireLock(
  type: ResourceType,
  id: string | number,
  timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS
): boolean {
  const key = getLockKey(type, id);
  const now = Date.now();
  
  const existing = locks.get(key);
  if (existing && existing.expiresAt > now) {
    console.log(`[ResourceLocks] Lock denied: ${key} (held until ${new Date(existing.expiresAt).toISOString()})`);
    return false;
  }
  
  locks.set(key, {
    resource: key,
    acquiredAt: now,
    expiresAt: now + timeoutMs,
  });
  
  console.log(`[ResourceLocks] Lock acquired: ${key} (expires in ${timeoutMs}ms)`);
  return true;
}

/**
 * Release a lock on a resource
 */
export function releaseLock(type: ResourceType, id: string | number): void {
  const key = getLockKey(type, id);
  if (locks.has(key)) {
    locks.delete(key);
    console.log(`[ResourceLocks] Lock released: ${key}`);
  }
}

/**
 * Wait for a lock to become available, with timeout
 * Returns true if lock acquired, false if timed out
 */
export async function waitForLock(
  type: ResourceType,
  id: string | number,
  maxWaitMs: number = 10000,
  pollIntervalMs: number = 500
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    if (tryAcquireLock(type, id)) {
      return true;
    }
    await new Promise(r => setTimeout(r, pollIntervalMs));
  }
  
  console.log(`[ResourceLocks] Timeout waiting for lock: ${getLockKey(type, id)}`);
  return false;
}

/**
 * Execute a function with a resource lock
 * Automatically acquires and releases the lock
 */
export async function withLock<T>(
  type: ResourceType,
  id: string | number,
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_LOCK_TIMEOUT_MS
): Promise<T> {
  const key = getLockKey(type, id);
  const acquired = await waitForLock(type, id, timeoutMs);
  
  if (!acquired) {
    throw new Error(`Could not acquire lock for ${key}`);
  }
  
  try {
    return await fn();
  } finally {
    releaseLock(type, id);
  }
}

/**
 * Check if a resource is currently locked
 */
export function isLocked(type: ResourceType, id: string | number): boolean {
  const key = getLockKey(type, id);
  const lock = locks.get(key);
  return lock !== undefined && lock.expiresAt > Date.now();
}

/**
 * Get current lock status for debugging
 */
export function getLockStatus(): {
  activeLocks: number;
  locks: Array<{ resource: string; acquiredAt: string; expiresIn: string }>;
} {
  const now = Date.now();
  const activeLocks: Array<{ resource: string; acquiredAt: string; expiresIn: string }> = [];
  
  locks.forEach((lock) => {
    if (lock.expiresAt > now) {
      activeLocks.push({
        resource: lock.resource,
        acquiredAt: new Date(lock.acquiredAt).toISOString(),
        expiresIn: `${Math.round((lock.expiresAt - now) / 1000)}s`,
      });
    }
  });
  
  return {
    activeLocks: activeLocks.length,
    locks: activeLocks,
  };
}
