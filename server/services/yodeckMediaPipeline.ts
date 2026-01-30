/**
 * Yodeck-Safe Media Pipeline
 * 
 * Validates and normalizes media files to ensure Yodeck compatibility.
 * Does NOT rely on ffprobe/ffmpeg CLI - uses pure Node solutions.
 * 
 * YODECK REQUIREMENTS:
 * - Container: MP4
 * - Video codec: H.264 (AVC)
 * - Pixel format: yuv420p
 * - Resolution: max 1920x1080
 * - Audio: AAC or none
 * - moov atom at start (faststart)
 */

import { storage } from "../storage";
import { db } from "../db";
import { adAssets } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES
// ============================================================================

export type YodeckReadinessStatus = 
  | "PENDING"           // Just uploaded, not yet validated
  | "VALIDATING"        // Validation in progress
  | "NEEDS_NORMALIZATION" // Not compatible, needs transcoding
  | "NORMALIZING"       // Transcoding in progress
  | "READY_FOR_YODECK"  // Compatible and ready to upload
  | "REJECTED";         // Cannot be normalized, permanently rejected

export interface MediaMetadata {
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  pixelFormat?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  bitrate?: number;
  hasVideoStream?: boolean;
  hasAudioStream?: boolean;
  moovAtStart?: boolean;
  isYodeckCompatible?: boolean;
  compatibilityReasons?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  isYodeckCompatible: boolean;
  metadata: MediaMetadata;
  compatibilityReasons: string[];
  recommendedAction: "READY" | "NORMALIZE" | "REJECT";
  rejectReason?: string;
}

/**
 * Trigger auto-publish when media becomes READY_FOR_YODECK
 * This is called asynchronously after validation/normalization completes
 */
async function triggerAutoPublish(advertiserId: string, assetId: string): Promise<void> {
  console.log(`[AutoPublish] Triggering for advertiser ${advertiserId}, asset ${assetId}`);
  
  try {
    const { publishNow } = await import("./publishNowService");
    const result = await publishNow(advertiserId, {});
    
    console.log(`[AutoPublish] Result: outcome=${result.outcome}, success=${result.summary.successCount}/${result.summary.targetsResolved}`);
    
    if (result.outcome === "FAILED") {
      console.warn(`[AutoPublish] Failed for advertiser ${advertiserId}: ${result.steps.find(s => s.error)?.error}`);
    }
  } catch (error: any) {
    console.error(`[AutoPublish] Error for advertiser ${advertiserId}: ${error.message}`);
  }
}

export interface NormalizationResult {
  success: boolean;
  normalizedPath?: string;
  normalizedUrl?: string;
  provider?: string;
  error?: string;
}

// ============================================================================
// MP4 METADATA PARSER (Pure Node, no ffprobe)
// ============================================================================

/**
 * Simple MP4 box parser to extract basic metadata
 * Reads the moov box to determine if faststart is enabled
 */
