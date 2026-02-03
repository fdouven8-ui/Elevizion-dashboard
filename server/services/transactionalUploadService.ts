import { db } from "../db";
import { uploadJobs, advertisers, UPLOAD_JOB_STATUS, UPLOAD_FINAL_STATE } from "@shared/schema";
import { eq } from "drizzle-orm";
import { Client } from "@replit/object-storage";
import { buildYodeckCreateMediaPayload, assertNoForbiddenKeys, logCreateMediaPayload } from "./yodeckPayloadBuilder";

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN?.trim() || "";
const LOG_PREFIX = "[TransactionalUpload]";

const POLL_TIMEOUT_MS = 60000; // 60 seconds max polling
const POLL_INTERVALS_MS = [2000, 3000, 5000, 5000, 5000, 10000, 10000, 10000];

export interface TransactionalUploadResult {
  ok: boolean;
  jobId: string;
  advertiserId: string;
  yodeckMediaId: number | null;
  finalState: string;
  errorCode?: string;
  errorDetails?: any;
}

function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${timestamp}-${random}`;
}

async function updateJob(
  jobId: string,
  updates: Partial<typeof uploadJobs.$inferSelect>
): Promise<void> {
  await db.update(uploadJobs)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(uploadJobs.id, jobId));
}

async function markJobFailed(
  jobId: string,
  errorCode: string,
  errorDetails: any,
  lastError: string
): Promise<void> {
  await updateJob(jobId, {
    status: UPLOAD_JOB_STATUS.PERMANENT_FAIL,
    finalState: UPLOAD_FINAL_STATE.FAILED,
    errorCode,
    errorDetails,
    lastError,
    lastErrorAt: new Date(),
  });
}

export async function uploadVideoToYodeckTransactional(
  advertiserId: string,
  assetPath: string,
  desiredFilename: string,
  fileSize: number
): Promise<TransactionalUploadResult> {
  const correlationId = generateCorrelationId();
  console.log(`${LOG_PREFIX} [${correlationId}] Starting transactional upload for advertiser=${advertiserId}`);

  const [job] = await db.insert(uploadJobs)
    .values({
      advertiserId,
      localAssetPath: assetPath,
      localFileSize: fileSize,
      desiredFilename,
      correlationId,
      status: UPLOAD_JOB_STATUS.UPLOADING,
      finalState: null,
      attempt: 1,
      maxAttempts: 5,
      pollAttempts: 0,
    })
    .returning();

  const jobId = job.id;
  console.log(`${LOG_PREFIX} [${correlationId}] Created job=${jobId}`);

  try {
    const fileBuffer = await readFileFromStorage(assetPath, correlationId);
    if (!fileBuffer) {
      await markJobFailed(jobId, "FILE_READ_FAILED", { path: assetPath }, "Failed to read file from storage");
      return makeFailResult(jobId, advertiserId, "FILE_READ_FAILED", { path: assetPath });
    }

    console.log(`${LOG_PREFIX} [${correlationId}] File read: ${fileBuffer.length} bytes`);

    const createResult = await step1CreateMedia(jobId, desiredFilename, correlationId);
    if (!createResult.ok) {
      return makeFailResult(jobId, advertiserId, createResult.errorCode!, createResult.errorDetails);
    }
    const { mediaId, presignUrl: getUploadUrlEndpoint } = createResult;

    // Step 2: Get the actual presigned URL by calling get_upload_url endpoint
    const uploadUrlResult = await step2GetPresignedUploadUrl(jobId, getUploadUrlEndpoint!, correlationId);
    if (!uploadUrlResult.ok) {
      return makeFailResult(jobId, advertiserId, uploadUrlResult.errorCode!, uploadUrlResult.errorDetails);
    }
    const presignedUrl = uploadUrlResult.presignedUrl!;

    const putResult = await step3PutBinary(jobId, presignedUrl, fileBuffer, correlationId);
    if (!putResult.ok) {
      return makeFailResult(jobId, advertiserId, putResult.errorCode!, putResult.errorDetails);
    }

    const finalizeResult = await stepFinalizeUpload(jobId, mediaId!, correlationId);
    console.log(`${LOG_PREFIX} [${correlationId}] Finalize result: ok=${finalizeResult.ok} endpoint=${finalizeResult.endpoint || "none"} status=${finalizeResult.status} error=${finalizeResult.error || "none"}`);
    
    if (!finalizeResult.ok) {
      await clearAdvertiserCanonical(advertiserId, correlationId);
      return makeFailResult(jobId, advertiserId, "FINALIZE_ENDPOINT_MISSING", { error: finalizeResult.error });
    }

    const verifyResult = await step4VerifyExistsImmediately(jobId, mediaId!, correlationId);
    if (!verifyResult.ok) {
      await clearAdvertiserCanonical(advertiserId, correlationId);
      return makeFailResult(jobId, advertiserId, verifyResult.errorCode!, verifyResult.errorDetails);
    }

    const pollResult = await step5PollStatus(jobId, mediaId!, correlationId);
    if (!pollResult.ok) {
      await clearAdvertiserCanonical(advertiserId, correlationId);
      return makeFailResult(jobId, advertiserId, pollResult.errorCode!, pollResult.errorDetails);
    }

    await updateJob(jobId, {
      status: UPLOAD_JOB_STATUS.READY,
      finalState: UPLOAD_FINAL_STATE.READY,
      completedAt: new Date(),
    });

    await updateAdvertiserSuccess(advertiserId, mediaId!, correlationId);

    console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE: Job=${jobId} mediaId=${mediaId} finalState=READY`);
    
    return {
      ok: true,
      jobId,
      advertiserId,
      yodeckMediaId: mediaId!,
      finalState: UPLOAD_FINAL_STATE.READY,
    };

  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] Unexpected error:`, error);
    await markJobFailed(jobId, "UNEXPECTED_ERROR", { message: error.message }, error.message);
    await clearAdvertiserCanonical(advertiserId, correlationId);
    return makeFailResult(jobId, advertiserId, "UNEXPECTED_ERROR", { message: error.message });
  }
}

async function readFileFromStorage(path: string, correlationId: string): Promise<Buffer | null> {
  try {
    const client = new Client();
    const result = await client.downloadAsBytes(path);
    if (!result.ok) {
      console.error(`${LOG_PREFIX} [${correlationId}] Failed to read from storage: ${path}`);
      return null;
    }
    return Buffer.from(result.value as Uint8Array);
  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] Storage read error:`, error);
    return null;
  }
}

