/**
 * YodeckPublishService - Idempotent media upload and playlist management
 * 
 * Features:
 * - Upload video from Object Storage to Yodeck
 * - Add media to playlists
 * - Idempotent operations using integration_outbox
 * - Rollback support for failed publishes
 */

import { db } from "../db";
import { integrationOutbox, placementPlans, adAssets, locations } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { ObjectStorageService } from "../objectStorage";
import { dispatchMailEvent } from "./mailEventService";
import { logAudit } from "./auditService";
import axios from "axios";
import FormData from "form-data";

const YODECK_BASE_URL = "https://app.yodeck.com/api/v2";
const REQUEST_TIMEOUT = 120000; // 120 seconds for uploads
const MAX_RETRIES = 3;
const BUFFER_FALLBACK_MAX_BYTES = 20 * 1024 * 1024; // 20MB max for buffer fallback

interface YodeckMediaUploadResponse {
  id: number;
  name: string;
  url?: string;
}

interface YodeckPlaylistItem {
  id: number;
  type: string;
  duration?: number;
}

interface PublishTarget {
  locationId: string;
  locationName: string;
  yodeckPlaylistId: number;
  mediaId?: number;
  status: "pending" | "uploaded" | "added_to_playlist" | "failed";
  error?: string;
}

interface PublishReport {
  planId: string;
  startedAt: string;
  completedAt?: string;
  totalTargets: number;
  successCount: number;
  failedCount: number;
  yodeckMediaId: string | null;
  targets: { locationId: string; status: string; error?: string }[];
  publishedAt?: string;
  rolledBackAt?: string;
}

class YodeckPublishService {
  private apiKey: string | null = null;

  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;
    
    const envToken = process.env.YODECK_AUTH_TOKEN;
    if (envToken) {
      this.apiKey = envToken;
      return envToken;
    }
    
    const v2Token = process.env.YODECK_V2_TOKEN?.trim();
    if (v2Token) {
      this.apiKey = v2Token;
      return v2Token;
    }

