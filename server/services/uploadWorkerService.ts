/**
 * Upload Worker Service
 * DEPRECATED: Legacy upload path - now routes through transactional upload service
 * 
 * HARD RULE: All new uploads MUST use uploadVideoToYodeckTransactional()
 * This service is kept for compatibility with existing upload jobs only.
 */

import { storage } from "../storage";
import type { UploadJob } from "@shared/schema";
import { UPLOAD_JOB_STATUS } from "@shared/schema";
import { checkMediaReadiness } from "./adTargetingService";
import { buildYodeckCreateMediaPayload, assertNoForbiddenKeys, logCreateMediaPayload } from "./yodeckPayloadBuilder";

const LEGACY_UPLOAD_DISABLED = process.env.LEGACY_UPLOAD_DISABLED === "true";

function assertLegacyUploadAllowed(context: string): void {
  if (LEGACY_UPLOAD_DISABLED) {
    throw new Error(`LEGACY_UPLOAD_PATH_DISABLED_USE_TRANSACTIONAL: ${context}. Set LEGACY_UPLOAD_DISABLED=false to re-enable.`);
  }
  console.warn(`[UploadWorker] DEPRECATED: Legacy upload path used (${context}). Migrate to transactionalUploadService.`);
}

const YODECK_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN;

const RETRY_DELAYS_MS = [
  1 * 60 * 1000,    // 1 minute
  5 * 60 * 1000,    // 5 minutes
  15 * 60 * 1000,   // 15 minutes
  60 * 60 * 1000,   // 1 hour
  6 * 60 * 60 * 1000, // 6 hours
];

const POLL_INTERVALS_MS = [2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000];
const POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

interface YodeckMediaCreateResponse {
  id: number;
  name: string;
  presign_url?: string;
  status?: string;
}

interface YodeckMediaStatus {
  id: number;
  name: string;
  status: string;
  filesize?: number;
  file_size?: number;
  duration?: number | string;
}

/**
 * Create Yodeck media and get presigned URL
 */
async function createYodeckMedia(name: string, mimeType: string = "video/mp4"): Promise<{
  ok: boolean;
  mediaId?: number;
  presignUrl?: string;
  error?: string;
}> {
  if (!YODECK_TOKEN) {
    return { ok: false, error: "YODECK_AUTH_TOKEN not configured" };
  }

  try {
    console.log(`[UploadWorker] Creating Yodeck media: ${name}`);
    
    // Use canonical payload builder - NEVER include forbidden fields
    const payload = buildYodeckCreateMediaPayload(name);
    assertNoForbiddenKeys(payload, "uploadWorker.createYodeckMedia");
    logCreateMediaPayload(payload);
    
    const resp = await fetch(`${YODECK_BASE}/media/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[UploadWorker] Create failed: ${resp.status} ${text}`);
      return { ok: false, error: `Create failed: ${resp.status}` };
    }

    const data: YodeckMediaCreateResponse = await resp.json();
    console.log(`[UploadWorker] Created media ID=${data.id}, presign_url=${data.presign_url ? "present" : "missing"}`);
    
    return {
      ok: true,
      mediaId: data.id,
      presignUrl: data.presign_url,
    };
  } catch (error: any) {
    console.error(`[UploadWorker] Create error:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Upload binary to presigned URL
 */
async function uploadToPresignedUrl(
  presignUrl: string,
  fileBuffer: Buffer,
  mimeType: string = "video/mp4"
): Promise<{ ok: boolean; etag?: string; error?: string }> {
  try {
    const urlHost = new URL(presignUrl).host;
    console.log(`[UploadWorker] Uploading ${fileBuffer.length} bytes to ${urlHost}`);

    const resp = await fetch(presignUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileBuffer.length.toString(),
      },
      body: fileBuffer,
    });

    const etag = resp.headers.get("etag") || undefined;
    console.log(`[UploadWorker] PUT response: ${resp.status}, ETag=${etag}`);

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[UploadWorker] Upload failed: ${resp.status} ${text}`);
      return { ok: false, error: `Upload failed: ${resp.status}` };
    }

    return { ok: true, etag };
  } catch (error: any) {
    console.error(`[UploadWorker] Upload error:`, error);
    return { ok: false, error: error.message };
  }
}

/**
 * Poll Yodeck media status until ready or timeout
 */
