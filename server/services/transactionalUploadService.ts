import { db } from "../db";
import { uploadJobs, advertisers, UPLOAD_JOB_STATUS, UPLOAD_FINAL_STATE } from "@shared/schema";
import { eq } from "drizzle-orm";
import { Client } from "@replit/object-storage";
import { buildYodeckCreateMediaPayload, assertNoForbiddenKeys, logCreateMediaPayload } from "./yodeckPayloadBuilder";
import { getYodeckClient } from "./yodeckClient";

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN?.trim() || "";
const LOG_PREFIX = "[TransactionalUpload]";

const POLL_TIMEOUT_MS = 300000; // 5 minutes max polling (videos may take time to encode)
const POLL_INTERVALS_MS = [2000, 3000, 5000, 8000, 10000, 15000, 15000, 15000, 15000, 15000]; // Exponential backoff to 15s

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
    const { mediaId } = createResult;
    
    // EARLY SAVE: Store yodeckMediaId immediately after create to prevent duplicate media on retries
    console.log(`${LOG_PREFIX} [${correlationId}] CREATE_MEDIA SUCCESS: mediaId=${mediaId} - saving to advertiser early`);
    await db.update(advertisers)
      .set({
        yodeckMediaIdCanonical: mediaId,
        yodeckMediaIdCanonicalUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    // Step 2: GET /media/{id}/upload to retrieve presigned upload_url
    const uploadUrlResult = await step2GetUploadUrl(jobId, mediaId!, correlationId);
    if (!uploadUrlResult.ok) {
      return makeFailResult(jobId, advertiserId, uploadUrlResult.errorCode!, uploadUrlResult.errorDetails);
    }
    const presignedUrl = uploadUrlResult.presignedUrl!;

    const putResult = await step3PutBinary(jobId, presignedUrl, fileBuffer, correlationId);
    if (!putResult.ok) {
      return makeFailResult(jobId, advertiserId, putResult.errorCode!, putResult.errorDetails);
    }

    // STEP 4: PUT /media/{id}/upload/complete with { upload_url } (REQUIRED)
    const completeResult = await stepCompleteUpload(jobId, mediaId!, presignedUrl, correlationId);
    console.log(`${LOG_PREFIX} [${correlationId}] Complete result: ok=${completeResult.ok} endpoint=${completeResult.endpoint || "none"} status=${completeResult.status || 0} error=${completeResult.error || "none"}`);

    if (!completeResult.ok) {
      await markAdvertiserPublishFailed(advertiserId, "COMPLETE_UPLOAD_FAILED", completeResult.error || "unknown", correlationId);
      return makeFailResult(jobId, advertiserId, "COMPLETE_UPLOAD_FAILED", { error: completeResult.error, status: completeResult.status });
    }

    const verifyResult = await step5VerifyExistsImmediately(jobId, mediaId!, correlationId);
    if (!verifyResult.ok) {
      await markAdvertiserPublishFailed(advertiserId, verifyResult.errorCode!, JSON.stringify(verifyResult.errorDetails), correlationId);
      return makeFailResult(jobId, advertiserId, verifyResult.errorCode!, verifyResult.errorDetails);
    }

    const pollResult = await step6PollStatus(jobId, mediaId!, correlationId);
    if (!pollResult.ok) {
      await markAdvertiserPublishFailed(advertiserId, pollResult.errorCode!, JSON.stringify(pollResult.errorDetails), correlationId);
      return makeFailResult(jobId, advertiserId, pollResult.errorCode!, pollResult.errorDetails);
    }

    await patchClearUrlPlaybackFields(mediaId!, correlationId);

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
    await markAdvertiserPublishFailed(advertiserId, "UNEXPECTED_ERROR", error.message, correlationId);
    return makeFailResult(jobId, advertiserId, "UNEXPECTED_ERROR", { message: error.message });
  }
}

