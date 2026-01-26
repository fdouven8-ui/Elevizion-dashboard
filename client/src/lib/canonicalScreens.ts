/**
 * Canonical Screens Service
 * Single source of truth for LIVE screen status from Yodeck API
 * 
 * RULE: UI must NEVER use cached DB fields as authoritative truth.
 * All live status comes from /api/admin/canonical-screens
 */

import type { CanonicalScreenStatus } from "@shared/schema";

export interface CanonicalScreensResponse {
  screens: CanonicalScreenStatus[];
  total: number;
  generatedAt: string;
}

/**
 * Fetch all canonical screens from Yodeck API (live truth)
 */
export async function fetchCanonicalScreens(): Promise<CanonicalScreensResponse> {
  const res = await fetch("/api/admin/canonical-screens", {
    credentials: "include",
  });
  
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to fetch canonical screens: ${error}`);
  }
  
  return res.json();
}

/**
 * Force refresh canonical screens (same as fetch, explicit intent)
 */
export async function refreshCanonicalScreens(): Promise<CanonicalScreensResponse> {
  return fetchCanonicalScreens();
}

/**
 * Ensure compliance for a location (baseline + ads + Elevizion layout)
 */
export async function ensureCompliance(locationId: string): Promise<{
  ok: boolean;
  logs: string[];
  error?: string;
}> {
  const res = await fetch(`/api/admin/screens/${locationId}/ensure-compliance`, {
    method: "POST",
    credentials: "include",
  });
  
  if (!res.ok) {
    const error = await res.text();
    return { ok: false, logs: [], error };
  }
  
  return res.json();
}

/**
 * Force reset a screen to empty playlist
 */
export async function forceReset(locationId: string): Promise<{
  ok: boolean;
  logs: string[];
  error?: string;
}> {
  const res = await fetch(`/api/admin/screens/${locationId}/force-reset`, {
    method: "POST",
    credentials: "include",
  });
  
  if (!res.ok) {
    const error = await res.text();
    return { ok: false, logs: [], error };
  }
  
  return res.json();
}
