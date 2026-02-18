import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { db } from '../db';
import { adAssets } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { ObjectStorageService } from '../objectStorage';
import { extractVideoMetadataWithDetails, VideoMetadata } from './videoMetadataService';

const execAsync = promisify(exec);
const objectStorage = new ObjectStorageService();

function logMemory(label: string) {
  const mem = process.memoryUsage();
  const formatMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
  console.log(`[Memory:${label}] Heap: ${formatMB(mem.heapUsed)}/${formatMB(mem.heapTotal)}MB | RSS: ${formatMB(mem.rss)}MB`);
}

const TARGET_CODEC = 'h264';
const TARGET_PIXEL_FORMAT = 'yuv420p';

export interface TranscodeRequirement {
  needsTranscode: boolean;
  reason: string | null;
  originalCodec: string;
  originalPixelFormat: string;
  targetCodec: string;
  targetPixelFormat: string;
}

export interface TranscodeResult {
  success: boolean;
  outputPath?: string;
  metadata?: VideoMetadata;
  error?: string;
  duration?: number;
}

export function checkTranscodeRequired(metadata: VideoMetadata): TranscodeRequirement {
  const codec = (metadata.codec || 'unknown').toLowerCase();
  const pixFmt = (metadata.pixelFormat || 'unknown').toLowerCase();
  
  if (!metadata.codec || metadata.codec === 'unknown') {
    return {
      needsTranscode: false,
      reason: 'Cannot determine codec - skipping transcode',
      originalCodec: metadata.codec || 'unknown',
      originalPixelFormat: metadata.pixelFormat || 'unknown',
      targetCodec: TARGET_CODEC,
      targetPixelFormat: TARGET_PIXEL_FORMAT,
    };
  }
  
  const codecOk = codec === 'h264';
  const pixelFormatOk = pixFmt === 'yuv420p';
  
  if (codecOk && pixelFormatOk) {
    return {
      needsTranscode: false,
      reason: null,
      originalCodec: metadata.codec,
      originalPixelFormat: metadata.pixelFormat,
      targetCodec: TARGET_CODEC,
      targetPixelFormat: TARGET_PIXEL_FORMAT,
    };
  }
  
  const reasons: string[] = [];
  if (!codecOk) {
    reasons.push(`codec ${metadata.codec} → ${TARGET_CODEC}`);
  }
  if (!pixelFormatOk) {
    reasons.push(`pixel format ${metadata.pixelFormat} → ${TARGET_PIXEL_FORMAT}`);
  }
  
  return {
    needsTranscode: true,
    reason: reasons.join(', '),
    originalCodec: metadata.codec,
    originalPixelFormat: metadata.pixelFormat || 'unknown',
    targetCodec: TARGET_CODEC,
    targetPixelFormat: TARGET_PIXEL_FORMAT,
  };
}

function generateTempPath(prefix = 'elevizion-transcode'): string {
  const uuid = crypto.randomUUID();
  return `/tmp/${prefix}-${uuid}.mp4`;
}

export async function transcodeVideo(inputPath: string): Promise<TranscodeResult> {
  const startTime = Date.now();
  const outputPath = generateTempPath();
  
  try {
    console.log('[Transcode] Starting transcode:', inputPath, '->', outputPath);
    
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: 'Input file does not exist' };
    }
    
    const cmd = [
      'ffmpeg',
      '-y',
      '-i', `"${inputPath}"`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-profile:v', 'high',
      '-level', '4.0',
      '-r', '25',
      '-g', '50',
      '-keyint_min', '25',
      '-movflags', '+faststart',
      '-an',
      `"${outputPath}"`,
    ].join(' ');
    
    console.log('[Transcode] Running ffmpeg command');
    await execAsync(cmd, { timeout: 300000 });
    
    if (!fs.existsSync(outputPath)) {
      return { success: false, error: 'Transcode output file not created' };
    }
    
    const stats = fs.statSync(outputPath);
    if (stats.size === 0) {
      fs.unlinkSync(outputPath);
      return { success: false, error: 'Transcode output file is empty' };
    }
    
    const metadataResult = await extractVideoMetadataWithDetails(outputPath, false);
    if (!metadataResult.metadata) {
      fs.unlinkSync(outputPath);
      return { success: false, error: 'Could not extract metadata from transcoded file' };
    }
    
    const duration = Date.now() - startTime;
    console.log('[Transcode] Complete:', {
      outputSize: stats.size,
      duration: `${duration}ms`,
      codec: metadataResult.metadata.codec,
      pixelFormat: metadataResult.metadata.pixelFormat,
    });
    
    return {
      success: true,
      outputPath,
      metadata: metadataResult.metadata,
      duration,
    };
  } catch (error: any) {
    console.error('[Transcode] Error:', error.message);
    
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch {}
    
    return {
      success: false,
      error: error.message || 'Unknown transcode error',
      duration: Date.now() - startTime,
    };
  }
}

