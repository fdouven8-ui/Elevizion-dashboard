import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

export const DEFAULT_VIDEO_DURATION_SECONDS = 15;
export const MAX_VIDEO_DURATION_SECONDS = 15; // Strict max 15 seconds

// Global state for binary availability (checked at startup)
let ffprobeAvailable = false;
let ffmpegAvailable = false;
let startupCheckDone = false;

/**
 * Check and log availability of ffprobe and ffmpeg binaries.
 * Called at server startup.
 */
export async function checkVideoProcessingDependencies(): Promise<{
  ffprobe: boolean;
  ffmpeg: boolean;
}> {
  try {
    await execAsync('ffprobe -version', { timeout: 10000 });
    ffprobeAvailable = true;
    console.log('[VideoProcessing] ffprobe: AVAILABLE');
  } catch {
    ffprobeAvailable = false;
    console.error('[VideoProcessing] ffprobe: NOT AVAILABLE - video uploads will fail');
  }
  
  try {
    await execAsync('ffmpeg -version', { timeout: 10000 });
    ffmpegAvailable = true;
    console.log('[VideoProcessing] ffmpeg: AVAILABLE');
  } catch {
    ffmpegAvailable = false;
    console.warn('[VideoProcessing] ffmpeg: NOT AVAILABLE - remux fallback disabled');
  }
  
  startupCheckDone = true;
  return { ffprobe: ffprobeAvailable, ffmpeg: ffmpegAvailable };
}

/**
 * Check if video processing is currently available.
 */
export function isVideoProcessingAvailable(): boolean {
  return ffprobeAvailable;
}

/**
 * Generate a unique temp file path for video processing.
 */
export function generateTempPath(prefix = 'elevizion-upload'): string {
  const uuid = crypto.randomUUID();
  return `/tmp/${prefix}-${uuid}.mp4`;
}

/**
 * Verify a temp file exists and has content.
 * Returns file size if valid, throws if not.
 */
