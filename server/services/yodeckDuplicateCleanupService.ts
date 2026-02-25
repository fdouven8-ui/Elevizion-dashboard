import { db } from "../db";
import { adAssets, advertisers } from "@shared/schema";
import { eq } from "drizzle-orm";

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN;
const DRY_RUN_DEFAULT = (process.env.EVZ_YODECK_CLEANUP_DRY_RUN || "true") !== "false";
const ASSET_MARKER_PREFIX = "EVZ_ASSET_ID=";

export interface CleanupResult {
  correlationId: string;
  assetId: number;
  canonicalMediaId: number;
  dryRun: boolean;
  candidates: number[];
  deleted: number[];
  skippedBusy: number[];
  skippedInUse: number[];
  skippedUnknownUsage: number[];
  errors: Array<{ mediaId: number; error: string }>;
}

export function buildAssetMarker(assetId: number): string {
  return `${ASSET_MARKER_PREFIX}${assetId}`;
}

export function extractAssetIdFromDescription(description: string | undefined | null): number | null {
  if (!description) return null;
  const match = description.match(/EVZ_ASSET_ID=(\d+)/);
  return match ? parseInt(match[1]) : null;
}

export async function stampAssetMarkerOnMedia(yodeckMediaId: number, assetId: number, correlationId: string): Promise<boolean> {
  if (!YODECK_TOKEN) return false;
  const marker = buildAssetMarker(assetId);
  try {
    const getResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });
    if (!getResp.ok) {
      console.warn(`[DupCleanup][${correlationId}] STAMP_FETCH_FAIL mediaId=${yodeckMediaId} status=${getResp.status}`);
      return false;
    }
    const mediaData = await getResp.json();
    const currentDesc = mediaData.description || "";
    if (currentDesc.includes(marker)) {
      console.log(`[DupCleanup][${correlationId}] STAMP_ALREADY_PRESENT mediaId=${yodeckMediaId} marker=${marker}`);
      return true;
    }
    const newDesc = currentDesc ? `${currentDesc} | ${marker}` : marker;
    const patchResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/`, {
      method: "PATCH",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description: newDesc }),
    });
    if (patchResp.ok) {
      console.log(`[DupCleanup][${correlationId}] STAMP_OK mediaId=${yodeckMediaId} marker=${marker}`);
      return true;
    }
    console.warn(`[DupCleanup][${correlationId}] STAMP_PATCH_FAIL mediaId=${yodeckMediaId} status=${patchResp.status}`);
    return false;
  } catch (err: any) {
    console.warn(`[DupCleanup][${correlationId}] STAMP_ERROR mediaId=${yodeckMediaId} error=${err.message}`);
    return false;
  }
}

async function listMediaByAssetMarker(assetId: number, correlationId: string): Promise<Array<{ id: number; status: string; description: string; name: string }>> {
  if (!YODECK_TOKEN) return [];
  const marker = buildAssetMarker(assetId);
  const results: Array<{ id: number; status: string; description: string; name: string }> = [];

  try {
    let offset = 0;
    const limit = 50;
    for (let page = 0; page < 10; page++) {
      const resp = await fetch(`${YODECK_API_BASE}/media/?limit=${limit}&offset=${offset}`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });
      if (!resp.ok) break;
      const data = await resp.json();
      const items = data.results || [];
      for (const item of items) {
        const desc = item.description || "";
        if (desc.includes(marker)) {
          results.push({
            id: item.id,
            status: item.status || "unknown",
            description: desc,
            name: item.name || "",
          });
        }
      }
      if (!data.next) break;
      offset += limit;
    }
  } catch (err: any) {
    console.warn(`[DupCleanup][${correlationId}] LIST_BY_MARKER_ERROR assetId=${assetId} error=${err.message}`);
  }

  console.log(`[DupCleanup][${correlationId}] LIST_BY_MARKER assetId=${assetId} found=${results.length} ids=[${results.map(r => r.id).join(",")}]`);
  return results;
}

async function deleteYodeckMedia(mediaId: number, correlationId: string): Promise<boolean> {
  if (!YODECK_TOKEN) return false;
  try {
    const resp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      method: "DELETE",
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });
    const ok = resp.ok || resp.status === 204;
    console.log(`[DupCleanup][${correlationId}] DELETE_MEDIA mediaId=${mediaId} status=${resp.status} ok=${ok}`);
    return ok;
  } catch (err: any) {
    console.warn(`[DupCleanup][${correlationId}] DELETE_ERROR mediaId=${mediaId} error=${err.message}`);
    return false;
  }
}

export async function cleanupDuplicateYodeckMediaForAsset(
  assetId: number,
  canonicalMediaId: number,
  opts?: { dryRun?: boolean; correlationId?: string },
): Promise<CleanupResult> {
  const dryRun = opts?.dryRun ?? DRY_RUN_DEFAULT;
  const correlationId = opts?.correlationId || Math.random().toString(36).substring(2, 8);
  const BUSY_STATUSES = new Set(["encoding", "processing", "initialized", "uploading"]);

  const result: CleanupResult = {
    correlationId,
    assetId,
    canonicalMediaId,
    dryRun,
    candidates: [],
    deleted: [],
    skippedBusy: [],
    skippedInUse: [],
    skippedUnknownUsage: [],
    errors: [],
  };

  console.log(`[DupCleanup][${correlationId}] START assetId=${assetId} canonicalMediaId=${canonicalMediaId} dryRun=${dryRun}`);

  const markedMedia = await listMediaByAssetMarker(assetId, correlationId);

  const duplicates = markedMedia.filter(m => m.id !== canonicalMediaId);
  result.candidates = duplicates.map(d => d.id);

  if (duplicates.length === 0) {
    console.log(`[DupCleanup][${correlationId}] NO_DUPLICATES assetId=${assetId} canonicalMediaId=${canonicalMediaId}`);
    return result;
  }

  console.log(`[DupCleanup][${correlationId}] FOUND_DUPLICATES assetId=${assetId} count=${duplicates.length} ids=[${duplicates.map(d => d.id).join(",")}]`);

  for (const dup of duplicates) {
    if (dup.id === canonicalMediaId) continue;

    if (BUSY_STATUSES.has(dup.status.toLowerCase())) {
      console.log(`[DupCleanup][${correlationId}] SKIP_BUSY mediaId=${dup.id} status=${dup.status}`);
      result.skippedBusy.push(dup.id);
      continue;
    }

    if (dryRun) {
      console.log(`[DupCleanup][${correlationId}] DRY_RUN_WOULD_DELETE mediaId=${dup.id} status=${dup.status} name="${dup.name}"`);
      result.deleted.push(dup.id);
      continue;
    }

    const ok = await deleteYodeckMedia(dup.id, correlationId);
    if (ok) {
      result.deleted.push(dup.id);
    } else {
      result.errors.push({ mediaId: dup.id, error: "delete_failed" });
    }
  }

  const summary = `CLEANUP_DUPLICATES assetId=${assetId} kept=${canonicalMediaId} candidates=[${result.candidates.join(",")}] deleted=[${result.deleted.join(",")}] skippedBusy=[${result.skippedBusy.join(",")}] skippedInUse=[${result.skippedInUse.join(",")}] errors=${result.errors.length} dryRun=${dryRun}`;
  console.log(`[DupCleanup][${correlationId}] ${summary}`);

  return result;
}
