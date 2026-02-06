/**
 * NormalizeAndPublishService
 * 
 * Deterministic endpoint to normalize an existing asset and publish to Yodeck screens.
 * Steps:
 * 1. RESOLVE_ASSET - Pick newest APPROVED asset, validate mapping
 * 2. NORMALIZE - FFmpeg to H.264/yuv420p/faststart
 * 3. UPLOAD_TO_YODECK - 2-step upload with deterministic naming
 * 4. RESOLVE_PLAYLIST - Get effective playlist for each target
 * 5. UPDATE_PLAYLIST - Insert ad into playlist
 * 6. PUSH_VERIFY - Trigger push and verify adsCount > 0
 */

import { db } from "../db";
import { adAssets, advertisers, screens } from "@shared/schema";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { buildYodeckCreateMediaPayload, assertNoForbiddenKeys, logCreateMediaPayload } from "./yodeckPayloadBuilder";
import { ObjectStorageService } from "../objectStorage";

const execAsync = promisify(exec);
const r2Storage = new ObjectStorageService();

const YODECK_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN;

const KNOWN_BASELINE_MEDIA_IDS = [
  27476083, // NOS algemeen nieuws
  27464296, // Fallback video
];

async function getBaselineMediaIds(): Promise<number[]> {
  const ids = [...KNOWN_BASELINE_MEDIA_IDS];
  
  try {
    const baselinePlaylistId = process.env.BASELINE_PLAYLIST_ID;
    if (baselinePlaylistId) {
      const playlistResp = await yodeckRequest<any>(`/playlists/${baselinePlaylistId}/`);
      if (playlistResp.ok && playlistResp.data?.items) {
        const playlistMediaIds = playlistResp.data.items
          .map((item: any) => item.media?.id || item.media_id)
          .filter((id: number) => typeof id === "number");
        ids.push(...playlistMediaIds);
      }
    }
  } catch (e) {
    console.error("[getBaselineMediaIds] Error fetching baseline playlist:", e);
  }
  
  return Array.from(new Set(ids));
}

export interface NormalizeAndPublishRequest {
  targetYodeckPlayerIds: string[];
  force?: boolean;
}

export interface NormalizeAndPublishTrace {
  correlationId: string;
  timestamp: string;
  advertiserId: string;
  steps: TraceStep[];
  outcome: "SUCCESS" | "PARTIAL" | "FAILED";
  summary: {
    assetId: string | null;
    originalPath: string | null;
    normalizedPath: string | null;
    yodeckMediaId: number | null;
    ffprobeSummary: {
      original: FfprobeInfo | null;
      normalized: FfprobeInfo | null;
    };
    playlistsUpdated: number;
    screensPushed: number;
    adsCount: number;
  };
  logs: string[];
}

interface TraceStep {
  step: string;
  status: "success" | "failed" | "skipped";
  duration_ms: number;
  details: Record<string, any>;
  error?: string;
}

interface FfprobeInfo {
  codec?: string;
  pixelFormat?: string;
  width?: number;
  height?: number;
  duration?: number;
  moovAtStart?: boolean;
}

function log(correlationId: string, step: string, message: string, logs: string[]): void {
  const entry = `[NormalizePublish][${correlationId}] STEP=${step} ${message}`;
  console.log(entry);
  logs.push(entry);
}

async function checkMoovAtStart(filePath: string): Promise<boolean> {
  try {
    const fd = await fs.promises.open(filePath, 'r');
    const headerSize = 8192;
    const header = Buffer.alloc(headerSize);
    await fd.read(header, 0, headerSize, 0);
    await fd.close();

    let offset = 0;
    let moovOffset = -1;
    let mdatOffset = -1;

    while (offset + 8 <= headerSize) {
      const boxSize = header.readUInt32BE(offset);
      const boxType = header.toString('ascii', offset + 4, offset + 8);

      if (boxSize === 0) break;

      if (boxType === 'moov') {
        moovOffset = offset;
      } else if (boxType === 'mdat') {
        mdatOffset = offset;
      }

      if (moovOffset !== -1 && mdatOffset !== -1) {
        return moovOffset < mdatOffset;
      }

      offset += boxSize;
      if (boxSize > headerSize) break;
    }

    return moovOffset !== -1 && moovOffset < 8192;
  } catch (error) {
    console.error(`[checkMoovAtStart] Error:`, error);
    return false;
  }
}