    throw new Error("YODECK_AUTH_TOKEN not configured");
  }

  private async makeRequest<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    endpoint: string,
    body?: any,
    isFormData = false,
    retries = MAX_RETRIES
  ): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
    try {
      const apiKey = await this.getApiKey();
      const url = `${YODECK_BASE_URL}${endpoint}`;

      const headers: Record<string, string> = {
        "Authorization": `Token ${apiKey}`,
      };

      if (!isFormData) {
        headers["Content-Type"] = "application/json";
        headers["Accept"] = "application/json";
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: isFormData ? body : (body ? JSON.stringify(body) : undefined),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.status === 429 && retries > 0) {
          const delay = 2000 * Math.pow(2, MAX_RETRIES - retries);
          console.log(`[YodeckPublish] Rate limited, waiting ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          return this.makeRequest<T>(method, endpoint, body, isFormData, retries - 1);
        }

        if (!response.ok) {
          const errorText = await response.text();
          return { ok: false, status: response.status, error: `HTTP ${response.status}: ${errorText}` };
        }

        if (response.status === 204) {
          return { ok: true };
        }

        const data = await response.json() as T;
        return { ok: true, data };
      } catch (err: any) {
        clearTimeout(timeout);
        if (err.name === "AbortError" && retries > 0) {
          return this.makeRequest<T>(method, endpoint, body, isFormData, retries - 1);
        }
        return { ok: false, error: err.message };
      }
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Upload a video file from Object Storage to Yodeck
   * Uses axios with multipart/form-data for proper binary video upload
   */
  async uploadMediaFromStorage(
    storagePath: string,
    mediaName: string,
    idempotencyKey: string,
    advertiserId: string
  ): Promise<{ ok: boolean; mediaId?: number; error?: string; errorCode?: string; errorDetails?: any }> {
    console.log(`[YodeckPublish] Uploading media: ${mediaName} from ${storagePath}`);

    // Check if already uploaded via outbox (succeeded = skip re-upload)
    const existing = await db.query.integrationOutbox.findFirst({
      where: and(
        eq(integrationOutbox.idempotencyKey, idempotencyKey),
        eq(integrationOutbox.status, "succeeded")
      ),
    });

    if (existing?.externalId) {
      console.log(`[YodeckPublish] Already uploaded, mediaId=${existing.externalId}`);
      return { ok: true, mediaId: parseInt(existing.externalId) };
    }

    // Upsert outbox record for tracking (handles conflicts gracefully)
    const { storage: storageService } = await import("../storage");
    const upsertResult = await storageService.upsertOutboxJob({
      provider: "yodeck",
      actionType: "upload_media",
      entityType: "ad_asset",
      entityId: advertiserId,
      payloadJson: { storagePath, mediaName },
      idempotencyKey,
      status: "processing",
    });
    
    if (upsertResult.isLocked) {
      console.log(`[YodeckPublish] Upload job is already being processed`);
      return { ok: false, error: "ALREADY_PROCESSING" };
    }
    
    // Update to processing status
    await db.update(integrationOutbox)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(integrationOutbox.id, upsertResult.job.id));

    try {
      // Get file from Object Storage
      const objectStorage = new ObjectStorageService();
      const file = await objectStorage.getFileByPath(storagePath);
      
      if (!file) {
        throw new Error("Could not get file from Object Storage");
      }
      
      // Get file metadata for size-based decision
      let fileSize: number | undefined;
      try {
        const [metadata] = await file.getMetadata();
        fileSize = metadata?.size ? parseInt(String(metadata.size)) : undefined;
      } catch (metaErr) {
        console.log(`[YodeckPublish] Could not get file metadata, will download to buffer`);
      }
      
      // Helper to ensure filename ends with .mp4 exactly once
      const ensureMp4Extension = (name: string): string => {
        if (name.toLowerCase().endsWith('.mp4')) {
          return name;
        }
        return `${name}.mp4`;
      };
      
      // Create form data for upload
      const formData = new FormData();
      
      // Normalize name - ensure single .mp4 extension
      const normalizedName = ensureMp4Extension(mediaName.replace(/\.mp4$/i, ''));
      
      // Fields for Yodeck API (only name and file are required)
      const uploadFields: Record<string, string> = {
        name: normalizedName,
      };
      
      formData.append("name", uploadFields.name);
      
      // Optional: include media_origin only if explicitly enabled (some accounts may need it)
      const includeMediaOrigin = process.env.YODECK_UPLOAD_INCLUDE_MEDIA_ORIGIN === 'true';
      if (includeMediaOrigin) {
        const mediaOrigin = process.env.YODECK_MEDIA_ORIGIN || "upload";
        uploadFields.media_origin = mediaOrigin;
        formData.append("media_origin", mediaOrigin);
      }

      // Decision: use streaming if file size is known and > BUFFER_FALLBACK_MAX_BYTES
      // Otherwise use buffer for reliability
      let fileContent: any;
      
      if (fileSize && fileSize <= BUFFER_FALLBACK_MAX_BYTES) {
        // Small file: use buffer (reliable)
        console.log(`[YodeckPublish] Small file (${fileSize} bytes), using buffer mode`);
        const [fileBuffer] = await file.download();
        fileContent = fileBuffer;
        fileSize = fileBuffer.length;
      } else if (fileSize && fileSize > BUFFER_FALLBACK_MAX_BYTES) {
        // Large file: use streaming to avoid memory spikes
        console.log(`[YodeckPublish] Large file (${fileSize} bytes), using stream mode`);
        fileContent = file.createReadStream();
      } else {
        // Unknown size: download and check
        const [fileBuffer] = await file.download();
        fileSize = fileBuffer.length;
        if (fileSize > BUFFER_FALLBACK_MAX_BYTES) {
          throw new Error(`File too large for buffer upload (${(fileSize / 1024 / 1024).toFixed(1)}MB > ${BUFFER_FALLBACK_MAX_BYTES / 1024 / 1024}MB). Please try again.`);
        }
        console.log(`[YodeckPublish] Downloaded file buffer: ${fileSize} bytes`);
        fileContent = fileBuffer;
      }
      
      // Ensure filename has single .mp4 extension
      const filename = ensureMp4Extension(normalizedName);
      formData.append("file", fileContent, { 
        filename,
        contentType: "video/mp4",  // CRITICAL: must specify video/mp4
        knownLength: fileSize      // Guarantees form-data can calculate Content-Length
      });

      // Log upload fields (no secrets) - show which keys are being sent
      const fieldKeys = Object.keys(uploadFields).concat(['file']);
      console.log(`[YodeckPublish] Upload multipart fields: ${fieldKeys.join(', ')} | name="${uploadFields.name}" file="${filename}" size=${fileSize} contentType=video/mp4`);

      // Upload to Yodeck using axios for proper multipart handling
      const apiKey = await this.getApiKey();
      const url = `${YODECK_BASE_URL}/media`;
      
      // Get Content-Length for the multipart request (REQUIRED for Yodeck)
      let contentLength: number;
      try {
        contentLength = await new Promise<number>((resolve, reject) => {
          formData.getLength((err: Error | null, length: number) => {
            if (err) reject(err);
            else resolve(length);
          });
        });
        console.log(`[YodeckPublish] Multipart Content-Length: ${contentLength} bytes`);
      } catch (lengthErr) {
        // Content-Length calculation failed - this means streaming without size
        throw new Error("Could not calculate Content-Length for upload. Please try again.");
      }
      
      // Build headers with required Content-Length
      const headers: Record<string, string> = {
        "Authorization": `Token ${apiKey}`,
        "Content-Length": String(contentLength),  // REQUIRED for Yodeck
        ...formData.getHeaders()  // CRITICAL: includes Content-Type with boundary
      };
      
      try {
        const response = await axios.post<YodeckMediaUploadResponse>(url, formData, {
          headers,
          timeout: REQUEST_TIMEOUT,  // 2 minute timeout for uploads
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
        
        const data = response.data;
        
        if (!data?.id) {
          throw new Error("Upload response missing media ID");
        }

        // Update outbox with success
        await db.update(integrationOutbox)
          .set({
            status: "succeeded",
            externalId: String(data.id),
            responseJson: data,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

        console.log(`[YodeckPublish] Upload successful, mediaId=${data.id}`);
        return { ok: true, mediaId: data.id };
      } catch (axiosError: any) {
        const statusCode = axiosError.response?.status || 'N/A';
        const responseData = axiosError.response?.data;
        
        // Parse Yodeck error response to extract missing_key if present
        let errorCode = "YODECK_UPLOAD_FAILED";
        let errorMessage = axiosError.message;
        let errorDetails: any = { sentFields: Object.keys(uploadFields) };
        
        if (responseData) {
          errorDetails.response = responseData;
          
          // Check for err_1002 missing_key error
          if (responseData.error?.code === "err_1002" && responseData.error?.details?.missing_key) {
            const missingKey = responseData.error.details.missing_key;
            errorCode = "YODECK_MISSING_FIELD";
            errorMessage = `Yodeck mist veld: ${missingKey}`;
            errorDetails.missingKey = missingKey;
            console.error(`[YodeckPublish] Upload failed: Missing field "${missingKey}" (sent: ${fieldKeys.join(", ")})`);
          }
          // Check for err_1003 invalid_field error
          else if (responseData.error?.code === "err_1003" && responseData.error?.details?.invalid_field) {
            const invalidField = responseData.error.details.invalid_field;
            errorCode = "YODECK_INVALID_FIELD";
            errorMessage = `Yodeck accepteert veld niet: ${invalidField}`;
            errorDetails.invalidField = invalidField;
            console.error(`[YodeckPublish] Upload failed: Invalid field "${invalidField}" (sent: ${fieldKeys.join(", ")})`);
          } else {
            errorMessage = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
            console.error(`[YodeckPublish] Upload failed: HTTP ${statusCode} | URL: ${url} | Response: ${errorMessage}`);
          }
        } else {
          console.error(`[YodeckPublish] Upload failed: HTTP ${statusCode} | URL: ${url}`, errorMessage);
        }
        
        await db.update(integrationOutbox)
          .set({ 
            status: "failed",
            lastError: JSON.stringify({ code: errorCode, message: errorMessage, details: errorDetails }),
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

        return { ok: false, error: errorMessage, errorCode, errorDetails };
      }
    } catch (err: any) {
      console.error(`[YodeckPublish] Upload error:`, err.message);
      await db.update(integrationOutbox)
        .set({
          status: "failed",
          lastError: err.message,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

      return { ok: false, error: err.message };
    }
  }

  /**
   * Add media to a Yodeck playlist
   */
  async addMediaToPlaylist(
    playlistId: number,
    mediaId: number,
    durationSeconds: number,
    idempotencyKey: string,
    locationId: string
  ): Promise<{ ok: boolean; error?: string }> {
    console.log(`[YodeckPublish] Adding media ${mediaId} to playlist ${playlistId}`);

    // Check if already added via outbox (succeeded = skip)
    const existing = await db.query.integrationOutbox.findFirst({
      where: and(
        eq(integrationOutbox.idempotencyKey, idempotencyKey),
        eq(integrationOutbox.status, "succeeded")
      ),
    });

    if (existing) {
      console.log(`[YodeckPublish] Already added to playlist`);
      return { ok: true };
    }

    // Upsert outbox record (handles conflicts gracefully)
    const { storage: storageService } = await import("../storage");
    const upsertResult = await storageService.upsertOutboxJob({
      provider: "yodeck",
      actionType: "add_to_playlist",
      entityType: "location",
      entityId: locationId,
      payloadJson: { playlistId, mediaId, durationSeconds },
      idempotencyKey,
      status: "processing",
    });
    
    if (upsertResult.isLocked) {
      console.log(`[YodeckPublish] Playlist add job is already being processed`);
      return { ok: false, error: "ALREADY_PROCESSING" };
    }
    
    // Update to processing status
    await db.update(integrationOutbox)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(integrationOutbox.id, upsertResult.job.id));

    try {
      // First get current playlist items
      const getResult = await this.makeRequest<{ items: YodeckPlaylistItem[] }>(
        "GET",
        `/playlists/${playlistId}`
      );

      if (!getResult.ok) {
        throw new Error(`Could not get playlist: ${getResult.error}`);
      }

      const currentItems = getResult.data?.items || [];
      
      // Check if media already exists in playlist
      const alreadyExists = currentItems.some(item => item.id === mediaId && item.type === "media");
      if (alreadyExists) {
        console.log(`[YodeckPublish] Media already in playlist`);
        await db.update(integrationOutbox)
          .set({
            status: "succeeded",
            responseJson: { alreadyExists: true },
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        return { ok: true };
      }

      // Add new item to playlist
      const newItems = [...currentItems, { id: mediaId, type: "media", duration: durationSeconds }];
      
      const patchResult = await this.makeRequest(
        "PATCH",
        `/playlists/${playlistId}`,
        { items: newItems }
      );

      if (!patchResult.ok) {
        throw new Error(`Could not update playlist: ${patchResult.error}`);
      }

      // VERIFICATION: Re-fetch playlist to confirm media was added (hard requirement)
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay for Yodeck to process
      
      const verifyResult = await this.makeRequest<{ items: YodeckPlaylistItem[] }>(
        "GET",
        `/playlists/${playlistId}`
      );

      if (!verifyResult.ok) {
        // Verification GET failed - cannot confirm media is in playlist, so we must fail
        console.error(`[YodeckPublish] VERIFICATION FAILED: Could not re-fetch playlist ${playlistId}: ${verifyResult.error}`);
        
        await db.update(integrationOutbox)
          .set({
            status: "failed",
            lastError: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST",
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        return { ok: false, error: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST: Could not verify playlist" };
      }
      
      const verifiedItems = verifyResult.data?.items || [];
      const mediaFound = verifiedItems.some(item => item.id === mediaId && item.type === "media");
      
      if (!mediaFound) {
        console.error(`[YodeckPublish] VERIFICATION FAILED: Media ${mediaId} not found in playlist ${playlistId}`);
        
        await db.update(integrationOutbox)
          .set({
            status: "failed",
            lastError: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST",
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        return { ok: false, error: "UPLOAD_OK_BUT_NOT_IN_PLAYLIST" };
      }
      
      console.log(`[YodeckPublish] VERIFIED: Media ${mediaId} confirmed in playlist ${playlistId}`);

      await db.update(integrationOutbox)
        .set({
          status: "succeeded",
          responseJson: { success: true, verified: true },
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

      return { ok: true };
    } catch (err: any) {
      await db.update(integrationOutbox)
        .set({
          status: "failed",
          lastError: err.message,
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

      return { ok: false, error: err.message };
    }
  }

  /**
   * Remove media from a Yodeck playlist (for rollback)
   */
  async removeMediaFromPlaylist(
    playlistId: number,
    mediaId: number
  ): Promise<{ ok: boolean; error?: string }> {
    console.log(`[YodeckPublish] Removing media ${mediaId} from playlist ${playlistId}`);

    try {
      // Get current playlist items
      const getResult = await this.makeRequest<{ items: YodeckPlaylistItem[] }>(
        "GET",
        `/playlists/${playlistId}`
      );

      if (!getResult.ok) {
        return { ok: false, error: getResult.error };
      }

      const currentItems = getResult.data?.items || [];
      const filteredItems = currentItems.filter(item => !(item.id === mediaId && item.type === "media"));

      if (filteredItems.length === currentItems.length) {
        // Media wasn't in playlist
        return { ok: true };
      }

      const patchResult = await this.makeRequest(
        "PATCH",
        `/playlists/${playlistId}`,
        { items: filteredItems }
      );

      if (!patchResult.ok) {
        return { ok: false, error: patchResult.error };
      }

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Publish an approved placement plan to Yodeck
   */
  async publishPlan(planId: string): Promise<PublishReport> {
    console.log(`[YodeckPublish] Publishing plan ${planId}`);

    const report: PublishReport = {
      planId,
      startedAt: new Date().toISOString(),
      totalTargets: 0,
      successCount: 0,
      failedCount: 0,
      yodeckMediaId: null,
      targets: [],
    };

    try {
      // Get plan
      const plan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });

      if (!plan) {
        throw new Error("Plan not found");
      }

      if (plan.status !== "APPROVED" && plan.status !== "FAILED") {
        throw new Error(`Plan status must be APPROVED or FAILED, got ${plan.status}`);
      }

      // Get the ad asset
      const asset = await db.query.adAssets.findFirst({
        where: eq(adAssets.id, plan.adAssetId),
      });

      if (!asset?.storagePath) {
        throw new Error("Asset not found or no storage path");
      }

      // Update plan to PUBLISHING
      await db.update(placementPlans)
        .set({ status: "PUBLISHING" })
        .where(eq(placementPlans.id, planId));

      // Get approved targets
      const approvedTargets = plan.approvedTargets as any[] || [];
      report.totalTargets = approvedTargets.length;

      // Generate idempotency key for upload
      const uploadIdempotencyKey = crypto
        .createHash("sha256")
        .update(`upload:${planId}:${asset.id}`)
        .digest("hex");

      // Step 1: Upload media to Yodeck
      const uploadResult = await this.uploadMediaFromStorage(
        asset.storagePath,
        `${plan.linkKey}_${asset.originalFileName || "video"}`,
        uploadIdempotencyKey,
        plan.advertiserId
      );

      if (!uploadResult.ok || !uploadResult.mediaId) {
        throw new Error(`Upload failed: ${uploadResult.error}`);
      }

      report.yodeckMediaId = String(uploadResult.mediaId);

      // Step 2: Add to each target playlist
      for (const target of approvedTargets) {
        const targetReport: { locationId: string; status: string; error?: string } = {
          locationId: target.locationId,
          status: "pending",
        };

        try {
          // Get location's yodeck playlist ID
          const location = await db.query.locations.findFirst({
            where: eq(locations.id, target.locationId),
          });

          if (!location?.yodeckPlaylistId) {
            targetReport.status = "failed";
            targetReport.error = "No yodeckPlaylistId configured";
            report.failedCount++;
            report.targets.push(targetReport);
            continue;
          }

          const playlistIdempotencyKey = crypto
            .createHash("sha256")
            .update(`playlist:${planId}:${target.locationId}:${uploadResult.mediaId}`)
            .digest("hex");

          // Parse duration from decimal string
          const durationSeconds = asset.durationSeconds ? parseFloat(String(asset.durationSeconds)) : 10;

          const addResult = await this.addMediaToPlaylist(
            parseInt(location.yodeckPlaylistId),
            uploadResult.mediaId,
            durationSeconds,
            playlistIdempotencyKey,
            target.locationId
          );

          if (!addResult.ok) {
            targetReport.status = "failed";
            targetReport.error = addResult.error;
            report.failedCount++;
          } else {
            targetReport.status = "added_to_playlist";
            report.successCount++;
          }
        } catch (err: any) {
          targetReport.status = "failed";
          targetReport.error = err.message;
          report.failedCount++;
        }

        report.targets.push(targetReport);
      }

      // Update plan status based on results
      report.completedAt = new Date().toISOString();
      report.publishedAt = new Date().toISOString();
      
      const finalStatus = report.failedCount === 0 
        ? "PUBLISHED" 
        : report.successCount > 0 
          ? "PUBLISHED" // Partial success still counts as published
          : "FAILED";

      // Get current plan to check retry count
      const currentPlan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });
      const wasRetry = (currentPlan as any)?.retryCount > 0;

      // Update plan status and clear error fields if this was a successful retry
      await db.update(placementPlans)
        .set({
          status: finalStatus,
          publishedAt: new Date(),
          publishReport: report,
          // Clear error fields after successful publish (cleanup after retry)
          ...(finalStatus === "PUBLISHED" && wasRetry ? {
            lastErrorCode: null,
            lastErrorMessage: null,
            lastErrorDetails: null,
            failedAt: null,
          } : {}),
        })
        .where(eq(placementPlans.id, planId));

      console.log(`[YodeckPublish] Plan ${planId} ${finalStatus}: ${report.successCount}/${report.totalTargets} successful${wasRetry ? ` (retry #${(currentPlan as any)?.retryCount})` : ""}`);
      
      // Log audit event for successful retry resolution
      if (finalStatus === "PUBLISHED" && wasRetry) {
        await logAudit('PLAN_RETRY_RESOLVED', {
          planId: planId,
          advertiserId: plan.advertiserId,
          assetId: plan.adAssetId,
          metadata: {
            retryCount: (currentPlan as any)?.retryCount,
            previousErrorCode: (currentPlan as any)?.lastErrorCode,
          },
        });
      }
      
      // Log audit event
      await logAudit('PLAN_PUBLISHED', {
        advertiserId: plan.advertiserId,
        assetId: plan.adAssetId,
        planId: planId,
        metadata: {
          status: finalStatus,
          successCount: report.successCount,
          totalTargets: report.totalTargets,
          yodeckMediaId: report.yodeckMediaId,
        },
      });
      
      if (finalStatus === "PUBLISHED" && report.successCount > 0) {
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
          : '';
        dispatchMailEvent("ADVERTISER_PUBLISHED", plan.advertiserId, baseUrl)
          .then(result => {
            if (!result.success && !result.skipped) {
              console.warn('[YodeckPublish] Mail dispatch warning:', result.reason);
            }
          })
          .catch(err => console.error('[YodeckPublish] Mail dispatch error:', err));
      }
      
      return report;
    } catch (err: any) {
      report.completedAt = new Date().toISOString();
      console.error(`[YodeckPublish] Plan ${planId} failed:`, err.message);

      // Determine error code from message
      let errorCode = "PUBLISH_FAILED";
      let auditEventType: "PLAN_PUBLISH_FAILED" | "PLAN_PUBLISH_VERIFY_FAILED" = "PLAN_PUBLISH_FAILED";
      
      if (err.message?.includes("Upload failed")) {
        errorCode = "YODECK_UPLOAD_FAILED";
      } else if (err.message?.includes("UPLOAD_OK_BUT_NOT_IN_PLAYLIST")) {
        errorCode = "UPLOAD_OK_BUT_NOT_IN_PLAYLIST";
        auditEventType = "PLAN_PUBLISH_VERIFY_FAILED";
      } else if (err.message?.includes("playlist")) {
        errorCode = "PLAYLIST_ADD_FAILED";
      } else if (err.message?.includes("Asset not found")) {
        errorCode = "ASSET_NOT_FOUND";
      }

      // Get current retry count
      const currentPlan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });
      const currentRetryCount = (currentPlan as any)?.retryCount || 0;

      await db.update(placementPlans)
        .set({
          status: "FAILED",
          failedAt: new Date(),
          retryCount: currentRetryCount + 1,
          lastAttemptAt: new Date(),
          lastErrorCode: errorCode,
          lastErrorMessage: err.message?.substring(0, 500) || "Unknown error",
          lastErrorDetails: { 
            stack: err.stack?.substring(0, 2000),
            report: { ...report, error: err.message }
          },
          publishReport: { ...report, error: err.message } as any,
        })
        .where(eq(placementPlans.id, planId));

      // Log audit event for failure
      await logAudit(auditEventType, {
        planId: planId,
        metadata: {
          errorCode,
          error: err.message,
          failedCount: report.failedCount,
          totalTargets: report.totalTargets,
          retryCount: currentRetryCount + 1,
        },
      });

      throw err;
    }
  }

  /**
   * Rollback a published plan
   */
  async rollbackPlan(planId: string): Promise<{ ok: boolean; error?: string }> {
    console.log(`[YodeckPublish] Rolling back plan ${planId}`);

    try {
      const plan = await db.query.placementPlans.findFirst({
        where: eq(placementPlans.id, planId),
      });

      if (!plan) {
        return { ok: false, error: "Plan not found" };
      }

      const publishReport = plan.publishReport as PublishReport | null;
      if (!publishReport?.yodeckMediaId) {
        return { ok: false, error: "No publish report or media ID found" };
      }

      const mediaId = parseInt(publishReport.yodeckMediaId);

      // Remove media from all playlists where it was added
      for (const target of publishReport.targets) {
        if (target.status === "added_to_playlist") {
          const location = await db.query.locations.findFirst({
            where: eq(locations.id, target.locationId),
          });

          if (location?.yodeckPlaylistId) {
            await this.removeMediaFromPlaylist(parseInt(location.yodeckPlaylistId), mediaId);
          }
        }
      }

      // Update plan status
      await db.update(placementPlans)
        .set({ 
          status: "ROLLED_BACK",
          publishReport: { ...publishReport, rolledBackAt: new Date().toISOString() },
        })
        .where(eq(placementPlans.id, planId));

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }
}

export const yodeckPublishService = new YodeckPublishService();
