import { db } from "../db";
import { adAssets, advertisers } from "@shared/schema";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { spawn } from "child_process";
import { Client } from "@replit/object-storage";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import crypto from "crypto";

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN;

interface PipelineLog {
  timestamp: string;
  step: string;
  message: string;
  assetId?: string;
  oldStatus?: string;
  newStatus?: string;
}

interface AssetAction {
  id: string;
  originalFileName: string;
  oldStatus: string;
  newStatus: string;
  action: string;
  yodeckMediaId?: number;
  error?: string;
}

interface ValidationResult {
  correlationId: string;
  scannedCount: number;
  enqueuedCount: number;
  completedCount: number;
  failedCount: number;
  assets: AssetAction[];
  logs: PipelineLog[];
}

interface FfprobeMetadata {
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
  // Forensic diagnostics
  fileSizeBytes?: number;
  firstBytesHex?: string;
  detectedMime?: string;
  isMp4Container?: boolean;
  videoStreamCount?: number;
  audioStreamCount?: number;
  reasonCode?: string;
  ffprobeError?: string;
  sha256?: string;
}

const MIN_FILE_SIZE_BYTES = 100 * 1024; // 100KB minimum - smaller files are likely corrupt

function getForensicDiagnostics(filePath: string): { 
  fileSizeBytes: number; 
  firstBytesHex: string; 
  isMp4Container: boolean; 
  detectedMime: string;
  sha256: string;
} {
  const stats = fs.statSync(filePath);
  const fileSizeBytes = stats.size;
  
  const buffer = Buffer.alloc(64);
  const fd = fs.openSync(filePath, "r");
  const bytesRead = fs.readSync(fd, buffer, 0, 64, 0);
  fs.closeSync(fd);
  
  const firstBytes = buffer.slice(0, bytesRead);
  const firstBytesHex = firstBytes.toString("hex");
  
  // Check for ftyp box (MP4/MOV signature)
  // ftyp typically appears at bytes 4-7 as "ftyp" (0x66747970)
  const hasFtyp = firstBytesHex.includes("66747970");
  
  // Detect MIME type from magic bytes
  let detectedMime = "unknown";
  if (hasFtyp) {
    detectedMime = "video/mp4";
  } else if (firstBytesHex.startsWith("1a45dfa3")) {
    detectedMime = "video/webm";
  } else if (firstBytesHex.startsWith("000001b")) {
    detectedMime = "video/mpeg";
  } else if (firstBytesHex.startsWith("52494646") && firstBytesHex.includes("41564920")) {
    detectedMime = "video/avi";
  } else if (firstBytesHex.startsWith("3c21") || firstBytesHex.startsWith("3c68") || firstBytesHex.startsWith("3c48")) {
    detectedMime = "text/html"; // HTML file saved as video
  } else if (firstBytesHex.startsWith("7b22") || firstBytesHex.startsWith("7b0a")) {
    detectedMime = "application/json"; // JSON file
  }
  
  // Calculate SHA256
  const fileBuffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  
  return {
    fileSizeBytes,
    firstBytesHex,
    isMp4Container: hasFtyp,
    detectedMime,
    sha256,
  };
}

function log(correlationId: string, step: string, message: string, logs: PipelineLog[], assetId?: string, oldStatus?: string, newStatus?: string) {
  const entry: PipelineLog = {
    timestamp: new Date().toISOString(),
    step,
    message,
    assetId,
    oldStatus,
    newStatus,
  };
  logs.push(entry);
  console.log(`[MediaPipeline] ${correlationId} ${assetId || ""} ${oldStatus ? `${oldStatus}->${newStatus}` : ""} ${step}: ${message}`);
}

async function runFfprobe(filePath: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath
    ];

    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => stdout += d.toString());
    proc.stderr.on("data", (d) => stderr += d.toString());

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr || `ffprobe exited with code ${code}` });
        return;
      }
      try {
        const data = JSON.parse(stdout);
        resolve({ ok: true, data });
      } catch (e: any) {
        resolve({ ok: false, error: `Failed to parse ffprobe output: ${e.message}` });
      }
    });

    proc.on("error", (err) => {
      resolve({ ok: false, error: `ffprobe spawn error: ${err.message}` });
    });
  });
}

