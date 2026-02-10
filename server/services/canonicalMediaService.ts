import { db } from "../db";
import { advertisers, adAssets } from "@shared/schema";
import { eq } from "drizzle-orm";
import { yodeckRequest } from "./simplePlaylistModel";
import { inspectMedia, type YodeckMediaInfo } from "./yodeckMediaMigrationService";
import { uploadVideoToYodeckTransactional } from "./transactionalUploadService";

const LOG_PREFIX = "[CanonicalMedia]";
const READY_STATUSES = ["finished", "ready", "done", "encoded", "active", "ok", "completed"];

export interface EnsureCanonicalResult {
  ok: boolean;
  mediaId: number | null;
  source: "existing_canonical" | "yodeck_search" | "upload" | "url_clone" | "none";
  diagnostics: Record<string, any>;
  error?: string;
}

interface YodeckMediaSearchResult {
  id: number;
  name: string;
  status?: string;
  media_origin?: { type?: string; source?: string; format?: string | null } | string | null;
  file_extension?: string;
  filesize?: number;
}

function isVideoMedia(media: { media_origin?: any; file_extension?: string | null; name?: string }): boolean {
  const origin = media.media_origin;
  if (origin && typeof origin === "object" && origin.type) {
    return origin.type === "video";
  }
  const ext = (media.file_extension || media.name || "").toLowerCase();
  return ext.endsWith(".mp4") || ext.endsWith(".mov") || ext.endsWith(".avi") || ext.endsWith(".webm");
}

function isReadyStatus(status: string | undefined): boolean {
  if (!status) return false;
  return READY_STATUSES.includes(status.toLowerCase());
}

function buildSearchPatterns(advertiser: any, assets: any[]): string[] {
  const patterns: string[] = [];
  
  for (const asset of assets) {
    if (asset.storedFilename) patterns.push(asset.storedFilename);
    if (asset.originalFileName) patterns.push(asset.originalFileName);
  }
  
  const slug = (advertiser.companyName || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .substring(0, 30);
  if (slug) {
    patterns.push(`ADV-${slug}`);
    patterns.push(`EVZ-AD-`);
    patterns.push(`EVZ-PURE-`);
  }
  
  if (advertiser.linkKey) {
    patterns.push(advertiser.linkKey);
  }
  
  return Array.from(new Set(patterns)).filter(Boolean);
}

async function searchYodeckMediaByPatterns(patterns: string[]): Promise<YodeckMediaSearchResult[]> {
  console.log(`${LOG_PREFIX} Searching Yodeck for media matching ${patterns.length} patterns`);
  
  const allMedia: YodeckMediaSearchResult[] = [];
  const seenIds = new Set<number>();
  
  const searchTerms = new Set<string>();
  for (const p of patterns) {
    const base = p.replace(/\.(mp4|mov|avi|webm)$/i, "");
    if (base.length >= 3) {
      searchTerms.add(base.substring(0, 50));
    }
  }
  
  for (const term of Array.from(searchTerms)) {
    try {
      const result = await yodeckRequest<{ count: number; results: YodeckMediaSearchResult[] }>(
        `/media/?search=${encodeURIComponent(term)}&limit=50`
      );
      if (result.ok && result.data?.results) {
        for (const m of result.data.results) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            allMedia.push(m);
          }
        }
      }
    } catch (err: any) {
      console.warn(`${LOG_PREFIX} Search failed for "${term}": ${err.message}`);
    }
  }
  
  console.log(`${LOG_PREFIX} Found ${allMedia.length} unique media items across ${searchTerms.size} searches`);
  return allMedia;
}

