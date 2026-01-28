/**
 * AutopilotWorker - Background worker that ensures all screens have content
 * 
 * NEW ARCHITECTURE: Per-Screen Playlist Mode
 * Each screen gets its OWN playlist: "Elevizion | Loop | {ScreenId}"
 * - Baseline items (news/weather from template)
 * - Ads (from active placements for this screen)
 * - Never empty - always has baseline content
 * 
 * Runs every 5 minutes and:
 * 1. Finds all screens with Yodeck devices linked
 * 2. Ensures each screen has its own playlist with correct content
 * 3. Assigns playlist to screen and verifies
 * 
 * Features:
 * - Per-screen locking to prevent parallel processing
 * - Rate limiting to avoid Yodeck API overload
 * - Single source of truth for device status
 * - Logs all repairs for monitoring
 */

import { db } from "../db";
import { locations, screens } from "@shared/schema";
import { eq, or, isNull, sql, isNotNull } from "drizzle-orm";
import { 
  ensureCombinedPlaylistForLocation, 
  getLocationContentStatus,
  ensureBaselineFromTemplate
} from "../services/combinedPlaylistService";
import { repairScreen } from "../services/screenPlaylistService";

const WORKER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SCREEN_DELAY_MS = 2000; // 2 seconds between screens (rate limit)
const LOCATION_DELAY_MS = 2000; // 2 seconds between locations (rate limit)
const MAX_REPAIRS_PER_RUN = 10; // Limit repairs per run to avoid long runs

const processingScreens = new Set<string>();
const processingLocations = new Set<string>();
let workerRunning = false;

/**
 * Run per-screen playlist sync (NEW: primary sync method)
 */
export async function runScreenPlaylistSync(): Promise<{
  checked: number;
  repaired: number;
  errors: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let checked = 0;
  let repaired = 0;
  let errors = 0;
  
  logs.push(`[AutopilotWorker] Starting per-screen playlist sync...`);
  
  // Get all screens with Yodeck devices linked
  const linkedScreens = await db.select({
    id: screens.id,
    screenId: screens.screenId,
    name: screens.name,
    yodeckPlayerId: screens.yodeckPlayerId,
  })
    .from(screens)
    .where(isNotNull(screens.yodeckPlayerId));
  
  logs.push(`[AutopilotWorker] Found ${linkedScreens.length} screens with Yodeck devices`);
  
  let processedCount = 0;
  
  for (const screen of linkedScreens) {
    if (processingScreens.has(screen.id)) {
      logs.push(`[AutopilotWorker] Skipping ${screen.screenId || screen.name} - already processing`);
      continue;
    }
    
    if (processedCount >= MAX_REPAIRS_PER_RUN) {
      logs.push(`[AutopilotWorker] Max repairs reached (${MAX_REPAIRS_PER_RUN}), will continue next run`);
      break;
    }
    
    processingScreens.add(screen.id);
    checked++;
    
    try {
      const result = await repairScreen(screen.id);
      
      if (result.ok) {
        repaired++;
        logs.push(`[AutopilotWorker] ✓ ${screen.screenId || screen.name} repaired (playlist: ${result.expectedPlaylistId}, items: ${result.itemCount})`);
      } else if (result.errorReason === "DEVICE_UNLINKED") {
        logs.push(`[AutopilotWorker] - ${screen.screenId || screen.name} skipped: device unlinked`);
      } else {
        errors++;
        logs.push(`[AutopilotWorker] ✗ ${screen.screenId || screen.name} repair failed: ${result.errorReason}`);
      }
      
      processedCount++;
      
      if (processedCount < MAX_REPAIRS_PER_RUN) {
        await new Promise(resolve => setTimeout(resolve, SCREEN_DELAY_MS));
      }
    } catch (error: any) {
      errors++;
      logs.push(`[AutopilotWorker] ✗ ${screen.screenId || screen.name} error: ${error.message}`);
    } finally {
      processingScreens.delete(screen.id);
    }
  }
  
  logs.push(`[AutopilotWorker] Screen sync completed: ${checked} checked, ${repaired} repaired, ${errors} errors`);
  
  return { checked, repaired, errors, logs };
}

/**
 * Run location-level combined playlist check (legacy - runs after screen sync)
 */