async function patchClearUrlPlaybackFields(mediaId: number, correlationId: string): Promise<void> {
  console.log(`${LOG_PREFIX} [${correlationId}] PATCH_STRIP_URLS_START mediaId=${mediaId}`);

  // Step 1: Try full patch (arguments + top-level fields)
  const fullPayload = {
    arguments: {
      play_from_url: null,
      download_from_url: null,
      buffering: false,
    },
    play_from_url: null,
    download_from_url: null,
    source_url: null,
    download_url: null,
  };

  try {
    const resp1 = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      method: "PATCH",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fullPayload),
    });
    if (resp1.ok) {
      console.log(`${LOG_PREFIX} [${correlationId}] PATCH_STRIP_URLS_FULL_OK mediaId=${mediaId}`);
    } else {
      // Yodeck may reject top-level fields with err_1003; fallback to arguments-only
      const errText = await resp1.text().catch(() => "");
      console.warn(`${LOG_PREFIX} [${correlationId}] PATCH_STRIP_URLS_FULL_REJECTED mediaId=${mediaId} http=${resp1.status} body=${errText.substring(0, 200)} - trying arguments-only fallback`);

      const argsOnlyPayload = {
        arguments: {
          play_from_url: null,
          download_from_url: null,
          buffering: false,
        },
      };
      const resp2 = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
        method: "PATCH",
        headers: {
          "Authorization": `Token ${YODECK_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(argsOnlyPayload),
      });
      if (resp2.ok) {
        console.log(`${LOG_PREFIX} [${correlationId}] PATCH_STRIP_URLS_ARGS_ONLY_OK mediaId=${mediaId}`);
      } else {
        const errText2 = await resp2.text().catch(() => "");
        console.warn(`${LOG_PREFIX} [${correlationId}] PATCH_STRIP_URLS_ARGS_ONLY_WARN mediaId=${mediaId} http=${resp2.status} body=${errText2.substring(0, 200)}`);
      }
    }
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} [${correlationId}] PATCH_STRIP_URLS_SOFT_FAIL mediaId=${mediaId} error=${err.message}`);
  }

  // Step 2: Verify URL fields are cleared
  try {
    await new Promise(r => setTimeout(r, 1000));
    const verifyResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });
    if (verifyResp.ok) {
      const data = await verifyResp.json();
      const args = data.arguments || {};
      const playUrl = args.play_from_url || data.play_from_url || null;
      const dlUrl = args.download_from_url || data.download_from_url || null;
      const SAFE_CDN = ["dsbackend.s3.amazonaws.com", "yodeck.com", "yodeck-"];
      const isSafe = (url: any) => !url || typeof url !== "string" || SAFE_CDN.some(p => url.includes(p));
      if (isSafe(playUrl) && isSafe(dlUrl)) {
        console.log(`${LOG_PREFIX} [${correlationId}] PATCH_VERIFY_OK mediaId=${mediaId} play_from_url=${playUrl ? "yodeck_cdn" : "null"} download_from_url=${dlUrl ? "yodeck_cdn" : "null"}`);
      } else {
        console.error(`${LOG_PREFIX} [${correlationId}] PATCH_VERIFY_WARN mediaId=${mediaId} EXTERNAL_URLS_REMAIN play_from_url=${typeof playUrl === "string" ? playUrl.substring(0, 80) : playUrl} download_from_url=${typeof dlUrl === "string" ? dlUrl.substring(0, 80) : dlUrl}`);
      }
    }
  } catch (err: any) {
    console.warn(`${LOG_PREFIX} [${correlationId}] PATCH_VERIFY_ERROR mediaId=${mediaId} error=${err.message}`);
  }
}

export { patchClearUrlPlaybackFields };