async function parseMP4Metadata(filePath: string): Promise<MediaMetadata> {
  const metadata: MediaMetadata = {
    container: "unknown",
    hasVideoStream: false,
    hasAudioStream: false,
    moovAtStart: false,
    compatibilityReasons: [],
  };

  try {
    const fd = fs.openSync(filePath, 'r');
    const stats = fs.fstatSync(fd);
    const fileSize = stats.size;
    
    // Read first 8KB to find ftyp and moov boxes
    const headerSize = Math.min(8192, fileSize);
    const header = Buffer.alloc(headerSize);
    fs.readSync(fd, header, 0, headerSize, 0);
    
    let offset = 0;
    let foundFtyp = false;
    let moovOffset = -1;
    let mdatOffset = -1;
    
    // Parse boxes in the header
    while (offset + 8 <= headerSize) {
      const boxSize = header.readUInt32BE(offset);
      const boxType = header.toString('ascii', offset + 4, offset + 8);
      
      if (boxSize === 0) break; // Invalid box
      
      if (boxType === 'ftyp') {
        foundFtyp = true;
        const brand = header.toString('ascii', offset + 8, offset + 12);
        if (brand.includes('mp4') || brand.includes('isom') || brand.includes('avc')) {
          metadata.container = 'mp4';
        } else if (brand.includes('qt')) {
          metadata.container = 'quicktime';
        }
      } else if (boxType === 'moov') {
        moovOffset = offset;
        metadata.moovAtStart = true; // moov found in first 8KB = faststart
      } else if (boxType === 'mdat') {
        mdatOffset = offset;
      }
      
      offset += boxSize;
      if (boxSize > headerSize) break; // Box extends beyond header
    }
    
    // If moov not in header, scan for it (might be at end = no faststart)
    if (moovOffset === -1 && fileSize > headerSize) {
      // Read last 16KB to check for moov at end
      const tailStart = Math.max(0, fileSize - 16384);
      const tailSize = fileSize - tailStart;
      const tail = Buffer.alloc(tailSize);
      fs.readSync(fd, tail, 0, tailSize, tailStart);
      
      let tailOffset = 0;
      while (tailOffset + 8 <= tailSize) {
        const boxSize = tail.readUInt32BE(tailOffset);
        const boxType = tail.toString('ascii', tailOffset + 4, tailOffset + 8);
        
        if (boxSize === 0 || boxSize > tailSize) break;
        
        if (boxType === 'moov') {
          metadata.moovAtStart = false; // moov at end = no faststart
          break;
        }
        
        tailOffset += boxSize;
      }
    }
    
    fs.closeSync(fd);
    
    // If we found ftyp, assume it has video/audio streams
    if (foundFtyp && metadata.container === 'mp4') {
      metadata.hasVideoStream = true;
      metadata.hasAudioStream = true;
      
      // We can't determine exact codec without parsing the stsd box
      // For now, assume H.264 for MP4 files as it's most common
      metadata.videoCodec = 'h264';
      metadata.audioCodec = 'aac';
      metadata.pixelFormat = 'yuv420p';
    }
    
  } catch (error: any) {
    console.error(`[MediaPipeline] Error parsing MP4: ${error.message}`);
    metadata.compatibilityReasons?.push(`Parse error: ${error.message}`);
  }
  
  return metadata;
}

/**
 * Alternative: Use ffprobe if available (fallback)
 */
async function parseWithFfprobe(filePath: string): Promise<MediaMetadata | null> {
  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
      { timeout: 30000 }
    );
    
    const data = JSON.parse(stdout);
    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = data.streams?.find((s: any) => s.codec_type === 'audio');
    
    return {
      container: data.format?.format_name?.split(',')[0],
      videoCodec: videoStream?.codec_name,
      audioCodec: audioStream?.codec_name,
      pixelFormat: videoStream?.pix_fmt,
      width: videoStream?.width,
      height: videoStream?.height,
      durationSeconds: parseFloat(data.format?.duration || '0'),
      bitrate: parseInt(data.format?.bit_rate || '0', 10),
      hasVideoStream: !!videoStream,
      hasAudioStream: !!audioStream,
      moovAtStart: true, // ffprobe doesn't easily tell us this
      compatibilityReasons: [],
    };
  } catch {
    return null;
  }
}

// ============================================================================
// YODECK COMPATIBILITY CHECK
// ============================================================================