function scoreCandidates(
  candidates: YodeckMediaSearchResult[],
  patterns: string[]
): Array<YodeckMediaSearchResult & { score: number; matchedPattern: string }> {
  const scored = [];
  const patternsLower = patterns.map(p => p.toLowerCase());
  
  for (const m of candidates) {
    if (!isVideoMedia(m)) continue;
    
    const name = (m.name || "").toLowerCase();
    let bestScore = 0;
    let matchedPattern = "";
    
    for (const p of patternsLower) {
      const pBase = p.replace(/\.(mp4|mov|avi|webm)$/i, "");
      const nBase = name.replace(/\.(mp4|mov|avi|webm)$/i, "");
      
      if (nBase === pBase) {
        bestScore = Math.max(bestScore, 100);
        matchedPattern = p;
      } else if (name.includes(pBase) || pBase.includes(nBase)) {
        bestScore = Math.max(bestScore, 70);
        matchedPattern = p;
      } else if (name.includes(p.substring(0, 8))) {
        bestScore = Math.max(bestScore, 40);
        matchedPattern = p;
      }
    }
    
    if (bestScore > 0) {
      const statusReady = isReadyStatus(m.status);
      if (statusReady) bestScore += 20;
      if ((m.filesize || 0) > 0) bestScore += 5;
      
      scored.push({ ...m, score: bestScore, matchedPattern });
    }
  }
  
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

async function validateMediaInYodeck(mediaId: number): Promise<{ valid: boolean; info: YodeckMediaInfo | null; reason?: string }> {
  const inspection = await inspectMedia(mediaId);
  if (!inspection.ok || !inspection.media) {
    return { valid: false, info: null, reason: inspection.notFound ? "NOT_FOUND_404" : (inspection.error || "INSPECT_FAILED") };
  }
  
  const media = inspection.media;
  if (!isReadyStatus(media.status)) {
    return { valid: false, info: media, reason: `STATUS_NOT_READY: ${media.status}` };
  }
  
  if (!isVideoMedia(media)) {
    return { valid: false, info: media, reason: `NOT_VIDEO: type=${JSON.stringify(media.media_origin)}` };
  }
  
  return { valid: true, info: media };
}

export async function ensureCanonicalYodeckMedia(advertiserId: string): Promise<EnsureCanonicalResult> {
  const correlationId = `canonical-${Date.now().toString(36)}`;
  console.log(`${LOG_PREFIX} [${correlationId}] START advertiserId=${advertiserId}`);
  
  const diagnostics: Record<string, any> = { correlationId, advertiserId, steps: [] };
  
  const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, advertiserId));
  if (!advertiser) {
    return { ok: false, mediaId: null, source: "none", error: "Advertiser niet gevonden", diagnostics };
  }
  
  diagnostics.advertiserName = advertiser.companyName;
  diagnostics.currentCanonical = advertiser.yodeckMediaIdCanonical;
  diagnostics.assetStatus = advertiser.assetStatus;
  
  const assets = await db.select().from(adAssets).where(eq(adAssets.advertiserId, advertiserId));
  diagnostics.assetCount = assets.length;
  
  if (advertiser.yodeckMediaIdCanonical) {
    diagnostics.steps.push({ step: "check_existing_canonical", mediaId: advertiser.yodeckMediaIdCanonical });
    const validation = await validateMediaInYodeck(advertiser.yodeckMediaIdCanonical);
    
    if (validation.valid) {
      console.log(`${LOG_PREFIX} [${correlationId}] Existing canonical ${advertiser.yodeckMediaIdCanonical} is VALID`);
      diagnostics.steps.push({ step: "existing_canonical_valid", mediaId: advertiser.yodeckMediaIdCanonical });
      return { ok: true, mediaId: advertiser.yodeckMediaIdCanonical, source: "existing_canonical", diagnostics };
    }
    
    console.warn(`${LOG_PREFIX} [${correlationId}] Existing canonical ${advertiser.yodeckMediaIdCanonical} is INVALID: ${validation.reason}`);
    diagnostics.steps.push({ step: "existing_canonical_invalid", reason: validation.reason, mediaInfo: validation.info ? { status: validation.info.status, name: validation.info.name } : null });
  }
  
  const patterns = buildSearchPatterns(advertiser, assets);
  diagnostics.searchPatterns = patterns;
  diagnostics.steps.push({ step: "yodeck_search", patternCount: patterns.length });
  
  if (patterns.length > 0) {
    const searchResults = await searchYodeckMediaByPatterns(patterns);
    const scored = scoreCandidates(searchResults, patterns);
    
    diagnostics.searchResults = searchResults.length;
    diagnostics.scoredCandidates = scored.length;
    diagnostics.topCandidates = scored.slice(0, 5).map(c => ({
      id: c.id, name: c.name, score: c.score, status: c.status, matchedPattern: c.matchedPattern,
    }));
    
    for (const candidate of scored) {
      const validation = await validateMediaInYodeck(candidate.id);
      if (validation.valid) {
        console.log(`${LOG_PREFIX} [${correlationId}] Found valid Yodeck media: id=${candidate.id} name="${candidate.name}" score=${candidate.score}`);
        
        await db.update(advertisers)
          .set({
            yodeckMediaIdCanonical: candidate.id,
            yodeckMediaIdCanonicalUpdatedAt: new Date(),
            assetStatus: "live",
            publishErrorCode: null,
            publishErrorMessage: null,
            updatedAt: new Date(),
          })
          .where(eq(advertisers.id, advertiserId));
        
        diagnostics.steps.push({ step: "yodeck_search_found", mediaId: candidate.id, name: candidate.name, score: candidate.score });
        return { ok: true, mediaId: candidate.id, source: "yodeck_search", diagnostics };
      } else {
        diagnostics.steps.push({ step: "candidate_invalid", mediaId: candidate.id, reason: validation.reason });
      }
    }
    
    diagnostics.steps.push({ step: "yodeck_search_no_valid_candidates" });
  }
  
  const bestAsset = assets
    .filter(a => a.storagePath || a.convertedStoragePath || a.storageUrl)
    .sort((a, b) => {
      const aScore = (a.validationStatus === "valid" ? 10 : 0) + (a.approvalStatus === "APPROVED" ? 5 : 0);
      const bScore = (b.validationStatus === "valid" ? 10 : 0) + (b.approvalStatus === "APPROVED" ? 5 : 0);
      if (aScore !== bScore) return bScore - aScore;
      return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    })[0];
  
  if (bestAsset) {
    const storagePath = bestAsset.convertedStoragePath || bestAsset.storagePath;
    const filename = bestAsset.storedFilename || bestAsset.originalFileName || `EVZ-AD-${advertiserId.substring(0, 8)}.mp4`;
    const fileSize = bestAsset.convertedSizeBytes || bestAsset.sizeBytes || 0;
    
    if (storagePath) {
      diagnostics.steps.push({ step: "upload_attempt", assetId: bestAsset.id, storagePath, filename, fileSize });
      console.log(`${LOG_PREFIX} [${correlationId}] Attempting upload: asset=${bestAsset.id} path=${storagePath} size=${fileSize}`);
      
      try {
        const uploadResult = await uploadVideoToYodeckTransactional(advertiserId, storagePath, filename, fileSize);
        
        if (uploadResult.ok && uploadResult.yodeckMediaId) {
          console.log(`${LOG_PREFIX} [${correlationId}] Upload SUCCESS: mediaId=${uploadResult.yodeckMediaId}`);
          diagnostics.steps.push({ step: "upload_success", mediaId: uploadResult.yodeckMediaId, jobId: uploadResult.jobId });
          
          await db.update(advertisers)
            .set({
              yodeckMediaIdCanonical: uploadResult.yodeckMediaId,
              yodeckMediaIdCanonicalUpdatedAt: new Date(),
              assetStatus: "live",
              publishErrorCode: null,
              publishErrorMessage: null,
              updatedAt: new Date(),
            })
            .where(eq(advertisers.id, advertiserId));
          
          return { ok: true, mediaId: uploadResult.yodeckMediaId, source: "upload", diagnostics };
        }
        
        diagnostics.steps.push({
          step: "upload_failed",
          errorCode: uploadResult.errorCode,
          finalState: uploadResult.finalState,
          details: uploadResult.errorDetails,
        });
        console.warn(`${LOG_PREFIX} [${correlationId}] Upload FAILED: ${uploadResult.errorCode} finalState=${uploadResult.finalState}`);
      } catch (err: any) {
        diagnostics.steps.push({ step: "upload_error", error: err.message });
        console.error(`${LOG_PREFIX} [${correlationId}] Upload ERROR: ${err.message}`);
      }
    }
    
    const downloadUrl = bestAsset.storageUrl || bestAsset.convertedStorageUrl;
    if (downloadUrl) {
      diagnostics.steps.push({ step: "url_clone_attempt", url: downloadUrl.substring(0, 80) });
      console.log(`${LOG_PREFIX} [${correlationId}] Attempting URL-clone from ${downloadUrl.substring(0, 80)}...`);
      
      try {
        const cloneName = filename.replace(/\.(mp4|mov)$/i, "") + ".mp4";
        const createResult = await yodeckRequest<any>("/media/", "POST", {
          name: cloneName,
          media_origin: { type: "video", source: "url", format: null },
          arguments: { download_from_url: downloadUrl },
        });
        
        if (createResult.ok && createResult.data?.id) {
          const cloneMediaId = createResult.data.id;
          console.log(`${LOG_PREFIX} [${correlationId}] URL-clone created mediaId=${cloneMediaId}, polling...`);
          
          const pollResult = await pollMediaReady(cloneMediaId, 120000);
          if (pollResult.ready) {
            console.log(`${LOG_PREFIX} [${correlationId}] URL-clone READY: mediaId=${cloneMediaId}`);
            
            await db.update(advertisers)
              .set({
                yodeckMediaIdCanonical: cloneMediaId,
                yodeckMediaIdCanonicalUpdatedAt: new Date(),
                assetStatus: "live",
                publishErrorCode: null,
                publishErrorMessage: null,
                updatedAt: new Date(),
              })
              .where(eq(advertisers.id, advertiserId));
            
            diagnostics.steps.push({ step: "url_clone_success", mediaId: cloneMediaId });
            return { ok: true, mediaId: cloneMediaId, source: "url_clone", diagnostics };
          }
          
          diagnostics.steps.push({ step: "url_clone_not_ready", mediaId: cloneMediaId, lastStatus: pollResult.lastStatus });
        } else {
          diagnostics.steps.push({ step: "url_clone_create_failed", error: createResult.error });
        }
      } catch (err: any) {
        diagnostics.steps.push({ step: "url_clone_error", error: err.message });
        console.error(`${LOG_PREFIX} [${correlationId}] URL-clone ERROR: ${err.message}`);
      }
    }
  } else {
    diagnostics.steps.push({ step: "no_uploadable_assets" });
  }
  
  await db.update(advertisers)
    .set({
      assetStatus: "publish_failed",
      publishErrorCode: "CANONICAL_RESOLUTION_FAILED",
      publishErrorMessage: `Geen bruikbare Yodeck media gevonden of aangemaakt. ${diagnostics.steps.length} stappen geprobeerd.`,
      publishFailedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(advertisers.id, advertiserId));
  
  diagnostics.steps.push({ step: "all_strategies_exhausted" });
  console.error(`${LOG_PREFIX} [${correlationId}] All strategies exhausted for advertiser ${advertiserId}`);
  
  return { ok: false, mediaId: null, source: "none", error: "Alle herstelstrategieën uitgeput", diagnostics };
}