async function readFileFromStorage(path: string, correlationId: string): Promise<Buffer | null> {
  const { ObjectStorageService, R2_IS_CONFIGURED } = await import("../objectStorage");
  if (R2_IS_CONFIGURED) {
    try {
      const r2Service = new ObjectStorageService();
      const buffer = await r2Service.downloadFile(path);
      if (buffer && buffer.length > 0) {
        console.log(`${LOG_PREFIX} [${correlationId}] Read ${buffer.length} bytes from R2: ${path}`);
        return buffer;
      }
      console.warn(`${LOG_PREFIX} [${correlationId}] R2 download returned empty for: ${path}, trying Replit fallback`);
    } catch (err: any) {
      console.warn(`${LOG_PREFIX} [${correlationId}] R2 download failed for ${path}: ${err.message}, trying Replit fallback`);
    }
  }

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
      
      // Log missing_key if present in response (helps debug required fields)
      if (responseData?.missing_key) {
        console.error(`${LOG_PREFIX} [${correlationId}] YODECK API REPORTS MISSING KEY: "${responseData.missing_key}"`);
      }
      if (responseData?.error_code) {
        console.error(`${LOG_PREFIX} [${correlationId}] YODECK ERROR CODE: "${responseData.error_code}"`);
      }
      if (responseData?.detail) {
        console.error(`${LOG_PREFIX} [${correlationId}] YODECK DETAIL: "${responseData.detail}"`);
      }
      
      await markJobFailed(jobId, errorCode, responseData, `Create media failed: ${response.status}`);
      return { ok: false, errorCode, errorDetails: responseData };
    }

    const mediaId = responseData.id;

    if (!mediaId) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 1 FAILED: No mediaId in response`);
      await markJobFailed(jobId, "CREATE_NO_MEDIA_ID", responseData, "Create response missing id");
      return { ok: false, errorCode: "CREATE_NO_MEDIA_ID", errorDetails: responseData };
    }

    if (responseData.get_upload_url) {
      console.warn(`${LOG_PREFIX} [${correlationId}] IGNORING legacy get_upload_url from create response - using /media/{id}/upload instead`);
    }

    await updateJob(jobId, {
      yodeckMediaId: mediaId,
      finalState: UPLOAD_FINAL_STATE.CREATED,
    });

    console.log(`${LOG_PREFIX} [${correlationId}] STEP 1 SUCCESS: mediaId=${mediaId}`);
    return { ok: true, mediaId };

  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 1 ERROR:`, error);
    await markJobFailed(jobId, "CREATE_EXCEPTION", { message: error.message }, error.message);
    return { ok: false, errorCode: "CREATE_EXCEPTION", errorDetails: { message: error.message } };
  }
}

async function step2GetUploadUrl(
  jobId: string,
  mediaId: number,
  correlationId: string
): Promise<{ ok: boolean; presignedUrl?: string; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 2: GET /media/${mediaId}/upload`);

  try {
    const url = `${YODECK_API_BASE}/media/${mediaId}/upload`;
    const response = await fetch(url, {
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

    console.log(`${LOG_PREFIX} [${correlationId}] STEP 2 response: status=${response.status} contentType=${response.headers.get("content-type")} keys=${typeof responseData === "object" && responseData ? Object.keys(responseData).join(",") : "N/A"}`);

    if (!response.ok) {
      const errorCode = `GET_UPLOAD_URL_FAILED_${response.status}`;
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 2 FAILED: ${response.status} body=${JSON.stringify(responseData).substring(0, 500)}`);
      await markJobFailed(jobId, errorCode, responseData, `GET /media/{id}/upload failed: ${response.status}`);
      return { ok: false, errorCode, errorDetails: responseData };
    }

    const presignedUrl = responseData.upload_url;
    if (!presignedUrl) {
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 2 FAILED: No upload_url in response. Keys: ${Object.keys(responseData).join(", ")} Body: ${JSON.stringify(responseData).substring(0, 500)}`);
      await markJobFailed(jobId, "NO_UPLOAD_URL_IN_RESPONSE", responseData, "Response missing upload_url");
      return { ok: false, errorCode: "NO_UPLOAD_URL_IN_RESPONSE", errorDetails: responseData };
    }

    await updateJob(jobId, { uploadUrl: presignedUrl });

    let urlHost = "unknown";
    try { urlHost = new URL(presignedUrl).host; } catch {}
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 2 SUCCESS: upload_url host=${urlHost}`);
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