async function step1CreateMedia(
  jobId: string,
  name: string,
  correlationId: string
): Promise<{ ok: boolean; mediaId?: number; presignUrl?: string; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 1: CREATE_MEDIA`);
  
  const mediaName = name.endsWith(".mp4") ? name : `${name}.mp4`;
  
  // Use canonical payload builder - NEVER include media_origin/media_type
  const payload = buildYodeckCreateMediaPayload(mediaName);
  
  // Safety guard: fail fast if forbidden keys somehow sneak in
  assertNoForbiddenKeys(payload, "step1CreateMedia");
  logCreateMediaPayload(payload, correlationId);
  
  try {
    const response = await fetch(`${YODECK_API_BASE}/media/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawText: responseText.substring(0, 500) };
    }

    console.log(`${LOG_PREFIX} [${correlationId}] STEP 1 response: status=${response.status} body=${JSON.stringify(responseData).substring(0, 300)}`);

    await updateJob(jobId, {
      createResponse: responseData,
    });

    if (!response.ok) {
      const errorCode = `CREATE_FAILED_${response.status}`;
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 1 FAILED: ${response.status} - ${JSON.stringify(responseData)}`);
      await markJobFailed(jobId, errorCode, responseData, `Create media failed: ${response.status}`);
      return { ok: false, errorCode, errorDetails: responseData };
    }

    const mediaId = responseData.id;
    const presignUrl = responseData.get_upload_url || responseData.presign_url;

    if (!mediaId) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 1 FAILED: No mediaId in response`);
      await markJobFailed(jobId, "CREATE_NO_MEDIA_ID", responseData, "Create response missing id");
      return { ok: false, errorCode: "CREATE_NO_MEDIA_ID", errorDetails: responseData };
    }

    await updateJob(jobId, {
      yodeckMediaId: mediaId,
      finalState: UPLOAD_FINAL_STATE.CREATED,
    });

    console.log(`${LOG_PREFIX} [${correlationId}] STEP 1 SUCCESS: mediaId=${mediaId} presignUrl=${presignUrl ? "present" : "MISSING"}`);
    return { ok: true, mediaId, presignUrl };

  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 1 ERROR:`, error);
    await markJobFailed(jobId, "CREATE_EXCEPTION", { message: error.message }, error.message);
    return { ok: false, errorCode: "CREATE_EXCEPTION", errorDetails: { message: error.message } };
  }
}

// DEPRECATED: Fallback function removed - only use clean payload without media_origin/url_type

async function step2GetPresignedUploadUrl(
  jobId: string,
  getUploadUrlEndpoint: string,
  correlationId: string
): Promise<{ ok: boolean; presignedUrl?: string; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 2: GET_PRESIGNED_URL`);
  
  if (!getUploadUrlEndpoint) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 2 FAILED: No get_upload_url endpoint`);
    await markJobFailed(jobId, "NO_UPLOAD_URL_ENDPOINT", null, "No get_upload_url in create response");
    return { ok: false, errorCode: "NO_UPLOAD_URL_ENDPOINT" };
  }
  
  // Check if the endpoint already looks like a presigned S3 URL (direct upload case)
  if (getUploadUrlEndpoint.includes("s3.") || getUploadUrlEndpoint.includes("storage.googleapis.com") || getUploadUrlEndpoint.includes("X-Amz-")) {
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 2: Endpoint looks like direct presigned URL, using as-is`);
    await updateJob(jobId, { uploadUrl: getUploadUrlEndpoint });
    return { ok: true, presignedUrl: getUploadUrlEndpoint };
  }
  
  try {
    // If the endpoint is a relative URL, make it absolute
    let fullUrl = getUploadUrlEndpoint;
    if (getUploadUrlEndpoint.startsWith("/")) {
      fullUrl = `https://app.yodeck.com${getUploadUrlEndpoint}`;
    } else if (!getUploadUrlEndpoint.startsWith("http")) {
      fullUrl = `${YODECK_API_BASE}/${getUploadUrlEndpoint}`;
    }
    
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 2: Fetching presigned URL from: ${fullUrl}`);
    
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Accept": "application/json",
      },
    });
    
    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawText: responseText.substring(0, 500) };
    }
    
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 2 response: status=${response.status} keys=${Object.keys(responseData).join(",")}`);
    
    if (!response.ok) {
      const errorCode = `GET_UPLOAD_URL_FAILED_${response.status}`;
      await markJobFailed(jobId, errorCode, responseData, `Get upload URL failed: ${response.status}`);
      return { ok: false, errorCode, errorDetails: responseData };
    }
    
    // The response should contain upload_url (the actual S3 presigned URL)
    const presignedUrl = responseData.upload_url || responseData.presign_url || responseData.url;
    
    if (!presignedUrl) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 2 FAILED: No presigned URL in response. Keys: ${Object.keys(responseData).join(", ")}`);
      await markJobFailed(jobId, "NO_PRESIGNED_URL_IN_RESPONSE", responseData, "Response missing upload_url");
      return { ok: false, errorCode: "NO_PRESIGNED_URL_IN_RESPONSE", errorDetails: responseData };
    }
    
    // Validate the presigned URL looks like an S3/storage URL
    if (!presignedUrl.startsWith("http")) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 2 FAILED: Invalid presigned URL format`);
      await markJobFailed(jobId, "INVALID_PRESIGNED_URL", { url: presignedUrl.substring(0, 100) }, "Presigned URL invalid format");
      return { ok: false, errorCode: "INVALID_PRESIGNED_URL" };
    }
    
    await updateJob(jobId, { uploadUrl: presignedUrl });
    
    // Log presigned URL host (masked)
    const urlHost = new URL(presignedUrl).host;
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 2 SUCCESS: Presigned URL host=${urlHost}`);
    return { ok: true, presignedUrl };
    
  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 2 ERROR:`, error);
    await markJobFailed(jobId, "GET_UPLOAD_URL_EXCEPTION", { message: error.message }, error.message);
    return { ok: false, errorCode: "GET_UPLOAD_URL_EXCEPTION", errorDetails: { message: error.message } };
  }
}