async function yodeckRequest<T>(endpoint: string, options?: RequestInit): Promise<{
  ok: boolean;
  data?: T;
  error?: string;
}> {
  if (!YODECK_TOKEN) {
    throw new Error("YODECK_API_KEY missing: YODECK_AUTH_TOKEN env var is not set");
  }

  const method = (options?.method || "GET").toUpperCase();
  const url = `${YODECK_BASE}${endpoint}`;
  const authHeader = `Token ${YODECK_TOKEN}`;

  console.log(`[YodeckRequest] ${method} ${endpoint} authHeaderPresent=${!!authHeader}`);

  try {
    const resp = await fetch(url, {
      ...options,
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[YodeckRequest] ${method} ${endpoint} status=${resp.status} body='${text.slice(0, 2000)}'`);
      return { ok: false, error: `HTTP ${resp.status}: ${text}` };
    }

    const data = await resp.json();
    return { ok: true, data };
  } catch (error: any) {
    console.error(`[YodeckRequest] ${method} ${endpoint} error=${error.message}`);
    return { ok: false, error: error.message };
  }
}

export async function normalizeAndPublish(
  advertiserId: string,
  request: NormalizeAndPublishRequest
): Promise<NormalizeAndPublishTrace> {
  const correlationId = crypto.randomBytes(8).toString("hex");
  const logs: string[] = [];
  const steps: TraceStep[] = [];

  const trace: NormalizeAndPublishTrace = {
    correlationId,
    timestamp: new Date().toISOString(),
    advertiserId,
    steps,
    outcome: "FAILED",
    summary: {
      assetId: null,
      originalPath: null,
      normalizedPath: null,
      yodeckMediaId: null,
      ffprobeSummary: { original: null, normalized: null },
      playlistsUpdated: 0,
      screensPushed: 0,
      adsCount: 0,
    },
    logs,
  };

  log(correlationId, "START", `Beginning normalize-and-publish for advertiser ${advertiserId}`, logs);
  log(correlationId, "START", `Target players: ${request.targetYodeckPlayerIds.join(", ")}`, logs);

  const baselineMediaIds = await getBaselineMediaIds();
  log(correlationId, "START", `Loaded ${baselineMediaIds.length} baseline media IDs`, logs);

  // =========================================================================
  // STEP 1: RESOLVE_ASSET
  // =========================================================================
  const resolveStart = Date.now();
  let asset: any = null;
  let advertiser: any = null;

  try {
    const advertiserRows = await db
      .select()
      .from(advertisers)
      .where(eq(advertisers.id, advertiserId));

    if (advertiserRows.length === 0) {
      steps.push({
        step: "RESOLVE_ASSET",
        status: "failed",
        duration_ms: Date.now() - resolveStart,
        details: {},
        error: "Advertiser not found",
      });
      return trace;
    }

    advertiser = advertiserRows[0];

    const assets = await db
      .select()
      .from(adAssets)
      .where(
        and(
          eq(adAssets.advertiserId, advertiserId),
          eq(adAssets.approvalStatus, "APPROVED")
        )
      )
      .orderBy(desc(adAssets.createdAt));

    if (assets.length === 0) {
      steps.push({
        step: "RESOLVE_ASSET",
        status: "failed",
        duration_ms: Date.now() - resolveStart,
        details: { totalAssets: 0 },
        error: "No APPROVED assets found for this advertiser",
      });
      return trace;
    }

    const activeAssets = assets.filter((a) => !a.isSuperseded);
    asset = activeAssets[0];

    if (!asset) {
      steps.push({
        step: "RESOLVE_ASSET",
        status: "failed",
        duration_ms: Date.now() - resolveStart,
        details: { totalAssets: assets.length },
        error: "All approved assets are superseded",
      });
      return trace;
    }

    const existingMediaId = asset.yodeckMediaId;
    let mappingInvalid = false;
    let mappingReason = "";

    if (existingMediaId) {
      if (baselineMediaIds.includes(existingMediaId)) {
        mappingInvalid = true;
        mappingReason = `yodeckMediaId ${existingMediaId} is a baseline media ID`;
        log(correlationId, "RESOLVE_ASSET", `INVALID_MAPPING: ${mappingReason}`, logs);
      } else {
        const mediaResp = await yodeckRequest<any>(`/media/${existingMediaId}/`);
        if (mediaResp.ok && mediaResp.data) {
          const mediaName = mediaResp.data.name || "";
          const expectedPrefix = `EVZ-AD | ${advertiser.companyName}`;
          if (!mediaName.includes(advertiser.linkKey) && !mediaName.startsWith(expectedPrefix)) {
            mappingInvalid = true;
            mappingReason = `Media name "${mediaName}" does not contain linkKey "${advertiser.linkKey}"`;
            log(correlationId, "RESOLVE_ASSET", `INVALID_MAPPING: ${mappingReason}`, logs);
          }
        }
      }
    }

    trace.summary.assetId = asset.id;
    trace.summary.originalPath = asset.storagePath;

    steps.push({
      step: "RESOLVE_ASSET",
      status: "success",
      duration_ms: Date.now() - resolveStart,
      details: {
        assetId: asset.id,
        storagePath: asset.storagePath,
        originalFileName: asset.originalFileName,
        sizeBytes: asset.sizeBytes,
        existingMediaId,
        mappingInvalid,
        mappingReason: mappingReason || null,
        force: request.force,
      },
    });

    log(correlationId, "RESOLVE_ASSET", `Found asset ${asset.id}, mapping=${mappingInvalid ? "INVALID" : "OK"}`, logs);

  } catch (error: any) {
    steps.push({
      step: "RESOLVE_ASSET",
      status: "failed",
      duration_ms: Date.now() - resolveStart,
      details: {},
      error: error.message,
    });
    return trace;
  }

  // =========================================================================
  // STEP 2: NORMALIZE with FFmpeg
  // =========================================================================
  const normalizeStart = Date.now();
  let normalizedLocalPath: string | null = null;
  let originalFfprobe: FfprobeInfo | null = null;
  let normalizedFfprobe: FfprobeInfo | null = null;

  try {
    const storagePath = asset.storagePath || asset.storageUrl;
    if (!storagePath) {
      steps.push({
        step: "NORMALIZE",
        status: "failed",
        duration_ms: Date.now() - normalizeStart,
        details: {},
        error: "No storagePath or storageUrl on asset",
      });
      return trace;
    }

    log(correlationId, "NORMALIZE", `NORMALIZE_DOWNLOAD_START key=${storagePath}`, logs);

    const tmpDir = `/tmp/normalize-${correlationId}`;
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const originalLocalPath = path.join(tmpDir, "original.mp4");
    normalizedLocalPath = path.join(tmpDir, "normalized-yodeck.mp4");

    // Download via central R2 ObjectStorageService (same client as /api/debug/storage/object)
    const dlResult = await r2Storage.downloadToFile(storagePath, originalLocalPath);
    log(correlationId, "NORMALIZE", `NORMALIZE_DOWNLOAD_OK bytes=${dlResult.bytes} contentType=${dlResult.contentType}`, logs);

    try {
      const { stdout: probeOut } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${originalLocalPath}"`
      );
      const probeData = JSON.parse(probeOut);
      const videoStream = probeData.streams?.find((s: any) => s.codec_type === "video");
      originalFfprobe = {
        codec: videoStream?.codec_name,
        pixelFormat: videoStream?.pix_fmt,
        width: videoStream?.width,
        height: videoStream?.height,
        duration: parseFloat(probeData.format?.duration || "0"),
      };
      trace.summary.ffprobeSummary.original = originalFfprobe;
      log(correlationId, "NORMALIZE", `Original: ${originalFfprobe.codec} ${originalFfprobe.width}x${originalFfprobe.height} ${originalFfprobe.pixelFormat}`, logs);
    } catch (probeErr: any) {
      log(correlationId, "NORMALIZE", `ffprobe original failed: ${probeErr.message}`, logs);
    }

    // NOOP BYPASS: If asset is already mp4/h264/yuv420p with moov@start, skip ffmpeg
    if (originalFfprobe?.codec === "h264" && originalFfprobe?.pixelFormat === "yuv420p") {
      const moovOk = await checkMoovAtStart(originalLocalPath);
      const resOk = (originalFfprobe.width || 0) <= 1920 && (originalFfprobe.height || 0) <= 1080;

      if (moovOk && resOk) {
        log(correlationId, "NORMALIZE", `NORMALIZE_NOOP_USED reason="already_mp4_h264_yuv420p_moov@start" codec=${originalFfprobe.codec} pix=${originalFfprobe.pixelFormat} res=${originalFfprobe.width}x${originalFfprobe.height}`, logs);

        // Use the original file as-is (copy to normalized path)
        await fs.promises.copyFile(originalLocalPath, normalizedLocalPath);
        normalizedFfprobe = { ...originalFfprobe, moovAtStart: true };
        trace.summary.ffprobeSummary.normalized = normalizedFfprobe;

        const normalizedStoragePath = `ads/${advertiser.linkKey}/${asset.id}-yodeck.mp4`;
        const normalizedBuffer = await fs.promises.readFile(normalizedLocalPath);
        await r2Storage.uploadBufferToKey(normalizedBuffer, normalizedStoragePath, "video/mp4");

        trace.summary.normalizedPath = normalizedStoragePath;

        await db
          .update(adAssets)
          .set({
            normalizedStoragePath,
            normalizedStorageUrl: normalizedStoragePath,
            yodeckReadinessStatus: "READY_FOR_YODECK",
            normalizationCompletedAt: new Date(),
            normalizationProvider: "noop",
            yodeckMetadataJson: normalizedFfprobe as any,
          })
          .where(eq(adAssets.id, asset.id));

        steps.push({
          step: "NORMALIZE",
          status: "success",
          duration_ms: Date.now() - normalizeStart,
          details: {
            noop: true,
            reason: "already_mp4_h264_yuv420p_moov@start",
            originalSize: dlResult.bytes,
            normalizedSize: normalizedBuffer.length,
            normalizedStoragePath,
          },
        });

        log(correlationId, "NORMALIZE", `NOOP complete, stored at ${normalizedStoragePath}`, logs);
      }
    }

    // Only run ffmpeg if NOOP bypass was not used
    if (steps.filter(s => s.step === "NORMALIZE").length === 0) {
      log(correlationId, "NORMALIZE", `Running ffmpeg normalization...`, logs);

      const ffmpegCmd = `ffmpeg -y -i "${originalLocalPath}" \
        -c:v libx264 -preset medium -crf 23 \
        -pix_fmt yuv420p \
        -vf "scale=min(1920\\,iw):min(1080\\,ih):force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
        -movflags +faststart \
        -c:a aac -b:a 128k \
        -t 15 \
        "${normalizedLocalPath}" 2>&1`;

      const { stdout, stderr } = await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
      
      const normalizedExists = await fs.promises.access(normalizedLocalPath).then(() => true).catch(() => false);
      if (!normalizedExists) {
        throw new Error(`FFmpeg did not produce output file. stderr: ${stderr || stdout}`);
      }

      const normalizedStats = await fs.promises.stat(normalizedLocalPath);
      log(correlationId, "NORMALIZE", `Normalized file: ${normalizedStats.size} bytes`, logs);

      try {
        const { stdout: probeNorm } = await execAsync(
          `ffprobe -v quiet -print_format json -show_format -show_streams "${normalizedLocalPath}"`
        );
        const probeNormData = JSON.parse(probeNorm);
        const normVideoStream = probeNormData.streams?.find((s: any) => s.codec_type === "video");
        const moovAtStart = await checkMoovAtStart(normalizedLocalPath);
        
        normalizedFfprobe = {
          codec: normVideoStream?.codec_name,
          pixelFormat: normVideoStream?.pix_fmt,
          width: normVideoStream?.width,
          height: normVideoStream?.height,
          duration: parseFloat(probeNormData.format?.duration || "0"),
          moovAtStart,
        };
        trace.summary.ffprobeSummary.normalized = normalizedFfprobe;
        log(correlationId, "NORMALIZE", `Normalized: ${normalizedFfprobe.codec} ${normalizedFfprobe.width}x${normalizedFfprobe.height} ${normalizedFfprobe.pixelFormat} moov=${moovAtStart}`, logs);

        if (normalizedFfprobe.codec !== "h264") {
          throw new Error(`VALIDATION_FAILED: Normalized codec is ${normalizedFfprobe.codec}, expected h264`);
        }
        if (normalizedFfprobe.pixelFormat !== "yuv420p") {
          throw new Error(`VALIDATION_FAILED: Normalized pixel format is ${normalizedFfprobe.pixelFormat}, expected yuv420p`);
        }
        if ((normalizedFfprobe.width || 0) > 1920 || (normalizedFfprobe.height || 0) > 1080) {
          throw new Error(`VALIDATION_FAILED: Normalized resolution ${normalizedFfprobe.width}x${normalizedFfprobe.height} exceeds 1920x1080`);
        }
        if (!moovAtStart) {
          throw new Error(`VALIDATION_FAILED: moov atom not at start of file (faststart failed)`);
        }
        log(correlationId, "NORMALIZE", `HARD_GATE: Validation passed (h264, yuv420p, <=1920x1080, moov@start)`, logs);
      } catch (probeErr: any) {
        if (probeErr.message.includes("VALIDATION_FAILED")) {
          throw probeErr;
        }
        log(correlationId, "NORMALIZE", `ffprobe normalized failed: ${probeErr.message}`, logs);
      }

      const normalizedStoragePath = `ads/${advertiser.linkKey}/${asset.id}-yodeck.mp4`;
      const normalizedBuffer = await fs.promises.readFile(normalizedLocalPath);
      
      await r2Storage.uploadBufferToKey(normalizedBuffer, normalizedStoragePath, "video/mp4");

      trace.summary.normalizedPath = normalizedStoragePath;

      await db
        .update(adAssets)
        .set({
          normalizedStoragePath,
          normalizedStorageUrl: normalizedStoragePath,
          yodeckReadinessStatus: "READY_FOR_YODECK",
          normalizationCompletedAt: new Date(),
          normalizationProvider: "ffmpeg",
          yodeckMetadataJson: normalizedFfprobe as any,
        })
        .where(eq(adAssets.id, asset.id));

      steps.push({
        step: "NORMALIZE",
        status: "success",
        duration_ms: Date.now() - normalizeStart,
        details: {
          originalSize: dlResult.bytes,
          normalizedSize: normalizedStats.size,
          originalCodec: originalFfprobe?.codec,
          normalizedCodec: normalizedFfprobe?.codec,
          normalizedStoragePath,
        },
      });

      log(correlationId, "NORMALIZE", `Normalization complete, stored at ${normalizedStoragePath}`, logs);
    }

  } catch (error: any) {
    steps.push({
      step: "NORMALIZE",
      status: "failed",
      duration_ms: Date.now() - normalizeStart,
      details: {},
      error: error.message,
    });
    return trace;
  }

  // =========================================================================
  // STEP 3: UPLOAD_TO_YODECK (2-step)
  // =========================================================================
  const uploadStart = Date.now();
  let newYodeckMediaId: number | null = null;

  try {
    const safeName = `EVZ-AD-${asset.id.slice(0, 8)}.mp4`;
    log(correlationId, "UPLOAD_TO_YODECK", `Creating media: "${safeName}"`, logs);

    const createPayload = {
      name: safeName,
      media_origin: { type: "video", source: "local", format: null },
      file_extension: "mp4",
    };

    console.log(`[YodeckCreateMedia] payload=${JSON.stringify(createPayload)}`);

    const createResp = await yodeckRequest<any>("/media/", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });

    if (!createResp.ok || !createResp.data) {
      throw new Error(`Create media failed: ${createResp.error}`);
    }

    newYodeckMediaId = createResp.data.id;
    const getUploadUrlRaw = createResp.data.get_upload_url || createResp.data.presign_url;

    log(correlationId, "UPLOAD_TO_YODECK", `Created media ID=${newYodeckMediaId}, get_upload_url=${getUploadUrlRaw ? "present" : "missing"}`, logs);
    console.log(`[YodeckUpload] create response keys: ${Object.keys(createResp.data).join(", ")}`);

    if (!getUploadUrlRaw) {
      console.error(`[YodeckUpload] No upload URL. Full response: ${JSON.stringify(createResp.data).slice(0, 1000)}`);
      throw new Error("No get_upload_url returned from Yodeck");
    }

    // Step B: GET get_upload_url to resolve the real presigned upload_url
    let getUploadEndpoint = getUploadUrlRaw;
    if (getUploadEndpoint.startsWith("http")) {
      try {
        const parsed = new URL(getUploadEndpoint);
        getUploadEndpoint = parsed.pathname;
      } catch {}
    }
    log(correlationId, "UPLOAD_TO_YODECK", `GET get_upload_url endpoint: ${getUploadEndpoint}`, logs);

    const uploadUrlResp = await yodeckRequest<any>(getUploadEndpoint);
    if (!uploadUrlResp.ok || !uploadUrlResp.data) {
      console.error(`[YodeckUpload] GET get_upload_url failed: ${uploadUrlResp.error}`);
      throw new Error(`GET get_upload_url failed: ${uploadUrlResp.error}`);
    }

    const presignUrl = uploadUrlResp.data.upload_url;
    if (!presignUrl) {
      console.error(`[YodeckUpload] No upload_url in GET response. Body: ${JSON.stringify(uploadUrlResp.data).slice(0, 1000)}`);
      throw new Error(`GET get_upload_url response missing upload_url field. Keys: ${Object.keys(uploadUrlResp.data).join(", ")}`);
    }

    let uploadUrlHost = "unknown";
    try { uploadUrlHost = new URL(presignUrl).host; } catch {}
    log(correlationId, "UPLOAD_TO_YODECK", `Resolved presigned URL host=${uploadUrlHost}`, logs);

    // Step C: PUT binary to the presigned upload_url
    const normalizedBuffer = await fs.promises.readFile(normalizedLocalPath!);
    const bytesSent = normalizedBuffer.length;
    log(correlationId, "UPLOAD_TO_YODECK", `PUT ${bytesSent} bytes to ${uploadUrlHost}...`, logs);

    const uploadResp = await fetch(presignUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": bytesSent.toString(),
      },
      body: normalizedBuffer,
    });

    const putStatus = uploadResp.status;
    const putEtag = uploadResp.headers.get("etag") || "none";
    const putAmzId = uploadResp.headers.get("x-amz-request-id") || "none";
    const putCfRay = uploadResp.headers.get("cf-ray") || "none";

    log(correlationId, "UPLOAD_TO_YODECK", `PUT status=${putStatus} etag=${putEtag} x-amz-request-id=${putAmzId} cf-ray=${putCfRay} bytes=${bytesSent}`, logs);

    if (putStatus !== 200 && putStatus !== 204) {
      const text = await uploadResp.text();
      console.error(`[YodeckUpload] PUT failed: status=${putStatus} body='${text.slice(0, 500)}' etag=${putEtag} x-amz-request-id=${putAmzId} cf-ray=${putCfRay}`);
      throw new Error(`PUT to presigned URL failed: HTTP ${putStatus}`);
    }

    log(correlationId, "UPLOAD_TO_YODECK", `PUT complete, verifying immediately...`, logs);

    // Step D: Immediate verification before polling
    await new Promise((r) => setTimeout(r, 2000));
    const immediateCheck = await yodeckRequest<any>(`/media/${newYodeckMediaId}/`);
    if (immediateCheck.ok && immediateCheck.data) {
      const imStatus = immediateCheck.data.status;
      const imFileSize = immediateCheck.data.filesize || immediateCheck.data.file_size || 0;
      log(correlationId, "UPLOAD_TO_YODECK", `Immediate check: status=${imStatus} fileSize=${imFileSize}`, logs);
    } else {
      log(correlationId, "UPLOAD_TO_YODECK", `Immediate check failed: ${immediateCheck.error}`, logs);
    }

    // Step E: Poll until ready
    let mediaReady = false;
    let finalFileSize = 0;
    let lastPollStatus = "unknown";
    let initStuckCount = 0;
    for (let poll = 0; poll < 30; poll++) {
      await new Promise((r) => setTimeout(r, 3000));
      
      const statusResp = await yodeckRequest<any>(`/media/${newYodeckMediaId}/`);
      if (statusResp.ok && statusResp.data) {
        const status = statusResp.data.status;
        const fileSize = statusResp.data.filesize || statusResp.data.file_size || 0;
        lastPollStatus = status;
        
        log(correlationId, "UPLOAD_TO_YODECK", `Poll ${poll + 1}/30: status=${status}, fileSize=${fileSize}`, logs);
        
        if (status === "initialized" && fileSize === 0) {
          initStuckCount++;
          if (initStuckCount >= 10) {
            throw new Error(`FAILED_INIT_STUCK: media ${newYodeckMediaId} stuck at initialized/fileSize=0 after ${initStuckCount} polls. putStatus=${putStatus} uploadUrlHost=${uploadUrlHost} usedGetUploadUrl=true`);
          }
        }
        
        if (fileSize > 0 && (status === "Live" || status === "ready" || status === "converted")) {
          finalFileSize = fileSize;
          mediaReady = true;
          break;
        }
      }
    }

    if (!mediaReady || !newYodeckMediaId) {
      throw new Error(`Media not ready after polling. lastStatus=${lastPollStatus} putStatus=${putStatus} uploadUrlHost=${uploadUrlHost} usedGetUploadUrl=true`);
    }

    if (baselineMediaIds.includes(newYodeckMediaId!)) {
      throw new Error(`SECURITY: New media ID ${newYodeckMediaId} matches baseline - this should never happen`);
    }

    await db
      .update(adAssets)
      .set({
        yodeckMediaId: newYodeckMediaId,
        yodeckUploadedAt: new Date(),
      })
      .where(eq(adAssets.id, asset.id));

    trace.summary.yodeckMediaId = newYodeckMediaId;

    steps.push({
      step: "UPLOAD_TO_YODECK",
      status: "success",
      duration_ms: Date.now() - uploadStart,
      details: {
        mediaId: newYodeckMediaId,
        mediaName: safeName,
        fileSize: finalFileSize,
      },
    });

    log(correlationId, "UPLOAD_TO_YODECK", `Media ${newYodeckMediaId} ready with fileSize=${finalFileSize}`, logs);

  } catch (error: any) {
    steps.push({
      step: "UPLOAD_TO_YODECK",
      status: "failed",
      duration_ms: Date.now() - uploadStart,
      details: { mediaId: newYodeckMediaId },
      error: error.message,
    });
    return trace;
  }

  // =========================================================================
  // STEP 4-6: RESOLVE_PLAYLIST + UPDATE_PLAYLIST + PUSH_VERIFY for each target
  // =========================================================================
  let playlistsUpdated = 0;
  let screensPushed = 0;
  let totalAdsCount = 0;

  for (const playerId of request.targetYodeckPlayerIds) {
    const targetStart = Date.now();

    try {
      log(correlationId, "RESOLVE_PLAYLIST", `Processing player ${playerId}`, logs);

      const screenResp = await yodeckRequest<any>(`/screens/${playerId}/`);
      if (!screenResp.ok || !screenResp.data) {
        throw new Error(`Failed to fetch screen: ${screenResp.error}`);
      }

      const screenContent = screenResp.data.screen_content || screenResp.data;
      const sourceType = screenContent.source_type || screenResp.data.source_type;
      const sourceId = screenContent.source || screenContent.source_id || screenResp.data.source;

      if (sourceType !== "playlist") {
        steps.push({
          step: `RESOLVE_PLAYLIST_${playerId}`,
          status: "failed",
          duration_ms: Date.now() - targetStart,
          details: { sourceType },
          error: `Screen is in ${sourceType} mode, not playlist`,
        });
        continue;
      }

      const playlistId = typeof sourceId === "number" ? sourceId : parseInt(sourceId);
      log(correlationId, "RESOLVE_PLAYLIST", `Player ${playerId} uses playlist ${playlistId}`, logs);

      const playlistResp = await yodeckRequest<any>(`/playlists/${playlistId}/`);
      if (!playlistResp.ok || !playlistResp.data) {
        throw new Error(`Failed to fetch playlist: ${playlistResp.error}`);
      }

      const existingItems: any[] = playlistResp.data.items || [];
      const existingMediaIds = existingItems.map((item: any) => item.media?.id || item.media_id).filter(Boolean);

      log(correlationId, "UPDATE_PLAYLIST", `Playlist ${playlistId} has ${existingItems.length} items, mediaIds: ${existingMediaIds.join(",")}`, logs);

      if (existingMediaIds.includes(newYodeckMediaId)) {
        log(correlationId, "UPDATE_PLAYLIST", `Media ${newYodeckMediaId} already in playlist, skipping insert`, logs);
      } else {
        const uniqueItems = existingItems.filter((item: any, index: number, arr: any[]) => {
          const mediaId = item.media?.id || item.media_id;
          return arr.findIndex((i: any) => (i.media?.id || i.media_id) === mediaId) === index;
        });

        const newItems = [
          ...uniqueItems.map((item: any) => ({
            media: item.media?.id || item.media_id,
            duration: item.duration || 10,
          })),
          {
            media: newYodeckMediaId,
            duration: 15,
          },
        ];

        const updateResp = await yodeckRequest<any>(`/playlists/${playlistId}/`, {
          method: "PATCH",
          body: JSON.stringify({
            items: newItems,
          }),
        });

        if (!updateResp.ok) {
          throw new Error(`Failed to update playlist: ${updateResp.error}`);
        }

        log(correlationId, "UPDATE_PLAYLIST", `Playlist ${playlistId} updated: ${existingItems.length} → ${newItems.length} items`, logs);
        playlistsUpdated++;
      }

      const pushResp = await yodeckRequest<any>(`/screens/${playerId}/push/`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (pushResp.ok) {
        screensPushed++;
        log(correlationId, "PUSH_VERIFY", `Push triggered for player ${playerId}`, logs);
      } else {
        log(correlationId, "PUSH_VERIFY", `Push may have failed: ${pushResp.error}`, logs);
      }

      let verifySuccess = false;
      let verifyAttempts = 0;
      const maxVerifyAttempts = 3;
      
      while (!verifySuccess && verifyAttempts < maxVerifyAttempts) {
        verifyAttempts++;
        await new Promise((r) => setTimeout(r, 2000));
        
        const verifyResp = await yodeckRequest<any>(`/playlists/${playlistId}/`);
        if (verifyResp.ok && verifyResp.data) {
          const verifyItems = verifyResp.data.items || [];
          const verifyMediaIds = verifyItems.map((item: any) => item.media?.id || item.media_id);
          
          const newMediaPresent = verifyMediaIds.includes(newYodeckMediaId);
          const adsCount = verifyItems.filter((item: any) => {
            const mediaId = item.media?.id || item.media_id;
            return !baselineMediaIds.includes(mediaId);
          }).length;
          
          if (newMediaPresent && adsCount > 0) {
            verifySuccess = true;
            totalAdsCount += adsCount;
            log(correlationId, "PUSH_VERIFY", `Playlist ${playlistId} verified: newMedia=${newYodeckMediaId} present, adsCount=${adsCount}`, logs);
          } else {
            log(correlationId, "PUSH_VERIFY", `Attempt ${verifyAttempts}/${maxVerifyAttempts}: newMedia=${newMediaPresent}, adsCount=${adsCount}`, logs);
          }
        }
      }
      
      if (!verifySuccess) {
        log(correlationId, "PUSH_VERIFY", `WARNING: Could not verify new media ${newYodeckMediaId} in playlist after ${maxVerifyAttempts} attempts`, logs);
      }

      steps.push({
        step: `TARGET_${playerId}`,
        status: "success",
        duration_ms: Date.now() - targetStart,
        details: {
          playlistId,
          playlistUpdated: true,
          pushTriggered: pushResp.ok,
        },
      });

    } catch (error: any) {
      steps.push({
        step: `TARGET_${playerId}`,
        status: "failed",
        duration_ms: Date.now() - targetStart,
        details: {},
        error: error.message,
      });
    }
  }

  trace.summary.playlistsUpdated = playlistsUpdated;
  trace.summary.screensPushed = screensPushed;
  trace.summary.adsCount = totalAdsCount;

  if (playlistsUpdated > 0 || totalAdsCount > 0) {
    trace.outcome = playlistsUpdated === request.targetYodeckPlayerIds.length ? "SUCCESS" : "PARTIAL";
  }

  log(correlationId, "COMPLETE", `Outcome=${trace.outcome}, playlists=${playlistsUpdated}, pushed=${screensPushed}, adsCount=${totalAdsCount}`, logs);

  try {
    const tmpDir = `/tmp/normalize-${correlationId}`;
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  } catch (e) {}

  return trace;
}