async function stepCompleteUpload(
  jobId: string,
  mediaId: number,
  uploadUrl: string,
  correlationId: string
): Promise<FinalizeResult> {
  const endpointPath = `/media/${mediaId}/upload/complete`;
  const fullUrl = `${YODECK_API_BASE}${endpointPath}`;
  const hasQuery = uploadUrl.includes("?");

  console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_CALL url=${endpointPath}`);
  console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_BODY hasQuery=${hasQuery}`);

  try {
    const response = await fetch(fullUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ upload_url: uploadUrl }),
    });

    const completeStatus = response.status;
    const contentType = response.headers.get("content-type") || "unknown";
    let respText = "";
    try { respText = await response.text(); } catch {}

    console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_STATUS=${completeStatus}`);
    console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_RESP_CT=${contentType}`);
    console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_RESP_BODY_SNIP=${respText.substring(0, 200)}`);

    await updateJob(jobId, {
      finalizeAttempted: true,
      finalizeStatus: completeStatus,
      finalizeUrlUsed: fullUrl,
    });

    if (completeStatus !== 200) {
      console.error(`${LOG_PREFIX} [${correlationId}] COMPLETE_UPLOAD FAILED: status=${completeStatus} ct=${contentType} body=${respText.substring(0, 500)}`);
      return { ok: false, error: `COMPLETE_FAILED_${completeStatus}`, status: completeStatus, endpoint: fullUrl };
    }

    console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_UPLOAD SUCCESS (200)`);

    // Immediately GET /media/{id} to check status after complete
    await new Promise(r => setTimeout(r, 1500));
    try {
      const checkResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });
      if (checkResp.ok) {
        const checkData = await checkResp.json();
        const mStatus = checkData.status || "unknown";
        const mFileSize = checkData.filesize || checkData.file_size || 0;
        const mLastUploaded = checkData.last_uploaded || checkData.updated_at || "unknown";
        console.log(`${LOG_PREFIX} [${correlationId}] AFTER_COMPLETE_MEDIA status=${mStatus} fileSize=${mFileSize} last_uploaded=${mLastUploaded}`);
      } else {
        console.warn(`${LOG_PREFIX} [${correlationId}] AFTER_COMPLETE_MEDIA check failed: ${checkResp.status}`);
      }
    } catch (err: any) {
      console.warn(`${LOG_PREFIX} [${correlationId}] AFTER_COMPLETE_MEDIA check error: ${err.message}`);
    }

    return { ok: true, endpoint: fullUrl, status: completeStatus };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] COMPLETE_UPLOAD ERROR: ${err.message}`);
    return { ok: false, error: err.message, status: 0 };
  }
}

async function step5VerifyExistsImmediately(
  jobId: string,
  mediaId: number,
  correlationId: string
): Promise<{ ok: boolean; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 5: VERIFY_EXISTS_IMMEDIATELY for mediaId=${mediaId}`);
  
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

async function step6PollStatus(
  jobId: string,
  mediaId: number,
  correlationId: string
): Promise<{ ok: boolean; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 6: POLL_STATUS for mediaId=${mediaId}`);
  
  await updateJob(jobId, { status: UPLOAD_JOB_STATUS.POLLING });

  const startTime = Date.now();
  let attempt = 0;

  const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed", "finished"];
  const IN_PROGRESS_STATUSES = ["processing", "encoding", "uploading", "initialized"];
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
        console.error(`${LOG_PREFIX} [${correlationId}] STEP 5 FAILED: Stuck on initialized after ${attempt} polls - clearing canonical ID for retry`);
        await markJobFailed(jobId, "FAILED_INIT_STUCK", { attempts: attempt, lastStatus: status }, "Media stuck on initialized status");
        return { ok: false, errorCode: "FAILED_INIT_STUCK", errorDetails: { attempts: attempt } };
      }

      if (READY_STATUSES.includes(status)) {
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
  console.log(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION: GET /media/${mediaId} (checking file presence + size)`);
  
  const MAX_FILE_POLLS = 15;
  const FILE_POLL_DELAY_MS = 2000;

  for (let poll = 1; poll <= MAX_FILE_POLLS; poll++) {
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

      const fileObj = data.file;
      const fileSize = fileObj?.size || fileObj?.file_size || data.filesize || data.file_size || 0;
      const filePresent = fileObj != null && fileSize > 0;
      const status = (data.status || "").toLowerCase();

      console.log(`${LOG_PREFIX} [${correlationId}] FINAL VERIFY poll=${poll}: status=${status} file=${fileObj != null ? "present" : "null"} fileSize=${fileSize} name=${data.name}`);

      if (filePresent) {
        console.log(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION PASSED: mediaId=${mediaId} filePresent=true size=${fileSize} name=${data.name}`);
        return { ok: true };
      }

      if (poll < MAX_FILE_POLLS) {
        console.log(`${LOG_PREFIX} [${correlationId}] FINAL VERIFY: file not ready yet, waiting ${FILE_POLL_DELAY_MS}ms (poll ${poll}/${MAX_FILE_POLLS})`);
        await new Promise(r => setTimeout(r, FILE_POLL_DELAY_MS));
      }
    } catch (error: any) {
      console.error(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION poll=${poll} ERROR: ${error.message}`);
      if (poll >= MAX_FILE_POLLS) {
        return { ok: false, errorCode: "FINAL_VERIFY_EXCEPTION", errorDetails: { message: error.message } };
      }
      await new Promise(r => setTimeout(r, FILE_POLL_DELAY_MS));
    }
  }

  console.error(`${LOG_PREFIX} [${correlationId}] FINAL VERIFICATION FAILED: file still null after ${MAX_FILE_POLLS} polls - UPLOAD_NOT_READY`);
  return { ok: false, errorCode: "UPLOAD_NOT_READY", errorDetails: { mediaId, polls: MAX_FILE_POLLS, message: "file is null or size=0 after polling" } };
}