export async function runAutopilotCheck(): Promise<{
  checked: number;
  repaired: number;
  errors: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let checked = 0;
  let repaired = 0;
  let errors = 0;
  
  logs.push(`[AutopilotWorker] Starting location autopilot check (Combined Playlist Mode)...`);
  
  // Get all live locations
  const liveLocations = await db.select()
    .from(locations)
    .where(or(
      eq(locations.status, "active"),
      eq(locations.readyForAds, true)
    ));
  
  logs.push(`[AutopilotWorker] Found ${liveLocations.length} live locations`);
  
  let processedCount = 0;
  
  for (const location of liveLocations) {
    // Check if already processing
    if (processingLocations.has(location.id)) {
      logs.push(`[AutopilotWorker] Skipping ${location.name} - already processing`);
      continue;
    }
    
    // Check if needs repair
    const status = await getLocationContentStatus(location.id);
    checked++;
    
    if (!status.needsRepair) {
      continue;
    }
    
    const repairReason = status.error || 
      (!status.combinedPlaylistId ? "geen combined playlist" : 
       status.combinedPlaylistItemCount === 0 ? "lege combined playlist" : "onbekend");
    logs.push(`[AutopilotWorker] ${location.name} needs repair: ${repairReason}`);
    
    // Stop if we've hit max repairs
    if (processedCount >= MAX_REPAIRS_PER_RUN) {
      logs.push(`[AutopilotWorker] Max repairs reached (${MAX_REPAIRS_PER_RUN}), will continue next run`);
      break;
    }
    
    // Lock and process
    processingLocations.add(location.id);
    
    try {
      // STEP 0: First ensure baseline playlist is filled from template
      // This is the KEY fix - fill empty baselines from "Elevizion - Basis"
      const baselineResult = await ensureBaselineFromTemplate(location.id);
      if (baselineResult.itemsSynced) {
        logs.push(`[AutopilotWorker] ✓ ${location.name} baseline synced (${baselineResult.baselineItemCount} items from template)`);
      } else if (!baselineResult.ok) {
        logs.push(`[AutopilotWorker] ⚠️ ${location.name} baseline sync issue: ${baselineResult.error}`);
      }
      
      // STEP 1: Then ensure combined playlist with base items + ads
      const result = await ensureCombinedPlaylistForLocation(location.id);
      
      if (result.ok) {
        repaired++;
        logs.push(`[AutopilotWorker] ✓ ${location.name} repaired (playlist: ${result.combinedPlaylistId}, items: ${result.itemCount})`);
      } else {
        errors++;
        logs.push(`[AutopilotWorker] ✗ ${location.name} repair failed: ${result.error}`);
        // Print detailed logs on failure for debugging
        result.logs.forEach(log => logs.push(`  ${log}`));
      }
      
      processedCount++;
      
      // Rate limit delay
      if (processedCount < MAX_REPAIRS_PER_RUN) {
        await new Promise(resolve => setTimeout(resolve, LOCATION_DELAY_MS));
      }
    } catch (error: any) {
      errors++;
      logs.push(`[AutopilotWorker] ✗ ${location.name} error: ${error.message}`);
    } finally {
      processingLocations.delete(location.id);
    }
  }
  
  logs.push(`[AutopilotWorker] Completed: ${checked} checked, ${repaired} repaired, ${errors} errors`);
  
  return { checked, repaired, errors, logs };
}

/**
 * Run full autopilot sync (screens first, then locations)
 */
async function runFullAutopilotSync(): Promise<void> {
  // STEP 1: Per-screen playlist sync (NEW primary method)
  try {
    const screenResult = await runScreenPlaylistSync();
    if (screenResult.repaired > 0 || screenResult.errors > 0) {
      screenResult.logs.forEach(log => console.log(log));
    } else {
      console.log(`[AutopilotWorker] Screen sync: ${screenResult.checked} screens OK`);
    }
  } catch (error: any) {
    console.error("[AutopilotWorker] Screen sync error:", error);
  }
  
  // STEP 2: Location-level check (legacy, for combined playlists)
  try {
    const locationResult = await runAutopilotCheck();
    if (locationResult.repaired > 0 || locationResult.errors > 0) {
      locationResult.logs.forEach(log => console.log(log));
    } else {
      console.log(`[AutopilotWorker] Location check: ${locationResult.checked} locations OK`);
    }
  } catch (error: any) {
    console.error("[AutopilotWorker] Location check error:", error);
  }
}

export function startAutopilotWorker(): void {
  if (workerRunning) {
    console.log("[AutopilotWorker] Already running");
    return;
  }
  
  workerRunning = true;
  console.log("[AutopilotWorker] Starting worker (interval: 5 minutes)");
  
  // First run after 2 minutes
  setTimeout(async () => {
    await runFullAutopilotSync();
    
    // Then run every 5 minutes
    setInterval(async () => {
      await runFullAutopilotSync();
    }, WORKER_INTERVAL_MS);
  }, 2 * 60 * 1000); // 2 minutes delay for first run
  
  console.log("[AutopilotWorker] First check scheduled in 2 minutes");
}

export function stopAutopilotWorker(): void {
  workerRunning = false;
  console.log("[AutopilotWorker] Stopped");
}