export interface ProcessAndUploadResult {
  success: boolean;
  storageUrl?: string;
  storagePath?: string;
  metadata?: VideoMetadata;
  error?: string;
}

// Transcode queue with concurrency=1 to prevent memory pressure
interface TranscodeQueueItem {
  assetId: string;
  inputStoragePath: string;
  resolve: (result: ProcessAndUploadResult) => void;
  reject: (error: Error) => void;
}

const transcodeQueue: TranscodeQueueItem[] = [];
let isTranscoding = false;

const RSS_LIMIT_MB = 180; // Platform limit is ~200MB, leave buffer

function isMemoryPressureHigh(): boolean {
  const mem = process.memoryUsage();
  const rssMB = mem.rss / 1024 / 1024;
  return rssMB > RSS_LIMIT_MB;
}

async function processTranscodeQueue(): Promise<void> {
  if (isTranscoding || transcodeQueue.length === 0) {
    return;
  }
  
  // Check RSS memory before starting ffmpeg - defer if too high
  if (isMemoryPressureHigh()) {
    logMemory('transcode-queue-deferred');
    console.warn('[TranscodeQueue] RSS memory pressure high, deferring job for 60s');
    setTimeout(() => processTranscodeQueue(), 60 * 1000);
    return;
  }
  
  isTranscoding = true;
  const item = transcodeQueue.shift()!;
  
  try {
    const result = await executeTranscodeAndUpload(item.assetId, item.inputStoragePath);
    item.resolve(result);
  } catch (error: any) {
    item.reject(error);
  } finally {
    isTranscoding = false;
    // Process next item in queue
    if (transcodeQueue.length > 0) {
      setImmediate(() => processTranscodeQueue());
    }
  }
}

export async function transcodeAndUpload(
  assetId: string,
  inputStoragePath: string
): Promise<ProcessAndUploadResult> {
  return new Promise((resolve, reject) => {
    transcodeQueue.push({ assetId, inputStoragePath, resolve, reject });
    console.log('[TranscodeQueue] Added to queue:', assetId, 'Queue length:', transcodeQueue.length);
    processTranscodeQueue();
  });
}