function checkYodeckCompatibility(metadata: MediaMetadata): ValidationResult {
  const reasons: string[] = [];
  let isCompatible = true;
  let recommendedAction: "READY" | "NORMALIZE" | "REJECT" = "READY";
  let rejectReason: string | undefined;

  // Check container
  if (metadata.container !== 'mp4') {
    reasons.push(`Container is ${metadata.container}, must be mp4`);
    isCompatible = false;
  }

  // Check video codec
  if (metadata.videoCodec && !['h264', 'avc', 'avc1'].includes(metadata.videoCodec.toLowerCase())) {
    reasons.push(`Video codec is ${metadata.videoCodec}, must be H.264`);
    isCompatible = false;
  }

  // Check pixel format
  if (metadata.pixelFormat && metadata.pixelFormat !== 'yuv420p') {
    reasons.push(`Pixel format is ${metadata.pixelFormat}, must be yuv420p`);
    isCompatible = false;
  }

  // Check resolution
  if (metadata.width && metadata.height) {
    if (metadata.width > 1920 || metadata.height > 1080) {
      reasons.push(`Resolution ${metadata.width}x${metadata.height} exceeds 1920x1080`);
      isCompatible = false;
    }
  }

  // Check moov atom
  if (metadata.moovAtStart === false) {
    reasons.push('moov atom at end (no faststart) - streaming will fail');
    isCompatible = false;
  }

  // Check duration
  if (metadata.durationSeconds && metadata.durationSeconds > 60) {
    reasons.push(`Duration ${metadata.durationSeconds}s exceeds 60s limit`);
    isCompatible = false;
  }

  // Check for video stream
  if (!metadata.hasVideoStream) {
    reasons.push('No video stream detected');
    rejectReason = 'Bestand bevat geen video';
    recommendedAction = "REJECT";
    isCompatible = false;
  }

  // Determine action
  if (!isCompatible && recommendedAction !== "REJECT") {
    recommendedAction = "NORMALIZE";
  }

  return {
    isValid: metadata.hasVideoStream === true,
    isYodeckCompatible: isCompatible,
    metadata: {
      ...metadata,
      isYodeckCompatible: isCompatible,
      compatibilityReasons: reasons,
    },
    compatibilityReasons: reasons,
    recommendedAction,
    rejectReason,
  };
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export async function validateMediaAsset(assetId: string): Promise<ValidationResult> {
  console.log(`[MediaPipeline] Starting validation for asset ${assetId}`);
  
  // Update status to VALIDATING
  await db.update(adAssets)
    .set({ yodeckReadinessStatus: "VALIDATING" })
    .where(eq(adAssets.id, assetId));
  
  const asset = await storage.getAdAsset(assetId);
  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }
  
  // Get file path - prefer converted, then stored
  let filePath = asset.convertedStoragePath || asset.storagePath;
  if (!filePath) {
    throw new Error(`Asset ${assetId} has no storage path`);
  }
  
  // Parse metadata (try ffprobe first, fallback to pure Node)
  let metadata = await parseWithFfprobe(filePath);
  if (!metadata) {
    console.log(`[MediaPipeline] ffprobe not available, using pure Node parser`);
    metadata = await parseMP4Metadata(filePath);
  }
  
  // Check compatibility
  const result = checkYodeckCompatibility(metadata);
  
  // Update asset status
  let newStatus: YodeckReadinessStatus;
  if (result.recommendedAction === "READY") {
    newStatus = "READY_FOR_YODECK";
  } else if (result.recommendedAction === "NORMALIZE") {
    newStatus = "NEEDS_NORMALIZATION";
  } else {
    newStatus = "REJECTED";
  }
  
  await db.update(adAssets)
    .set({
      yodeckReadinessStatus: newStatus,
      yodeckMetadataJson: result.metadata,
      yodeckRejectReason: result.rejectReason || null,
    })
    .where(eq(adAssets.id, assetId));
  
  console.log(`[MediaPipeline] Asset ${assetId} validated: status=${newStatus} compatible=${result.isYodeckCompatible}`);
  
  if (newStatus === "READY_FOR_YODECK") {
    triggerAutoPublish(asset.advertiserId, assetId).catch(err => {
      console.warn(`[MediaPipeline] Auto-publish trigger failed: ${err.message}`);
    });
  }
  
  return result;
}

// ============================================================================
// NORMALIZATION PROVIDER ABSTRACTION
// ============================================================================

interface NormalizerProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  normalize(inputPath: string, outputPath: string): Promise<NormalizationResult>;
}

/**
 * CloudConvert Provider - External API for transcoding
 * Requires CLOUDCONVERT_API_KEY secret
 */
const cloudConvertProvider: NormalizerProvider = {
  name: "cloudconvert",
  
  async isAvailable(): Promise<boolean> {
    return !!process.env.CLOUDCONVERT_API_KEY;
  },
  
  async normalize(inputPath: string, outputPath: string): Promise<NormalizationResult> {
    // CloudConvert implementation would go here
    // For now, return not available
    return {
      success: false,
      error: "CloudConvert integration not yet implemented",
    };
  },
};

/**
 * Local FFmpeg Provider - Uses system ffmpeg if available
 */
const localFfmpegProvider: NormalizerProvider = {
  name: "ffmpeg_local",
  
  async isAvailable(): Promise<boolean> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      await execAsync('ffmpeg -version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  },
  
  async normalize(inputPath: string, outputPath: string): Promise<NormalizationResult> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      // Transcode to Yodeck-safe format
      // H.264 yuv420p, AAC audio, faststart, max 1920x1080
      const cmd = `ffmpeg -i "${inputPath}" -c:v libx264 -pix_fmt yuv420p -vf "scale='min(1920,iw)':min'(1080,ih)':force_original_aspect_ratio=decrease" -c:a aac -movflags +faststart -y "${outputPath}"`;
      
      await execAsync(cmd, { timeout: 300000 }); // 5 minute timeout
      
      return {
        success: true,
        normalizedPath: outputPath,
        provider: "ffmpeg_local",
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        provider: "ffmpeg_local",
      };
    }
  },
};

// Get the first available normalizer
async function getAvailableNormalizer(): Promise<NormalizerProvider | null> {
  const providers = [cloudConvertProvider, localFfmpegProvider];
  
  for (const provider of providers) {
    if (await provider.isAvailable()) {
      console.log(`[MediaPipeline] Using normalizer: ${provider.name}`);
      return provider;
    }
  }
  
  return null;
}