async function updateAdvertiserSuccess(
  advertiserId: string,
  mediaId: number,
  correlationId: string
): Promise<void> {
  console.log(`${LOG_PREFIX} [${correlationId}] Updating advertiser ${advertiserId}: assetStatus=live, yodeckMediaIdCanonical=${mediaId}`);
  
  // Clear any previous failure metadata on successful publish
  await db.update(advertisers)
    .set({
      assetStatus: "live",
      yodeckMediaIdCanonical: mediaId,
      yodeckMediaIdCanonicalUpdatedAt: new Date(),
      publishErrorCode: null,
      publishErrorMessage: null,
      publishFailedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(advertisers.id, advertiserId));
}

/**
 * Mark advertiser as publish_failed.
 * For terminal failures (FAILED_INIT_STUCK, POLL_TIMEOUT, POLL_404), clear canonical ID
 * so next retry forces a fresh upload. For transient failures, keep canonical ID.
 */
async function markAdvertiserPublishFailed(
  advertiserId: string,
  errorCode: string,
  errorMessage: string,
  correlationId: string
): Promise<void> {
  console.log(`${LOG_PREFIX} [${correlationId}] Marking advertiser ${advertiserId} as publish_failed: ${errorCode}`);
  
  const current = await db.query.advertisers.findFirst({
    where: eq(advertisers.id, advertiserId),
    columns: { publishRetryCount: true },
  });
  
  // Terminal failures: media is unusable, clear canonical ID to force fresh upload on retry
  const TERMINAL_ERRORS = ["FAILED_INIT_STUCK", "POLL_TIMEOUT", "POLL_404", "VERIFY_404", "FINAL_VERIFY_404"];
  const shouldClearCanonical = TERMINAL_ERRORS.includes(errorCode);
  
  const updates: any = {
    assetStatus: shouldClearCanonical ? "ready_for_yodeck" : "publish_failed",
    publishErrorCode: errorCode,
    publishErrorMessage: errorMessage,
    publishFailedAt: new Date(),
    publishRetryCount: (current?.publishRetryCount || 0) + 1,
    updatedAt: new Date(),
  };
  
  if (shouldClearCanonical) {
    updates.yodeckMediaIdCanonical = null;
    console.warn(`${LOG_PREFIX} [${correlationId}] TERMINAL FAILURE ${errorCode}: Cleared yodeckMediaIdCanonical, set status=ready_for_yodeck for advertiser ${advertiserId}`);
  }
  
  await db.update(advertisers)
    .set(updates)
    .where(eq(advertisers.id, advertiserId));
}

/**
 * Clear publish failure state when retrying.
 * Called at start of retry to reset error fields.
 */
async function clearPublishFailure(
  advertiserId: string,
  correlationId: string
): Promise<void> {
  console.log(`${LOG_PREFIX} [${correlationId}] Clearing publish failure for advertiser ${advertiserId}`);
  
  await db.update(advertisers)
    .set({
      publishErrorCode: null,
      publishErrorMessage: null,
      publishFailedAt: null,
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
  const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed", "finished", "processing", "encoding", "live"];
  
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
      const fileSize = data.filesize || data.file_size || 0;
      
      console.log(`${LOG} Media ${existingMediaId} VERIFIED EXISTS in Yodeck (status=${status}, isReady=${isReady}, fileSize=${fileSize})`);
      
      // If media exists but is NOT ready and NOT encoding, it's stuck - clear it for retry
      const ENCODING_STATUSES = ["encoding", "processing", "uploading", "initialized"];
      if (!isReady && !ENCODING_STATUSES.includes(status)) {
        console.warn(`${LOG} Media ${existingMediaId} exists but status="${status}" is not ready/encoding - clearing canonical for retry`);
        await db.update(advertisers)
          .set({
            assetStatus: "ready_for_yodeck",
            yodeckMediaIdCanonical: null,
            updatedAt: new Date(),
          })
          .where(eq(advertisers.id, advertiserId));
        return { ok: false, mediaId: null, reason: `MEDIA_NOT_PLAYABLE_STATUS_${status}`, status, isReady: false };
      }
      
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