async function executeTranscodeAndUpload(
  assetId: string,
  inputStoragePath: string
): Promise<ProcessAndUploadResult> {
  console.log('[TranscodeAndUpload] Starting for asset:', assetId);
  logMemory('transcode-start');
  
  try {
    await db.update(adAssets)
      .set({ conversionError: null })
      .where(eq(adAssets.id, assetId));
    
    // Stream download to temp file - no memory buffering
    console.log('[TranscodeAndUpload] Streaming download of original file...');
    const tempInputPath = generateTempPath('elevizion-input');
    
    logMemory('before-download');
    await objectStorage.downloadFileToPath(inputStoragePath, tempInputPath);
    logMemory('after-download');
    const stats = fs.statSync(tempInputPath);
    console.log('[TranscodeAndUpload] Downloaded to:', tempInputPath, 'size:', stats.size);
    
    logMemory('before-ffmpeg');
    const transcodeResult = await transcodeVideo(tempInputPath);
    logMemory('after-ffmpeg');
    
    fs.unlinkSync(tempInputPath);
    
    if (!transcodeResult.success || !transcodeResult.outputPath || !transcodeResult.metadata) {
      throw new Error(transcodeResult.error || 'Transcode failed');
    }
    
    // Stream upload of transcoded file - no memory buffering
    console.log('[TranscodeAndUpload] Streaming upload of transcoded file...');
    
    const convertedFilename = `converted/${assetId}-converted.mp4`;
    
    logMemory('before-converted-upload');
    const storageUrl = await objectStorage.uploadFileFromPath(
      transcodeResult.outputPath,
      convertedFilename,
      'video/mp4'
    );
    logMemory('after-converted-upload');
    
    fs.unlinkSync(transcodeResult.outputPath);
    
    await db.update(adAssets)
      .set({
        conversionStatus: 'COMPLETED',
        conversionCompletedAt: new Date(),
        convertedStoragePath: convertedFilename,
        convertedStorageUrl: storageUrl,
        convertedCodec: transcodeResult.metadata.codec,
        convertedPixelFormat: transcodeResult.metadata.pixelFormat,
        convertedWidth: transcodeResult.metadata.width,
        convertedHeight: transcodeResult.metadata.height,
        convertedSizeBytes: transcodeResult.metadata.fileSize,
      })
      .where(eq(adAssets.id, assetId));
    
    console.log('[TranscodeAndUpload] Complete:', {
      assetId,
      convertedPath: convertedFilename,
      codec: transcodeResult.metadata.codec,
      pixelFormat: transcodeResult.metadata.pixelFormat,
    });
    
    return {
      success: true,
      storageUrl,
      storagePath: convertedFilename,
      metadata: transcodeResult.metadata,
    };
  } catch (error: any) {
    console.error('[TranscodeAndUpload] Error:', error.message);
    
    await db.update(adAssets)
      .set({
        conversionStatus: 'FAILED',
        conversionError: error.message || 'Unknown error',
      })
      .where(eq(adAssets.id, assetId));
    
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function startTranscodeJob(assetId: string): Promise<void> {
  const asset = await db.query.adAssets.findFirst({
    where: eq(adAssets.id, assetId),
  });
  
  if (!asset || !asset.storagePath) {
    console.error('[TranscodeJob] Asset not found or no storage path:', assetId);
    return;
  }
  
  if (asset.conversionStatus !== 'PENDING') {
    console.log('[TranscodeJob] Asset not pending conversion:', assetId, asset.conversionStatus);
    return;
  }
  
  if (asset.validationStatus !== 'valid') {
    console.log('[TranscodeJob] Asset validation failed, skipping transcode:', assetId);
    await db.update(adAssets)
      .set({ conversionStatus: 'NONE' })
      .where(eq(adAssets.id, assetId));
    return;
  }
  
  const [updateResult] = await db.update(adAssets)
    .set({ conversionStatus: 'CONVERTING', conversionStartedAt: new Date() })
    .where(and(
      eq(adAssets.id, assetId),
      eq(adAssets.conversionStatus, 'PENDING')
    ))
    .returning({ id: adAssets.id, conversionStatus: adAssets.conversionStatus });
  
  if (!updateResult) {
    console.log('[TranscodeJob] Status already changed (not PENDING), skipping:', assetId);
    return;
  }
  
  transcodeAndUpload(assetId, asset.storagePath).catch(err => {
    console.error('[TranscodeJob] Background transcode failed:', assetId, err.message);
  });
}

export async function retryFailedTranscode(assetId: string): Promise<ProcessAndUploadResult> {
  const asset = await db.query.adAssets.findFirst({
    where: eq(adAssets.id, assetId),
  });
  
  if (!asset || !asset.storagePath) {
    return { success: false, error: 'Asset not found or no storage path' };
  }
  
  if (asset.conversionStatus !== 'FAILED') {
    return { success: false, error: `Asset is not in FAILED state: ${asset.conversionStatus}` };
  }
  
  await db.update(adAssets)
    .set({
      conversionStatus: 'PENDING',
      conversionError: null,
    })
    .where(eq(adAssets.id, assetId));
  
  return await transcodeAndUpload(assetId, asset.storagePath);
}

export interface YodeckNormalizationResult {
  success: boolean;
  normalizedStoragePath?: string;
  normalizedStorageUrl?: string;
  yodeckMetadata?: {
    container: string;
    videoCodec: string;
    audioCodec: string | null;
    pixelFormat: string;
    width: number;
    height: number;
    durationSeconds: number;
    bitrate: number;
    hasVideoStream: boolean;
    hasAudioStream: boolean;
    moovAtStart: boolean;
    isYodeckCompatible: boolean;
    compatibilityReasons: string[];
    fileSizeBytes: number;
    framerate: number;
  };
  error?: string;
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
      if (boxType === 'moov') moovOffset = offset;
      else if (boxType === 'mdat') mdatOffset = offset;
      if (moovOffset !== -1 && mdatOffset !== -1) return moovOffset < mdatOffset;
      offset += boxSize;
      if (boxSize > headerSize) break;
    }
    return moovOffset !== -1 && moovOffset < 8192;
  } catch {
    return false;
  }
}