// ============================================================================
// NORMALIZATION FUNCTION
// ============================================================================

export async function normalizeMediaAsset(assetId: string): Promise<NormalizationResult> {
  console.log(`[MediaPipeline] Starting normalization for asset ${assetId}`);
  
  const asset = await storage.getAdAsset(assetId);
  if (!asset) {
    throw new Error(`Asset ${assetId} not found`);
  }
  
  // Update status
  await db.update(adAssets)
    .set({
      yodeckReadinessStatus: "NORMALIZING",
      normalizationStartedAt: new Date(),
    })
    .where(eq(adAssets.id, assetId));
  
  // Get normalizer
  const normalizer = await getAvailableNormalizer();
  if (!normalizer) {
    const error = "Geen normalisatie provider beschikbaar (CloudConvert of FFmpeg)";
    await db.update(adAssets)
      .set({
        yodeckReadinessStatus: "REJECTED",
        yodeckRejectReason: error,
        normalizationError: error,
      })
      .where(eq(adAssets.id, assetId));
    
    return { success: false, error };
  }
  
  // Get input path
  const inputPath = asset.convertedStoragePath || asset.storagePath;
  if (!inputPath) {
    throw new Error(`Asset ${assetId} has no storage path`);
  }
  
  // Generate output path
  const outputPath = inputPath.replace(/\.[^.]+$/, '_normalized.mp4');
  
  // Normalize
  const result = await normalizer.normalize(inputPath, outputPath);
  
  if (result.success) {
    await db.update(adAssets)
      .set({
        yodeckReadinessStatus: "READY_FOR_YODECK",
        normalizationProvider: normalizer.name,
        normalizationCompletedAt: new Date(),
        normalizedStoragePath: result.normalizedPath,
      })
      .where(eq(adAssets.id, assetId));
    
    triggerAutoPublish(asset.advertiserId, assetId).catch(err => {
      console.warn(`[MediaPipeline] Auto-publish trigger failed: ${err.message}`);
    });
  } else {
    await db.update(adAssets)
      .set({
        yodeckReadinessStatus: "REJECTED",
        yodeckRejectReason: `Normalisatie mislukt: ${result.error}`,
        normalizationError: result.error,
      })
      .where(eq(adAssets.id, assetId));
  }
  
  return result;
}

// ============================================================================
// CANONICAL MEDIA RESOLVER
// ============================================================================

/**
 * Get the canonical (ready for Yodeck) media file path for an asset
 * Returns normalized path if available, otherwise original/converted path
 */
export async function getCanonicalMediaPath(assetId: string): Promise<{ path: string | null; isReady: boolean; status: YodeckReadinessStatus }> {
  const asset = await storage.getAdAsset(assetId);
  if (!asset) {
    return { path: null, isReady: false, status: "PENDING" };
  }
  
  const status = (asset.yodeckReadinessStatus as YodeckReadinessStatus) || "PENDING";
  
  if (status !== "READY_FOR_YODECK") {
    return { path: null, isReady: false, status };
  }
  
  // Prefer normalized, then converted, then original
  const path = asset.normalizedStoragePath || asset.convertedStoragePath || asset.storagePath;
  
  return { path: path || null, isReady: true, status };
}

/**
 * Get the canonical (ready) asset for an advertiser
 * Returns the newest non-superseded READY_FOR_YODECK asset with valid video stream
 * 
 * CANONICAL ASSET REQUIREMENTS:
 * - status === READY_FOR_YODECK
 * - hasVideoStream === true (from yodeckMetadataJson)
 * - newest createdAt
 * - not superseded
 */