async function step3PutBinary(
  jobId: string,
  presignUrl: string,
  fileBuffer: Buffer,
  correlationId: string
): Promise<{ ok: boolean; errorCode?: string; errorDetails?: any }> {
  const fileSize = fileBuffer.length;
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 3: PUT_BINARY (${fileSize} bytes)`);
  
  // Validate file size
  if (fileSize === 0) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 3 FAILED: File is empty (0 bytes)`);
    await markJobFailed(jobId, "PUT_EMPTY_FILE", { fileSize: 0 }, "File is empty");
    return { ok: false, errorCode: "PUT_EMPTY_FILE", errorDetails: { fileSize: 0 } };
  }
  
  // Log presigned URL host for debugging (masked)
  let urlHost = "unknown";
  try {
    urlHost = new URL(presignUrl).host;
  } catch {}
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 3: PUT to host=${urlHost} size=${fileSize}`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(presignUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": fileSize.toString(),
      },
      body: fileBuffer,
    });

    const putStatus = response.status;
    const putEtag = response.headers.get("etag") || null;
    const putContentLength = response.headers.get("content-length");
    const putDurationMs = Date.now() - startTime;
    
    // Log response headers for diagnostics
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    let responseBody = "";
    try {
      responseBody = await response.text();
    } catch {}
    
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 3 response: status=${putStatus} etag=${putEtag} duration=${putDurationMs}ms body=${responseBody.substring(0, 200)}`);

    await updateJob(jobId, {
      putStatus,
      putEtag,
    });

    if (putStatus !== 200 && putStatus !== 204) {
      const errorCode = `PUT_FAILED_${putStatus}`;
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 3 FAILED: status=${putStatus} body=${responseBody.substring(0, 500)}`);
      await markJobFailed(jobId, errorCode, { 
        status: putStatus, 
        host: urlHost,
        fileSize,
        durationMs: putDurationMs,
        responseBody: responseBody.substring(0, 500),
        headers: responseHeaders,
      }, `PUT failed with status ${putStatus}`);
      return { ok: false, errorCode, errorDetails: { status: putStatus, responseBody: responseBody.substring(0, 200) } };
    }

    await updateJob(jobId, { finalState: UPLOAD_FINAL_STATE.UPLOADED });
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 3 SUCCESS: status=${putStatus} etag=${putEtag} duration=${putDurationMs}ms fileSize=${fileSize}`);
    return { ok: true };

  } catch (error: any) {
    const putDurationMs = Date.now() - startTime;
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 3 ERROR:`, error);
    await markJobFailed(jobId, "PUT_EXCEPTION", { 
      message: error.message, 
      host: urlHost,
      fileSize,
      durationMs: putDurationMs,
    }, error.message);
    return { ok: false, errorCode: "PUT_EXCEPTION", errorDetails: { message: error.message } };
  }
}

interface FinalizeResult {
  ok: boolean;
  endpoint?: string;
  status?: number;
  error?: string;
}

async function stepFinalizeUpload(
  jobId: string,
  mediaId: number,
  correlationId: string
): Promise<FinalizeResult> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 3.5: FINALIZE_UPLOAD for mediaId=${mediaId}`);
  
  const finalizeEndpoints = [
    `${YODECK_API_BASE}/media/${mediaId}/upload/complete`,
    `${YODECK_API_BASE}/media/${mediaId}/upload/complete/`,
    `${YODECK_API_BASE}/media/${mediaId}/upload/confirm`,
    `${YODECK_API_BASE}/media/${mediaId}/upload/confirm/`,
    `${YODECK_API_BASE}/media/${mediaId}/upload/done`,
    `${YODECK_API_BASE}/media/${mediaId}/upload/done/`,
  ];
  
  let lastStatus = 0;
  let successEndpoint: string | null = null;
  
  for (const endpoint of finalizeEndpoints) {
    try {
      console.log(`${LOG_PREFIX} [${correlationId}] FINALIZE trying: ${endpoint}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Token ${YODECK_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      
      lastStatus = response.status;
      console.log(`${LOG_PREFIX} [${correlationId}] FINALIZE ${endpoint} -> ${response.status}`);
      
      if (response.ok) {
        successEndpoint = endpoint;
        console.log(`${LOG_PREFIX} [${correlationId}] FINALIZE SUCCESS: ${endpoint} -> ${response.status}`);
        break;
      }
      
      if (response.status !== 404 && response.status !== 405) {
        console.log(`${LOG_PREFIX} [${correlationId}] FINALIZE unexpected status ${response.status}, continuing...`);
      }
    } catch (err: any) {
      console.log(`${LOG_PREFIX} [${correlationId}] FINALIZE endpoint error: ${err.message}`);
    }
  }
  
  await updateJob(jobId, {
    finalizeAttempted: true,
    finalizeStatus: lastStatus,
    finalizeUrlUsed: successEndpoint,
  });
  
  if (successEndpoint) {
    return { ok: true, endpoint: successEndpoint, status: lastStatus };
  }
  
  // No finalize endpoint succeeded - this is OK, Yodeck may auto-finalize after PUT
  // We'll continue to verify/poll and let that determine success/failure
  console.warn(`${LOG_PREFIX} [${correlationId}] FINALIZE: No endpoint succeeded (lastStatus=${lastStatus}). Continuing - Yodeck may auto-finalize.`);
  return { ok: true, error: "NO_FINALIZE_ENDPOINT", status: lastStatus };
}

async function step4VerifyExistsImmediately(
  jobId: string,
  mediaId: number,
  correlationId: string
): Promise<{ ok: boolean; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 4: VERIFY_EXISTS_IMMEDIATELY for mediaId=${mediaId}`);
  
  await new Promise(r => setTimeout(r, 1000));

  try {
    const response = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });

    let responseData: any;
    try {
      responseData = await response.json();
    } catch {
      responseData = { status: response.status };
    }

    await updateJob(jobId, {
      confirmResponse: responseData,
      pollAttempts: 1,
    });

    if (response.status === 404) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 4 FAILED: 404 - Media does NOT exist in Yodeck`);
      await markJobFailed(jobId, "VERIFY_404", responseData, "Media not found in Yodeck after upload");
      return { ok: false, errorCode: "VERIFY_404", errorDetails: responseData };
    }

    if (!response.ok) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 4 FAILED: status=${response.status}`);
      await markJobFailed(jobId, `VERIFY_ERROR_${response.status}`, responseData, `Verify failed: ${response.status}`);
      return { ok: false, errorCode: `VERIFY_ERROR_${response.status}`, errorDetails: responseData };
    }

    if (!responseData.id) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 4 FAILED: Response missing id field`);
      await markJobFailed(jobId, "VERIFY_INVALID_RESPONSE", responseData, "Verify response missing id");
      return { ok: false, errorCode: "VERIFY_INVALID_RESPONSE", errorDetails: responseData };
    }

    await updateJob(jobId, { finalState: UPLOAD_FINAL_STATE.VERIFIED_EXISTS });
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 4 SUCCESS: Media exists in Yodeck`);
    return { ok: true };

  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 4 ERROR:`, error);
    await markJobFailed(jobId, "VERIFY_EXCEPTION", { message: error.message }, error.message);
    return { ok: false, errorCode: "VERIFY_EXCEPTION", errorDetails: { message: error.message } };
  }
}

async function step5PollStatus(
  jobId: string,
  mediaId: number,
  correlationId: string
): Promise<{ ok: boolean; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 5: POLL_STATUS for mediaId=${mediaId}`);
  
  await updateJob(jobId, { status: UPLOAD_JOB_STATUS.POLLING });

  const startTime = Date.now();
  let attempt = 0;

  const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed"];
  const FAILED_STATUSES = ["failed", "error", "aborted", "rejected"];

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const delay = POLL_INTERVALS_MS[Math.min(attempt, POLL_INTERVALS_MS.length - 1)];
    await new Promise(r => setTimeout(r, delay));
    attempt++;

    try {
      const response = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });

      await updateJob(jobId, { pollAttempts: attempt + 1 });

      if (response.status === 404) {
        console.error(`${LOG_PREFIX} [${correlationId}] STEP 5 FAILED: 404 during poll`);
        await markJobFailed(jobId, "POLL_404", null, "Media disappeared during polling");
        return { ok: false, errorCode: "POLL_404", errorDetails: null };
      }

      if (!response.ok) {
        console.log(`${LOG_PREFIX} [${correlationId}] Poll ${attempt}: non-ok status ${response.status}`);
        continue;
      }

      const data = await response.json();
      const status = (data.status || "").toLowerCase();
      const fileSize = data.filesize || data.file_size || 0;
      const lastUploaded = data.last_uploaded || data.lastUploaded || null;
      const thumbnailUrl = data.thumbnail_url || data.thumbnailUrl || null;
      const duration = data.duration || null;

      console.log(`${LOG_PREFIX} [${correlationId}] Poll ${attempt}: status=${status} fileSize=${fileSize} lastUploaded=${lastUploaded} thumbnail=${thumbnailUrl ? "present" : "none"} duration=${duration}`);

      await updateJob(jobId, {
        yodeckStatus: status,
        yodeckFileSize: fileSize,
      });

      if (status === "initialized" && attempt > 20) {
        console.error(`${LOG_PREFIX} [${correlationId}] STEP 5 FAILED: Stuck on initialized after ${attempt} polls`);
        await markJobFailed(jobId, "FAILED_INIT_STUCK", { attempts: attempt, lastStatus: status }, "Media stuck on initialized status");
        return { ok: false, errorCode: "FAILED_INIT_STUCK", errorDetails: { attempts: attempt } };
      }

      if (READY_STATUSES.includes(status) && fileSize > 0) {
        const finalVerify = await finalVerification(mediaId, correlationId);
        if (!finalVerify.ok) {
          await markJobFailed(jobId, finalVerify.errorCode!, finalVerify.errorDetails, "Final verification failed");
          return { ok: false, errorCode: finalVerify.errorCode, errorDetails: finalVerify.errorDetails };
        }
        
        console.log(`${LOG_PREFIX} [${correlationId}] STEP 5 SUCCESS: Media is READY`);
        return { ok: true };
      }

      if (FAILED_STATUSES.includes(status)) {
        console.error(`${LOG_PREFIX} [${correlationId}] STEP 5 FAILED: status=${status}`);
        await markJobFailed(jobId, `YODECK_STATUS_${status.toUpperCase()}`, data, `Yodeck status: ${status}`);
        return { ok: false, errorCode: `YODECK_STATUS_${status.toUpperCase()}`, errorDetails: data };
      }

      if (status.includes("encoding") || status.includes("processing")) {
        await updateJob(jobId, { finalState: UPLOAD_FINAL_STATE.ENCODING });
      }

    } catch (error: any) {
      console.error(`${LOG_PREFIX} [${correlationId}] Poll ${attempt} error:`, error);
    }
  }

  console.error(`${LOG_PREFIX} [${correlationId}] STEP 5 FAILED: Timeout after ${attempt} polls`);
  await markJobFailed(jobId, "POLL_TIMEOUT", { attempts: attempt }, "Timeout waiting for media to become ready");
  return { ok: false, errorCode: "POLL_TIMEOUT", errorDetails: { attempts: attempt } };
}

