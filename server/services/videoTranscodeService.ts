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

export async function transcodeAndUpload(
  assetId: string,
  inputStoragePath: string
): Promise<ProcessAndUploadResult> {
  console.log('[TranscodeAndUpload] Starting for asset:', assetId);
  
  try {
    await db.update(adAssets)
      .set({ conversionError: null })
      .where(eq(adAssets.id, assetId));
    
    console.log('[TranscodeAndUpload] Downloading original file...');
    const tempInputPath = generateTempPath('elevizion-input');
    
    const fileBuffer = await objectStorage.downloadFile(inputStoragePath);
    if (!fileBuffer) {
      throw new Error('Could not download original file from storage');
    }
    
    fs.writeFileSync(tempInputPath, fileBuffer);
    console.log('[TranscodeAndUpload] Downloaded to:', tempInputPath, 'size:', fileBuffer.length);
    
    const transcodeResult = await transcodeVideo(tempInputPath);
    
    fs.unlinkSync(tempInputPath);
    
    if (!transcodeResult.success || !transcodeResult.outputPath || !transcodeResult.metadata) {
      throw new Error(transcodeResult.error || 'Transcode failed');
    }
    
    console.log('[TranscodeAndUpload] Uploading transcoded file...');
    
    const convertedBuffer = fs.readFileSync(transcodeResult.outputPath);
    const convertedFilename = `converted/${assetId}-converted.mp4`;
    
    const storageUrl = await objectStorage.uploadFile(
      convertedBuffer,
      convertedFilename,
      'video/mp4'
    );
    
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