async function pollMediaStatus(mediaId: number): Promise<{
  ok: boolean;
  status?: string;
  fileSize?: number;
  duration?: number;
  error?: string;
}> {
  console.log(`[UploadWorker] Polling media ${mediaId} status...`);
  
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const delay = POLL_INTERVALS_MS[Math.min(attempt, POLL_INTERVALS_MS.length - 1)];
    await new Promise(resolve => setTimeout(resolve, delay));
    attempt++;

    try {
      const readiness = await checkMediaReadiness(mediaId);
      console.log(`[UploadWorker] Poll ${attempt}: status=${readiness.status}, fileSize=${readiness.fileSize}, usable=${readiness.usable}`);

      if (readiness.usable) {
        // FINAL VERIFICATION: Confirm media exists via GET /media/:id
        console.log(`[UploadWorker] FINAL VERIFICATION: GET /media/${mediaId} to confirm existence...`);
        const token = process.env.YODECK_AUTH_TOKEN?.trim() || "";
        const verifyResponse = await fetch(`https://app.yodeck.com/api/v2/media/${mediaId}/`, {
          headers: { Authorization: `Token ${token}` },
        });
        
        if (verifyResponse.status === 404) {
          console.error(`[UploadWorker] FINAL VERIFICATION FAILED: Media ${mediaId} returns 404 - upload was NOT real`);
          return {
            ok: false,
            status: "FINAL_VERIFY_404",
            error: `CRITICAL: Final verification failed. GET /media/${mediaId} returned 404. The upload was NOT successful.`,
          };
        }
        
        if (!verifyResponse.ok) {
          console.error(`[UploadWorker] FINAL VERIFICATION FAILED: Unexpected status ${verifyResponse.status}`);
          return {
            ok: false,
            status: `FINAL_VERIFY_ERROR_${verifyResponse.status}`,
            error: `Final verification failed with status ${verifyResponse.status}`,
          };
        }
        
        // Validate response body has required fields (not just HTTP 200)
        let verifyData: any;
        try {
          verifyData = await verifyResponse.json();
        } catch {
          console.error(`[UploadWorker] FINAL VERIFICATION FAILED: Invalid JSON response`);
          return {
            ok: false,
            status: "FINAL_VERIFY_INVALID_JSON",
            error: `Final verification failed: response is not valid JSON`,
          };
        }
        
        if (!verifyData.id) {
          console.error(`[UploadWorker] FINAL VERIFICATION FAILED: Response missing 'id' field`);
          return {
            ok: false,
            status: "FINAL_VERIFY_INVALID",
            error: `Final verification failed: response missing 'id' field`,
          };
        }
        
        console.log(`[UploadWorker] FINAL VERIFICATION PASSED: Media ${mediaId} confirmed in Yodeck (status=${verifyData.status})`);
        
        return {
          ok: true,
          status: readiness.status || "ready",
          fileSize: readiness.fileSize,
          duration: readiness.duration,
        };
      }

      // Check for permanent failure states
      if (readiness.reason.includes("FAILED") || readiness.reason.includes("ERROR")) {
        return {
          ok: false,
          status: readiness.status,
          fileSize: readiness.fileSize,
          error: readiness.reason,
        };
      }

      // Still processing, continue polling
      if (readiness.reason.includes("PROCESSING") || readiness.reason.includes("ENCODING")) {
        console.log(`[UploadWorker] Media still processing, continuing poll...`);
        continue;
      }

      // Check if stuck at initialized with no file
      if (readiness.fileSize === 0 && attempt >= 5) {
        console.log(`[UploadWorker] Media stuck at fileSize=0 after ${attempt} polls`);
        return {
          ok: false,
          status: readiness.status,
          fileSize: 0,
          error: "UPLOAD_STUCK: fileSize remains 0",
        };
      }

    } catch (error: any) {
      console.error(`[UploadWorker] Poll error:`, error);
    }
  }

  return { ok: false, error: "POLL_TIMEOUT: Media not ready within 2 minutes" };
}

/**
 * Calculate next retry time based on attempt number
 */
function getNextRetryTime(attempt: number): Date {
  const delayMs = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delayMs);
}

/**
 * Process a single upload job
 * DEPRECATED: Use transactionalUploadService.uploadVideoToYodeckTransactional() for new uploads
 */
