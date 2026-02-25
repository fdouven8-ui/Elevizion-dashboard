import { db } from "../db";
import { adAssets, advertisers, uploadJobs, UPLOAD_JOB_STATUS, UPLOAD_FINAL_STATE } from "@shared/schema";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { spawn } from "child_process";
import { ObjectStorageService } from "../objectStorage";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import crypto from "crypto";
import * as Sentry from "@sentry/node";
import { buildYodeckCreateMediaPayload, assertNoForbiddenKeys, logCreateMediaPayload } from "./yodeckPayloadBuilder";
import { stampAssetMarkerOnMedia, cleanupDuplicateYodeckMediaForAsset } from "./yodeckDuplicateCleanupService";

const objectStorage = new ObjectStorageService();

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN;

export function isYodeckMediaReadyStandalone(
  statusData: { status?: string; error_message?: string; error?: string; [key: string]: any },
  fileState: { fileSize: number; hasFileObject: boolean; hasFileUrl: boolean; hasLastUploaded: boolean; hasThumbnailUrl: boolean },
): { ready: boolean; signal: "FILE_FIELDS" | "STRONG" | "WAIT_THUMBNAIL" | "NONE"; reason: string } {
  const status = (statusData.status || "").toLowerCase();
  if (status === "failed") {
    throw new Error(`YODECK_UPLOAD_FAILED: status=failed error=${statusData.error_message || statusData.error || "unknown"}`);
  }
  if (status === "initialized") return { ready: false, signal: "NONE", reason: "still_initialized" };
  if (fileState.fileSize > 0 || (fileState.hasFileObject && fileState.hasFileUrl)) {
    return { ready: true, signal: "FILE_FIELDS", reason: `fileSize=${fileState.fileSize} hasFileObj=${fileState.hasFileObject} hasFileUrl=${fileState.hasFileUrl}` };
  }
  if (status === "finished" && fileState.hasLastUploaded && fileState.hasThumbnailUrl) {
    return { ready: true, signal: "STRONG", reason: `finished+last_uploaded+thumbnail_url` };
  }
  if (status === "finished" && fileState.hasLastUploaded && !fileState.hasThumbnailUrl) {
    return { ready: false, signal: "WAIT_THUMBNAIL", reason: `finished+last_uploaded but thumbnail_url missing — keep polling` };
  }
  return { ready: false, signal: "NONE", reason: `status=${status} noFileFields noFinishedSignals` };
}

