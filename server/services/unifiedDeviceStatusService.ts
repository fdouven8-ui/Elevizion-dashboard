/**
 * Unified Device Status Service
 * 
 * SINGLE SOURCE OF TRUTH for screen online/offline status.
 * All UI components should use this service for consistent status display.
 * 
 * Status values:
 * - ONLINE: Device is online and responsive (lastSeenAt < 5 minutes)
 * - OFFLINE: Device is offline or unresponsive
 * - UNLINKED: No Yodeck device ID linked to this screen
 */

import { db } from "../db";
import { screens, locations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { yodeckRequest } from "./yodeckLayoutService";

export type DeviceStatus = "ONLINE" | "OFFLINE" | "UNLINKED";

export interface UnifiedDeviceStatus {
  status: DeviceStatus;
  isOnline: boolean;
  lastSeenAt: string | null;
  lastScreenshotAt: string | null;
  yodeckDeviceId: string | null;
  yodeckDeviceName: string | null;
  source: "yodeck" | "cache" | "unlinked";
  fetchedAt: string;
  error?: string;
}

export interface ScreenPlaylistStatus {
  hasPlaylist: boolean;
  playlistId: string | null;
  playlistName: string | null;
  itemCount: number;
  baselineCount: number;
  adsCount: number;
  lastPushAt: string | null;
  lastPushResult: "ok" | "failed" | "pending" | null;
  mismatch: boolean;
  mismatchReason?: string;
}

export interface ScreenNowPlaying {
  device: UnifiedDeviceStatus;
  playlist: ScreenPlaylistStatus;
  contentItems: Array<{
    id: string;
    name: string;
    type: "baseline" | "ad";
    isInActivePlaylist: boolean;
  }>;
}

const CACHE_TTL_MS = 60 * 1000;
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

const deviceStatusCache = new Map<string, { status: UnifiedDeviceStatus; expiresAt: number }>();

/**
 * Get unified device status for a screen
 * Uses Yodeck API as single source of truth with caching
 */
export async function getYodeckDeviceStatus(screenId: string): Promise<UnifiedDeviceStatus> {
  const cached = deviceStatusCache.get(screenId);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...cached.status, source: "cache" };
  }

  const [screen] = await db.select({
    yodeckPlayerId: screens.yodeckPlayerId,
    yodeckPlayerName: screens.yodeckPlayerName,
    lastSeenAt: screens.lastSeenAt,
  }).from(screens).where(eq(screens.id, screenId));

  if (!screen) {
    return {
      status: "UNLINKED",
      isOnline: false,
      lastSeenAt: null,
      lastScreenshotAt: null,
      yodeckDeviceId: null,
      yodeckDeviceName: null,
      source: "unlinked",
      fetchedAt: new Date().toISOString(),
      error: "SCREEN_NOT_FOUND",
    };
  }

  const yodeckDeviceId = screen.yodeckPlayerId;
  
  if (!yodeckDeviceId) {
    return {
      status: "UNLINKED",
      isOnline: false,
      lastSeenAt: screen.lastSeenAt?.toISOString() || null,
      lastScreenshotAt: null,
      yodeckDeviceId: null,
      yodeckDeviceName: screen.yodeckPlayerName,
      source: "unlinked",
      fetchedAt: new Date().toISOString(),
    };
  }

  try {
    const result = await yodeckRequest<any>(`/screens/${yodeckDeviceId}/`);
    
    if (!result.ok || !result.data) {
      const status: UnifiedDeviceStatus = {
        status: "OFFLINE",
        isOnline: false,
        lastSeenAt: screen.lastSeenAt?.toISOString() || null,
        lastScreenshotAt: null,
        yodeckDeviceId,
        yodeckDeviceName: screen.yodeckPlayerName,
        source: "yodeck",
        fetchedAt: new Date().toISOString(),
        error: result.error || "YODECK_API_ERROR",
      };
      return status;
    }

    const data = result.data;
    const lastSeenOnline = data.last_seen_online || data.last_seen || data.lastSeenAt;
    const lastScreenshot = data.last_screenshot_at || data.screenshot_updated_at;
    
    let isOnline = false;
    if (lastSeenOnline) {
      const lastSeenDate = new Date(lastSeenOnline);
      const now = Date.now();
      isOnline = (now - lastSeenDate.getTime()) < ONLINE_THRESHOLD_MS;
    } else if (data.is_online !== undefined) {
      isOnline = data.is_online === true;
    } else if (data.online !== undefined) {
      isOnline = data.online === true;
    } else if (data.state?.online !== undefined) {
      isOnline = data.state.online === true;
    }

    const status: UnifiedDeviceStatus = {
      status: isOnline ? "ONLINE" : "OFFLINE",
      isOnline,
      lastSeenAt: lastSeenOnline || null,
      lastScreenshotAt: lastScreenshot || null,
      yodeckDeviceId,
      yodeckDeviceName: data.name || screen.yodeckPlayerName,
      source: "yodeck",
      fetchedAt: new Date().toISOString(),
    };

    deviceStatusCache.set(screenId, { status, expiresAt: Date.now() + CACHE_TTL_MS });
    
    await db.update(screens).set({
      status: isOnline ? "online" : "offline",
      lastSeenAt: lastSeenOnline ? new Date(lastSeenOnline) : undefined,
    }).where(eq(screens.id, screenId));

    return status;
  } catch (error: any) {
    return {
      status: "OFFLINE",
      isOnline: false,
      lastSeenAt: screen.lastSeenAt?.toISOString() || null,
      lastScreenshotAt: null,
      yodeckDeviceId,
      yodeckDeviceName: screen.yodeckPlayerName,
      source: "yodeck",
      fetchedAt: new Date().toISOString(),
      error: error.message,
    };
  }
}