export async function processUploadJob(job: UploadJob): Promise<{
  success: boolean;
  yodeckMediaId?: number;
  error?: string;
}> {
  assertLegacyUploadAllowed("processUploadJob");
  
  const attempt = job.attempt + 1;
  console.log(`[UploadWorker] Processing job ${job.id} (attempt ${attempt}/${job.maxAttempts})`);

  // Update status to UPLOADING
  await storage.updateUploadJob(job.id, {
    status: UPLOAD_JOB_STATUS.UPLOADING,
    attempt,
  });

  try {
    // Step 0: Pre-upload validation
    const { quickValidate } = await import("./preUploadValidation");
    const validation = quickValidate(job.localFileSize, "video/mp4");
    if (!validation.valid) {
      console.error(`[UploadWorker] Pre-upload validation failed: ${validation.error}`);
      // Mark as permanent fail - file is invalid, no point retrying
      await storage.updateUploadJob(job.id, {
        status: UPLOAD_JOB_STATUS.PERMANENT_FAIL,
        lastError: `PRE_VALIDATION_FAILED: ${validation.error}`,
        lastErrorAt: new Date(),
      });
      return { success: false, error: `Pre-validation failed: ${validation.error}` };
    }

    // Step 1: Get file from storage
    const { Client } = await import("@replit/object-storage");
    const client = new Client();
    
    const fileResult = await client.downloadAsBytes(job.localAssetPath);
    if (!fileResult.ok) {
      throw new Error(`Failed to read file from storage: ${job.localAssetPath}`);
    }
    
    const fileBuffer = Buffer.from(fileResult.value);
    console.log(`[UploadWorker] Read ${fileBuffer.length} bytes from ${job.localAssetPath}`);

    // Verify actual file size matches expected
    if (fileBuffer.length !== job.localFileSize) {
      console.warn(`[UploadWorker] File size mismatch: expected=${job.localFileSize}, actual=${fileBuffer.length}`);
    }
    
    // Additional validation: check actual file size
    if (fileBuffer.length < 200 * 1024) {
      throw new Error(`File too small: ${fileBuffer.length} bytes (min 200KB)`);
    }

    // Step 2: Create Yodeck media and get presigned URL
    const createResult = await createYodeckMedia(job.yodeckMediaName || `Upload-${job.id}`);
    if (!createResult.ok) {
      throw new Error(createResult.error || "Failed to create Yodeck media");
    }

    if (!createResult.presignUrl) {
      throw new Error("Yodeck did not return presigned URL");
    }

    const yodeckMediaId = createResult.mediaId!;
    
    // Update job with Yodeck media ID
    await storage.updateUploadJob(job.id, {
      yodeckMediaId,
      status: UPLOAD_JOB_STATUS.UPLOADING,
    });

    // Step 3: Upload binary to presigned URL
    const uploadResult = await uploadToPresignedUrl(createResult.presignUrl, fileBuffer);
    if (!uploadResult.ok) {
      throw new Error(uploadResult.error || "Failed to upload to presigned URL");
    }

    // Step 4: Poll for verification
    await storage.updateUploadJob(job.id, { status: UPLOAD_JOB_STATUS.POLLING });
    
    const pollResult = await pollMediaStatus(yodeckMediaId);
    
    if (pollResult.ok) {
      // Success! Mark as READY
      await storage.updateUploadJob(job.id, {
        status: UPLOAD_JOB_STATUS.READY,
        yodeckFileSize: pollResult.fileSize,
        yodeckDuration: pollResult.duration?.toString(),
        yodeckStatus: pollResult.status,
        completedAt: new Date(),
      });

      // Update advertiser canonical media
      const advertiser = await storage.getAdvertiser(job.advertiserId);
      if (advertiser) {
        await storage.updateAdvertiser(job.advertiserId, {
          yodeckMediaIdCanonical: yodeckMediaId,
          yodeckMediaIdCanonicalUpdatedAt: new Date(),
          assetStatus: "live",
        } as any);
        console.log(`[UploadWorker] Updated advertiser ${job.advertiserId} canonical media to ${yodeckMediaId}`);
      }

      console.log(`[UploadWorker] Job ${job.id} completed successfully: mediaId=${yodeckMediaId}`);
      return { success: true, yodeckMediaId };
    } else {
      throw new Error(pollResult.error || "Media verification failed");
    }

  } catch (error: any) {
    console.error(`[UploadWorker] Job ${job.id} failed:`, error.message);

    // DATABASE STATE MUST NEVER LIE - clear advertiser canonical ID on failure
    const advertiser = await storage.getAdvertiser(job.advertiserId);
    if (advertiser) {
      await storage.updateAdvertiser(job.advertiserId, {
        assetStatus: "upload_failed",
        yodeckMediaIdCanonical: null,  // Clear to prevent stale/false ID
      } as any);
      console.log(`[UploadWorker] Cleared advertiser ${job.advertiserId} assetStatus/yodeckMediaIdCanonical due to failure`);
    }

    // Check if we should retry
    if (attempt >= job.maxAttempts) {
      // Permanent failure
      await storage.updateUploadJob(job.id, {
        status: UPLOAD_JOB_STATUS.PERMANENT_FAIL,
        lastError: error.message,
        lastErrorAt: new Date(),
      });
      console.log(`[UploadWorker] Job ${job.id} marked as PERMANENT_FAIL after ${attempt} attempts`);
      return { success: false, error: `Permanent failure: ${error.message}` };
    } else {
      // Schedule retry
      const nextRetry = getNextRetryTime(attempt);
      await storage.updateUploadJob(job.id, {
        status: UPLOAD_JOB_STATUS.RETRYABLE_FAIL,
        lastError: error.message,
        lastErrorAt: new Date(),
        nextRetryAt: nextRetry,
      });
      console.log(`[UploadWorker] Job ${job.id} scheduled for retry at ${nextRetry.toISOString()}`);
      return { success: false, error: error.message };
    }
  }
}