function extractMetadata(ffprobeData: any): FfprobeMetadata {
  const streams = ffprobeData.streams || [];
  const format = ffprobeData.format || {};

  const videoStreams = streams.filter((s: any) => s.codec_type === "video");
  const audioStreams = streams.filter((s: any) => s.codec_type === "audio");
  const videoStream = videoStreams[0];
  const audioStream = audioStreams[0];

  const metadata: FfprobeMetadata = {
    container: format.format_name,
    videoCodec: videoStream?.codec_name?.toLowerCase(),
    audioCodec: audioStream?.codec_name?.toLowerCase(),
    pixelFormat: videoStream?.pix_fmt,
    width: videoStream?.width,
    height: videoStream?.height,
    durationSeconds: parseFloat(format.duration) || parseFloat(videoStream?.duration) || 0,
    bitrate: parseInt(format.bit_rate) || 0,
    hasVideoStream: videoStreams.length > 0,
    hasAudioStream: audioStreams.length > 0,
    videoStreamCount: videoStreams.length,
    audioStreamCount: audioStreams.length,
  };

  const reasons: string[] = [];
  let isCompatible = true;

  if (metadata.videoCodec !== "h264") {
    isCompatible = false;
    reasons.push(`codec=${metadata.videoCodec}, needs h264`);
  }

  if (metadata.pixelFormat && metadata.pixelFormat !== "yuv420p") {
    isCompatible = false;
    reasons.push(`pixelFormat=${metadata.pixelFormat}, needs yuv420p`);
  }

  if ((metadata.width || 0) > 1920 || (metadata.height || 0) > 1080) {
    isCompatible = false;
    reasons.push(`resolution=${metadata.width}x${metadata.height}, max 1920x1080`);
  }

  metadata.isYodeckCompatible = isCompatible;
  metadata.compatibilityReasons = reasons;

  return metadata;
}

async function normalizeVideo(inputPath: string, outputPath: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = [
      "-y", "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-vf", "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outputPath
    ];

    console.log(`[MediaPipeline] Running ffmpeg: ffmpeg ${args.join(" ")}`);

    const proc = spawn("ffmpeg", args);
    let stderr = "";

    proc.stderr.on("data", (d) => stderr += d.toString());

    proc.on("close", (code) => {
      if (code !== 0) {
        resolve({ ok: false, error: stderr.slice(-500) });
      } else {
        resolve({ ok: true });
      }
    });

    proc.on("error", (err) => {
      resolve({ ok: false, error: `ffmpeg spawn error: ${err.message}` });
    });
  });
}