export async function verifyTempFile(filePath: string): Promise<number> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Temp file does not exist: ${filePath}`);
  }
  
  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    throw new Error(`Temp file is empty: ${filePath}`);
  }
  
  return stats.size;
}

/**
 * Try to remux a video file with ffmpeg to fix moov atom issues.
 * Returns the path to the fixed file, or null if remux failed.
 */
export async function remuxWithFfmpeg(inputPath: string): Promise<string | null> {
  if (!ffmpegAvailable) {
    console.log('[VideoProcessing] ffmpeg not available, skipping remux');
    return null;
  }
  
  const outputPath = generateTempPath('elevizion-remux');
  
  try {
    console.log('[VideoProcessing] Attempting ffmpeg remux:', inputPath, '->', outputPath);
    
    // Fast remux with faststart for web compatibility
    const cmd = `ffmpeg -y -i "${inputPath}" -c copy -movflags +faststart "${outputPath}"`;
    await execAsync(cmd, { timeout: 60000 });
    
    // Verify output file
    const size = await verifyTempFile(outputPath);
    console.log('[VideoProcessing] Remux successful, output size:', size);
    
    return outputPath;
  } catch (error: any) {
    console.error('[VideoProcessing] Remux failed:', error.message);
    // Clean up failed output
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch {}
    return null;
  }
}

/**
 * Clean up temp files after processing is complete.
 */
export function cleanupTempFiles(...paths: (string | null | undefined)[]) {
  for (const filePath of paths) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('[VideoProcessing] Cleaned up temp file:', filePath);
      } catch (error: any) {
        console.warn('[VideoProcessing] Failed to clean up temp file:', filePath, error.message);
      }
    }
  }
}

export interface VideoMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: string;
  codec: string;
  hasAudio: boolean;
  fileSize: number;
  mimeType: string;
  framerate?: number;
}

export interface VideoValidationResult {
  isValid: boolean;
  metadata: VideoMetadata | null;
  errors: string[];
  warnings: string[];
}

export interface VideoSpecs {
  allowedMimeTypes: string[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  requiredWidth: number;
  requiredHeight: number;
  requiredAspectRatio: string;
  maxFileSizeBytes: number;
  allowAudio: boolean;
}

export const DEFAULT_VIDEO_SPECS: VideoSpecs = {
  allowedMimeTypes: ['video/mp4'],
  minDurationSeconds: 0.5, // Minimum half second to ensure valid video
  maxDurationSeconds: MAX_VIDEO_DURATION_SECONDS, // Max 15 seconds (with epsilon)
  requiredWidth: 1920,
  requiredHeight: 1080,
  requiredAspectRatio: '16:9',
  maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
  allowAudio: false,
};

export function getVideoSpecsForDuration(contractDuration: number): VideoSpecs {
  // Duration validation: max is contractDuration (default 15s), shorter videos are allowed
  // No epsilon above max - strict enforcement of max duration
  return {
    ...DEFAULT_VIDEO_SPECS,
    minDurationSeconds: 0.5, // Minimum half second
    maxDurationSeconds: contractDuration, // Strict max, no tolerance above
  };
}

export interface ExtractResult {
  metadata: VideoMetadata | null;
  error?: string;
  ffprobeStderr?: string;
}

export async function extractVideoMetadata(filePath: string): Promise<VideoMetadata | null> {
  const result = await extractVideoMetadataWithDetails(filePath);
  return result.metadata;
}

export async function extractVideoMetadataWithDetails(filePath: string, allowRemux = true): Promise<ExtractResult> {
  try {
    // Verify file exists and has content
    if (!fs.existsSync(filePath)) {
      console.error('[VideoMetadata] File does not exist:', filePath);
      return { metadata: null, error: 'File does not exist' };
    }
    
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error('[VideoMetadata] File is empty:', filePath);
      return { metadata: null, error: 'File is empty' };
    }
    
    console.log('[VideoMetadata] Probing file:', filePath, 'size:', stats.size);
    
    // Use cached startup check if available, otherwise check now
    if (!ffprobeAvailable && startupCheckDone) {
      console.error('[VideoMetadata] ffprobe not available (startup check failed)');
      return { metadata: null, error: 'ffprobe not available' };
    }
    
    // Fallback check if startup check hasn't run yet
    if (!startupCheckDone) {
      try {
        await execAsync('which ffprobe', { timeout: 5000 });
      } catch {
        console.error('[VideoMetadata] ffprobe binary not found in PATH');
        return { metadata: null, error: 'ffprobe not available' };
      }
    }
    
    const ffprobeCommand = `ffprobe -v error -print_format json -show_format -show_streams "${filePath}"`;
    
    let stdout: string;
    let stderr: string = '';
    
    try {
      const result = await execAsync(ffprobeCommand, { timeout: 30000 });
      stdout = result.stdout;
      stderr = result.stderr || '';
    } catch (execError: any) {
      // Capture stderr for debugging
      stderr = execError.stderr || '';
      console.error('[VideoMetadata] ffprobe failed:', {
        filePath,
        fileSize: stats.size,
        exitCode: execError.code,
        stderr: stderr.substring(0, 500),
      });
      
      // Try remux fallback if allowed (might fix moov atom issues)
      if (allowRemux) {
        console.log('[VideoMetadata] Attempting remux fallback...');
        const remuxedPath = await remuxWithFfmpeg(filePath);
        if (remuxedPath) {
          // Recursively try to extract from remuxed file (but don't allow another remux)
          const remuxResult = await extractVideoMetadataWithDetails(remuxedPath, false);
          // Clean up remuxed file
          cleanupTempFiles(remuxedPath);
          if (remuxResult.metadata) {
            console.log('[VideoMetadata] Remux fallback successful');
            return remuxResult;
          }
        }
      }
      
      return { 
        metadata: null, 
        error: 'ffprobe execution failed',
        ffprobeStderr: stderr.substring(0, 500),
      };
    }
    
    if (!stdout || stdout.trim() === '') {
      console.error('[VideoMetadata] ffprobe returned empty output:', filePath);
      return { metadata: null, error: 'ffprobe returned empty output', ffprobeStderr: stderr };
    }
    
    let probeData: any;
    try {
      probeData = JSON.parse(stdout);
    } catch (parseError) {
      console.error('[VideoMetadata] Failed to parse ffprobe JSON:', stdout.substring(0, 200));
      return { metadata: null, error: 'Failed to parse ffprobe output' };
    }
    
    const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
    const format = probeData.format;
    
    if (!videoStream || !format) {
      console.error('[VideoMetadata] No video stream found in file:', filePath);
      return { metadata: null, error: 'No video stream found in file' };
    }
    
    const width = videoStream.width || 0;
    const height = videoStream.height || 0;
    const duration = parseFloat(format.duration) || 0;
    const fileSize = parseInt(format.size) || stats.size;
    
    let framerate: number | undefined;
    if (videoStream.avg_frame_rate) {
      const [num, denom] = videoStream.avg_frame_rate.split('/');
      if (num && denom && parseInt(denom) !== 0) {
        framerate = parseInt(num) / parseInt(denom);
      }
    }
    
    const aspectRatio = calculateAspectRatio(width, height);
    
    const mimeTypeLookup: Record<string, string> = {
      'h264': 'video/mp4',
      'hevc': 'video/mp4',
      'h265': 'video/mp4',
      'vp8': 'video/webm',
      'vp9': 'video/webm',
      'av1': 'video/mp4',
    };
    
    const metadata: VideoMetadata = {
      durationSeconds: duration,
      width,
      height,
      aspectRatio,
      codec: videoStream.codec_name || 'unknown',
      hasAudio: !!audioStream,
      fileSize,
      mimeType: mimeTypeLookup[videoStream.codec_name?.toLowerCase()] || 'video/mp4',
      framerate,
    };
    
    console.log('[VideoMetadata] Extracted metadata:', {
      duration: metadata.durationSeconds,
      resolution: `${metadata.width}x${metadata.height}`,
      codec: metadata.codec,
    });
    
    return { metadata };
  } catch (error: any) {
    console.error('[VideoMetadata] Unexpected error extracting metadata:', error);
    return { metadata: null, error: error.message || 'Unknown error' };
  }
}

function calculateAspectRatio(width: number, height: number): string {
  if (width === 0 || height === 0) return 'unknown';
  
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const divisor = gcd(width, height);
  const ratioW = width / divisor;
  const ratioH = height / divisor;
  
  const ratio = width / height;
  if (Math.abs(ratio - 16 / 9) < 0.01) return '16:9';
  if (Math.abs(ratio - 4 / 3) < 0.01) return '4:3';
  if (Math.abs(ratio - 9 / 16) < 0.01) return '9:16';
  if (Math.abs(ratio - 1) < 0.01) return '1:1';
  
  return `${ratioW}:${ratioH}`;
}

export function validateVideoMetadata(
  metadata: VideoMetadata,
  specs: VideoSpecs,
  options: { strictResolution?: boolean } = {}
): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { strictResolution = false } = options;
  
  if (!specs.allowedMimeTypes.includes(metadata.mimeType)) {
    errors.push(`Ongeldig bestandstype: ${metadata.mimeType}. Vereist: ${specs.allowedMimeTypes.join(', ')}`);
  }
  
  if (metadata.durationSeconds < specs.minDurationSeconds) {
    errors.push(
      `Video is te kort: ${metadata.durationSeconds.toFixed(1)}s. ` +
      `Minimaal 0.5 seconde vereist.`
    );
  }
  
  if (metadata.durationSeconds > specs.maxDurationSeconds) {
    // Show exact detected duration and the allowed max (without the epsilon)
    const displayMax = Math.floor(specs.maxDurationSeconds);
    errors.push(
      `Video is te lang: je video is ${metadata.durationSeconds.toFixed(1)} seconden. ` +
      `Maximaal ${displayMax} seconden toegestaan.`
    );
  }
  
  const isPortrait = metadata.height > metadata.width;
  const ratio = metadata.width / metadata.height;
  const is16by9 = Math.abs(ratio - 16 / 9) < 0.05;
  const isLowRes = metadata.width < specs.requiredWidth || metadata.height < specs.requiredHeight;
  
  if (isPortrait) {
    const msg = 'Video is staand (portrait). Aanbevolen: liggend 16:9 formaat.';
    if (strictResolution) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  } else if (!is16by9) {
    const msg = `Aspectverhouding ${metadata.aspectRatio} wijkt af. Aanbevolen: 16:9.`;
    if (strictResolution) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  if (isLowRes && !isPortrait) {
    const msg = `Resolutie ${metadata.width}x${metadata.height} is lager dan aanbevolen (1920x1080).`;
    if (strictResolution) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }
  
  if (metadata.fileSize > specs.maxFileSizeBytes) {
    errors.push(
      `Bestand te groot: ${(metadata.fileSize / (1024 * 1024)).toFixed(1)}MB. ` +
      `Maximaal ${specs.maxFileSizeBytes / (1024 * 1024)}MB toegestaan.`
    );
  }
  
  if (!specs.allowAudio && metadata.hasAudio) {
    warnings.push('Video bevat audio. Audio wordt niet afgespeeld op de schermen.');
  }
  
  const preferredCodecs = ['h264', 'hevc', 'h265'];
  if (!preferredCodecs.includes(metadata.codec.toLowerCase())) {
    warnings.push(`Codec ${metadata.codec} is niet optimaal. H.264 wordt aanbevolen.`);
  }
  
  return {
    isValid: errors.length === 0,
    metadata,
    errors,
    warnings,
  };
}

export async function validateVideoFile(
  filePath: string,
  specs: VideoSpecs = DEFAULT_VIDEO_SPECS
): Promise<VideoValidationResult> {
  const result = await extractVideoMetadataWithDetails(filePath);
  
  if (!result.metadata) {
    // Provide more specific error messages based on the failure type
    let errorMessage = 'We konden je video niet uitlezen. ';
    
    if (result.error === 'File does not exist') {
      errorMessage += 'Het bestand kon niet worden gevonden. Probeer opnieuw te uploaden.';
    } else if (result.error === 'File is empty') {
      errorMessage += 'Het bestand is leeg. Controleer je video en probeer opnieuw.';
    } else if (result.error === 'No video stream found in file') {
      errorMessage += 'Geen video-stream gevonden. Zorg dat het een geldig MP4-bestand (H.264) is.';
    } else if (result.error === 'ffprobe not available') {
      errorMessage += 'Er is een technisch probleem met de videoverwerking. Neem contact op met support.';
      console.error('[VideoValidation] ffprobe not available - system configuration issue');
    } else if (result.ffprobeStderr) {
      errorMessage += 'Probeer het bestand opnieuw te exporteren als MP4 (H.264 codec).';
      console.error('[VideoValidation] ffprobe stderr:', result.ffprobeStderr);
    } else {
      errorMessage += 'Probeer opnieuw of exporteer als MP4 (H.264 codec).';
    }
    
    return {
      isValid: false,
      metadata: null,
      errors: [errorMessage],
      warnings: [],
    };
  }
  
  return validateVideoMetadata(result.metadata, specs);
}

export async function isFFprobeAvailable(): Promise<boolean> {
  try {
    await execAsync('ffprobe -version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export function formatVideoSpecsForDisplay(specs: VideoSpecs, contractDuration: number): string {
  return `
Videospecificaties voor uw advertentie:

• Bestandsformaat: MP4 (H.264 codec) - VERPLICHT
• Duur: maximaal ${contractDuration} seconden (korter mag ook) - VERPLICHT
• Resolutie: ${specs.requiredWidth}x${specs.requiredHeight} pixels (Full HD) - Aanbevolen
• Beeldverhouding: ${specs.requiredAspectRatio} liggend - Aanbevolen
• Maximale bestandsgrootte: ${specs.maxFileSizeBytes / (1024 * 1024)}MB
• Audio: wordt niet afgespeeld

Tip: Gebruik Adobe Premiere, DaVinci Resolve of een online converter om uw video om te zetten naar de juiste specificaties.
  `.trim();
}