async function pollMediaReady(
  mediaId: number,
  timeoutMs: number = 600000
): Promise<{ ready: boolean; lastStatus: string }> {
  const intervals = [2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000];
  const start = Date.now();
  let lastStatus = "unknown";
  let pollCount = 0;
  
  while (Date.now() - start < timeoutMs) {
    const intervalIndex = Math.min(pollCount, intervals.length - 1);
    await new Promise(r => setTimeout(r, intervals[intervalIndex]));
    pollCount++;
    
    const inspection = await inspectMedia(mediaId);
    if (!inspection.ok || !inspection.media) {
      if (inspection.notFound) {
        console.warn(`${LOG_PREFIX} pollMediaReady: mediaId=${mediaId} returned 404`);
        return { ready: false, lastStatus: "NOT_FOUND" };
      }
      continue;
    }
    
    lastStatus = inspection.media.status;
    console.log(`${LOG_PREFIX} pollMediaReady: mediaId=${mediaId} poll=${pollCount} status=${lastStatus} filesize=${inspection.media.filesize}`);
    
    if (isReadyStatus(lastStatus)) {
      return { ready: true, lastStatus };
    }
    
    if (lastStatus === "failed" || lastStatus === "error") {
      return { ready: false, lastStatus };
    }
    
    if (pollCount > 20 && lastStatus === "initialized" && (inspection.media.filesize || 0) === 0) {
      console.warn(`${LOG_PREFIX} pollMediaReady: mediaId=${mediaId} stuck at initialized after ${pollCount} polls`);
      return { ready: false, lastStatus: "STUCK_INITIALIZED" };
    }
  }
  
  console.warn(`${LOG_PREFIX} pollMediaReady: mediaId=${mediaId} TIMEOUT after ${pollCount} polls, lastStatus=${lastStatus}`);
  return { ready: false, lastStatus: `TIMEOUT_${lastStatus}` };
}

