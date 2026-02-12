import { db } from "../db";
import { uploadJobs, advertisers, adAssets, UPLOAD_JOB_STATUS, UPLOAD_FINAL_STATE } from "@shared/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { Client } from "@replit/object-storage";
import { buildYodeckCreateMediaPayload, buildYodeckUrlMediaPayload, assertNoForbiddenKeys, logCreateMediaPayload } from "./yodeckPayloadBuilder";
import { getYodeckClient } from "./yodeckClient";
import { getR2PresignedUrl } from "../objectStorage";

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN?.trim() || "";
const LOG_PREFIX = "[TransactionalUpload]";

const POLL_TIMEOUT_MS = 300000; // 5 minutes max polling (videos may take time to encode)
const POLL_INTERVALS_MS = [2000, 3000, 5000, 8000, 10000, 15000, 15000, 15000, 15000, 15000]; // Exponential backoff to 15s

const STALE_JOB_MS = 30 * 60 * 1000;

async function findExistingUploadJob(
  advertiserId: string,
  assetPath: string
): Promise<TransactionalUploadResult | null> {
  const recentJobs = await db.select().from(uploadJobs)
    .where(
      and(
        eq(uploadJobs.advertiserId, advertiserId),
        eq(uploadJobs.localAssetPath, assetPath),
        or(
          eq(uploadJobs.status, UPLOAD_JOB_STATUS.READY),
          eq(uploadJobs.status, UPLOAD_JOB_STATUS.UPLOADING),
          eq(uploadJobs.status, UPLOAD_JOB_STATUS.POLLING)
        )
      )
    )
    .orderBy(desc(uploadJobs.createdAt))
    .limit(5);

  for (const job of recentJobs) {
    if (job.status === UPLOAD_JOB_STATUS.READY && job.yodeckMediaId) {
      const mediaCheck = await fetch(`${YODECK_API_BASE}/media/${job.yodeckMediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });
      if (mediaCheck.ok) {
        const data = await mediaCheck.json();
        const status = (data.status || "").toLowerCase();
        const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed", "finished"];
        if (READY_STATUSES.includes(status)) {
          console.log(`${LOG_PREFIX} IDEMPOTENCY_HIT: Reusing completed job=${job.id} mediaId=${job.yodeckMediaId} (status=${status})`);
          return {
            ok: true,
            jobId: job.id,
            advertiserId,
            yodeckMediaId: job.yodeckMediaId,
            finalState: UPLOAD_FINAL_STATE.READY,
          };
        }
      }
    }

    if ((job.status === UPLOAD_JOB_STATUS.UPLOADING || job.status === UPLOAD_JOB_STATUS.POLLING) && job.yodeckMediaId) {
      const jobAge = Date.now() - (job.createdAt?.getTime() || 0);
      if (jobAge < STALE_JOB_MS) {
        console.log(`${LOG_PREFIX} IDEMPOTENCY_SKIP: Upload already in progress job=${job.id} mediaId=${job.yodeckMediaId} age=${Math.round(jobAge/1000)}s`);
        return {
          ok: false,
          jobId: job.id,
          advertiserId,
          yodeckMediaId: job.yodeckMediaId,
          finalState: "IN_PROGRESS",
          errorCode: "UPLOAD_ALREADY_IN_PROGRESS",
          errorDetails: { existingJobId: job.id, mediaId: job.yodeckMediaId, ageMs: jobAge },
        };
      } else {
        console.warn(`${LOG_PREFIX} IDEMPOTENCY_STALE: Ignoring stale in-progress job=${job.id} age=${Math.round(jobAge/1000)}s - allowing new upload`);
        await updateJob(job.id, { status: UPLOAD_JOB_STATUS.PERMANENT_FAIL, finalState: UPLOAD_FINAL_STATE.FAILED, lastError: "Marked stale by idempotency guard" });
      }
    }
  }

  return null;
}

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
  const [advCheck] = await db.select({ canonical: advertisers.yodeckMediaIdCanonical }).from(advertisers).where(eq(advertisers.id, advertiserId));
  if (advCheck?.canonical) {
    const msg = `UPLOAD_BLOCKED_CANONICAL_MEDIA_PRESENT: advertiser ${advertiserId} already has canonical mediaId=${advCheck.canonical} - upload refused`;
    console.error(`${LOG_PREFIX} ${msg}`);
    throw new Error(msg);
  }

  const existingResult = await findExistingUploadJob(advertiserId, assetPath);
  if (existingResult) {
    return existingResult;
  }

  const usePresigned = process.env.YODECK_UPLOAD_MODE === "presigned";
  if (!usePresigned) {
    console.log(`[TransactionalUpload] Using URL-based upload via CDN proxy (set YODECK_UPLOAD_MODE=presigned for S3 PUT)`);
    return uploadVideoToYodeckViaUrl(advertiserId, assetPath, desiredFilename, fileSize);
  }
  console.log(`[TransactionalUpload] Using presigned S3 PUT upload`);

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

    console.log("[AdBytesSource]", {
      mediaId: "pending",
      name: desiredFilename,
      source: assetPath.startsWith("http") ? "http" : "r2",
      bytesLen: fileBuffer.length,
    });

    const createResult = await step1CreateMedia(jobId, desiredFilename, correlationId);
    if (!createResult.ok) {
      console.error(`[YodeckUploadFailed] mediaId=none advertiserId=${advertiserId} reason=${createResult.errorCode}`);
      return makeFailResult(jobId, advertiserId, createResult.errorCode!, createResult.errorDetails);
    }
    const { mediaId, getUploadUrlEndpoint } = createResult;
    console.log(`[YodeckUploadStart] mediaId=${mediaId} name=${desiredFilename} advertiserId=${advertiserId}`);
    
    // EARLY SAVE: Store yodeckMediaId immediately after create to prevent duplicate media on retries
    console.log(`${LOG_PREFIX} [${correlationId}] CREATE_MEDIA SUCCESS: mediaId=${mediaId} - saving to advertiser early`);
    await db.update(advertisers)
      .set({
        yodeckMediaIdCanonical: mediaId,
        yodeckMediaIdCanonicalUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    // Step 2: GET upload URL (use get_upload_url from create response if available)
    const uploadUrlResult = await step2GetUploadUrl(jobId, mediaId!, correlationId, getUploadUrlEndpoint);
    if (!uploadUrlResult.ok) {
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} step=GET_UPLOAD_URL reason=${uploadUrlResult.errorCode}`);
      return makeFailResult(jobId, advertiserId, uploadUrlResult.errorCode!, uploadUrlResult.errorDetails);
    }
    const presignedUrl = uploadUrlResult.presignedUrl!;

    const buf = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer);
    const head = buf.subarray(0, Math.min(128, buf.length)).toString("latin1");
    const hasFtyp = head.includes("ftyp");

    console.log("[YodeckUploadStart]", {
      mediaId,
      name: desiredFilename,
      bytesLen: buf.length,
      headHex: buf.subarray(0, 32).toString("hex"),
      hasFtyp,
    });

    if (buf.length < 1024 || !hasFtyp) {
      console.error("[YodeckUploadFailed]", {
        mediaId,
        name: desiredFilename,
        reason: "INVALID_MP4_BYTES",
        bytesLen: buf.length,
        headPreview: head.slice(0, 200),
      });
      const err: any = new Error("INVALID_MP4_BYTES: buffer is not a valid MP4 (ftyp missing or too small)");
      err.code = "INVALID_MP4_BYTES";
      err.mediaId = mediaId;
      await markJobFailed(jobId, "INVALID_MP4_BYTES", { bytesLen: buf.length, hasFtyp, headHex: buf.subarray(0, 32).toString("hex") }, "Buffer is not a valid MP4");
      return makeFailResult(jobId, advertiserId, "INVALID_MP4_BYTES", { bytesLen: buf.length, hasFtyp });
    }

    console.log(`[YodeckUploadBytes] mediaId=${mediaId} bytesLength=${fileBuffer.length}`);
    const putResult = await step3PutBinary(jobId, presignedUrl, fileBuffer, correlationId);
    if (!putResult.ok) {
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} step=PUT_BINARY statusCode=${putResult.errorCode} responseSnippet=${JSON.stringify(putResult.errorDetails).substring(0, 200)}`);
      return makeFailResult(jobId, advertiserId, putResult.errorCode!, putResult.errorDetails);
    }
    console.log(`[YodeckUploadPutDone] mediaId=${mediaId} bytesUploaded=${fileBuffer.length}`);

    // Step 4: PUT /media/{id}/upload/complete with { upload_url } (REQUIRED)
    // Re-fetch upload_url to ensure we use the EXACT string Yodeck expects
    let uploadUrlForComplete = presignedUrl;
    try {
      const refetchResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/upload/`, {
        method: "GET",
        headers: {
          "Authorization": `Token ${YODECK_TOKEN}`,
          "Accept": "application/json",
        },
      });
      if (refetchResp.ok) {
        const refetchData = await refetchResp.json();
        if (refetchData.upload_url && typeof refetchData.upload_url === "string") {
          uploadUrlForComplete = refetchData.upload_url;
          console.log(`${LOG_PREFIX} [${correlationId}] Re-fetched upload_url for complete call (host=${new URL(uploadUrlForComplete).host})`);
        }
      }
    } catch (e: any) {
      console.warn(`${LOG_PREFIX} [${correlationId}] Failed to re-fetch upload_url, using original: ${e.message}`);
    }
    
    console.log(`[YodeckUploadComplete] mediaId=${mediaId} upload_url_host=${(() => { try { return new URL(uploadUrlForComplete).host; } catch { return "unknown"; } })()}`);
    const completeResult = await stepCompleteUpload(jobId, mediaId!, uploadUrlForComplete, correlationId);
    console.log(`${LOG_PREFIX} [${correlationId}] Complete result: ok=${completeResult.ok} endpoint=${completeResult.endpoint || "none"} status=${completeResult.status || 0} error=${completeResult.error || "none"}`);

    if (!completeResult.ok) {
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} step=COMPLETE_UPLOAD reason=${completeResult.error}`);
      await markAdvertiserPublishFailed(advertiserId, "COMPLETE_UPLOAD_FAILED", completeResult.error || "unknown", correlationId);
      return makeFailResult(jobId, advertiserId, "COMPLETE_UPLOAD_FAILED", { error: completeResult.error, status: completeResult.status });
    }

    // Step 5: Verify media exists
    const verifyResult = await step5VerifyExistsImmediately(jobId, mediaId!, correlationId);
    if (!verifyResult.ok) {
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} step=VERIFY_EXISTS reason=${verifyResult.errorCode}`);
      await markAdvertiserPublishFailed(advertiserId, verifyResult.errorCode!, JSON.stringify(verifyResult.errorDetails), correlationId);
      return makeFailResult(jobId, advertiserId, verifyResult.errorCode!, verifyResult.errorDetails);
    }

    // Step 6: Poll until status is ready
    const pollResult = await step6PollStatus(jobId, mediaId!, correlationId);
    if (!pollResult.ok) {
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} step=POLL_STATUS reason=${pollResult.errorCode}`);
      await markAdvertiserPublishFailed(advertiserId, pollResult.errorCode!, JSON.stringify(pollResult.errorDetails), correlationId);
      return makeFailResult(jobId, advertiserId, pollResult.errorCode!, pollResult.errorDetails);
    }

    // Step 7: CRITICAL - Wait until file is ACTUALLY present (file!=null, size>0)
    // This is the safety net: status may be "ready" but file may still be null
    const client = await getYodeckClient();
    if (!client) {
      console.error(`${LOG_PREFIX} [${correlationId}] HARD_FAIL: Yodeck client unavailable - cannot verify file presence for mediaId=${mediaId}`);
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} lastState=CLIENT_UNAVAILABLE`);
      await markAdvertiserPublishFailed(advertiserId, "YODECK_CLIENT_UNAVAILABLE", "Cannot verify file presence", correlationId);
      return makeFailResult(jobId, advertiserId, "YODECK_CLIENT_UNAVAILABLE", { mediaId, reason: "File presence verification requires Yodeck client" });
    }
    const fileResult = await client.waitUntilMediaHasFile(mediaId!, { timeoutMs: 60000, intervalMs: 2000 });
    if (!fileResult.ok) {
      console.error(`${LOG_PREFIX} [${correlationId}] HARD_FAIL: file not present after upload. mediaId=${mediaId} hasFile=${fileResult.hasFile} size=${fileResult.size} status=${fileResult.status} polls=${fileResult.polls}`);
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} lastState=FILE_NOT_READY hasFile=${fileResult.hasFile} size=${fileResult.size}`);
      await markAdvertiserPublishFailed(advertiserId, "UPLOAD_FILE_NOT_READY", `file=${fileResult.hasFile} size=${fileResult.size} status=${fileResult.status}`, correlationId);
      return makeFailResult(jobId, advertiserId, "UPLOAD_FILE_NOT_READY", { mediaId, hasFile: fileResult.hasFile, size: fileResult.size, status: fileResult.status });
    }
    console.log(`${LOG_PREFIX} [${correlationId}] FILE_CONFIRMED: mediaId=${mediaId} size=${fileResult.size} polls=${fileResult.polls}`);
    console.log(`[YodeckUploadComplete] mediaId=${mediaId} fileSize=${fileResult.size} advertiserId=${advertiserId}`);

    // Step 8: Defensive strip of URL playback fields
    await patchClearUrlPlaybackFields(mediaId!, correlationId);

    // Step 8b: SAFETY ASSERTION - verify play_from_url and download_from_url are null
    try {
      const assertResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });
      if (assertResp.ok) {
        const assertData = await assertResp.json();
        const assertArgs = assertData.arguments || {};
        const assertPlayUrl = assertArgs.play_from_url;
        const assertDlUrl = assertArgs.download_from_url;
        const SAFE_CDN = ["dsbackend.s3.amazonaws.com", "yodeck.com", "yodeck-"];
        const isExternalUrl = (url: any) => url && typeof url === "string" && !SAFE_CDN.some((p: string) => url.includes(p));
        if (isExternalUrl(assertPlayUrl) || isExternalUrl(assertDlUrl)) {
          console.error(`[YodeckUploadFailed] mediaId=${mediaId} SAFETY_ASSERT_FAIL: external URLs remain after upload. play_from_url=${assertPlayUrl} download_from_url=${assertDlUrl}`);
        } else {
          console.log(`${LOG_PREFIX} [${correlationId}] SAFETY_ASSERT_OK: no external URLs on mediaId=${mediaId}`);
        }
      }
    } catch (assertErr: any) {
      console.warn(`${LOG_PREFIX} [${correlationId}] SAFETY_ASSERT_CHECK_ERROR: ${assertErr.message}`);
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
    await markAdvertiserPublishFailed(advertiserId, "UNEXPECTED_ERROR", error.message, correlationId);
    return makeFailResult(jobId, advertiserId, "UNEXPECTED_ERROR", { message: error.message });
  }
}

export async function uploadVideoToYodeckViaUrl(
  advertiserId: string,
  assetPath: string,
  desiredFilename: string,
  fileSize: number,
  assetId?: string
): Promise<TransactionalUploadResult> {
  const correlationId = generateCorrelationId();
  console.log(`${LOG_PREFIX} [${correlationId}] Starting URL-based upload for advertiser=${advertiserId} path=${assetPath}`);

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
  console.log(`${LOG_PREFIX} [${correlationId}] Created URL-upload job=${jobId}`);

  try {
    const cdnUrl = await getR2PresignedUrl(assetPath, 21600);
    console.log(`${LOG_PREFIX} [${correlationId}] R2 direct source URL for Yodeck: ${cdnUrl.substring(0, 100)}...`);

    console.log(`${LOG_PREFIX} [${correlationId}] PRE-FLIGHT: Checking CDN URL returns valid MP4...`);
    const preflightResp = await fetch(cdnUrl, { method: "GET", headers: { "Range": "bytes=0-31" } });
    if (!preflightResp.ok && preflightResp.status !== 206) {
      const errBody = await preflightResp.text().catch(() => "");
      console.error(`${LOG_PREFIX} [${correlationId}] PRE-FLIGHT FAILED: status=${preflightResp.status} body=${errBody.substring(0, 200)}`);
      await markJobFailed(jobId, "PREFLIGHT_CDN_FAILED", { status: preflightResp.status, body: errBody.substring(0, 200) }, `CDN URL returned ${preflightResp.status}`);
      return makeFailResult(jobId, advertiserId, "PREFLIGHT_CDN_FAILED", { status: preflightResp.status });
    }

    const preflightBytes = Buffer.from(await preflightResp.arrayBuffer());
    const preflightContentType = preflightResp.headers.get("content-type") || "";
    console.log(`${LOG_PREFIX} [${correlationId}] PRE-FLIGHT: received ${preflightBytes.length} bytes, content-type=${preflightContentType}`);
    console.log("[AdBytesSource]", { mediaId: "pending", name: desiredFilename, source: "cdn-proxy", bytesLen: fileSize });

    if (preflightBytes.length >= 8) {
      const ftypCheck = preflightBytes.toString("ascii", 4, 8);
      if (ftypCheck !== "ftyp") {
        const head = preflightBytes.toString("hex");
        console.error(`${LOG_PREFIX} [${correlationId}] PRE-FLIGHT MP4_INVALID: bytes[4..8]='${ftypCheck}' (expected 'ftyp') head=${head}`);
        await markJobFailed(jobId, "PREFLIGHT_NOT_MP4", { ftypCheck, head }, `CDN returns non-MP4: bytes[4..8]='${ftypCheck}'`);
        return makeFailResult(jobId, advertiserId, "PREFLIGHT_NOT_MP4", { ftypCheck });
      }
      console.log(`${LOG_PREFIX} [${correlationId}] PRE-FLIGHT MP4_VALID: ftyp header confirmed`);
    } else {
      console.warn(`${LOG_PREFIX} [${correlationId}] PRE-FLIGHT: Only ${preflightBytes.length} bytes received, cannot verify ftyp`);
    }

    const mediaName = desiredFilename.endsWith(".mp4") ? desiredFilename : `${desiredFilename}.mp4`;
    const payload = buildYodeckUrlMediaPayload(mediaName, cdnUrl);

    console.log(`${LOG_PREFIX} [${correlationId}] Creating Yodeck media via URL import: download_from_url=${cdnUrl.substring(0, 60)}...`);
    const createResp = await fetch(`${YODECK_API_BASE}/media/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const createText = await createResp.text();
    let createData: any;
    try { createData = JSON.parse(createText); } catch { createData = null; }

    if (!createResp.ok) {
      console.error(`${LOG_PREFIX} [${correlationId}] CREATE_MEDIA_URL FAILED: status=${createResp.status} body=${createText.substring(0, 500)}`);
      await markJobFailed(jobId, "CREATE_MEDIA_URL_FAILED", { status: createResp.status, body: createText.substring(0, 300) }, `Yodeck create-media returned ${createResp.status}`);
      return makeFailResult(jobId, advertiserId, "CREATE_MEDIA_URL_FAILED", { status: createResp.status });
    }

    const mediaId = createData?.id;
    if (!mediaId) {
      console.error(`${LOG_PREFIX} [${correlationId}] CREATE_MEDIA_URL: No mediaId in response`);
      await markJobFailed(jobId, "CREATE_MEDIA_URL_NO_ID", { response: createText.substring(0, 300) }, "No mediaId returned");
      return makeFailResult(jobId, advertiserId, "CREATE_MEDIA_URL_NO_ID", {});
    }

    console.log(`${LOG_PREFIX} [${correlationId}] CREATE_MEDIA_URL SUCCESS: mediaId=${mediaId}`);
    console.log("[YodeckUploadStart]", { mediaId, name: mediaName, method: "url", cdnUrlHost: new URL(cdnUrl).host });
    await updateJob(jobId, { yodeckMediaId: mediaId });

    await db.update(advertisers)
      .set({
        yodeckMediaIdCanonical: mediaId,
        yodeckMediaIdCanonicalUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    console.log(`${LOG_PREFIX} [${correlationId}] Polling for encoding completion...`);
    const pollResult = await step6PollStatus(jobId, mediaId, correlationId);
    if (!pollResult.ok) {
      console.error(`[YodeckUploadFailed] mediaId=${mediaId} step=POLL_STATUS_URL reason=${pollResult.errorCode}`);
      await markAdvertiserPublishFailed(advertiserId, pollResult.errorCode!, JSON.stringify(pollResult.errorDetails), correlationId);
      return makeFailResult(jobId, advertiserId, pollResult.errorCode!, pollResult.errorDetails);
    }

    const client = await getYodeckClient();
    if (client) {
      const fileResult = await client.waitUntilMediaHasFile(mediaId, { timeoutMs: 120000, intervalMs: 3000 });
      if (!fileResult.ok) {
        console.error(`${LOG_PREFIX} [${correlationId}] URL_UPLOAD FILE_NOT_READY: mediaId=${mediaId} hasFile=${fileResult.hasFile} size=${fileResult.size} status=${fileResult.status}`);
        await markAdvertiserPublishFailed(advertiserId, "UPLOAD_FILE_NOT_READY", `file=${fileResult.hasFile} size=${fileResult.size}`, correlationId);
        return makeFailResult(jobId, advertiserId, "UPLOAD_FILE_NOT_READY", { mediaId, hasFile: fileResult.hasFile, size: fileResult.size });
      }
      console.log(`${LOG_PREFIX} [${correlationId}] URL_UPLOAD FILE_CONFIRMED: mediaId=${mediaId} size=${fileResult.size}`);
    }

    await updateJob(jobId, {
      status: UPLOAD_JOB_STATUS.READY,
      finalState: UPLOAD_FINAL_STATE.READY,
      completedAt: new Date(),
    });

    await updateAdvertiserSuccess(advertiserId, mediaId, correlationId);

    console.log(`${LOG_PREFIX} [${correlationId}] URL_UPLOAD COMPLETE: job=${jobId} mediaId=${mediaId}`);

    return {
      ok: true,
      jobId,
      advertiserId,
      yodeckMediaId: mediaId,
      finalState: UPLOAD_FINAL_STATE.READY,
    };

  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] URL_UPLOAD unexpected error:`, error);
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

function bufferHexHead(buf: Buffer, n: number = 32): string {
  return buf.subarray(0, Math.min(n, buf.length)).toString("hex");
}
function bufferHexTail(buf: Buffer, n: number = 32): string {
  const start = Math.max(0, buf.length - n);
  return buf.subarray(start).toString("hex");
}
function validateMp4Header(buf: Buffer): { valid: boolean; reason?: string } {
  if (buf.length < 8) return { valid: false, reason: "File too small (<8 bytes)" };
  const ftypMarker = buf.toString("ascii", 4, 8);
  if (ftypMarker === "ftyp") return { valid: true };
  const moovMarker = buf.toString("ascii", 4, 8);
  if (moovMarker === "moov" || moovMarker === "mdat" || moovMarker === "free" || moovMarker === "wide") {
    return { valid: true };
  }
  return { valid: false, reason: `Not an MP4: bytes[4..8]='${ftypMarker}' (expected 'ftyp')` };
}

async function readFileFromStorage(path: string, correlationId: string): Promise<Buffer | null> {
  const { ObjectStorageService, R2_IS_CONFIGURED } = await import("../objectStorage");
  let rawBuffer: Buffer | null = null;

  if (R2_IS_CONFIGURED) {
    try {
      const r2Service = new ObjectStorageService();
      const buffer = await r2Service.downloadFile(path);
      if (buffer && buffer.length > 0) {
        console.log(`${LOG_PREFIX} [${correlationId}] Read ${buffer.length} bytes from R2: ${path}`);
        console.log("[AdBytesSource]", { mediaId: "n/a", name: path, source: "r2", bytesLen: buffer.length });
        rawBuffer = buffer;
      } else {
        console.warn(`${LOG_PREFIX} [${correlationId}] R2 download returned empty for: ${path}, trying Replit fallback`);
      }
    } catch (err: any) {
      console.warn(`${LOG_PREFIX} [${correlationId}] R2 download failed for ${path}: ${err.message}, trying Replit fallback`);
    }
  }

  if (!rawBuffer) {
    try {
      const client = new Client();
      const result = await client.downloadAsBytes(path);
      if (!result.ok) {
        console.error(`${LOG_PREFIX} [${correlationId}] Failed to read from storage: ${path}`);
        return null;
      }
      rawBuffer = Buffer.from(result.value as unknown as ArrayBuffer);
      console.log("[AdBytesSource]", { mediaId: "n/a", name: path, source: "replit-objectstore", bytesLen: rawBuffer.length });
    } catch (error: any) {
      console.error(`${LOG_PREFIX} [${correlationId}] Storage read error:`, error);
      return null;
    }
  }

  if (!rawBuffer || rawBuffer.length === 0) return null;

  const cleanBuffer = Buffer.alloc(rawBuffer.length);
  rawBuffer.copy(cleanBuffer);

  console.log(`${LOG_PREFIX} [${correlationId}] File loaded: ${cleanBuffer.length} bytes, head32=${bufferHexHead(cleanBuffer)}, tail32=${bufferHexTail(cleanBuffer)}`);

  const mp4Check = validateMp4Header(cleanBuffer);
  if (!mp4Check.valid) {
    console.error(`${LOG_PREFIX} [${correlationId}] MP4 VALIDATION FAILED: ${mp4Check.reason} path=${path}`);
  } else {
    console.log(`${LOG_PREFIX} [${correlationId}] MP4 header valid (ftyp box detected)`);
  }

  return cleanBuffer;
}

async function step1CreateMedia(
  jobId: string,
  name: string,
  correlationId: string
): Promise<{ ok: boolean; mediaId?: number; presignUrl?: string; getUploadUrlEndpoint?: string; errorCode?: string; errorDetails?: any }> {
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 1: CREATE_MEDIA`);
  
  const mediaName = name.endsWith(".mp4") ? name : `${name}.mp4`;
  
  // Use canonical payload builder - NEVER include media_origin/media_type
  const payload = buildYodeckCreateMediaPayload(mediaName);
  
  // Safety guard: fail fast if forbidden keys somehow sneak in
  assertNoForbiddenKeys(payload, "step1CreateMedia");
  logCreateMediaPayload(payload as any, correlationId);
  
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

    const getUploadUrlEndpoint = responseData.get_upload_url || null;
    if (getUploadUrlEndpoint) {
      console.log(`${LOG_PREFIX} [${correlationId}] CREATE response includes get_upload_url: ${getUploadUrlEndpoint}`);
    }

    await updateJob(jobId, {
      yodeckMediaId: mediaId,
      finalState: UPLOAD_FINAL_STATE.CREATED,
    });

    console.log(`${LOG_PREFIX} [${correlationId}] STEP 1 SUCCESS: mediaId=${mediaId}`);
    return { ok: true, mediaId, getUploadUrlEndpoint };

  } catch (error: any) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 1 ERROR:`, error);
    await markJobFailed(jobId, "CREATE_EXCEPTION", { message: error.message }, error.message);
    return { ok: false, errorCode: "CREATE_EXCEPTION", errorDetails: { message: error.message } };
  }
}

async function step2GetUploadUrl(
  jobId: string,
  mediaId: number,
  correlationId: string,
  getUploadUrlEndpoint?: string
): Promise<{ ok: boolean; presignedUrl?: string; errorCode?: string; errorDetails?: any }> {
  // Use get_upload_url from create response if available, else fallback to standard endpoint
  const url = getUploadUrlEndpoint
    ? (getUploadUrlEndpoint.startsWith("http") ? getUploadUrlEndpoint : `https://app.yodeck.com${getUploadUrlEndpoint}`)
    : `${YODECK_API_BASE}/media/${mediaId}/upload/`;
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 2: GET ${getUploadUrlEndpoint ? "get_upload_url from create response" : `/media/${mediaId}/upload/`}`);

  try {
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

function presignedPutWithNode(
  url: string,
  buffer: Buffer,
  contentType: string
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const https = require("node:https");
    const http = require("node:http");
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;

    const options = {
      method: "PUT",
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength,
      },
    };

    const req = transport.request(options, (res: any) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const responseHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          responseHeaders[key] = String(value);
        }
        resolve({
          status: res.statusCode,
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString("utf-8"),
        });
      });
    });

    req.on("error", reject);
    req.end(buffer);
  });
}

async function step3PutBinary(
  jobId: string,
  presignUrl: string,
  fileBuffer: Buffer,
  correlationId: string
): Promise<{ ok: boolean; errorCode?: string; errorDetails?: any }> {
  const fileSize = fileBuffer.byteLength;
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 3: PUT_BINARY (${fileSize} bytes)`);
  
  if (fileSize === 0) {
    console.error(`${LOG_PREFIX} [${correlationId}] STEP 3 FAILED: File is empty (0 bytes)`);
    await markJobFailed(jobId, "PUT_EMPTY_FILE", { fileSize: 0 }, "File is empty");
    return { ok: false, errorCode: "PUT_EMPTY_FILE", errorDetails: { fileSize: 0 } };
  }

  const mp4Check = validateMp4Header(fileBuffer);
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 3 MP4 pre-flight: valid=${mp4Check.valid} reason=${mp4Check.reason || "ok"}`);
  console.log(`${LOG_PREFIX} [${correlationId}] STEP 3 buffer diagnostics: byteLength=${fileBuffer.byteLength} byteOffset=${fileBuffer.byteOffset} isBuffer=${Buffer.isBuffer(fileBuffer)} head32=${bufferHexHead(fileBuffer)} tail32=${bufferHexTail(fileBuffer)}`);
  
  let urlHost = "unknown";
  try { urlHost = new URL(presignUrl).host; } catch {}
  console.log(`[YodeckUploadPresignedPUT] byteLength=${fileSize} host=${urlHost} method=node:https`);
  
  const startTime = Date.now();
  
  try {
    const result = await presignedPutWithNode(presignUrl, fileBuffer, "video/mp4");

    const putStatus = result.status;
    const putEtag = result.headers["etag"] || null;
    const putDurationMs = Date.now() - startTime;
    
    console.log(`${LOG_PREFIX} [${correlationId}] STEP 3 response: status=${putStatus} etag=${putEtag} duration=${putDurationMs}ms body=${result.body.substring(0, 200)}`);

    await updateJob(jobId, {
      putStatus,
      putEtag,
    });

    if (putStatus !== 200 && putStatus !== 204) {
      const errorCode = `PUT_FAILED_${putStatus}`;
      console.error(`${LOG_PREFIX} [${correlationId}] STEP 3 FAILED: status=${putStatus} body=${result.body.substring(0, 500)}`);
      await markJobFailed(jobId, errorCode, { 
        status: putStatus, 
        host: urlHost,
        fileSize,
        durationMs: putDurationMs,
        responseBody: result.body.substring(0, 500),
        headers: result.headers,
      }, `PUT failed with status ${putStatus}`);
      return { ok: false, errorCode, errorDetails: { status: putStatus, responseBody: result.body.substring(0, 200) } };
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
  const endpointPath = `/media/${mediaId}/upload/complete/`;
  const fullUrl = `${YODECK_API_BASE}${endpointPath}`;
  const hasQuery = uploadUrl.includes("?");

  let uploadUrlHost = "unknown";
  try { uploadUrlHost = new URL(uploadUrl).host; } catch {}
  console.log(`[YodeckUploadCompleteRequest] mediaId=${mediaId} uploadUrlPresent=${!!uploadUrl} uploadUrlHost=${uploadUrlHost} hasQuery=${hasQuery}`);
  console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_CALL url=${endpointPath}`);

  try {
    const completeBody = JSON.stringify({ upload_url: uploadUrl });
    console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_BODY_LENGTH=${completeBody.length} method=PUT`);
    
    const response = await fetch(fullUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: completeBody,
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

    // Verify media is no longer "initialized" — retry complete if stuck
    for (let retry = 0; retry < 3; retry++) {
      const waitMs = retry === 0 ? 2000 : 4000;
      await new Promise(r => setTimeout(r, waitMs));
      try {
        const checkResp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
          headers: { "Authorization": `Token ${YODECK_TOKEN}` },
        });
        if (checkResp.ok) {
          const checkData = await checkResp.json();
          const mStatus = (checkData.status || "unknown").toLowerCase();
          const mFileSize = checkData.filesize || checkData.file_size || 0;
          const mLastUploaded = checkData.last_uploaded || checkData.updated_at || "unknown";
          console.log(`${LOG_PREFIX} [${correlationId}] AFTER_COMPLETE_CHECK[${retry}] status=${mStatus} fileSize=${mFileSize} last_uploaded=${mLastUploaded}`);

          if (mStatus !== "initialized") {
            console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_VERIFIED: media moved past initialized (status=${mStatus})`);
            break;
          }

          if (retry < 2) {
            console.warn(`${LOG_PREFIX} [${correlationId}] Media still initialized after complete, retrying complete call (attempt ${retry + 2})`);
            const retryResp = await fetch(fullUrl, {
              method: "PUT",
              headers: {
                "Authorization": `Token ${YODECK_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ upload_url: uploadUrl }),
            });
            console.log(`${LOG_PREFIX} [${correlationId}] COMPLETE_RETRY[${retry + 1}] status=${retryResp.status}`);
          } else {
            console.warn(`${LOG_PREFIX} [${correlationId}] Media still initialized after ${retry + 1} complete attempts - continuing to poll phase`);
          }
        } else {
          console.warn(`${LOG_PREFIX} [${correlationId}] AFTER_COMPLETE_CHECK[${retry}] failed: ${checkResp.status}`);
        }
      } catch (err: any) {
        console.warn(`${LOG_PREFIX} [${correlationId}] AFTER_COMPLETE_CHECK[${retry}] error: ${err.message}`);
      }
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
        console.log(`${LOG_PREFIX} [${correlationId}] STEP 6 SUCCESS: Media status is READY (${status}) - file presence check deferred to waitUntilMediaHasFile`);
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
    columns: { publishRetryCount: true, yodeckMediaIdCanonical: true },
  });
  
  const TERMINAL_ERRORS = ["FAILED_INIT_STUCK", "POLL_TIMEOUT", "POLL_404", "VERIFY_404", "FINAL_VERIFY_404"];
  const isTerminal = TERMINAL_ERRORS.includes(errorCode);
  
  let shouldClearCanonical = false;
  
  if (isTerminal && current?.yodeckMediaIdCanonical) {
    try {
      const checkResp = await fetch(`${YODECK_API_BASE}/media/${current.yodeckMediaIdCanonical}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });
      if (checkResp.ok) {
        const data = await checkResp.json();
        const status = (data.status || "").toLowerCase();
        const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed", "finished"];
        const ext = (data.file_extension || data.name || "").toLowerCase();
        const isVideo = (data.media_origin?.type === "video") || ext.endsWith(".mp4") || ext.endsWith(".mov") || ext.endsWith(".avi") || ext.endsWith(".webm");
        if (READY_STATUSES.includes(status) && isVideo) {
          console.log(`${LOG_PREFIX} [${correlationId}] TERMINAL_BUT_MEDIA_OK: canonical ${current.yodeckMediaIdCanonical} is still valid (${status}, video=${isVideo}) - keeping canonical, setting status=live`);
          await db.update(advertisers)
            .set({
              assetStatus: "live",
              publishErrorCode: errorCode,
              publishErrorMessage: `Upload failed but existing media ${current.yodeckMediaIdCanonical} is valid`,
              publishRetryCount: (current?.publishRetryCount || 0) + 1,
              updatedAt: new Date(),
            })
            .where(eq(advertisers.id, advertiserId));
          return;
        }
      }
      shouldClearCanonical = true;
    } catch {
      shouldClearCanonical = true;
    }
  } else if (isTerminal) {
    shouldClearCanonical = true;
  }
  
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
  advertiserId: string,
  options?: { autoHeal?: boolean }
): Promise<{ ok: boolean; mediaId: number | null; reason?: string; status?: string; isReady?: boolean; healed?: boolean; oldMediaId?: number | null }> {
  const LOG = "[EnsureMediaValid]";
  const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed", "finished"];
  const autoHeal = options?.autoHeal ?? true;
  
  const advertiser = await db.query.advertisers.findFirst({
    where: eq(advertisers.id, advertiserId),
  });

  if (!advertiser) {
    return { ok: false, mediaId: null, reason: "ADVERTISER_NOT_FOUND" };
  }

  const existingMediaId = advertiser.yodeckMediaIdCanonical;
  let needsReupload = false;
  let invalidReason = "";

  if (existingMediaId) {
    console.log(`[YODECK_MEDIA_CHECK] id=${existingMediaId} advertiser=${advertiserId}`);
    
    try {
      const response = await fetch(`${YODECK_API_BASE}/media/${existingMediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });

      console.log(`[YODECK_MEDIA_CHECK] id=${existingMediaId} status=${response.status}`);

      if (response.status === 404) {
        console.error(`[YODECK_MEDIA_INVALID] mediaId=${existingMediaId} HTTP 404 - media does not exist in Yodeck, clearing canonical`);
        needsReupload = true;
        invalidReason = "MEDIA_MISSING_IN_YODECK";
      } else if (!response.ok) {
        console.warn(`${LOG} Media ${existingMediaId} check returned ${response.status}`);
        return { ok: false, mediaId: null, reason: `MEDIA_CHECK_ERROR_${response.status}` };
      } else {
        const data = await response.json();
        if (!data.id) {
          console.warn(`${LOG} Media ${existingMediaId} response missing id field`);
          needsReupload = true;
          invalidReason = "MEDIA_INVALID_RESPONSE";
        } else {
          const mediaOriginType = data.media_origin?.type || data.mediaOrigin?.type || null;
          const mediaName = data.name || "";
          console.log(`[YODECK_MEDIA_CHECK] id=${existingMediaId} mediaOrigin.type=${mediaOriginType} name="${mediaName}"`);

          if (mediaOriginType && mediaOriginType !== "video") {
            console.error(`[INVALID_AD_MEDIA] mediaId=${existingMediaId} mediaOrigin.type="${mediaOriginType}" name="${mediaName}" — NOT a video, clearing`);
            needsReupload = true;
            invalidReason = `WRONG_MEDIA_TYPE_${mediaOriginType}`;

            await db.update(adAssets)
              .set({ yodeckMediaId: null })
              .where(eq(adAssets.yodeckMediaId, existingMediaId));
          } else {
            const status = (data.status || "").toLowerCase();
            const isReady = READY_STATUSES.includes(status);
            const fileObj = data.file;
            const fileSize = fileObj?.size || fileObj?.file_size || data.filesize || data.file_size || 0;
            const hasFile = fileObj != null && fileSize > 0;
            
            console.log(`[YODECK_MEDIA_CHECK] id=${existingMediaId} status=${status} isReady=${isReady} fileSize=${fileSize} hasFile=${hasFile}`);

            if (isReady) {
              if (!hasFile) {
                console.log(`[YODECK_MEDIA_CHECK] id=${existingMediaId} status=${status} file=null/size=0 - Yodeck metadata incomplete but media is READY, accepting as valid`);
              }
              return { ok: true, mediaId: existingMediaId, status, isReady: true };
            } else {
              const ENCODING_STATUSES = ["encoding", "processing", "uploading", "initialized"];
              if (!isReady && !ENCODING_STATUSES.includes(status)) {
                console.warn(`[YODECK_MEDIA_INVALID] mediaId=${existingMediaId} status="${status}" is stuck/invalid`);
                needsReupload = true;
                invalidReason = `MEDIA_NOT_PLAYABLE_STATUS_${status}`;
              } else {
                return { ok: true, mediaId: existingMediaId, status, isReady };
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`${LOG} Error checking media ${existingMediaId}:`, error.message);
      return { ok: false, mediaId: null, reason: "MEDIA_CHECK_EXCEPTION" };
    }
  } else {
    needsReupload = true;
    invalidReason = "NO_CANONICAL_MEDIA_ID";
  }

  if (needsReupload) {
    console.log(`[YODECK_MEDIA_INVALID] advertiser=${advertiserId} oldMediaId=${existingMediaId || "null"} reason=${invalidReason} autoHeal=${autoHeal}`);

    if (!autoHeal) {
      return { ok: false, mediaId: null, reason: invalidReason, oldMediaId: existingMediaId };
    }

    await db.update(advertisers)
      .set({
        assetStatus: "ready_for_yodeck",
        yodeckMediaIdCanonical: null,
        updatedAt: new Date(),
      })
      .where(eq(advertisers.id, advertiserId));

    console.log(`[YODECK_MEDIA_REUPLOAD] starting self-heal for advertiser=${advertiserId} oldMediaId=${existingMediaId || "null"}`);

    const { ensureAdvertiserMediaUploaded } = await import("./simplePlaylistModel");
    const uploadResult = await ensureAdvertiserMediaUploaded(advertiserId);

    if (!uploadResult.ok || !uploadResult.mediaId) {
      console.error(`[YODECK_MEDIA_REUPLOAD] FAILED for advertiser=${advertiserId}: ${uploadResult.error}`);
      return { ok: false, mediaId: null, reason: `SELF_HEAL_UPLOAD_FAILED: ${uploadResult.error}`, oldMediaId: existingMediaId, healed: false };
    }

    const newMediaId = uploadResult.mediaId;
    console.log(`[YODECK_MEDIA_REUPLOAD] oldId=${existingMediaId || "null"} newId=${newMediaId} advertiser=${advertiserId}`);

    const verifyResp = await fetch(`${YODECK_API_BASE}/media/${newMediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });

    if (!verifyResp.ok) {
      console.error(`[YODECK_MEDIA_REUPLOAD] VERIFY FAILED: new mediaId=${newMediaId} returned ${verifyResp.status}`);
      return { ok: false, mediaId: null, reason: `SELF_HEAL_VERIFY_FAILED_${verifyResp.status}`, oldMediaId: existingMediaId, healed: false };
    }

    const verifyData = await verifyResp.json();
    const newStatus = (verifyData.status || "").toLowerCase();
    const newIsReady = READY_STATUSES.includes(newStatus);

    console.log(`[YODECK_MEDIA_READY] id=${newMediaId} status=${newStatus} isReady=${newIsReady}`);

    return {
      ok: newIsReady,
      mediaId: newMediaId,
      status: newStatus,
      isReady: newIsReady,
      healed: true,
      oldMediaId: existingMediaId,
      reason: newIsReady ? undefined : `SELF_HEAL_NOT_READY_${newStatus}`,
    };
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
