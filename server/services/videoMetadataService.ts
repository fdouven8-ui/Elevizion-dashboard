import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export const DURATION_TOLERANCE_SECONDS = 0.5;
export const DEFAULT_VIDEO_DURATION_SECONDS = 15;

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
  minDurationSeconds: 9.5,
  maxDurationSeconds: 15.5,
  requiredWidth: 1920,
  requiredHeight: 1080,
  requiredAspectRatio: '16:9',
  maxFileSizeBytes: 100 * 1024 * 1024, // 100MB
  allowAudio: false,
};

export function getVideoSpecsForDuration(contractDuration: number): VideoSpecs {
  return {
    ...DEFAULT_VIDEO_SPECS,
    minDurationSeconds: contractDuration - DURATION_TOLERANCE_SECONDS,
    maxDurationSeconds: contractDuration + DURATION_TOLERANCE_SECONDS,
  };
}

export async function extractVideoMetadata(filePath: string): Promise<VideoMetadata | null> {
  try {
    const ffprobeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
    const { stdout } = await execAsync(ffprobeCommand, { timeout: 30000 });
    
    const probeData = JSON.parse(stdout);
    const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');
    const format = probeData.format;
    
    if (!videoStream || !format) {
      console.error('[VideoMetadata] No video stream found in file:', filePath);
      return null;
    }
    
    const width = videoStream.width || 0;
    const height = videoStream.height || 0;
    const duration = parseFloat(format.duration) || 0;
    const fileSize = parseInt(format.size) || 0;
    
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
    
    return {
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
  } catch (error) {
    console.error('[VideoMetadata] Error extracting metadata:', error);
    return null;
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
      `Minimaal ${specs.minDurationSeconds.toFixed(0)}s vereist.`
    );
  }
  
  if (metadata.durationSeconds > specs.maxDurationSeconds) {
    errors.push(
      `Video is te lang: ${metadata.durationSeconds.toFixed(1)}s. ` +
      `Maximaal ${specs.maxDurationSeconds.toFixed(0)}s toegestaan.`
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
  const metadata = await extractVideoMetadata(filePath);
  
  if (!metadata) {
    return {
      isValid: false,
      metadata: null,
      errors: ['Kan video metadata niet uitlezen. Controleer of het bestand een geldig videobestand is.'],
      warnings: [],
    };
  }
  
  return validateVideoMetadata(metadata, specs);
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
• Duur: exact ${contractDuration} seconden - VERPLICHT
• Resolutie: ${specs.requiredWidth}x${specs.requiredHeight} pixels (Full HD) - Aanbevolen
• Beeldverhouding: ${specs.requiredAspectRatio} liggend - Aanbevolen
• Maximale bestandsgrootte: ${specs.maxFileSizeBytes / (1024 * 1024)}MB
• Audio: wordt niet afgespeeld

Tip: Gebruik Adobe Premiere, DaVinci Resolve of een online converter om uw video om te zetten naar de juiste specificaties.
  `.trim();
}