export async function cleanupDuplicateAssets(advertiserId: string): Promise<{
  ok: boolean;
  keptCount: number;
  archivedCount: number;
  keptList: Array<{ id: string; filename: string; status: string }>;
  archivedList: Array<{ id: string; filename: string; reason: string }>;
}> {
  console.log(`${LOG_PREFIX} cleanupDuplicateAssets START advertiserId=${advertiserId}`);
  
  const assets = await db.select().from(adAssets).where(eq(adAssets.advertiserId, advertiserId));
  
  if (assets.length <= 1) {
    return {
      ok: true,
      keptCount: assets.length,
      archivedCount: 0,
      keptList: assets.map(a => ({ id: a.id, filename: a.originalFileName, status: a.approvalStatus })),
      archivedList: [],
    };
  }
  
  const groups = new Map<string, typeof assets>();
  for (const asset of assets) {
    const key = (asset.originalFileName || asset.storedFilename || asset.id).toLowerCase();
    const group = groups.get(key) || [];
    group.push(asset);
    groups.set(key, group);
  }
  
  const keptList: Array<{ id: string; filename: string; status: string }> = [];
  const archivedList: Array<{ id: string; filename: string; reason: string }> = [];
  
  for (const [filename, group] of Array.from(groups)) {
    if (group.length <= 1) {
      keptList.push({ id: group[0].id, filename: group[0].originalFileName, status: group[0].approvalStatus });
      continue;
    }
    
    group.sort((a: typeof assets[0], b: typeof assets[0]) => {
      const scoreA = (a.yodeckMediaId ? 20 : 0) + (a.approvalStatus === "APPROVED" ? 10 : a.approvalStatus === "PUBLISHED" ? 15 : 0) + (a.validationStatus === "valid" ? 5 : 0);
      const scoreB = (b.yodeckMediaId ? 20 : 0) + (b.approvalStatus === "APPROVED" ? 10 : b.approvalStatus === "PUBLISHED" ? 15 : 0) + (b.validationStatus === "valid" ? 5 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
    });
    
    const [best, ...rest] = group;
    keptList.push({ id: best.id, filename: best.originalFileName, status: best.approvalStatus });
    
    for (const dup of rest) {
      await db.update(adAssets)
        .set({
          approvalStatus: "REJECTED",
          rejectedReason: "duplicate",
          rejectedDetails: `Archived by cleanup: kept ${best.id} (${best.originalFileName})`,
          rejectedAt: new Date(),
        })
        .where(eq(adAssets.id, dup.id));
      
      archivedList.push({
        id: dup.id,
        filename: dup.originalFileName,
        reason: `Duplicate of ${best.id}`,
      });
    }
  }
  
  console.log(`${LOG_PREFIX} cleanupDuplicateAssets: kept=${keptList.length} archived=${archivedList.length}`);
  
  return { ok: true, keptCount: keptList.length, archivedCount: archivedList.length, keptList, archivedList };
}