function needsYodeckNormalization(metadata: VideoMetadata, moovAtStart: boolean): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const codec = (metadata.codec || '').toLowerCase();
  const pixFmt = (metadata.pixelFormat || '').toLowerCase();

  if (codec !== 'h264') reasons.push(`codec ${metadata.codec} → h264`);
  if (pixFmt !== 'yuv420p') reasons.push(`pixel_format ${metadata.pixelFormat} → yuv420p`);
  if (!moovAtStart) reasons.push('moov atom not at start → faststart');
  if (metadata.hasAudio) reasons.push('has audio → strip audio');

  const fr = metadata.framerate;
  if (!fr || Math.abs(fr - 25) > 0.5) reasons.push(`framerate ${fr?.toFixed(1) ?? 'unknown'} → 25fps CFR`);

  return { needed: reasons.length > 0, reasons };
}

async function extractDetailedProbe(filePath: string): Promise<{
  codec: string; pixFmt: string; width: number; height: number;
  durationSeconds: number; bitrate: number; hasAudio: boolean;
  framerate: number; container: string; fileSizeBytes: number;
} | null> {
  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
    const { stdout } = await execAsync(cmd, { timeout: 30000 });
    const data = JSON.parse(stdout);
    const vs = data.streams?.find((s: any) => s.codec_type === 'video');
    const as_ = data.streams?.find((s: any) => s.codec_type === 'audio');
    if (!vs) return null;
    const frParts = (vs.avg_frame_rate || '0/1').split('/');
    const framerate = parseInt(frParts[0]) / (parseInt(frParts[1]) || 1);
    return {
      codec: vs.codec_name || 'unknown',
      pixFmt: vs.pix_fmt || 'unknown',
      width: vs.width || 0,
      height: vs.height || 0,
      durationSeconds: parseFloat(data.format?.duration || '0'),
      bitrate: parseInt(data.format?.bit_rate || '0'),
      hasAudio: !!as_,
      framerate,
      container: data.format?.format_name || 'unknown',
      fileSizeBytes: parseInt(data.format?.size || '0') || fs.statSync(filePath).size,
    };
  } catch (err: any) {
    console.error('[NormalizeYodeck] ffprobe failed:', err.message);
    return null;
  }
}