async function uploadToYodeck(
  filePath: string, 
  name: string, 
  mimeType: string = "video/mp4"
): Promise<{ ok: boolean; mediaId?: number; error?: string }> {
  if (!YODECK_TOKEN) {
    return { ok: false, error: "YODECK_AUTH_TOKEN not configured" };
  }

  try {
    const createResp = await fetch(`${YODECK_API_BASE}/media/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        media_type: "video",
        url_type: "upload",
      }),
    });

    if (!createResp.ok) {
      const errText = await createResp.text();
      return { ok: false, error: `Create media failed: ${createResp.status} ${errText}` };
    }

    const createData = await createResp.json();
    const mediaId = createData.id;
    const presignUrl = createData.presign_url;

    if (!presignUrl) {
      return { ok: false, error: "No presign_url in create response" };
    }

    const fileBuffer = fs.readFileSync(filePath);
    
    const uploadResp = await fetch(presignUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
      },
      body: fileBuffer,
    });

    if (!uploadResp.ok) {
      return { ok: false, error: `Upload to presign URL failed: ${uploadResp.status}` };
    }

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      
      const statusResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });

      if (statusResp.ok) {
        const statusData = await statusResp.json();
        const fileSize = statusData.filesize || statusData.file_size || 0;
        const status = statusData.status;

        if (fileSize > 0 && (status === "active" || status === "ready")) {
          // STEP 5: FINAL VERIFICATION - Confirm media exists with one more GET
          console.log(`[MediaPipeline] FINAL VERIFICATION: GET /media/${mediaId} to confirm existence...`);
          const verifyResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
            headers: { "Authorization": `Token ${YODECK_TOKEN}` },
          });
          
          if (verifyResp.status === 404) {
            return { ok: false, error: `FINAL_VERIFY_404: Media ${mediaId} returns 404 - upload was NOT real` };
          }
          
          if (!verifyResp.ok) {
            return { ok: false, error: `FINAL_VERIFY_ERROR: Unexpected status ${verifyResp.status}` };
          }
          
          const verifyData = await verifyResp.json();
          if (!verifyData.id) {
            return { ok: false, error: `FINAL_VERIFY_INVALID: Response missing 'id' field` };
          }
          
          console.log(`[MediaPipeline] FINAL VERIFICATION PASSED: Media ${mediaId} confirmed in Yodeck`);
          return { ok: true, mediaId };
        }
      }
    }

    return { ok: false, error: "Timeout waiting for Yodeck media to become ready" };
  } catch (e: any) {
    return { ok: false, error: `Yodeck upload error: ${e.message}` };
  }
}

export async function validateAdvertiserMedia(advertiserId: string, externalCorrelationId?: string): Promise<ValidationResult> {
  // Use external correlationId if provided (for tracing from approve flow), otherwise generate one
  const correlationId = externalCorrelationId || `VAL-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const logs: PipelineLog[] = [];
  const assetActions: AssetAction[] = [];

  log(correlationId, "START", `Beginning validation for advertiser ${advertiserId}`, logs);

  const advertiser = await db.query.advertisers.findFirst({
    where: eq(advertisers.id, advertiserId),
  });

  if (!advertiser) {
    log(correlationId, "ERROR", `Advertiser not found: ${advertiserId}`, logs);
    return {
      correlationId,
      scannedCount: 0,
      enqueuedCount: 0,
      completedCount: 0,
      failedCount: 0,
      assets: [],
      logs,
    };
  }

  const assets = await db.query.adAssets.findMany({
    where: and(
      eq(adAssets.advertiserId, advertiserId),
      eq(adAssets.isSuperseded, false),
      or(
        eq(adAssets.yodeckReadinessStatus, "PENDING"),
        and(
          eq(adAssets.approvalStatus, "APPROVED"),
          isNull(adAssets.yodeckMediaId)
        )
      )
    ),
  });

  log(correlationId, "SCAN", `Found ${assets.length} assets needing validation`, logs);

  let enqueuedCount = 0;
  let completedCount = 0;
  let failedCount = 0;

  const client = new Client();
  const tempDir = os.tmpdir();

  for (const asset of assets) {
    const oldStatus = asset.yodeckReadinessStatus;
    let newStatus = oldStatus;
    let action = "SKIPPED";
    let yodeckMediaId: number | undefined;
    let error: string | undefined;

    try {
      log(correlationId, "VALIDATE_START", `Processing asset`, logs, asset.id, oldStatus);

      await db.update(adAssets)
        .set({ yodeckReadinessStatus: "VALIDATING" })
        .where(eq(adAssets.id, asset.id));

      const storagePath = asset.normalizedStoragePath || asset.storagePath;
      if (!storagePath) {
        throw new Error("No storage path available");
      }

      const localPath = path.join(tempDir, `validate-${asset.id}-${Date.now()}.mp4`);
      
      log(correlationId, "DOWNLOAD", `Downloading from ${storagePath}`, logs, asset.id);
      
      const downloadResult = await client.downloadAsBytes(storagePath);
      if (!downloadResult.ok) {
        throw new Error(`Download failed: ${downloadResult.error}`);
      }
      
      fs.writeFileSync(localPath, Buffer.from(downloadResult.value as unknown as ArrayBuffer));

      // Get forensic diagnostics FIRST
      const forensics = getForensicDiagnostics(localPath);
      
      log(correlationId, "FORENSICS", `size=${forensics.fileSizeBytes}, mime=${forensics.detectedMime}, isMp4=${forensics.isMp4Container}, firstBytes=${forensics.firstBytesHex.slice(0, 32)}...`, logs, asset.id);

      // Early rejection: empty or too small file
      if (forensics.fileSizeBytes < MIN_FILE_SIZE_BYTES) {
        const metadata: FfprobeMetadata = {
          ...forensics,
          reasonCode: forensics.fileSizeBytes === 0 ? "EMPTY_FILE" : "EMPTY_FILE",
          hasVideoStream: false,
          videoStreamCount: 0,
          audioStreamCount: 0,
        };
        
        await db.update(adAssets)
          .set({ yodeckMetadataJson: metadata })
          .where(eq(adAssets.id, asset.id));
        
        try { fs.unlinkSync(localPath); } catch {}
        throw new Error(`Bestand te klein (${forensics.fileSizeBytes} bytes, min ${MIN_FILE_SIZE_BYTES})`);
      }

      // Early rejection: not MP4/MOV container
      if (!forensics.isMp4Container) {
        const metadata: FfprobeMetadata = {
          ...forensics,
          reasonCode: "NOT_MP4",
          hasVideoStream: false,
          videoStreamCount: 0,
          audioStreamCount: 0,
        };
        
        await db.update(adAssets)
          .set({ yodeckMetadataJson: metadata })
          .where(eq(adAssets.id, asset.id));
        
        try { fs.unlinkSync(localPath); } catch {}
        throw new Error(`Bestand is geen MP4/MOV (detected: ${forensics.detectedMime})`);
      }

      log(correlationId, "FFPROBE", `Running ffprobe`, logs, asset.id);

      const probeResult = await runFfprobe(localPath);
      
      let metadata: FfprobeMetadata;
      
      if (!probeResult.ok) {
        metadata = {
          ...forensics,
          reasonCode: "FFPROBE_FAILED",
          ffprobeError: probeResult.error,
          hasVideoStream: false,
          videoStreamCount: 0,
          audioStreamCount: 0,
        };
        
        await db.update(adAssets)
          .set({ yodeckMetadataJson: metadata })
          .where(eq(adAssets.id, asset.id));
        
        try { fs.unlinkSync(localPath); } catch {}
        throw new Error(`ffprobe failed: ${probeResult.error}`);
      }

      metadata = extractMetadata(probeResult.data);
      
      // Add forensic data to metadata
      metadata.fileSizeBytes = forensics.fileSizeBytes;
      metadata.firstBytesHex = forensics.firstBytesHex;
      metadata.detectedMime = forensics.detectedMime;
      metadata.isMp4Container = forensics.isMp4Container;
      metadata.sha256 = forensics.sha256;

      // Check for NO_VIDEO_STREAM
      if (!metadata.hasVideoStream || (metadata.videoStreamCount || 0) === 0) {
        metadata.reasonCode = "NO_VIDEO_STREAM";
        
        await db.update(adAssets)
          .set({ yodeckMetadataJson: metadata })
          .where(eq(adAssets.id, asset.id));
        
        try { fs.unlinkSync(localPath); } catch {}
        throw new Error(`Bestand bevat geen video stream (streams: video=${metadata.videoStreamCount}, audio=${metadata.audioStreamCount})`);
      }

      log(correlationId, "METADATA", `codec=${metadata.videoCodec}, pix_fmt=${metadata.pixelFormat}, ${metadata.width}x${metadata.height}, compatible=${metadata.isYodeckCompatible}, videoStreams=${metadata.videoStreamCount}`, logs, asset.id);

      await db.update(adAssets)
        .set({ yodeckMetadataJson: metadata })
        .where(eq(adAssets.id, asset.id));

      let finalPath = localPath;

      // Only normalize if there IS a video stream
      if (!metadata.isYodeckCompatible && metadata.hasVideoStream) {
        log(correlationId, "NORMALIZE", `Asset needs normalization: ${metadata.compatibilityReasons?.join(", ")}`, logs, asset.id, "VALIDATING", "NORMALIZING");

        await db.update(adAssets)
          .set({ 
            yodeckReadinessStatus: "NORMALIZING",
            normalizationStartedAt: new Date(),
          })
          .where(eq(adAssets.id, asset.id));

        const normalizedPath = path.join(tempDir, `normalized-${asset.id}-${Date.now()}.mp4`);
        const normResult = await normalizeVideo(localPath, normalizedPath);

        if (!normResult.ok) {
          throw new Error(`Normalization failed: ${normResult.error}`);
        }

        const normalizedStoragePath = `normalized/${asset.id}/${path.basename(normalizedPath)}`;
        const normalizedBuffer = fs.readFileSync(normalizedPath);
        
        log(correlationId, "UPLOAD_NORMALIZED", `Uploading normalized file to storage`, logs, asset.id);
        
        const uploadResult = await client.uploadFromBytes(normalizedStoragePath, normalizedBuffer);
        if (!uploadResult.ok) {
          throw new Error(`Failed to upload normalized file: ${uploadResult.error}`);
        }

        await db.update(adAssets)
          .set({
            normalizedStoragePath,
            normalizedStorageUrl: uploadResult.value,
            normalizationCompletedAt: new Date(),
            normalizationProvider: "ffmpeg",
          })
          .where(eq(adAssets.id, asset.id));

        finalPath = normalizedPath;

        try { fs.unlinkSync(localPath); } catch {}
      }

      log(correlationId, "YODECK_UPLOAD", `Uploading to Yodeck`, logs, asset.id);

      const yodeckName = `EVZ-AD | ${advertiser.companyName} | ${asset.id.slice(0, 8)} | ${asset.originalFileName}`;
      const yodeckResult = await uploadToYodeck(finalPath, yodeckName);

      try { fs.unlinkSync(finalPath); } catch {}

      if (!yodeckResult.ok) {
        throw new Error(`Yodeck upload failed: ${yodeckResult.error}`);
      }

      yodeckMediaId = yodeckResult.mediaId;
      newStatus = "READY_FOR_YODECK";
      action = metadata.isYodeckCompatible ? "VALIDATED_AND_UPLOADED" : "NORMALIZED_AND_UPLOADED";

      await db.update(adAssets)
        .set({
          yodeckReadinessStatus: "READY_FOR_YODECK",
          yodeckMediaId: yodeckMediaId,
          yodeckUploadedAt: new Date(),
        })
        .where(eq(adAssets.id, asset.id));

      await db.update(advertisers)
        .set({
          yodeckMediaIdCanonical: yodeckMediaId,
          yodeckMediaIdCanonicalUpdatedAt: new Date(),
          assetStatus: "ready_for_yodeck",
          updatedAt: new Date(),
        })
        .where(eq(advertisers.id, advertiserId));

      log(correlationId, "COMPLETE", `Asset ready with yodeckMediaId=${yodeckMediaId}`, logs, asset.id, oldStatus, newStatus);
      
      enqueuedCount++;
      completedCount++;

    } catch (e: any) {
      error = e.message;
      newStatus = "REJECTED";
      action = "FAILED";
      failedCount++;

      log(correlationId, "ERROR", `Failed: ${error}`, logs, asset.id, oldStatus, "REJECTED");

      await db.update(adAssets)
        .set({
          yodeckReadinessStatus: "REJECTED",
          yodeckRejectReason: error,
          normalizationError: error,
        })
        .where(eq(adAssets.id, asset.id));
      
      // DATABASE STATE MUST NEVER LIE - clear canonical ID on failure
      await db.update(advertisers)
        .set({
          assetStatus: "upload_failed",
          yodeckMediaIdCanonical: null,  // Clear to prevent stale/false ID
          updatedAt: new Date(),
        })
        .where(eq(advertisers.id, advertiserId));
      log(correlationId, "DB_UPDATE", `Cleared yodeckMediaIdCanonical due to failure`, logs);
    }

    assetActions.push({
      id: asset.id,
      originalFileName: asset.originalFileName,
      oldStatus,
      newStatus,
      action,
      yodeckMediaId,
      error,
    });
  }

  log(correlationId, "FINISH", `Completed: ${completedCount} succeeded, ${failedCount} failed`, logs);

  return {
    correlationId,
    scannedCount: assets.length,
    enqueuedCount,
    completedCount,
    failedCount,
    assets: assetActions,
    logs,
  };
}

export async function backfillPendingAssets(): Promise<{ processed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;

  const stuckAssets = await db.query.adAssets.findMany({
    where: and(
      eq(adAssets.yodeckReadinessStatus, "PENDING"),
      eq(adAssets.approvalStatus, "APPROVED"),
      eq(adAssets.isSuperseded, false),
      isNull(adAssets.yodeckMediaId)
    ),
  });

  console.log(`[MediaPipeline] Backfill: Found ${stuckAssets.length} stuck assets`);

  const advertiserIds = Array.from(new Set(stuckAssets.map(a => a.advertiserId)));

  for (const advertiserId of advertiserIds) {
    try {
      const result = await validateAdvertiserMedia(advertiserId);
      processed += result.completedCount;
      if (result.failedCount > 0) {
        errors.push(`Advertiser ${advertiserId}: ${result.failedCount} assets failed`);
      }
    } catch (e: any) {
      errors.push(`Advertiser ${advertiserId}: ${e.message}`);
    }
  }

  return { processed, errors };
}
