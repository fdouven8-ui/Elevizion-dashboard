/**
 * Yodeck Autopilot Configuration Service
 * 
 * Manages configuration for the autopilot system:
 * - ELEVIZION_SELF_AD_MEDIA_ID: Global self-ad media ID
 * - Layout ADS region mappings per layout
 */

import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

// Config keys
const CONFIG_KEYS = {
  SELF_AD_MEDIA_ID: "yodeck.selfAdMediaId",
  LAYOUT_ADS_REGION_PREFIX: "yodeck.layout.adsRegion.", // e.g., yodeck.layout.adsRegion.7694728
} as const;

// Cache for config values (TTL 60 seconds)
const configCache = new Map<string, { value: string | null; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

/**
 * Get a config value from database with caching
 */
async function getConfigValue(key: string): Promise<string | null> {
  const cached = configCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
  const value = setting?.value || null;
  
  configCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Set a config value in database
 */
async function setConfigValue(key: string, value: string, description?: string, category = "yodeck"): Promise<void> {
  const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key));
  
  if (existing.length > 0) {
    await db.update(systemSettings)
      .set({ value, updatedAt: new Date() })
      .where(eq(systemSettings.key, key));
  } else {
    await db.insert(systemSettings).values({
      key,
      value,
      description: description || key,
      category,
    });
  }
  
  // Invalidate cache
  configCache.delete(key);
}

/**
 * Get the configured self-ad media ID
 */
export async function getSelfAdMediaId(): Promise<number | null> {
  // First check environment variable
  const envValue = process.env.ELEVIZION_SELF_AD_MEDIA_ID;
  if (envValue && !isNaN(parseInt(envValue))) {
    return parseInt(envValue);
  }
  
  // Then check database
  const dbValue = await getConfigValue(CONFIG_KEYS.SELF_AD_MEDIA_ID);
  if (dbValue && !isNaN(parseInt(dbValue))) {
    return parseInt(dbValue);
  }
  
  return null;
}

/**
 * Set the self-ad media ID
 */
export async function setSelfAdMediaId(mediaId: number): Promise<void> {
  await setConfigValue(
    CONFIG_KEYS.SELF_AD_MEDIA_ID, 
    String(mediaId),
    "Yodeck media ID for Elevizion self-ad (fallback when no customer ads)"
  );
  console.log(`[AutopilotConfig] Self-ad media ID set to: ${mediaId}`);
}

/**
 * Get the ADS region ID for a specific layout
 */
export async function getLayoutAdsRegionId(layoutId: number): Promise<number | null> {
  const key = `${CONFIG_KEYS.LAYOUT_ADS_REGION_PREFIX}${layoutId}`;
  const value = await getConfigValue(key);
  if (value && !isNaN(parseInt(value))) {
    return parseInt(value);
  }
  return null;
}

/**
 * Set the ADS region ID for a specific layout
 */
export async function setLayoutAdsRegionId(layoutId: number, regionId: number): Promise<void> {
  const key = `${CONFIG_KEYS.LAYOUT_ADS_REGION_PREFIX}${layoutId}`;
  await setConfigValue(
    key,
    String(regionId),
    `ADS region ID for Yodeck layout ${layoutId}`
  );
  console.log(`[AutopilotConfig] Layout ${layoutId} ADS region set to: ${regionId}`);
}

/**
 * Get all Yodeck config values for admin display
 */
export async function getAllYodeckConfig(): Promise<{
  selfAdMediaId: number | null;
  layoutAdsRegions: Record<string, number>;
}> {
  const selfAdMediaId = await getSelfAdMediaId();
  
  // Get all layout region mappings
  const allSettings = await db.select().from(systemSettings);
  const layoutAdsRegions: Record<string, number> = {};
  
  for (const setting of allSettings) {
    if (setting.key.startsWith(CONFIG_KEYS.LAYOUT_ADS_REGION_PREFIX)) {
      const layoutId = setting.key.replace(CONFIG_KEYS.LAYOUT_ADS_REGION_PREFIX, "");
      const regionId = parseInt(setting.value);
      if (!isNaN(regionId)) {
        layoutAdsRegions[layoutId] = regionId;
      }
    }
  }
  
  return { selfAdMediaId, layoutAdsRegions };
}

/**
 * Clear config cache (useful after updates)
 */
export function clearConfigCache(): void {
  configCache.clear();
}