/**
 * Run the upload worker - process all pending jobs
 */
export async function runUploadWorker(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
}> {
  console.log("[UploadWorker] Starting worker run...");

  const jobs = await storage.getUploadJobsForProcessing();
  console.log(`[UploadWorker] Found ${jobs.length} jobs to process`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let retrying = 0;

  for (const job of jobs) {
    const result = await processUploadJob(job);
    processed++;

    if (result.success) {
      succeeded++;
    } else {
      const updatedJob = await storage.getUploadJob(job.id);
      if (updatedJob?.status === UPLOAD_JOB_STATUS.PERMANENT_FAIL) {
        failed++;
      } else {
        retrying++;
      }
    }
  }

  console.log(`[UploadWorker] Complete: processed=${processed} succeeded=${succeeded} failed=${failed} retrying=${retrying}`);
  return { processed, succeeded, failed, retrying };
}

/**
 * Enqueue a new upload job
 */
export async function enqueueUploadJob(params: {
  advertiserId: string;
  adAssetId?: string;
  localAssetPath: string;
  localFileSize: number;
  localDurationSeconds?: number;
  yodeckMediaName: string;
}): Promise<UploadJob> {
  console.log(`[UploadWorker] Enqueueing job for advertiser ${params.advertiserId}: ${params.yodeckMediaName}`);

  const job = await storage.createUploadJob({
    advertiserId: params.advertiserId,
    adAssetId: params.adAssetId || null,
    localAssetPath: params.localAssetPath,
    localFileSize: params.localFileSize,
    localDurationSeconds: params.localDurationSeconds?.toString(),
    yodeckMediaName: params.yodeckMediaName,
    status: UPLOAD_JOB_STATUS.QUEUED,
    attempt: 0,
    maxAttempts: 5,
  });

  console.log(`[UploadWorker] Created job ${job.id}`);
  return job;
}

/**
 * Get upload job status for an advertiser
 */
export async function getAdvertiserUploadStatus(advertiserId: string): Promise<{
  jobs: UploadJob[];
  latestStatus: string | null;
  hasReadyMedia: boolean;
  canonicalMediaId: number | null;
}> {
  const jobs = await storage.getUploadJobByAdvertiser(advertiserId);
  const advertiser = await storage.getAdvertiser(advertiserId);

  const latestJob = jobs[0];
  
  return {
    jobs,
    latestStatus: latestJob?.status || null,
    hasReadyMedia: jobs.some(j => j.status === UPLOAD_JOB_STATUS.READY),
    canonicalMediaId: (advertiser as any)?.yodeckMediaIdCanonical || null,
  };
}