/**
 * Get device status for a location (via its linked screen)
 */
export async function getLocationDeviceStatus(locationId: string): Promise<UnifiedDeviceStatus> {
  const [location] = await db.select({
    yodeckDeviceId: locations.yodeckDeviceId,
  }).from(locations).where(eq(locations.id, locationId));

  if (!location || !location.yodeckDeviceId) {
    return {
      status: "UNLINKED",
      isOnline: false,
      lastSeenAt: null,
      lastScreenshotAt: null,
      yodeckDeviceId: null,
      yodeckDeviceName: null,
      source: "unlinked",
      fetchedAt: new Date().toISOString(),
    };
  }

  const [screen] = await db.select({ id: screens.id })
    .from(screens)
    .where(eq(screens.yodeckPlayerId, location.yodeckDeviceId));

  if (!screen) {
    return {
      status: "UNLINKED",
      isOnline: false,
      lastSeenAt: null,
      lastScreenshotAt: null,
      yodeckDeviceId: location.yodeckDeviceId,
      yodeckDeviceName: null,
      source: "unlinked",
      fetchedAt: new Date().toISOString(),
      error: "NO_SCREEN_FOR_DEVICE",
    };
  }

  return getYodeckDeviceStatus(screen.id);
}

/**
 * Clear device status cache for a screen
 */
export function clearDeviceStatusCache(screenId?: string): void {
  if (screenId) {
    deviceStatusCache.delete(screenId);
  } else {
    deviceStatusCache.clear();
  }
}

/**
 * Get batch device status for multiple screens (optimized)
 */
export async function getBatchDeviceStatus(screenIds: string[]): Promise<Map<string, UnifiedDeviceStatus>> {
  const results = new Map<string, UnifiedDeviceStatus>();
  
  const uncachedIds: string[] = [];
  for (const screenId of screenIds) {
    const cached = deviceStatusCache.get(screenId);
    if (cached && cached.expiresAt > Date.now()) {
      results.set(screenId, { ...cached.status, source: "cache" });
    } else {
      uncachedIds.push(screenId);
    }
  }

  for (const screenId of uncachedIds) {
    const status = await getYodeckDeviceStatus(screenId);
    results.set(screenId, status);
  }

  return results;
}
