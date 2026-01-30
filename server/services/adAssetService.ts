/**
 * AD ASSET SERVICE
 * 
 * Canonical asset management for advertisers.
 * Returns the ONE usable Yodeck media ID for an advertiser.
 */

import { db } from "../db";
import { adAssets, advertisers } from "@shared/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";

export interface CanonicalAsset {
  assetId: string;
  yodeckMediaId: string;
  duration: number;
  filename: string;
  advertiserId: string;
  companyName: string;
}

export interface GetCanonicalAssetResult {
  ok: boolean;
  asset?: CanonicalAsset;
  error?: string;
  errorCode?: "NO_ADVERTISER" | "NO_APPROVED_ASSET" | "NO_YODECK_MEDIA_ID";
}

const APPROVED_STATUSES = [
  "approved",
  "APPROVED",
  "READY_FOR_YODECK",
  "ready_for_yodeck",
  "LIVE",
  "live",
];

/**
 * Get the canonical approved asset for an advertiser.
 * Returns the most recent approved asset with a valid Yodeck media ID.
 */
export async function getCanonicalApprovedAsset(advertiserId: string): Promise<GetCanonicalAssetResult> {
  const advertiser = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId)).then(r => r[0]);
  
  if (!advertiser) {
    return { ok: false, errorCode: "NO_ADVERTISER", error: `Advertiser ${advertiserId} not found` };
  }

  const assets = await db.select()
    .from(adAssets)
    .where(
      and(
        eq(adAssets.advertiserId, advertiserId),
        isNotNull(adAssets.yodeckMediaId)
      )
    )
    .orderBy(desc(adAssets.createdAt));

  const approvedAsset = assets.find(a => 
    APPROVED_STATUSES.includes(a.status || "") || 
    APPROVED_STATUSES.includes(a.yodeckReadinessStatus || "")
  );

  if (!approvedAsset) {
    const anyAsset = assets[0];
    if (anyAsset) {
      return { 
        ok: false, 
        errorCode: "NO_APPROVED_ASSET", 
        error: `Advertiser has ${assets.length} asset(s) but none are approved. Latest status: ${anyAsset.status}, yodeckReadiness: ${anyAsset.yodeckReadinessStatus}` 
      };
    }
    return { ok: false, errorCode: "NO_APPROVED_ASSET", error: "Advertiser has no assets" };
  }

  if (!approvedAsset.yodeckMediaId) {
    return { ok: false, errorCode: "NO_YODECK_MEDIA_ID", error: "Approved asset has no Yodeck media ID" };
  }

  return {
    ok: true,
    asset: {
      assetId: approvedAsset.id,
      yodeckMediaId: String(approvedAsset.yodeckMediaId),
      duration: Number(approvedAsset.durationSeconds) || 15,
      filename: approvedAsset.originalFileName,
      advertiserId: advertiser.id,
      companyName: advertiser.companyName,
    },
  };
}

/**
 * Mark old assets as superseded when a new one is approved.
 * Excludes the new asset from being marked as superseded.
 */
export async function supersedeOldAssets(advertiserId: string, newAssetId: string): Promise<{ supersededCount: number }> {
  const allAssets = await db.select({ id: adAssets.id })
    .from(adAssets)
    .where(
      and(
        eq(adAssets.advertiserId, advertiserId),
        isNotNull(adAssets.yodeckMediaId)
      )
    );

  const toSupersede = allAssets.filter(a => a.id !== newAssetId);
  
  if (toSupersede.length === 0) {
    return { supersededCount: 0 };
  }

  for (const asset of toSupersede) {
    await db.update(adAssets)
      .set({ 
        status: "superseded",
        updatedAt: new Date(),
      })
      .where(eq(adAssets.id, asset.id));
  }

  return { supersededCount: toSupersede.length };
}

/**
 * Get the Yodeck media ID that should be REMOVED from playlists
 * when a new asset supersedes an old one.
 */
export async function getSupersededMediaIds(advertiserId: string, excludeAssetId: string): Promise<string[]> {
  const oldAssets = await db.select({ yodeckMediaId: adAssets.yodeckMediaId })
    .from(adAssets)
    .where(
      and(
        eq(adAssets.advertiserId, advertiserId),
        isNotNull(adAssets.yodeckMediaId)
      )
    );

  return oldAssets
    .filter(a => a.yodeckMediaId)
    .map(a => String(a.yodeckMediaId));
}
