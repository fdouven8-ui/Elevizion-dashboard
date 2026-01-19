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
const REQUEST_TIMEOUT = 60000; // 60 seconds for uploads
const MAX_RETRIES = 3;

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
  ): Promise<{ ok: boolean; mediaId?: number; error?: string }> {
    console.log(`[YodeckPublish] Uploading media: ${mediaName} from ${storagePath}`);

    // Check if already uploaded via outbox
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

    // Create outbox record for tracking
    await db.insert(integrationOutbox).values({
      provider: "yodeck",
      actionType: "upload_media",
      entityType: "ad_asset",
      entityId: advertiserId,
      payloadJson: { storagePath, mediaName },
      idempotencyKey,
      status: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    try {
      // Get file from Object Storage
      const storage = new ObjectStorageService();
      const file = await storage.getFileByPath(storagePath);
      
      if (!file) {
        throw new Error("Could not get file from Object Storage");
      }
      
      // Create form data for upload with proper contentType
      const formData = new FormData();
      formData.append("name", mediaName);

      // Always use buffer for Yodeck uploads to guarantee Content-Length
      // Streaming is unreliable with form-data Content-Length calculation
      const [fileBuffer] = await file.download();
      const fileSize = fileBuffer.length;
      console.log(`[YodeckPublish] Downloaded file buffer: ${fileSize} bytes`);
      
      formData.append("file", fileBuffer, { 
        filename: `${mediaName}.mp4`,
        contentType: "video/mp4",  // CRITICAL: must specify video/mp4
        knownLength: fileSize      // Guarantees form-data can calculate Content-Length
      });

      // Upload to Yodeck using axios for proper multipart handling
      const apiKey = await this.getApiKey();
      const url = `${YODECK_BASE_URL}/media`;
      
      console.log(`[YodeckPublish] Uploading to Yodeck API: ${url}`);
      
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
        // Content-Length is required for Yodeck - this should not happen with buffer fallback
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
          timeout: REQUEST_TIMEOUT * 2,  // 2 minute timeout for uploads
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
        const errorMessage = axiosError.response?.data 
          ? (typeof axiosError.response.data === 'string' 
            ? axiosError.response.data 
            : JSON.stringify(axiosError.response.data))
          : axiosError.message;
        const statusCode = axiosError.response?.status || 'N/A';
        
        console.error(`[YodeckPublish] Upload failed: HTTP ${statusCode}`, errorMessage);
        
        await db.update(integrationOutbox)
          .set({ 
            status: "failed",
            lastError: `HTTP ${statusCode}: ${errorMessage}`,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));

        return { ok: false, error: `HTTP ${statusCode}: ${errorMessage}` };
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

    // Check if already added via outbox
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

    // Create outbox record
    await db.insert(integrationOutbox).values({
      provider: "yodeck",
      actionType: "add_to_playlist",
      entityType: "location",
      entityId: locationId,
      payloadJson: { playlistId, mediaId, durationSeconds },
      idempotencyKey,
      status: "processing",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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

      await db.update(integrationOutbox)
        .set({
          status: "succeeded",
          responseJson: { success: true },
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

      if (plan.status !== "APPROVED") {
        throw new Error(`Plan status must be APPROVED, got ${plan.status}`);
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

      await db.update(placementPlans)
        .set({
          status: finalStatus,
          publishedAt: new Date(),
          publishReport: report,
        })
        .where(eq(placementPlans.id, planId));

      console.log(`[YodeckPublish] Plan ${planId} ${finalStatus}: ${report.successCount}/${report.totalTargets} successful`);
      
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

      await db.update(placementPlans)
        .set({
          status: "FAILED",
          publishReport: { ...report, error: err.message } as any,
        })
        .where(eq(placementPlans.id, planId));

      // Log audit event for failure
      await logAudit('PLAN_FAILED', {
        planId: planId,
        metadata: {
          error: err.message,
          failedCount: report.failedCount,
          totalTargets: report.totalTargets,
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