export async function isBaselineMediaId(mediaId: number): Promise<boolean> {
  const baselineIds = await getBaselineMediaIds();
  if (baselineIds.includes(mediaId)) return true;
  
  try {
    const mediaResp = await yodeckRequest<any>(`/media/${mediaId}/`);
    if (mediaResp.ok && mediaResp.data) {
      const name = (mediaResp.data.name || "").toLowerCase();
      if (name.includes("nos") || name.includes("baseline") || name.includes("fallback") || name.includes("elevizion | loop")) {
        return true;
      }
    }
  } catch (e) {}
  
  return false;
}

export async function validateAssetMediaMapping(assetId: string): Promise<{
  valid: boolean;
  reason: string;
  suggestedAction?: string;
}> {
  const [asset] = await db.select().from(adAssets).where(eq(adAssets.id, assetId));
  
  if (!asset) {
    return { valid: false, reason: "Asset not found" };
  }

  if (!asset.yodeckMediaId) {
    return { valid: true, reason: "No yodeckMediaId set (upload pending)" };
  }

  if (await isBaselineMediaId(asset.yodeckMediaId)) {
    return {
      valid: false,
      reason: `yodeckMediaId ${asset.yodeckMediaId} is baseline content`,
      suggestedAction: "REUPLOAD",
    };
  }

  const mediaResp = await yodeckRequest<any>(`/media/${asset.yodeckMediaId}/`);
  if (!mediaResp.ok) {
    return {
      valid: false,
      reason: `Cannot verify media ${asset.yodeckMediaId}: ${mediaResp.error}`,
      suggestedAction: "REUPLOAD",
    };
  }

  const mediaName = mediaResp.data?.name || "";
  const fileSize = mediaResp.data?.filesize || mediaResp.data?.file_size || 0;

  if (fileSize === 0) {
    return {
      valid: false,
      reason: "Yodeck media has fileSize=0",
      suggestedAction: "REUPLOAD",
    };
  }

  const [advertiser] = await db.select().from(advertisers).where(eq(advertisers.id, asset.advertiserId));
  if (advertiser) {
    if (!mediaName.includes(advertiser.linkKey) && !mediaName.includes(advertiser.companyName)) {
      return {
        valid: false,
        reason: `Media name "${mediaName}" does not match advertiser`,
        suggestedAction: "REUPLOAD",
      };
    }
  }

  return { valid: true, reason: "OK" };
}