export function classifyUploadVerification(opts: {
  putOk: boolean; etagPresent: boolean; verifyOk: boolean;
  verifyStatus?: number; methodUsed: string;
  contentLength?: number; expectedSize: number;
}): "OK" | "INCONCLUSIVE" | "FAIL" {
  if (opts.verifyOk && opts.contentLength && opts.contentLength === opts.expectedSize) return "OK";
  if (opts.verifyOk && opts.contentLength && opts.contentLength > 0) return "OK";
  if (opts.verifyOk) return "OK";
  const INCONCLUSIVE_STATUSES = new Set([403, 405, 501]);
  if (opts.verifyStatus && INCONCLUSIVE_STATUSES.has(opts.verifyStatus) && opts.putOk && (opts.etagPresent || opts.methodUsed === "NONE")) {
    return "INCONCLUSIVE";
  }
  if (opts.methodUsed === "NONE" && opts.putOk) return "INCONCLUSIVE";
  if (opts.verifyStatus && INCONCLUSIVE_STATUSES.has(opts.verifyStatus) && opts.putOk) return "INCONCLUSIVE";
  if (!opts.verifyOk && opts.contentLength === 0) return "FAIL";
  if (!opts.verifyOk && opts.verifyStatus && !INCONCLUSIVE_STATUSES.has(opts.verifyStatus)) return "FAIL";
  return opts.putOk ? "INCONCLUSIVE" : "FAIL";
}

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
    // Use canonical payload builder - NEVER include media_origin/media_type
    const mediaName = name.endsWith(".mp4") ? name : `${name}.mp4`;
    const payload = buildYodeckCreateMediaPayload(mediaName);
    
    // Safety guard: fail fast if forbidden keys somehow sneak in
    assertNoForbiddenKeys(payload, "uploadToYodeck");
    logCreateMediaPayload(payload);
    
    const createResp = await fetch(`${YODECK_API_BASE}/media/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const createRespText = await createResp.text();
    let createData: any;
    try {
      createData = JSON.parse(createRespText);
    } catch {
      createData = { rawText: createRespText.substring(0, 500) };
    }
    
    console.log(`[MediaPipeline] CREATE_MEDIA response: status=${createResp.status}, body=${JSON.stringify(createData).substring(0, 300)}`);

    if (!createResp.ok) {
      return { 
        ok: false, 
        error: `Create media failed: ${createResp.status} ${JSON.stringify(createData)}`,
      };
    }

    const mediaId = createData.id;
    const getUploadUrlEndpoint = createData.get_upload_url;

    if (!getUploadUrlEndpoint) {
      return { ok: false, error: "No get_upload_url in create response" };
    }
    
    // STEP 2: GET the presigned URL from the endpoint
    console.log(`[MediaPipeline] GET_PRESIGNED_URL: fetching from ${getUploadUrlEndpoint}`);
    
    const fullEndpointUrl = getUploadUrlEndpoint.startsWith("http") 
      ? getUploadUrlEndpoint 
      : `${YODECK_API_BASE.replace("/api/v2", "")}${getUploadUrlEndpoint}`;
    
    const presignResp = await fetch(fullEndpointUrl, {
      method: "GET",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
      },
    });
    
    if (!presignResp.ok) {
      return { ok: false, error: `GET presigned URL failed: ${presignResp.status}` };
    }
    
    const presignData = await presignResp.json();
    const presignUrl = presignData.upload_url || presignData.presign_url || presignData.url;
    
    console.log(`[MediaPipeline] GET_PRESIGNED_URL response: presignUrl=${presignUrl ? "present" : "MISSING"}`);
    
    if (!presignUrl) {
      return { ok: false, error: `No upload_url in presign response: ${JSON.stringify(presignData).substring(0, 200)}` };
    }

    // STEP 3: PUT binary to presigned URL using streaming
    const fileSize = fs.statSync(filePath).size;
    
    console.log(`[MediaPipeline] PUT_BINARY: uploading ${fileSize} bytes to presigned URL (url_length=${presignUrl.length})`);
    
    const fileStream = fs.createReadStream(filePath);
    
    let streamError: Error | null = null;
    fileStream.on('error', (err) => {
      streamError = err;
      console.error(`[MediaPipeline] FILE_STREAM_ERROR: ${err.message}`);
    });
    
    const uploadResp = await fetch(presignUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(fileSize),
      },
      body: fileStream as any,
      // @ts-ignore - duplex required for streaming body in Node.js fetch
      duplex: "half",
    });

    if (streamError) {
      return { ok: false, error: `YODECK_UPLOAD_ABORTED: File stream error during upload: ${(streamError as Error).message}` };
    }

    let uploadRespBody = "";
    try {
      uploadRespBody = await uploadResp.text();
    } catch {}
    
    console.log(`[MediaPipeline] PUT_BINARY response: status=${uploadResp.status} body=${uploadRespBody.substring(0, 500)}`);

    if (!uploadResp.ok && uploadResp.status !== 204) {
      return { ok: false, error: `YODECK_UPLOAD_ABORTED: Upload to presign URL failed: status=${uploadResp.status} body=${uploadRespBody.substring(0, 300)}` };
    }

    // Poll until status is NOT "initialized" (any other status = ready for use)
    const POLL_MAX_SECONDS = 120;
    const startTime = Date.now();
    let pollCount = 0;
    
    while ((Date.now() - startTime) < POLL_MAX_SECONDS * 1000) {
      await new Promise(r => setTimeout(r, 3000));
      pollCount++;
      
      const statusResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });

      if (statusResp.ok) {
        const statusData = await statusResp.json();
        const polledFileSize = statusData.filesize || statusData.file_size || 0;
        const status = statusData.status;
        const errorMessage = statusData.error_message || statusData.errorMessage || statusData.error || "";
        
        console.log(`[MediaPipeline] POLL #${pollCount}: mediaId=${mediaId} status=${status} fileSize=${polledFileSize} error=${errorMessage}`);

        if (status === "error" || (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes("abort"))) {
          return { ok: false, error: `Yodeck upload aborted/error: status=${status} error=${errorMessage}` };
        }

        // Success = any status that is NOT "initialized" + has filesize
        if (status !== "initialized" && polledFileSize > 0) {
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

    return { ok: false, error: `Timeout waiting for Yodeck media ${mediaId} to become ready after ${pollCount} polls (${POLL_MAX_SECONDS}s)` };
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
    orderBy: (adAssets, { desc }) => [desc(adAssets.uploadedAt)],
  });

  log(correlationId, "SCAN", `Found ${assets.length} assets needing validation`, logs);

  let enqueuedCount = 0;
  let completedCount = 0;
  let failedCount = 0;

  const tempDir = os.tmpdir();

  // IMPORTANT: Only process the FIRST (most recent by uploadedAt DESC) non-superseded asset
  // This prevents noise from processing old/duplicate assets
  const assetsToProcess = assets.length > 0 ? [assets[0]] : [];
  
  if (assets.length > 1) {
    log(correlationId, "DEDUP", `Found ${assets.length} assets, processing newest (uploadedAt DESC): ${assets[0].id} (uploaded ${assets[0].uploadedAt})`, logs);
  }

  for (const asset of assetsToProcess) {
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
      
      // Use ObjectStorageService for proper download with error handling
      const downloadBuffer = await objectStorage.downloadFile(storagePath);
      if (!downloadBuffer) {
        // Try to get more details by checking file existence
        const file = await objectStorage.getFileByPath(storagePath);
        if (!file) {
          throw new Error(`Download failed: File not found at path "${storagePath}". Check storage path format.`);
        }
        throw new Error(`Download failed: File exists but download returned null`);
      }
      
      log(correlationId, "DOWNLOAD_OK", `Downloaded ${downloadBuffer.length} bytes`, logs, asset.id);
      fs.writeFileSync(localPath, downloadBuffer);

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

        const normalizedFileName = `normalized/${asset.id}/${path.basename(normalizedPath)}`;
        const normalizedBuffer = fs.readFileSync(normalizedPath);
        
        log(correlationId, "UPLOAD_NORMALIZED", `Uploading normalized file to storage`, logs, asset.id);
        
        const storedPath = await objectStorage.uploadFile(normalizedBuffer, normalizedFileName, "video/mp4");

        await db.update(adAssets)
          .set({
            normalizedStoragePath: storedPath,
            normalizedStorageUrl: storedPath,
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

// ============================================================================
// PUBLISH SINGLE ASSET - Direct publish for admin retry, NO scan/dedup
// ============================================================================

export interface PublishSingleAssetResult {
  ok: boolean;
  assetId: string;
  correlationId: string;
  yodeckMediaId?: number;
  error?: string;
}

export async function publishSingleAsset(opts: {
  assetId: string;
  correlationId: string;
  actor: string;
}): Promise<PublishSingleAssetResult> {
  const { assetId, correlationId, actor } = opts;
  const LOG = "[RetryPublish]";

  console.log(`${LOG} correlationId=${correlationId} assetId=${assetId} actor=${actor}`);

  // 1. Load asset by ID
  const asset = await db.query.adAssets.findFirst({
    where: eq(adAssets.id, assetId),
  });

  if (!asset) {
    console.error(`${LOG} correlationId=${correlationId} ASSET_NOT_FOUND assetId=${assetId}`);
    return { ok: false, assetId, correlationId, error: "Asset niet gevonden" };
  }

  const allowedApprovalStatuses = ["APPROVED", "APPROVED_PENDING_PUBLISH"];
  if (!allowedApprovalStatuses.includes(asset.approvalStatus)) {
    console.error(`${LOG} correlationId=${correlationId} WRONG_STATUS assetId=${assetId} approvalStatus=${asset.approvalStatus}`);
    return { ok: false, assetId, correlationId, error: `Asset heeft status ${asset.approvalStatus}, moet APPROVED zijn` };
  }
  if (asset.approvalStatus === "APPROVED_PENDING_PUBLISH") {
    console.warn(`${LOG} correlationId=${correlationId} COMPAT_ALIAS assetId=${assetId} treating APPROVED_PENDING_PUBLISH as APPROVED`);
  }

  // 3. Determine storage path
  const storagePath = asset.normalizedStoragePath || asset.storagePath;
  if (!storagePath) {
    console.error(`${LOG} correlationId=${correlationId} NO_STORAGE_PATH assetId=${assetId}`);
    await db.update(adAssets).set({
      publishStatus: "PUBLISH_FAILED",
      publishError: "Geen storage pad gevonden voor dit asset",
    }).where(eq(adAssets.id, assetId));
    return { ok: false, assetId, correlationId, error: "Geen storage pad gevonden" };
  }

  console.log(`${LOG} correlationId=${correlationId} assetId=${assetId} storagePath=${storagePath}`);

  // 4. Check file exists in object storage
  const fileInfo = await objectStorage.getFileByPath(storagePath);
  const fileExists = !!fileInfo;
  console.log(`${LOG} correlationId=${correlationId} assetId=${assetId} storagePath=${storagePath} exists=${fileExists}`);

  if (!fileExists) {
    console.error(`${LOG} correlationId=${correlationId} STORAGE_FILE_MISSING assetId=${assetId} storagePath=${storagePath}`);
    await db.update(adAssets).set({
      publishStatus: "PUBLISH_FAILED",
      publishError: `Storage file missing: ${storagePath}`,
    }).where(eq(adAssets.id, assetId));
    return { ok: false, assetId, correlationId, error: `Storage bestand niet gevonden: ${storagePath}` };
  }

  // 5. Download file
  const tempDir = os.tmpdir();
  const localPath = path.join(tempDir, `retry-publish-${assetId}-${Date.now()}.mp4`);

  try {
    const downloadBuffer = await objectStorage.downloadFile(storagePath);
    if (!downloadBuffer || downloadBuffer.length === 0) {
      throw new Error("Download returned empty buffer");
    }
    fs.writeFileSync(localPath, downloadBuffer);
    console.log(`${LOG} correlationId=${correlationId} DOWNLOAD_OK assetId=${assetId} bytes=${downloadBuffer.length}`);
  } catch (dlErr: any) {
    console.error(`${LOG} correlationId=${correlationId} DOWNLOAD_FAILED assetId=${assetId} error=${dlErr.message}`);
    await db.update(adAssets).set({
      publishStatus: "PUBLISH_FAILED",
      publishError: `Download mislukt: ${dlErr.message}`,
    }).where(eq(adAssets.id, assetId));
    try { fs.unlinkSync(localPath); } catch {}
    return { ok: false, assetId, correlationId, error: `Download mislukt: ${dlErr.message}` };
  }

  // 6. Yodeck upload - step by step with EARLY ID persistence
  const filename = asset.storedFilename || asset.originalFileName || `asset-${assetId}.mp4`;
  const mediaName = filename.endsWith(".mp4") ? filename : `${filename}.mp4`;
  let yodeckMediaId: number | null = asset.yodeckMediaId || null;
  let getUploadUrlEndpoint: string | null = null;

  // Create upload_job for tracking
  let uploadJobId: string | null = null;
  try {
    const fileStats = fs.statSync(localPath);
    const [job] = await db.insert(uploadJobs)
      .values({
        advertiserId: asset.advertiserId,
        localAssetPath: storagePath,
        localFileSize: fileStats.size,
        desiredFilename: mediaName,
        correlationId,
        status: UPLOAD_JOB_STATUS.UPLOADING,
        finalState: null,
        attempt: 1,
        maxAttempts: 5,
        pollAttempts: 0,
      })
      .returning();
    uploadJobId = job.id;
    console.log(`${LOG} correlationId=${correlationId} UPLOAD_JOB_CREATED jobId=${uploadJobId}`);
  } catch (jobErr: any) {
    console.warn(`${LOG} correlationId=${correlationId} Failed to create upload job: ${jobErr.message} (continuing)`);
  }

  let presignUrl: string | undefined;
  try {
    if (!YODECK_TOKEN) {
      throw new Error("YODECK_AUTH_TOKEN not configured");
    }

    // If asset already has yodeckMediaId (from failed retry), check if it's usable
    if (yodeckMediaId) {
      console.log(`${LOG} correlationId=${correlationId} EXISTING_MEDIA_ID assetId=${assetId} mediaId=${yodeckMediaId} - checking if valid`);
      try {
        const checkResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/`, {
          headers: { "Authorization": `Token ${YODECK_TOKEN}` },
        });
        if (checkResp.ok) {
          const checkData = await checkResp.json();
          const fileSize = checkData.filesize || checkData.file_size || 0;
          const status = checkData.status;
          if (status !== "initialized" && fileSize > 0) {
            console.log(`${LOG} correlationId=${correlationId} EXISTING_MEDIA_ALREADY_READY assetId=${assetId} mediaId=${yodeckMediaId} status=${status} fileSize=${fileSize}`);
            await db.update(adAssets).set({
              yodeckUploadedAt: new Date(),
              yodeckReadinessStatus: "READY",
              publishStatus: "PUBLISHED",
              publishError: null,
            }).where(eq(adAssets.id, assetId));
            await db.update(advertisers).set({
              assetStatus: "live",
              updatedAt: new Date(),
            }).where(eq(advertisers.id, asset.advertiserId));
            try { fs.unlinkSync(localPath); } catch {}
            return { ok: true, assetId, correlationId, yodeckMediaId };
          }
          console.log(`${LOG} correlationId=${correlationId} EXISTING_MEDIA_NOT_READY assetId=${assetId} mediaId=${yodeckMediaId} status=${status} fileSize=${fileSize} - creating new`);
        } else {
          console.log(`${LOG} correlationId=${correlationId} EXISTING_MEDIA_GONE assetId=${assetId} mediaId=${yodeckMediaId} status=${checkResp.status} - creating new`);
        }
      } catch (checkErr: any) {
        console.warn(`${LOG} correlationId=${correlationId} EXISTING_MEDIA_CHECK_ERROR: ${checkErr.message} - creating new`);
      }
      yodeckMediaId = null;
    }

    // STEP 1: CREATE MEDIA in Yodeck
    const payload = buildYodeckCreateMediaPayload(mediaName);
    assertNoForbiddenKeys(payload, "publishSingleAsset");
    logCreateMediaPayload(payload);

    const createResp = await fetch(`${YODECK_API_BASE}/media/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let createData: any;
    try {
      createData = JSON.parse(await createResp.text());
    } catch {
      createData = {};
    }

    if (!createResp.ok) {
      throw new Error(`CREATE_MEDIA failed: ${createResp.status} ${JSON.stringify(createData).substring(0, 300)}`);
    }

    yodeckMediaId = createData.id;
    getUploadUrlEndpoint = createData.get_upload_url;

    if (!yodeckMediaId || !getUploadUrlEndpoint) {
      throw new Error(`CREATE_MEDIA missing id or get_upload_url`);
    }

    console.log(`${LOG} correlationId=${correlationId} YODECK_CREATE_OK assetId=${assetId} mediaId=${yodeckMediaId}`);

    // EARLY PERSIST: Store yodeckMediaId immediately after CREATE to prevent duplicates on retry
    await db.update(adAssets).set({
      yodeckMediaId: yodeckMediaId,
    }).where(eq(adAssets.id, assetId));

    await db.update(advertisers).set({
      yodeckMediaIdCanonical: yodeckMediaId,
      yodeckMediaIdCanonicalUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(advertisers.id, asset.advertiserId));

    console.log(`${LOG} correlationId=${correlationId} EARLY_ID_SAVED assetId=${assetId} mediaId=${yodeckMediaId}`);

    stampAssetMarkerOnMedia(yodeckMediaId!, assetId, correlationId).catch(err =>
      console.warn(`${LOG} correlationId=${correlationId} STAMP_MARKER_BACKGROUND_ERROR: ${err.message}`)
    );

    // Update upload job with yodeckMediaId
    if (uploadJobId && yodeckMediaId) {
      try {
        await db.update(uploadJobs).set({
          yodeckMediaId: yodeckMediaId,
        }).where(eq(uploadJobs.id, uploadJobId));
      } catch {}
    }

    // STEP 2: GET presigned upload URL
    const fullEndpointUrl = getUploadUrlEndpoint!.startsWith("http")
      ? getUploadUrlEndpoint!
      : `${YODECK_API_BASE.replace("/api/v2", "")}${getUploadUrlEndpoint!}`;

    const presignResp = await fetch(fullEndpointUrl, {
      method: "GET",
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });

    if (!presignResp.ok) {
      throw new Error(`GET presigned URL failed: ${presignResp.status}`);
    }

    const presignData = await presignResp.json();
    presignUrl = presignData.upload_url || presignData.presign_url || presignData.url;

    if (!presignUrl) {
      throw new Error(`No upload_url in presign response`);
    }
    try {
      const presignParsed = new URL(presignUrl);
      console.log(`${LOG} correlationId=${correlationId} GET_UPLOAD_URL_OK host=${presignParsed.hostname} path=${presignParsed.pathname.substring(0, 30)}…`);
    } catch { console.log(`${LOG} correlationId=${correlationId} GET_UPLOAD_URL_OK (unparseable)`); }

    // --- Diagnostic helpers ---
    function maskUrl(url: string): string {
      try {
        const u = new URL(url);
        return `${u.hostname}${u.pathname.substring(0, 20)}…#${crypto.createHash("sha256").update(url).digest("hex").substring(0, 8)}`;
      } catch {
        return url.substring(0, 30) + "…#" + crypto.createHash("sha256").update(url).digest("hex").substring(0, 8);
      }
    }

    async function tryHeadOrRangeForSize(url: string): Promise<{
      ok: boolean; contentLength?: number; status?: number; methodUsed: "HEAD" | "RANGE" | "NONE";
    }> {
      try {
        const headResp = await fetch(url, { method: "HEAD" });
        const cl = headResp.headers.get("content-length");
        if (headResp.ok && cl && Number(cl) > 0) {
          return { ok: true, contentLength: Number(cl), status: headResp.status, methodUsed: "HEAD" };
        }
        if (headResp.ok && cl) {
          return { ok: false, contentLength: Number(cl), status: headResp.status, methodUsed: "HEAD" };
        }
        if (!headResp.ok && headResp.status !== 405 && headResp.status !== 403) {
          return { ok: false, status: headResp.status, methodUsed: "HEAD" };
        }
      } catch {}
      try {
        const rangeResp = await fetch(url, { method: "GET", headers: { "Range": "bytes=0-0" } });
        const crHeader = rangeResp.headers.get("content-range");
        const clHeader = rangeResp.headers.get("content-length");
        if ((rangeResp.status === 206 || rangeResp.status === 200) && crHeader) {
          const match = crHeader.match(/\/(\d+)$/);
          const totalSize = match ? Number(match[1]) : undefined;
          return { ok: !!totalSize && totalSize > 0, contentLength: totalSize, status: rangeResp.status, methodUsed: "RANGE" };
        }
        if (rangeResp.ok && clHeader && Number(clHeader) > 0) {
          return { ok: true, contentLength: Number(clHeader), status: rangeResp.status, methodUsed: "RANGE" };
        }
        return { ok: false, status: rangeResp.status, methodUsed: "RANGE" };
      } catch {}
      return { ok: false, methodUsed: "NONE" };
    }

    function getYodeckFileState(resp: any): {
      fileSize: number; hasFileObject: boolean; hasFileUrl: boolean;
      rawFileKeys: string[]; rawTopKeys: string[];
      hasArgsPlayUrl: boolean; hasArgsDownloadUrl: boolean;
      hasLastUploaded: boolean; hasThumbnailUrl: boolean;
    } {
      const fileSize = Number(resp.filesize || resp.file_size || resp.fileSize || 0) || 0;
      const fileObj = resp.file;
      const hasFileObject = !!fileObj && typeof fileObj === "object";
      const hasFileUrl = hasFileObject && !!(fileObj.url || fileObj.file_url || fileObj.download_url);
      const rawFileKeys = hasFileObject ? Object.keys(fileObj).slice(0, 8) : [];
      const rawTopKeys = Object.keys(resp).filter((k: string) =>
        /file|size|url|status|error|processing|updated|modified|duration|play|download|streaming|thumbnail|last_uploaded/i.test(k)
      ).slice(0, 10);
      const args = resp.arguments || {};
      const hasArgsPlayUrl = !!(args.play_from_url || resp.play_from_url);
      const hasArgsDownloadUrl = !!(args.download_from_url || resp.download_from_url || resp.download_url);
      const hasLastUploaded = !!(resp.last_uploaded || resp.lastUploaded);
      const hasThumbnailUrl = !!(resp.thumbnail_url || resp.thumbnailUrl || resp.thumbnail);
      return { fileSize, hasFileObject, hasFileUrl, rawFileKeys, rawTopKeys, hasArgsPlayUrl, hasArgsDownloadUrl, hasLastUploaded, hasThumbnailUrl };
    }

    function isYodeckMediaReady(statusData: any, fileState: ReturnType<typeof getYodeckFileState>): { ready: boolean; signal: "FILE_FIELDS" | "STRONG" | "WAIT_THUMBNAIL" | "NONE"; reason: string } {
      const status = (statusData.status || "").toLowerCase();
      if (status === "failed") {
        throw new Error(`YODECK_UPLOAD_FAILED: mediaId=${yodeckMediaId} status=failed error=${statusData.error_message || statusData.error || "unknown"}`);
      }
      if (status === "initialized") return { ready: false, signal: "NONE", reason: "still_initialized" };
      if (fileState.fileSize > 0 || (fileState.hasFileObject && fileState.hasFileUrl)) {
        return { ready: true, signal: "FILE_FIELDS", reason: `fileSize=${fileState.fileSize} hasFileObj=${fileState.hasFileObject} hasFileUrl=${fileState.hasFileUrl}` };
      }
      if (status === "finished" && fileState.hasLastUploaded && fileState.hasThumbnailUrl) {
        return { ready: true, signal: "STRONG", reason: `finished+last_uploaded+thumbnail_url` };
      }
      if (status === "finished" && fileState.hasLastUploaded && !fileState.hasThumbnailUrl) {
        return { ready: false, signal: "WAIT_THUMBNAIL", reason: `finished+last_uploaded but thumbnail_url missing — keep polling` };
      }
      return { ready: false, signal: "NONE", reason: `status=${status} noFileFields noFinishedSignals` };
    }

    function redactBody(data: any): string {
      const safe = { ...data };
      for (const k of ["authorization", "token", "api_key", "secret"]) {
        if (safe[k]) safe[k] = "[REDACTED]";
      }
      if (safe.file && typeof safe.file === "object") {
        const sf = { ...safe.file };
        for (const uk of ["url", "file_url", "download_url"]) {
          if (sf[uk]) sf[uk] = maskUrl(sf[uk]);
        }
        safe.file = sf;
      }
      if (safe.arguments && typeof safe.arguments === "object") {
        const sa = { ...safe.arguments };
        for (const uk of ["play_from_url", "download_from_url"]) {
          if (sa[uk]) sa[uk] = maskUrl(sa[uk]);
        }
        safe.arguments = sa;
      }
      for (const uk of ["play_from_url", "download_from_url", "download_url", "streaming_url", "file_url"]) {
        if (safe[uk] && typeof safe[uk] === "string") safe[uk] = maskUrl(safe[uk]);
      }
      return JSON.stringify(safe).substring(0, 800);
    }

    async function markAssetReady(pollsUsed: number, source: string) {
      console.log(`${LOG} correlationId=${correlationId} YODECK_READY_OK assetId=${assetId} mediaId=${yodeckMediaId} source=${source} polls=${pollsUsed}`);
      await db.update(adAssets).set({
        yodeckUploadedAt: new Date(),
        yodeckReadinessStatus: "READY",
        publishStatus: "PUBLISHED",
        publishError: null,
      }).where(eq(adAssets.id, assetId));
      await db.update(advertisers).set({
        assetStatus: "live",
        updatedAt: new Date(),
      }).where(eq(advertisers.id, asset.advertiserId));

      if (yodeckMediaId) {
        cleanupDuplicateYodeckMediaForAsset(assetId, yodeckMediaId, { correlationId }).catch(err =>
          console.warn(`${LOG} correlationId=${correlationId} CLEANUP_BACKGROUND_ERROR: ${err.message}`)
        );
      }
      if (uploadJobId) {
        try {
          await db.update(uploadJobs).set({
            status: UPLOAD_JOB_STATUS.READY,
            finalState: UPLOAD_FINAL_STATE.READY,
            yodeckMediaId: yodeckMediaId,
            pollAttempts: pollsUsed,
            completedAt: new Date(),
          }).where(eq(uploadJobs.id, uploadJobId));
        } catch {}
      }
      try { fs.unlinkSync(localPath); } catch {}
    }

    // STEP 3: PUT binary to presigned URL using buffer (not streaming)
    const { isShuttingDown } = await import("../shutdownFlag");
    const uploadBuffer = fs.readFileSync(localPath);
    const uploadFileSize = uploadBuffer.length;
    const fsStat = fs.statSync(localPath);

    if (uploadFileSize === 0) {
      throw new Error(`YODECK_UPLOAD_ABORTED: Local file is 0 bytes at ${localPath}`);
    }

    if (isShuttingDown()) {
      throw new Error(`YODECK_UPLOAD_ABORTED: Server shutting down before PUT`);
    }

    if (fsStat.size !== uploadFileSize) {
      console.warn(`${LOG} correlationId=${correlationId} SIZE_MISMATCH: fsStat=${fsStat.size} bufferLen=${uploadFileSize}`);
    }

    const putHeaders: Record<string, string> = {
      "Content-Type": "video/mp4",
      "Content-Length": String(uploadFileSize),
    };
    console.log(`${LOG} correlationId=${correlationId} PUT_BINARY_START assetId=${assetId} localPath=${localPath} fsStat=${fsStat.size} bufferLen=${uploadFileSize} CL=${uploadFileSize} streaming=false presign=${maskUrl(presignUrl)}`);

    const uploadResp = await fetch(presignUrl, {
      method: "PUT",
      headers: putHeaders,
      body: uploadBuffer,
    });

    let uploadRespBody = "";
    try { uploadRespBody = await uploadResp.text(); } catch {}

    const putRespHeaders: Record<string, string> = {};
    for (const hdr of ["etag", "x-amz-request-id", "x-amz-id-2", "cf-ray", "content-length"]) {
      const v = uploadResp.headers.get(hdr);
      if (v) putRespHeaders[hdr] = v;
    }

    if (!uploadResp.ok && uploadResp.status !== 204) {
      console.error(`${LOG} correlationId=${correlationId} PUT_BINARY_FAIL status=${uploadResp.status} respHeaders=${JSON.stringify(putRespHeaders)} body=${uploadRespBody.substring(0, 300)}`);
      throw new Error(`YODECK_UPLOAD_ABORTED: PUT binary failed: status=${uploadResp.status} body=${uploadRespBody.substring(0, 300)}`);
    }

    console.log(`${LOG} correlationId=${correlationId} PUT_BINARY_OK status=${uploadResp.status} bytes=${uploadFileSize} etag=${putRespHeaders["etag"] || "none"} amzReqId=${putRespHeaders["x-amz-request-id"] || "none"}`);

    // STEP 3.1: Verify bytes landed via HEAD or Range fallback
    const putOk = uploadResp.ok || uploadResp.status === 204;
    const etagPresent = !!(putRespHeaders["etag"]);
    const verifyResult = await tryHeadOrRangeForSize(presignUrl);
    const verifyDecision = classifyUploadVerification({
      putOk, etagPresent, verifyOk: verifyResult.ok,
      verifyStatus: verifyResult.status, methodUsed: verifyResult.methodUsed,
      contentLength: verifyResult.contentLength, expectedSize: uploadFileSize,
    });
    const byteVerifyOk = verifyDecision !== "FAIL";
    console.log(`${LOG} correlationId=${correlationId} UPLOAD_VERIFY_RESULT: decision=${verifyDecision} methodUsed=${verifyResult.methodUsed} verifyStatus=${verifyResult.status} contentLength=${verifyResult.contentLength} expected=${uploadFileSize} putOk=${putOk} etagPresent=${etagPresent}`);

    if (verifyResult.ok && verifyResult.contentLength && verifyResult.contentLength !== uploadFileSize) {
      console.warn(`${LOG} correlationId=${correlationId} UPLOAD_VERIFY_SIZE_MISMATCH: remote=${verifyResult.contentLength} local=${uploadFileSize}`);
    }

    if (verifyDecision === "FAIL") {
      console.error(`${LOG} correlationId=${correlationId} UPLOAD_BYTES_MISSING: putStatus=${uploadResp.status} verifyMethod=${verifyResult.methodUsed} verifyStatus=${verifyResult.status} contentLength=${verifyResult.contentLength || 0} expected=${uploadFileSize}`);
      throw new Error(`UPLOAD_BYTES_MISSING: mediaId=${yodeckMediaId} putStatus=${uploadResp.status} ${verifyResult.methodUsed}Status=${verifyResult.status} contentLength=${verifyResult.contentLength || 0} expected=${uploadFileSize}`);
    }

    // STEP 3.5: PUT /media/{id}/upload/complete/ — exactly one call per attempt
    let completeOk = false;
    let completeCallCount = 0;
    for (let completeAttempt = 1; completeAttempt <= 3; completeAttempt++) {
      try {
        const completePayload = { upload_url: presignUrl };
        completeCallCount++;
        const completeResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/upload/complete/`, {
          method: "PUT",
          headers: {
            "Authorization": `Token ${YODECK_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(completePayload),
        });
        let completeBody = "";
        try { completeBody = await completeResp.text(); } catch {}
        console.log(`${LOG} correlationId=${correlationId} UPLOAD_COMPLETE_OK=${completeResp.ok} attempt=${completeAttempt} status=${completeResp.status} body=${completeBody.substring(0, 200)}`);
        if (completeResp.ok || completeResp.status < 400) {
          completeOk = true;
          break;
        }
        if (completeAttempt < 3) await new Promise(r => setTimeout(r, 2000));
      } catch (completeErr: any) {
        console.warn(`${LOG} correlationId=${correlationId} UPLOAD_COMPLETE_ERROR attempt=${completeAttempt} error=${completeErr.message}`);
        if (completeAttempt < 3) await new Promise(r => setTimeout(r, 2000));
      }
    }
    if (!completeOk) {
      throw new Error(`UPLOAD_COMPLETE_FAILED: mediaId=${yodeckMediaId} failed after ${completeCallCount} attempts`);
    }

    // STEP 4: Poll until ready (4 min wall-clock, backoff 500ms→5s, fail-fast at 8 stuck polls)
    console.log(`${LOG} correlationId=${correlationId} POLL_START mediaId=${yodeckMediaId} byteVerifyOk=${byteVerifyOk} completeOk=${completeOk} maxMs=240000`);
    const POLL_MAX_MS = 240000;
    const FAIL_FAST_INITIALIZED_POLLS = 8;
    const startTime = Date.now();
    let pollCount = 0;
    let initializedZeroCount = 0;
    let completeFallbackFired = false;
    let finishedNoFileLogged = false;
    let lastPollStatus = "";
    let lastFileState: ReturnType<typeof getYodeckFileState> = { fileSize: 0, hasFileObject: false, hasFileUrl: false, rawFileKeys: [], rawTopKeys: [], hasArgsPlayUrl: false, hasArgsDownloadUrl: false, hasLastUploaded: false, hasThumbnailUrl: false };

    while (Date.now() - startTime < POLL_MAX_MS) {
      const backoffMs = Math.min(500 * Math.pow(2, Math.min(pollCount, 4)), 5000);
      await new Promise(r => setTimeout(r, backoffMs));
      pollCount++;

      const statusResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });

      if (!statusResp.ok) {
        console.warn(`${LOG} correlationId=${correlationId} POLL #${pollCount}: HTTP ${statusResp.status} — retrying`);
        continue;
      }

      const statusData = await statusResp.json();
      const fileState = getYodeckFileState(statusData);
      lastFileState = fileState;
      const status = statusData.status;
      lastPollStatus = status;
      const errorMessage = statusData.error_message || statusData.errorMessage || statusData.error || "";

      const detailKeys = Object.keys(statusData).slice(0, 20);
      console.log(`${LOG} correlationId=${correlationId} POLL #${pollCount}: mediaId=${yodeckMediaId} status=${status} fileSize=${fileState.fileSize} hasFileObj=${fileState.hasFileObject} hasFileUrl=${fileState.hasFileUrl} last_uploaded=${fileState.hasLastUploaded} thumbnail_present=${fileState.hasThumbnailUrl} topKeys=[${fileState.rawTopKeys.join(",")}] fileKeys=[${fileState.rawFileKeys.join(",")}] detailKeys=[${detailKeys.join(",")}] elapsed=${Date.now() - startTime}ms`);

      if (status === "error" || (typeof errorMessage === 'string' && errorMessage.toLowerCase().includes("abort"))) {
        throw new Error(`YODECK_UPLOAD_ABORTED: mediaId=${yodeckMediaId} status=${status} error=${errorMessage}`);
      }

      if (['failed', 'aborted', 'deleted'].includes((status || '').toLowerCase())) {
        throw new Error(`YODECK_UPLOAD_ABORTED: mediaId=${yodeckMediaId} terminal status=${status}`);
      }

      const readiness = isYodeckMediaReady(statusData, fileState);

      if (!readiness.ready && readiness.signal === "WAIT_THUMBNAIL") {
        console.log(`${LOG} correlationId=${correlationId} [WAIT_THUMBNAIL] mediaId=${yodeckMediaId} status=${status} last_uploaded=${fileState.hasLastUploaded} thumbnail_present=false — keep polling`);
        continue;
      }

      if (readiness.ready) {
        const verifyResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/`, {
          headers: { "Authorization": `Token ${YODECK_TOKEN}` },
        });
        if (verifyResp.status === 404) {
          throw new Error(`FINAL_VERIFY_404: Media ${yodeckMediaId} returns 404`);
        }
        const verifyData = await verifyResp.json();
        const verifyFileState = getYodeckFileState(verifyData);
        const verifyReadiness = isYodeckMediaReady(verifyData, verifyFileState);
        if (!verifyReadiness.ready) {
          console.warn(`${LOG} correlationId=${correlationId} VERIFY_FLAP: poll said ready(${readiness.signal}/${readiness.reason}) but verify says not ready: ${verifyReadiness.reason} — continuing`);
          continue;
        }
        console.log(`${LOG} correlationId=${correlationId} READY_CONFIRMED signal=${verifyReadiness.signal} reason=${verifyReadiness.reason}`);
        await markAssetReady(pollCount, `poll_verify_${verifyReadiness.signal}`);
        return { ok: true, assetId, correlationId, yodeckMediaId };
      }

      if (status === "initialized" && fileState.fileSize === 0 && !fileState.hasFileUrl) {
        initializedZeroCount++;
        if (pollCount >= 5 && !completeFallbackFired) {
          completeFallbackFired = true;
          completeCallCount++;
          console.warn(`${LOG} correlationId=${correlationId} STUCK: ${pollCount} polls, status=initialized, fileSize=0 — retrying upload/complete callCount=${completeCallCount}`);
          try {
            const retryResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/upload/complete/`, {
              method: "PUT",
              headers: { "Authorization": `Token ${YODECK_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify({ upload_url: presignUrl }),
            });
            console.log(`${LOG} correlationId=${correlationId} STUCK_COMPLETE_RETRY status=${retryResp.status}`);
          } catch {}
        }
        if (initializedZeroCount >= FAIL_FAST_INITIALIZED_POLLS) {
          throw new Error(`FAILED_INIT_STUCK: mediaId=${yodeckMediaId} stuck initialized+fileSize=0 for ${initializedZeroCount} consecutive polls after ${completeCallCount} upload/complete calls`);
        }
      } else {
        initializedZeroCount = 0;
      }

      if (status === "finished" && fileState.fileSize === 0 && !fileState.hasFileUrl && !readiness.ready) {
        if (!finishedNoFileLogged) {
          finishedNoFileLogged = true;
          console.warn(`${LOG} correlationId=${correlationId} YODECK_NO_FILE_FIELDS_ON_MEDIA_ENDPOINT #${pollCount} byteVerifyOk=${byteVerifyOk} lastUploaded=${fileState.hasLastUploaded} thumbnail=${fileState.hasThumbnailUrl}: ${redactBody(statusData)}`);
        } else {
          console.warn(`${LOG} correlationId=${correlationId} YODECK_NO_FILE_FIELDS_ON_MEDIA_ENDPOINT: still no file (poll #${pollCount}) byteVerifyOk=${byteVerifyOk} lastUploaded=${fileState.hasLastUploaded} thumbnail=${fileState.hasThumbnailUrl}`);
        }
      }

      if (status === "encoding" && fileState.fileSize === 0 && byteVerifyOk) {
        console.log(`${LOG} correlationId=${correlationId} ENCODING_BYTE_VERIFY_OK: status=encoding fileSize=0 but bytes verified — Yodeck still processing (poll #${pollCount})`);
      }
    }

    // STEP 5: Final diagnostic on timeout
    let finalDiag = "";
    try {
      const finalResp = await fetch(`${YODECK_API_BASE}/media/${yodeckMediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });
      if (finalResp.ok) {
        const finalData = await finalResp.json();
        const fs2 = getYodeckFileState(finalData);
        const finalStatus = finalData.status;
        const finalReadiness = isYodeckMediaReady(finalData, fs2);
        finalDiag = `status=${finalStatus} fileSize=${fs2.fileSize} hasFileObj=${fs2.hasFileObject} hasFileUrl=${fs2.hasFileUrl} lastUploaded=${fs2.hasLastUploaded} thumbnail=${fs2.hasThumbnailUrl} readySignal=${finalReadiness.signal} topKeys=[${fs2.rawTopKeys.join(",")}]`;
        console.log(`${LOG} correlationId=${correlationId} TIMEOUT_FINAL_DIAG: ${finalDiag}`);
        console.log(`${LOG} correlationId=${correlationId} TIMEOUT_FINAL_BODY: ${redactBody(finalData)}`);
        if (finalReadiness.ready) {
          await markAssetReady(pollCount, `timeout_final_${finalReadiness.signal}`);
          return { ok: true, assetId, correlationId, yodeckMediaId };
        }
      } else {
        finalDiag = `httpStatus=${finalResp.status}`;
        console.warn(`${LOG} correlationId=${correlationId} TIMEOUT_FINAL_DIAG: GET failed ${finalResp.status}`);
      }
    } catch (finalErr: any) {
      finalDiag = `error=${finalErr.message}`;
      console.warn(`${LOG} correlationId=${correlationId} TIMEOUT_FINAL_DIAG_ERROR: ${finalErr.message}`);
    }

    throw new Error(`POLL_TIMEOUT: mediaId=${yodeckMediaId} polls=${pollCount} elapsed=${Math.round((Date.now() - startTime) / 1000)}s lastStatus=${lastPollStatus} fileSize=${lastFileState.fileSize} hasFileObj=${lastFileState.hasFileObject} hasFileUrl=${lastFileState.hasFileUrl} lastUploaded=${lastFileState.hasLastUploaded} thumbnail=${lastFileState.hasThumbnailUrl} byteVerifyOk=${byteVerifyOk} completeOk=${completeOk} completeCalls=${completeCallCount} finalDiag={${finalDiag}}`);
  } catch (uploadErr: any) {
    console.error(`${LOG} correlationId=${correlationId} UPLOAD_ERROR assetId=${assetId} mediaId=${yodeckMediaId} error=${uploadErr.message}`);

    const step = /UPLOAD_BYTES_MISSING/.test(uploadErr.message || "") ? "UPLOAD_VERIFY"
      : /UPLOAD_COMPLETE_FAILED/.test(uploadErr.message || "") ? "COMPLETE"
      : /POLL_TIMEOUT|POLL_404/.test(uploadErr.message || "") ? "POLL"
      : "UPLOAD";
    Sentry.captureException(uploadErr, {
      tags: { correlationId, assetId: String(assetId), yodeckMediaId: String(yodeckMediaId || "none"), step },
      extra: { uploadJobId, presignHost: (() => { try { return presignUrl ? new URL(presignUrl).hostname : "none"; } catch { return "parse-error"; } })() },
    });

    // Determine error code for terminal failures
    const errMsg = uploadErr.message || "";
    const isTerminal = /FAILED_INIT_STUCK|POLL_TIMEOUT|POLL_404|VERIFY_404|FINAL_VERIFY_404|YODECK_UPLOAD_ABORTED|YODECK_UPLOAD_FAILED|UPLOAD_BYTES_MISSING|UPLOAD_COMPLETE_FAILED/.test(errMsg);

    // For terminal failures: ALWAYS clear canonical media IDs regardless of yodeckMediaId state
    // This ensures retry always forces a fresh CREATE_MEDIA + upload cycle
    if (isTerminal) {
      console.log(`${LOG} correlationId=${correlationId} TERMINAL_FAILURE - clearing all media IDs (yodeckMediaId=${yodeckMediaId}) for retry`);
      await db.update(adAssets).set({
        publishStatus: "PUBLISH_FAILED",
        publishError: uploadErr.message,
        yodeckMediaId: null,
      }).where(eq(adAssets.id, assetId));
      await db.update(advertisers).set({
        assetStatus: "ready_for_yodeck",
        yodeckMediaIdCanonical: null,
        updatedAt: new Date(),
      }).where(eq(advertisers.id, asset.advertiserId));
    } else {
      // Non-terminal: preserve yodeckMediaId for retry without re-upload
      await db.update(adAssets).set({
        publishStatus: "PUBLISH_FAILED",
        publishError: uploadErr.message,
      }).where(eq(adAssets.id, assetId));
    }

    // Update upload job as FAILED
    if (uploadJobId) {
      try {
        const errorCode = errMsg.match(/(FAILED_INIT_STUCK|POLL_TIMEOUT|POLL_404|VERIFY_404|FINAL_VERIFY_404|YODECK_UPLOAD_FAILED|UPLOAD_BYTES_MISSING|UPLOAD_COMPLETE_FAILED)/)?.[1] || "UPLOAD_ERROR";
        await db.update(uploadJobs).set({
          status: UPLOAD_JOB_STATUS.PERMANENT_FAIL,
          finalState: UPLOAD_FINAL_STATE.FAILED,
          yodeckMediaId: yodeckMediaId || null,
          errorCode,
          lastError: errMsg.substring(0, 500),
          completedAt: new Date(),
        }).where(eq(uploadJobs.id, uploadJobId));
      } catch {}
    }

    try { fs.unlinkSync(localPath); } catch {}
    return { ok: false, assetId, correlationId, yodeckMediaId: yodeckMediaId || undefined, error: uploadErr.message };
  }
}
