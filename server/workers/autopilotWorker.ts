/**
 * AutopilotWorker - Background worker that ensures all live locations have content
 * 
 * Runs every 5 minutes and:
 * 1. Finds all live locations (status: active or readyForAds)
 * 2. Checks if they need repair (missing playlists, empty content)
 * 3. Runs ensureCanonicalSetupForLocation for each one
 * 
 * Features:
 * - Per-location locking to prevent parallel processing
 * - Rate limiting to avoid Yodeck API overload
 * - Logs all repairs for monitoring
 */

import { db } from "../db";
import { locations } from "@shared/schema";
import { eq, or } from "drizzle-orm";
import { ensureCanonicalSetupForLocation, getContentStatus } from "../services/yodeckCanonicalService";

const WORKER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOCATION_DELAY_MS = 2000; // 2 seconds between locations (rate limit)
const MAX_REPAIRS_PER_RUN = 10; // Limit repairs per run to avoid long runs

const processingLocations = new Set<string>();
let workerRunning = false;

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
  
  logs.push(`[AutopilotWorker] Starting autopilot check...`);
  
  // Get all live locations
  const liveLocations = await db.select()
    .from(locations)
    .where(or(
      eq(locations.status, "active"),
      eq(locations.status, "readyForAds")
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
    const status = await getContentStatus(location.id);
    checked++;
    
    if (!status.needsRepair) {
      continue;
    }
    
    const repairReason = status.layout?.error || (!status.ads.playlistId ? "geen ADS playlist" : "lege ADS playlist");
    logs.push(`[AutopilotWorker] ${location.name} needs repair: ${repairReason}`);
    
    // Stop if we've hit max repairs
    if (processedCount >= MAX_REPAIRS_PER_RUN) {
      logs.push(`[AutopilotWorker] Max repairs reached (${MAX_REPAIRS_PER_RUN}), will continue next run`);
      break;
    }
    
    // Lock and process
    processingLocations.add(location.id);
    
    try {
      const result = await ensureCanonicalSetupForLocation(location.id);
      
      if (result.ok) {
        repaired++;
        logs.push(`[AutopilotWorker] ✓ ${location.name} repaired (layout: ${result.layoutAssigned ? "OK" : "-"}, ads: ${result.ads.itemCount})`);
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

export function startAutopilotWorker(): void {
  if (workerRunning) {
    console.log("[AutopilotWorker] Already running");
    return;
  }
  
  workerRunning = true;
  console.log("[AutopilotWorker] Starting worker (interval: 5 minutes)");
  
  // First run after 2 minutes
  setTimeout(async () => {
    try {
      const result = await runAutopilotCheck();
      result.logs.forEach(log => console.log(log));
    } catch (error: any) {
      console.error("[AutopilotWorker] Error:", error);
    }
    
    // Then run every 5 minutes
    setInterval(async () => {
      try {
        const result = await runAutopilotCheck();
        if (result.repaired > 0 || result.errors > 0) {
          result.logs.forEach(log => console.log(log));
        } else {
          console.log(`[AutopilotWorker] Check complete: ${result.checked} locations OK`);
        }
      } catch (error: any) {
        console.error("[AutopilotWorker] Error:", error);
      }
    }, WORKER_INTERVAL_MS);
  }, 2 * 60 * 1000); // 2 minutes delay for first run
  
  console.log("[AutopilotWorker] First check scheduled in 2 minutes");
}

export function stopAutopilotWorker(): void {
  workerRunning = false;
  console.log("[AutopilotWorker] Stopped");
}