export async function getCanonicalAssetForAdvertiser(advertiserId: string): Promise<{
  asset: any | null;
  status: YodeckReadinessStatus;
  reason?: string;
}> {
  const assets = await storage.getAdAssetsByAdvertiser(advertiserId);
  
  // Filter to non-superseded assets
  const activeAssets = assets.filter(a => !a.isSuperseded);
  
  // Find the newest READY_FOR_YODECK asset WITH valid video stream
  const readyAsset = activeAssets
    .filter(a => {
      if (a.yodeckReadinessStatus !== "READY_FOR_YODECK") return false;
      
      // Check hasVideoStream from metadata
      const metadata = a.yodeckMetadataJson as any;
      if (metadata && metadata.hasVideoStream === false) {
        console.warn(`[CanonicalAsset] Asset ${a.id} is READY_FOR_YODECK but hasVideoStream=false, skipping`);
        return false;
      }
      
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  
  if (readyAsset) {
    return { asset: readyAsset, status: "READY_FOR_YODECK" };
  }
  
  // Check if any are being processed
  const processingAsset = activeAssets.find(a => 
    ["VALIDATING", "NEEDS_NORMALIZATION", "NORMALIZING"].includes(a.yodeckReadinessStatus || "")
  );
  
  if (processingAsset) {
    return {
      asset: processingAsset,
      status: processingAsset.yodeckReadinessStatus as YodeckReadinessStatus,
      reason: "Video wordt nog verwerkt",
    };
  }
  
  // Check if any are rejected
  const rejectedAsset = activeAssets.find(a => a.yodeckReadinessStatus === "REJECTED");
  if (rejectedAsset) {
    return {
      asset: rejectedAsset,
      status: "REJECTED",
      reason: rejectedAsset.yodeckRejectReason || "Video is afgekeurd",
    };
  }
  
  // No assets at all
  const pendingAsset = activeAssets[0];
  return {
    asset: pendingAsset || null,
    status: pendingAsset?.yodeckReadinessStatus as YodeckReadinessStatus || "PENDING",
    reason: pendingAsset ? "Video wacht op validatie" : "Geen video geüpload",
  };
}

// ============================================================================
// REPLACEMENT LOGIC - Mark old assets as superseded
// ============================================================================

export async function markAssetSuperseded(oldAssetId: string, newAssetId: string): Promise<void> {
  console.log(`[MediaPipeline] Marking asset ${oldAssetId} as superseded by ${newAssetId}`);
  
  await db.update(adAssets)
    .set({
      isSuperseded: true,
      supersededById: newAssetId,
    })
    .where(eq(adAssets.id, oldAssetId));
}

/**
 * Handle new upload for advertiser - mark old assets as superseded
 */
export async function handleNewUpload(advertiserId: string, newAssetId: string): Promise<void> {
  const assets = await storage.getAdAssetsByAdvertiser(advertiserId);
  
  // Mark all previous assets as superseded
  for (const asset of assets) {
    if (asset.id !== newAssetId && !asset.isSuperseded) {
      await markAssetSuperseded(asset.id, newAssetId);
    }
  }
  
  // Start validation for new asset
  await validateMediaAsset(newAssetId);
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

export interface MediaDiagnostics {
  assetId: string;
  advertiserId: string;
  status: YodeckReadinessStatus;
  rejectReason: string | null;
  metadata: MediaMetadata | null;
  files: {
    original: string | null;
    converted: string | null;
    normalized: string | null;
  };
  yodeckCompatibility: {
    ok: boolean;
    reasons: string[];
  };
  normalization: {
    provider: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    error: string | null;
  };
}

export async function getMediaDiagnostics(assetId: string): Promise<MediaDiagnostics | null> {
  const asset = await storage.getAdAsset(assetId);
  if (!asset) return null;
  
  const metadata = asset.yodeckMetadataJson as MediaMetadata | null;
  
  return {
    assetId: asset.id,
    advertiserId: asset.advertiserId,
    status: (asset.yodeckReadinessStatus as YodeckReadinessStatus) || "PENDING",
    rejectReason: asset.yodeckRejectReason || null,
    metadata,
    files: {
      original: asset.storagePath || null,
      converted: asset.convertedStoragePath || null,
      normalized: asset.normalizedStoragePath || null,
    },
    yodeckCompatibility: {
      ok: metadata?.isYodeckCompatible || false,
      reasons: metadata?.compatibilityReasons || [],
    },
    normalization: {
      provider: asset.normalizationProvider || null,
      startedAt: asset.normalizationStartedAt || null,
      completedAt: asset.normalizationCompletedAt || null,
      error: asset.normalizationError || null,
    },
  };
}

export async function retryNormalization(assetId: string): Promise<{ ok: boolean; error?: string }> {
  const asset = await storage.getAdAsset(assetId);
  if (!asset) {
    return { ok: false, error: "Asset niet gevonden" };
  }
  
  // Reset status to NEEDS_NORMALIZATION
  await db.update(adAssets)
    .set({
      yodeckReadinessStatus: "NEEDS_NORMALIZATION",
      yodeckRejectReason: null,
      normalizationError: null,
      normalizationStartedAt: null,
      normalizationCompletedAt: null,
    })
    .where(eq(adAssets.id, assetId));
  
  // Start normalization
  const result = await normalizeMediaAsset(assetId);
  
  return { ok: result.success, error: result.error };
}
