/**
 * AutopilotWorker - Background worker that ensures all screens have correct playlists
 * 
 * ARCHITECTURE: TruthReconciler-based self-heal
 * - Every 10 minutes: runs reconcileLocationTruth for each active location
 * - Ensures baseline + DB-selected ads are in REPLACE mode per screen playlist
 * - Rate-limited to avoid Yodeck API spikes
 * - Idempotent: safe to run at any time
 */

import { db } from "../db";
import { locations, screens } from "@shared/schema";
import { eq, or, isNotNull } from "drizzle-orm";

const RECONCILE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const LOCATION_DELAY_MS = 3000; // 3 seconds between locations (rate limit)
const INITIAL_DELAY_MS = 3 * 60 * 1000; // 3 minutes delay for first run

let workerRunning = false;
let reconcileIntervalId: ReturnType<typeof setInterval> | null = null;

export async function runReconcileSweep(): Promise<{
  locationsChecked: number;
  screensReconciled: number;
  errors: number;
  logs: string[];
}> {
  const logs: string[] = [];
  let locationsChecked = 0;
  let screensReconciled = 0;
  let errors = 0;

  const token = process.env.YODECK_AUTH_TOKEN?.trim();
  if (!token) {
    logs.push("[AutopilotWorker] Skipped: no YODECK_AUTH_TOKEN configured");
    return { locationsChecked: 0, screensReconciled: 0, errors: 0, logs };
  }

  logs.push("[AutopilotWorker] Starting scheduled reconcile sweep...");

  const activeLocations = await db.select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(or(
      eq(locations.status, "active"),
      eq(locations.readyForAds, true)
    ));

  const locationsWithScreens = new Set<string>();
  const linkedScreens = await db.select({ id: screens.id, locationId: screens.locationId })
    .from(screens)
    .where(isNotNull(screens.yodeckPlayerId));

  for (const s of linkedScreens) {
    if (s.locationId) locationsWithScreens.add(s.locationId);
  }

  const targetLocations = activeLocations.filter(l => locationsWithScreens.has(l.id));
  logs.push(`[AutopilotWorker] ${activeLocations.length} active locations, ${targetLocations.length} with linked screens`);

  if (targetLocations.length === 0) {
    logs.push("[AutopilotWorker] No locations with linked screens to reconcile");
    return { locationsChecked: 0, screensReconciled: 0, errors: 0, logs };
  }

  const { reconcileLocationTruth } = await import("../services/truthReconciler");

  for (let i = 0; i < targetLocations.length; i++) {
    const location = targetLocations[i];
    locationsChecked++;

    try {
      const result = await reconcileLocationTruth({
        locationId: location.id,
        push: false,
        reason: "scheduled-selfheal",
      });

      screensReconciled += result.screens.length;

      if (result.ok) {
        logs.push(`[AutopilotWorker] ${location.name}: OK (${result.screens.length} screens)`);
      } else {
        errors++;
        logs.push(`[AutopilotWorker] ${location.name}: ${result.errors.length} errors - ${result.errors[0] || ""}`);
      }
    } catch (err: any) {
      errors++;
      logs.push(`[AutopilotWorker] ${location.name}: ERROR ${err.message}`);
    }

    // Rate limit between locations
    if (i < targetLocations.length - 1) {
      await new Promise(r => setTimeout(r, LOCATION_DELAY_MS));
    }
  }

  logs.push(`[AutopilotWorker] Sweep done: ${locationsChecked} locations, ${screensReconciled} screens, ${errors} errors`);
  return { locationsChecked, screensReconciled, errors, logs };
}

export function startAutopilotWorker(): void {
  if (workerRunning) {
    console.log("[AutopilotWorker] Already running");
    return;
  }

  workerRunning = true;
  console.log(`[AutopilotWorker] Starting worker (interval: ${RECONCILE_INTERVAL_MS / 1000}s, initial delay: ${INITIAL_DELAY_MS / 1000}s)`);

  setTimeout(async () => {
    try {
      const result = await runReconcileSweep();
      if (result.errors > 0 || result.screensReconciled > 0) {
        result.logs.forEach(log => console.log(log));
      } else {
        console.log(`[AutopilotWorker] Initial sweep: ${result.locationsChecked} locations OK`);
      }
    } catch (err: any) {
      console.error("[AutopilotWorker] Initial sweep error:", err.message);
    }

    reconcileIntervalId = setInterval(async () => {
      try {
        const result = await runReconcileSweep();
        if (result.errors > 0) {
          result.logs.forEach(log => console.log(log));
        } else {
          console.log(`[AutopilotWorker] Sweep: ${result.locationsChecked} locations, ${result.screensReconciled} screens OK`);
        }
      } catch (err: any) {
        console.error("[AutopilotWorker] Sweep error:", err.message);
      }
    }, RECONCILE_INTERVAL_MS);
  }, INITIAL_DELAY_MS);

  console.log(`[AutopilotWorker] First sweep scheduled in ${INITIAL_DELAY_MS / 1000}s`);
}

export function stopAutopilotWorker(): void {
  workerRunning = false;
  if (reconcileIntervalId) {
    clearInterval(reconcileIntervalId);
    reconcileIntervalId = null;
  }
  console.log("[AutopilotWorker] Stopped");
}