async function finalVerification(
  mediaId: number,
  correlationId: string
): Promise<{ ok: boolean; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION: GET /media/${mediaId}`);
  
  try {
    const response = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });

    if (response.status === 404) {
      console.error(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION FAILED: 404`);
      return { ok: false, errorCode: "FINAL_VERIFY_404", errorDetails: { status: 404 } };
    }

    if (!response.ok) {
      console.error(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION FAILED: ${response.status}`);
      return { ok: false, errorCode: `FINAL_VERIFY_${response.status}`, errorDetails: { status: response.status } };
    }

    const data = await response.json();
    if (!data.id) {
      console.error(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION FAILED: missing id`);
      return { ok: false, errorCode: "FINAL_VERIFY_INVALID", errorDetails: data };
    }

    console.log(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION PASSED`);
    return { ok: true };

  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION ERROR:`, error);
    return { ok: false, errorCode: "FINAL_VERIFY_EXCEPTION", errorDetails: { message: error.message } };
  }
}

async function updateAdvertiserSuccess(
  advertiserId: string,
  mediaId: number,
  correlationId: string
): Promise<void> {
  console.log(`${LOG_PREFIX} [${correlationId}] Updating advertiser ${advertiserId}: assetStatus=live, yodeckMediaIdCanonical=${mediaId}`);
  
  await db.update(advertisers)
    .set({
      assetStatus: "live",
      yodeckMediaIdCanonical: mediaId,
      yodeckMediaIdCanonicalUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(advertisers.id, advertiserId));
}

async function clearAdvertiserCanonical(
  advertiserId: string,
  correlationId: string
): Promise<void> {
  console.log(`${LOG_PREFIX} [${correlationId}] Clearing advertiser ${advertiserId}: assetStatus=ready_for_yodeck, yodeckMediaIdCanonical=NULL`);
  
  await db.update(advertisers)
    .set({
      assetStatus: "ready_for_yodeck",
      yodeckMediaIdCanonical: null,
      updatedAt: new Date(),
    })
    .where(eq(advertisers.id, advertiserId));
}

function makeFailResult(
  jobId: string,
  advertiserId: string,
  errorCode: string,
  errorDetails: any
): TransactionalUploadResult {
  return {
    ok: false,
    jobId,
    advertiserId,
    yodeckMediaId: null,
    finalState: UPLOAD_FINAL_STATE.FAILED,
    errorCode,
    errorDetails,
  };
}

export async function ensureAdvertiserMediaIsValid(
  advertiserId: string
): Promise<{ ok: boolean; mediaId: number | null; reason?: string; status?: string; isReady?: boolean }> {
  const LOG = "[EnsureMediaValid]";
  const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed"];
  
  const advertiser = await db.query.advertisers.findFirst({
    where: eq(advertisers.id, advertiserId),
  });

  if (!advertiser) {
    return { ok: false, mediaId: null, reason: "ADVERTISER_NOT_FOUND" };
  }

  const existingMediaId = advertiser.yodeckMediaIdCanonical;

  if (existingMediaId) {
    console.log(`${LOG} Checking if mediaId=${existingMediaId} exists in Yodeck...`);
    
    try {
      const response = await fetch(`${YODECK_API_BASE}/media/${existingMediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });

      if (response.status === 404) {
        console.log(`${LOG} Media ${existingMediaId} NOT FOUND in Yodeck - clearing canonical`);
        await db.update(advertisers)
          .set({
            assetStatus: "ready_for_yodeck",
            yodeckMediaIdCanonical: null,
            updatedAt: new Date(),
          })
          .where(eq(advertisers.id, advertiserId));
        return { ok: false, mediaId: null, reason: "MEDIA_MISSING_IN_YODECK" };
      }

      if (!response.ok) {
        console.warn(`${LOG} Media ${existingMediaId} check returned ${response.status}`);
        return { ok: false, mediaId: null, reason: `MEDIA_CHECK_ERROR_${response.status}` };
      }

      const data = await response.json();
      if (!data.id) {
        console.warn(`${LOG} Media ${existingMediaId} response missing id field`);
        return { ok: false, mediaId: null, reason: "MEDIA_INVALID_RESPONSE" };
      }

      const status = (data.status || "").toLowerCase();
      const isReady = READY_STATUSES.includes(status);
      
      console.log(`${LOG} Media ${existingMediaId} VERIFIED EXISTS in Yodeck (status=${status}, isReady=${isReady})`);
      return { ok: true, mediaId: existingMediaId, status, isReady };

    } catch (error: any) {
      console.error(`${LOG} Error checking media:`, error);
      return { ok: false, mediaId: null, reason: "MEDIA_CHECK_EXCEPTION" };
    }
  }

  return { ok: false, mediaId: null, reason: "NO_CANONICAL_MEDIA_ID" };
}

export async function getRecentUploadJobs(
  advertiserId?: string,
  limit: number = 20
): Promise<typeof uploadJobs.$inferSelect[]> {
  if (advertiserId) {
    return await db.query.uploadJobs.findMany({
      where: eq(uploadJobs.advertiserId, advertiserId),
      orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
      limit,
    });
  }
  
  return await db.query.uploadJobs.findMany({
    orderBy: (jobs, { desc }) => [desc(jobs.createdAt)],
    limit,
  });
}

export async function checkMediaExistsInYodeck(
  mediaId: number
): Promise<{ ok: boolean; exists: boolean; httpStatus: number; responseSnippet: string }> {
  try {
    const response = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });

    const text = await response.text();
    const snippet = text.substring(0, 300);

    return {
      ok: true,
      exists: response.ok,
      httpStatus: response.status,
      responseSnippet: snippet,
    };
  } catch (error: any) {
    return {
      ok: false,
      exists: false,
      httpStatus: 0,
      responseSnippet: error.message,
    };
  }
}
