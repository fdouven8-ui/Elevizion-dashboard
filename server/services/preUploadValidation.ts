/**
 * Pre-Upload Validation Service
 * Validates files before sending to Yodeck to prevent failed uploads
 */

import { spawn } from "child_process";

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    fileSize: number;
    duration: number;
    codec: string;
    pixelFormat: string;
    width: number;
    height: number;
  };
}

const MIN_FILE_SIZE = 200 * 1024; // 200KB minimum
const ALLOWED_CODECS = ["h264", "hevc", "h265"];
const PREFERRED_PIXEL_FORMAT = "yuv420p";

/**
 * Run ffprobe on a file and extract metadata
 */
async function runFFprobe(filePath: string): Promise<{
  ok: boolean;
  data?: any;
  error?: string;
}> {
  return new Promise((resolve) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];

    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => stdout += data.toString());
    proc.stderr.on("data", (data) => stderr += data.toString());

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

    proc.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      resolve({ ok: false, error: "ffprobe timeout" });
    }, 30000);
  });
}

/**
 * Validate a video file before upload to Yodeck
 */
export async function validateVideoForUpload(filePath: string, fileSize: number): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: File size minimum
  if (fileSize < MIN_FILE_SIZE) {
    errors.push(`FILE_TOO_SMALL: ${fileSize} bytes is below minimum ${MIN_FILE_SIZE} bytes (200KB)`);
  }

  // Check 2: Run ffprobe for metadata
  const probeResult = await runFFprobe(filePath);
  
  if (!probeResult.ok) {
    errors.push(`FFPROBE_FAILED: ${probeResult.error}`);
    return { valid: false, errors, warnings };
  }

  const { data } = probeResult;
  
  // Extract video stream
  const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
  
  if (!videoStream) {
    errors.push("NO_VIDEO_STREAM: File does not contain a video track");
    return { valid: false, errors, warnings };
  }

  // Check 3: Duration
  const duration = parseFloat(data.format?.duration || videoStream.duration || "0");
  if (duration <= 0) {
    errors.push(`INVALID_DURATION: Video duration is ${duration} seconds`);
  } else if (duration < 1) {
    warnings.push(`SHORT_DURATION: Video is only ${duration.toFixed(2)} seconds`);
  }

  // Check 4: Codec
  const codec = videoStream.codec_name?.toLowerCase() || "";
  if (!ALLOWED_CODECS.includes(codec)) {
    warnings.push(`NON_STANDARD_CODEC: ${codec} (preferred: h264)`);
  }

  // Check 5: Pixel format
  const pixelFormat = videoStream.pix_fmt || "";
  if (pixelFormat !== PREFERRED_PIXEL_FORMAT) {
    warnings.push(`NON_STANDARD_PIXEL_FORMAT: ${pixelFormat} (preferred: yuv420p)`);
  }

  // Check 6: Resolution
  const width = videoStream.width || 0;
  const height = videoStream.height || 0;
  if (width < 640 || height < 360) {
    warnings.push(`LOW_RESOLUTION: ${width}x${height}`);
  }

  const metadata = {
    fileSize,
    duration,
    codec,
    pixelFormat,
    width,
    height,
  };

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata,
  };
}

/**
 * Quick validation check (no ffprobe, just file checks)
 */
export function quickValidate(fileSize: number, mimeType: string): {
  valid: boolean;
  error?: string;
} {
  if (fileSize < MIN_FILE_SIZE) {
    return { valid: false, error: `File too small: ${fileSize} bytes (min: ${MIN_FILE_SIZE})` };
  }

  const validMimeTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
  if (!validMimeTypes.includes(mimeType)) {
    return { valid: false, error: `Invalid mime type: ${mimeType}` };
  }

  return { valid: true };
}