export async function normalizeForYodeck(assetId: string, force = false): Promise<YodeckNormalizationResult> {
  console.log(`[NormalizeYodeck] Starting for asset ${assetId} force=${force}`);
  logMemory('normalize-start');

  const asset = await db.query.adAssets.findFirst({ where: eq(adAssets.id, assetId) });
  if (!asset?.storagePath) {
    return { success: false, error: 'Asset not found or no storage path' };
  }

  if (!force && asset.yodeckReadinessStatus === 'READY_FOR_YODECK' && asset.normalizedStoragePath) {
    console.log(`[NormalizeYodeck] ${assetId} already READY_FOR_YODECK, skipping (use force=true to re-normalize)`);
    return { success: true, normalizedStoragePath: asset.normalizedStoragePath, normalizedStorageUrl: asset.normalizedStorageUrl || undefined };
  }

  if (!force && (asset.yodeckReadinessStatus === 'NORMALIZING' || asset.yodeckReadinessStatus === 'VALIDATING')) {
    console.log(`[NormalizeYodeck] ${assetId} already in progress (${asset.yodeckReadinessStatus}), skipping`);
    return { success: false, error: `Already in progress: ${asset.yodeckReadinessStatus}` };
  }

  await db.update(adAssets)
    .set({ yodeckReadinessStatus: 'VALIDATING', normalizationError: null })
    .where(eq(adAssets.id, assetId));

  const inputPath = generateTempPath('elevizion-norm-input');
  let outputPath: string | null = null;

  try {
    logMemory('before-download');
    await objectStorage.downloadFileToPath(asset.storagePath, inputPath);
    logMemory('after-download');

    const probe = await extractDetailedProbe(inputPath);
    if (!probe) {
      console.warn(`[Normalize] FAILED_BUT_CONTINUING reason=ffprobe_failed asset=${assetId}`);
      await db.update(adAssets)
        .set({ normalizationError: 'ffprobe failed on source file — using original' })
        .where(eq(adAssets.id, assetId));
      return { success: true, normalizedStoragePath: asset.storagePath, normalizedStorageUrl: asset.storageUrl || undefined };
    }

    const moovOk = await checkMoovAtStart(inputPath);
    const meta: VideoMetadata = {
      durationSeconds: probe.durationSeconds,
      width: probe.width, height: probe.height,
      aspectRatio: `${probe.width}:${probe.height}`,
      codec: probe.codec, pixelFormat: probe.pixFmt,
      hasAudio: probe.hasAudio, fileSize: probe.fileSizeBytes,
      mimeType: 'video/mp4', framerate: probe.framerate,
    };

    const check = needsYodeckNormalization(meta, moovOk);
    console.log(`[NormalizeYodeck] ${assetId} needsNormalization=${check.needed} reasons=${check.reasons.join(', ') || 'none'}`);

    let normalizedPath: string;
    let normalizedUrl: string;

    if (!check.needed) {
      normalizedPath = asset.storagePath;
      normalizedUrl = asset.storageUrl || '';
      console.log(`[NormalizeYodeck] ${assetId} already compliant, using original`);
    } else {
      await db.update(adAssets)
        .set({ yodeckReadinessStatus: 'NORMALIZING', normalizationStartedAt: new Date(), normalizationProvider: 'ffmpeg' })
        .where(eq(adAssets.id, assetId));

      outputPath = generateTempPath('elevizion-norm-output');

      const streamCopyCmd = [
        'ffmpeg', '-y',
        '-i', `"${inputPath}"`,
        '-c:v', 'copy',
        '-movflags', '+faststart',
        '-an',
        `"${outputPath}"`,
      ].join(' ');

      const ultrafastCmd = [
        'ffmpeg', '-y',
        '-i', `"${inputPath}"`,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-an',
        `"${outputPath}"`,
      ].join(' ');

      let ffmpegOk = false;
      logMemory('before-ffmpeg-normalize');

      try {
        console.log(`[NormalizeYodeck] ${assetId} trying stream-copy first...`);
        await execAsync(streamCopyCmd, { timeout: 120000 });
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          ffmpegOk = true;
          console.log(`[NormalizeYodeck] ${assetId} stream-copy succeeded`);
        }
      } catch (copyErr: any) {
        console.warn(`[NormalizeYodeck] ${assetId} stream-copy failed: ${copyErr.message?.substring(0, 200)}`);
        try { if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
      }

      if (!ffmpegOk) {
        try {
          console.log(`[NormalizeYodeck] ${assetId} falling back to ultrafast re-encode...`);
          await execAsync(ultrafastCmd, { timeout: 300000 });
          if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            ffmpegOk = true;
            console.log(`[NormalizeYodeck] ${assetId} ultrafast re-encode succeeded`);
          }
        } catch (encErr: any) {
          console.warn(`[NormalizeYodeck] ${assetId} ultrafast re-encode failed: ${encErr.message?.substring(0, 200)}`);
          try { if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
        }
      }

      logMemory('after-ffmpeg-normalize');

      if (!ffmpegOk) {
        console.warn(`[Normalize] FAILED_BUT_CONTINUING reason=both_ffmpeg_attempts_failed asset=${assetId}`);
        await db.update(adAssets)
          .set({
            normalizationError: 'Both stream-copy and ultrafast re-encode failed (likely OOM killed). Using original file.',
            normalizedStoragePath: asset.storagePath,
            normalizedStorageUrl: asset.storageUrl || '',
            normalizationCompletedAt: new Date(),
          })
          .where(eq(adAssets.id, assetId));
        return { success: true, normalizedStoragePath: asset.storagePath, normalizedStorageUrl: asset.storageUrl || undefined };
      } else {
        const normStoragePath = `normalized/${assetId}-normalized.mp4`;
        logMemory('before-norm-upload');
        normalizedUrl = await objectStorage.uploadFileFromPath(outputPath!, normStoragePath, 'video/mp4');
        logMemory('after-norm-upload');

        normalizedPath = normStoragePath;
        console.log(`[NormalizeYodeck] ${assetId} normalized and uploaded to ${normStoragePath}`);
      }
    }

    const probeFile = outputPath && fs.existsSync(outputPath) ? outputPath : inputPath;
    const finalProbe = outputPath && fs.existsSync(outputPath)
      ? await extractDetailedProbe(outputPath)
      : probe;
    const finalMoov = await checkMoovAtStart(probeFile);

    if (!finalProbe) {
      throw new Error('Could not probe normalized file');
    }

    const yodeckMeta = {
      container: 'mp4',
      videoCodec: finalProbe.codec,
      audioCodec: finalProbe.hasAudio ? 'aac' : null,
      pixelFormat: finalProbe.pixFmt,
      width: finalProbe.width,
      height: finalProbe.height,
      durationSeconds: finalProbe.durationSeconds,
      bitrate: finalProbe.bitrate,
      hasVideoStream: true,
      hasAudioStream: finalProbe.hasAudio,
      moovAtStart: finalMoov,
      isYodeckCompatible: true,
      compatibilityReasons: [],
      fileSizeBytes: finalProbe.fileSizeBytes,
      framerate: finalProbe.framerate,
    };

    const warnings: string[] = [];
    if (!finalMoov) { yodeckMeta.isYodeckCompatible = false; warnings.push('moov atom not at start after normalization'); }
    if (finalProbe.codec !== 'h264') { yodeckMeta.isYodeckCompatible = false; warnings.push(`codec still ${finalProbe.codec}`); }
    if (finalProbe.pixFmt !== 'yuv420p') { yodeckMeta.isYodeckCompatible = false; warnings.push(`pix_fmt still ${finalProbe.pixFmt}`); }
    yodeckMeta.compatibilityReasons = warnings;

    const readinessStatus = 'READY_FOR_YODECK';
    const rejectReason = warnings.length > 0 ? warnings.join('; ') : null;

    await db.update(adAssets)
      .set({
        normalizedStoragePath: normalizedPath,
        normalizedStorageUrl: normalizedUrl,
        normalizationCompletedAt: new Date(),
        yodeckReadinessStatus: readinessStatus,
        yodeckRejectReason: rejectReason,
        yodeckMetadataJson: yodeckMeta,
        validationWarnings: warnings.length > 0 ? warnings : [],
      })
      .where(eq(adAssets.id, assetId));

    console.log(`[NormalizeYodeck] ${assetId} complete: status=${readinessStatus} path=${normalizedPath}`);

    return {
      success: true,
      normalizedStoragePath: normalizedPath,
      normalizedStorageUrl: normalizedUrl,
      yodeckMetadata: yodeckMeta as any,
    };
  } catch (error: any) {
    console.error(`[Normalize] FAILED_BUT_CONTINUING reason=${error.message?.substring(0, 200)} asset=${assetId}`);
    await db.update(adAssets)
      .set({
        normalizationError: `Normalization failed: ${error.message}`,
      })
      .where(eq(adAssets.id, assetId));
    return { success: true, normalizedStoragePath: asset.storagePath, normalizedStorageUrl: asset.storageUrl || undefined, error: error.message };
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
    logMemory('normalize-end');
  }
}
