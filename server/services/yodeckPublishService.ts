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
  id?: number;
  media?: number;
  type: string;
  duration?: number;
  priority?: number;
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

interface TwoStepUploadDiagnostics {
  metadata: {
    ok: boolean;
    status?: number;
    mediaId?: number;
    rawKeysFound: string[];
    uploadUrlFoundAt: string;
    error?: string;
  };
  binaryUpload: {
    ok: boolean;
    method: 'presigned_put' | 'patch' | 'none';
    status?: number;
    contentTypeSent?: string;
    bytesSent?: number;
    error?: string;
  };
  confirm: {
    attempted: boolean;
    ok: boolean;
    status?: number;
    error?: string;
  };
  lastError?: {
    message: string;
    status?: number;
    bodySnippet?: string;
  };
}

class YodeckPublishService {
  private apiKey: string | null = null;

  private async getApiKey(): Promise<string> {
    if (this.apiKey) return this.apiKey;
    
    // Use centralized token parsing from yodeckClient
    const { getYodeckToken } = await import("./yodeckClient");
    const token = await getYodeckToken();
    
    if (!token.isValid) {
      throw new Error(token.error || "YODECK_AUTH_TOKEN not configured or invalid format");
    }
    
    // Construct label:value token
    this.apiKey = `${token.label}:${token.value}`;
    return this.apiKey;
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
          const contentType = response.headers.get('content-type') || 'unknown';
          return { ok: false, status: response.status, error: `HTTP ${response.status} [${contentType}]: ${errorText}` };
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
   * Helper to normalize MP4 filename - ensures exactly one .mp4 extension
   */
  private normalizeMp4Name(name: string): string {
    // Remove any existing .mp4 extension(s) and add exactly one
    const baseName = name.replace(/\.mp4$/gi, '');
    return `${baseName}.mp4`;
  }

  /**
   * Unified two-step upload function used by both testUpload() and production publish
   * Returns comprehensive diagnostics for debugging
   */
  async twoStepUploadMedia(params: {
    bytes: Buffer;
    name: string;
    contentType?: string;
  }): Promise<{
    ok: boolean;
    mediaId?: number;
    uploadMethodUsed: 'two-step' | 'unknown';
    diagnostics: TwoStepUploadDiagnostics;
  }> {
    const { bytes, name, contentType = 'video/mp4' } = params;
    const fileSize = bytes.length;
    
    // Generate correlation ID for this upload attempt
    const corrId = crypto.randomUUID().substring(0, 8);
    
    // Helper to log Yodeck API calls with masked sensitive data
    const logYodeckCall = (step: string, method: string, url: string, status: number, contentType: string | undefined, body: any) => {
      const safeBody = typeof body === 'string' 
        ? body.substring(0, 2000)
        : JSON.stringify(body || {}).substring(0, 2000);
      // Mask sensitive data
      const maskedBody = safeBody.replace(/[A-Za-z0-9]{20,}/g, '[MASKED]');
      console.log(`[YodeckPublish][${corrId}] ${step} ${method} ${url} status=${status} content-type=${contentType || 'unknown'} body=${maskedBody}`);
    };
    
    const diagnostics: TwoStepUploadDiagnostics = {
      metadata: { ok: false, rawKeysFound: [], uploadUrlFoundAt: 'none' },
      binaryUpload: { ok: false, method: 'none' },
      confirm: { attempted: false, ok: false },
    };
    
    // === STEP 1: Create media metadata ===
    const apiKey = await this.getApiKey();
    const metadataUrl = `${YODECK_BASE_URL}/media`;
    
    const payload = {
      name: name,
      media_origin: {
        type: "video",
        source: "local"
      }
    };
    
    console.log(`[YodeckPublish][${corrId}] Two-step upload: Creating metadata for "${name}" (${fileSize} bytes)`);
    
    let mediaId: number | undefined;
    let uploadUrl: string | undefined;
    
    try {
      const response = await axios.post(metadataUrl, payload, {
        headers: {
          "Authorization": `Token ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 30000,
        validateStatus: () => true, // Don't throw on any status
      });
      
      const data = response.data;
      diagnostics.metadata.status = response.status;
      diagnostics.metadata.rawKeysFound = data ? Object.keys(data) : [];
      
      // Log with observability
      logYodeckCall('METADATA_CREATE', 'POST', metadataUrl, response.status, response.headers['content-type'], data);
      
      if (response.status >= 200 && response.status < 300 && data?.id) {
        mediaId = data.id;
        diagnostics.metadata.ok = true;
        diagnostics.metadata.mediaId = mediaId;
        
        // Search for upload URL in all plausible locations (case-insensitive)
        // IMPORTANT: Yodeck v2 API returns "get_upload_url" as the presigned URL field
        const urlSearchPaths = [
          { path: 'get_upload_url', value: data.get_upload_url },  // Yodeck v2 API standard field
          { path: 'upload_url', value: data.upload_url },
          { path: 'uploadUrl', value: data.uploadUrl },
          { path: 'presigned_url', value: data.presigned_url },
          { path: 'presignedUrl', value: data.presignedUrl },
          { path: 'file_upload_url', value: data.file_upload_url },
          { path: 'file.upload_url', value: data.file?.upload_url },
          { path: 'file.uploadUrl', value: data.file?.uploadUrl },
          { path: 'data.upload_url', value: data.data?.upload_url },
          { path: 'data.file.upload_url', value: data.data?.file?.upload_url },
          { path: 'upload.url', value: data.upload?.url },
          { path: 'upload.upload_url', value: data.upload?.upload_url },
          { path: 'getUploadUrl', value: data.getUploadUrl },  // camelCase variant
        ];
        
        for (const { path, value } of urlSearchPaths) {
          if (value && typeof value === 'string' && value.startsWith('http')) {
            uploadUrl = value;
            diagnostics.metadata.uploadUrlFoundAt = path;
            console.log(`[YodeckPublish] Found upload URL at "${path}"`);
            break;
          }
        }
        
        if (!uploadUrl) {
          console.log(`[YodeckPublish] No upload URL found in response. Available keys: ${diagnostics.metadata.rawKeysFound.join(', ')}`);
        }
      } else {
        diagnostics.metadata.ok = false;
        const errorMessage = data?.error?.message || data?.message || `HTTP ${response.status}`;
        diagnostics.metadata.error = errorMessage;
        diagnostics.lastError = {
          message: errorMessage,
          status: response.status,
          bodySnippet: JSON.stringify(data).substring(0, 500),
        };
        
        return { ok: false, uploadMethodUsed: 'unknown', diagnostics };
      }
    } catch (err: any) {
      diagnostics.metadata.ok = false;
      diagnostics.metadata.error = err.message;
      diagnostics.metadata.status = err.response?.status;
      diagnostics.lastError = {
        message: err.message,
        status: err.response?.status,
        bodySnippet: JSON.stringify(err.response?.data || {}).substring(0, 500),
      };
      
      return { ok: false, uploadMethodUsed: 'unknown', diagnostics };
    }
    
    // === STEP 2: Binary upload ===
    if (uploadUrl) {
      console.log(`[YodeckPublish] Two-step upload: Fetching presigned URL from ${uploadUrl}`);
      diagnostics.binaryUpload.contentTypeSent = contentType;
      diagnostics.binaryUpload.bytesSent = fileSize;
      
      try {
        // Step 2a: Get the actual presigned URL by calling the get_upload_url endpoint
        const getUrlResponse = await axios.get(uploadUrl, {
          headers: {
            "Authorization": `Token ${apiKey}`,
            "Accept": "application/json",
          },
          timeout: 30000,
          validateStatus: () => true,
        });
        
        console.log(`[YodeckPublish] get_upload_url response (${getUrlResponse.status}):`, JSON.stringify(getUrlResponse.data, null, 2));
        
        const urlData = getUrlResponse.data;
        let presignedUrl: string | undefined;
        
        // Search for the actual presigned URL in the response
        const presignedSearchPaths = [
          { path: 'url', value: urlData?.url },
          { path: 'upload_url', value: urlData?.upload_url },
          { path: 'presigned_url', value: urlData?.presigned_url },
          { path: 'data.url', value: urlData?.data?.url },
        ];
        
        for (const { path, value } of presignedSearchPaths) {
          if (value && typeof value === 'string' && value.startsWith('http')) {
            presignedUrl = value;
            console.log(`[YodeckPublish] Found presigned URL at "${path}"`);
            break;
          }
        }
        
        if (!presignedUrl) {
          // No presigned URL found - try raw binary PUT to the upload URL
          console.log(`[YodeckPublish] No presigned URL in response, trying direct PUT with auth`);
          diagnostics.binaryUpload.method = 'presigned_put';
          
          const response = await axios.put(uploadUrl, bytes, {
            headers: {
              "Authorization": `Token ${apiKey}`,
              "Content-Type": contentType,
              "Content-Length": String(fileSize),
            },
            timeout: REQUEST_TIMEOUT,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true,
          });
          
          diagnostics.binaryUpload.status = response.status;
          
          if ([200, 201, 204].includes(response.status)) {
            diagnostics.binaryUpload.ok = true;
            console.log(`[YodeckPublish] Direct PUT succeeded: ${response.status}`);
          } else {
            diagnostics.binaryUpload.ok = false;
            diagnostics.binaryUpload.error = `HTTP ${response.status}`;
            diagnostics.lastError = {
              message: `Direct PUT failed with status ${response.status}`,
              status: response.status,
              bodySnippet: typeof response.data === 'string' ? response.data.substring(0, 500) : JSON.stringify(response.data || {}).substring(0, 500),
            };
          }
        } else {
          // Got presigned URL - PUT binary data to it (no auth needed for presigned)
          console.log(`[YodeckPublish] Uploading ${fileSize} bytes to presigned URL`);
          diagnostics.binaryUpload.method = 'presigned_put';
          
          const response = await axios.put(presignedUrl, bytes, {
            headers: {
              "Content-Type": contentType,
              "Content-Length": String(fileSize),
              // NO Authorization header for presigned URLs (they have signature in URL)
            },
            timeout: REQUEST_TIMEOUT,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
            validateStatus: () => true,
          });
          
          diagnostics.binaryUpload.status = response.status;
          
          // 200, 201, 204 are all success for presigned uploads
          if ([200, 201, 204].includes(response.status)) {
            diagnostics.binaryUpload.ok = true;
            console.log(`[YodeckPublish] Presigned PUT succeeded: ${response.status}`);
          } else {
            diagnostics.binaryUpload.ok = false;
            diagnostics.binaryUpload.error = `HTTP ${response.status}`;
            diagnostics.lastError = {
              message: `Presigned PUT failed with status ${response.status}`,
              status: response.status,
              bodySnippet: typeof response.data === 'string' ? response.data.substring(0, 500) : JSON.stringify(response.data || {}).substring(0, 500),
            };
          }
        }
      } catch (err: any) {
        diagnostics.binaryUpload.ok = false;
        diagnostics.binaryUpload.error = err.message;
        diagnostics.binaryUpload.status = err.response?.status;
        diagnostics.lastError = {
          message: err.message,
          status: err.response?.status,
          bodySnippet: JSON.stringify(err.response?.data || {}).substring(0, 500),
        };
      }
    } else {
      // No upload URL - fail with clear error (don't silently try PATCH)
      // Per requirements: if no uploadUrl -> fail with clear error
      diagnostics.binaryUpload.ok = false;
      diagnostics.binaryUpload.method = 'none';
      diagnostics.binaryUpload.error = 'No upload URL provided in metadata response';
      diagnostics.lastError = {
        message: 'Yodeck did not return an upload URL in the metadata response. Binary upload cannot proceed.',
        status: undefined,
      };
      
      console.log(`[YodeckPublish] FAIL: No upload URL in metadata response. Cannot upload binary.`);
    }
    
    // === STEP 3: Optional confirm (non-blocking) ===
    // Only attempt if binary upload succeeded
    if (diagnostics.binaryUpload.ok && mediaId) {
      console.log(`[YodeckPublish] Two-step upload: Attempting optional confirm`);
      diagnostics.confirm.attempted = true;
      
      const confirmEndpoints = [
        `${YODECK_BASE_URL}/media/${mediaId}/confirm`,
        `${YODECK_BASE_URL}/media/${mediaId}/upload/complete`,
      ];
      
      for (const endpoint of confirmEndpoints) {
        try {
          const response = await axios.post(endpoint, {}, {
            headers: {
              "Authorization": `Token ${apiKey}`,
              "Content-Type": "application/json"
            },
            timeout: 10000,
            validateStatus: () => true,
          });
          
          diagnostics.confirm.status = response.status;
          
          if ([200, 201, 204].includes(response.status)) {
            diagnostics.confirm.ok = true;
            console.log(`[YodeckPublish] Confirm succeeded at ${endpoint}`);
            break;
          } else if ([404, 405].includes(response.status)) {
            // Endpoint doesn't exist, try next
            continue;
          }
        } catch (err: any) {
          diagnostics.confirm.error = err.message;
          continue;
        }
      }
      
      // If no confirm endpoint worked, that's OK - it's optional
      if (!diagnostics.confirm.ok) {
        console.log(`[YodeckPublish] No confirm endpoint available (this is OK)`);
        diagnostics.confirm.ok = true; // Mark as OK since it's optional
      }
    }
    
    // === Final result ===
    // uploadOk = metadata.ok AND binaryUpload.ok (confirm is optional)
    const uploadOk = diagnostics.metadata.ok && diagnostics.binaryUpload.ok;
    
    console.log(`[YodeckPublish] Two-step upload complete: uploadOk=${uploadOk}, mediaId=${mediaId}`);
    
    return {
      ok: uploadOk,
      mediaId: uploadOk ? mediaId : undefined,
      uploadMethodUsed: uploadOk ? 'two-step' : 'unknown',
      diagnostics,
    };
  }

  /**
   * Perform single upload attempt to Yodeck
   * Supports different media_origin formats for API compatibility
   */
  private async attemptYodeckUpload(
    fileBuffer: Buffer,
    normalizedName: string,
    filename: string,
    fileSize: number,
    mediaOriginFormat: 'none' | 'json' | 'nested' = 'none'
  ): Promise<{ 
    ok: boolean; 
    mediaId?: number; 
    error?: string; 
    errorCode?: string; 
    errorDetails?: any;
    yodeckErrorCode?: string;
    yodeckMissingField?: string;
    yodeckInvalidField?: string;
  }> {
    const formData = new FormData();
    const uploadFields: string[] = ['name'];
    
    formData.append("name", normalizedName);
    
    // Add media_origin in the specified format
    if (mediaOriginFormat === 'json') {
      // JSON-stringified object format
      const mediaOriginObj = { source: "local", type: "video" };
      formData.append("media_origin", JSON.stringify(mediaOriginObj));
      uploadFields.push('media_origin (JSON object)');
    } else if (mediaOriginFormat === 'nested') {
      // Nested multipart fields format
      formData.append("media_origin[source]", "local");
      formData.append("media_origin[type]", "video");
      uploadFields.push('media_origin[source]', 'media_origin[type]');
    }
    // 'none' = no media_origin field
    
    formData.append("file", fileBuffer, { 
      filename,
      contentType: "video/mp4",
      knownLength: fileSize
    });
    uploadFields.push('file');
    
    console.log(`[YodeckPublish] Upload attempt (format=${mediaOriginFormat}): fields=[${uploadFields.join(', ')}] name="${normalizedName}" file="${filename}" size=${fileSize}`);
    
    const apiKey = await this.getApiKey();
    const url = `${YODECK_BASE_URL}/media`;
    
    let contentLength: number;
    try {
      contentLength = await new Promise<number>((resolve, reject) => {
        formData.getLength((err: Error | null, length: number) => {
          if (err) reject(err);
          else resolve(length);
        });
      });
    } catch (lengthErr) {
      return { ok: false, error: "Could not calculate Content-Length", errorCode: "CONTENT_LENGTH_FAILED" };
    }
    
    const headers: Record<string, string> = {
      "Authorization": `Token ${apiKey}`,
      "Content-Length": String(contentLength),
      ...formData.getHeaders()
    };
    
    try {
      const response = await axios.post<YodeckMediaUploadResponse>(url, formData, {
        headers,
        timeout: REQUEST_TIMEOUT,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      
      const data = response.data;
      if (!data?.id) {
        return { ok: false, error: "Upload response missing media ID", errorCode: "NO_MEDIA_ID" };
      }
      
      console.log(`[YodeckPublish] Upload successful, mediaId=${data.id}`);
      return { ok: true, mediaId: data.id };
    } catch (axiosError: any) {
      const statusCode = axiosError.response?.status || 'N/A';
      const responseData = axiosError.response?.data;
      
      let errorCode = "YODECK_UPLOAD_FAILED";
      let errorMessage = axiosError.message;
      let errorDetails: any = { 
        sentFields: uploadFields, 
        url, 
        statusCode, 
        format: mediaOriginFormat,
        requestHeaders: Object.keys(headers).filter(k => k !== 'Authorization'), // Log header keys (no secrets)
      };
      let yodeckErrorCode: string | undefined;
      let yodeckMissingField: string | undefined;
      let yodeckInvalidField: string | undefined;
      
      if (responseData) {
        // Capture full error structure from Yodeck
        errorDetails.yodeckError = responseData.error || responseData;
        
        // Try to parse structured error
        const yodeckErr = responseData.error || responseData;
        yodeckErrorCode = yodeckErr?.code;
        
        // Log full error details for debugging
        console.error(`[YodeckPublish] HTTP ${statusCode} | Full Yodeck error:`, JSON.stringify(responseData, null, 2));
        
        // Parse missing_key (err_1002) - could be any field, not just media_origin
        if (yodeckErr?.code === "err_1002") {
          const missingKey = yodeckErr?.details?.missing_key || yodeckErr?.message?.match(/Missing field[:\s]+(\w+)/i)?.[1];
          if (missingKey) {
            yodeckMissingField = missingKey;
            errorCode = "YODECK_MISSING_FIELD";
            errorMessage = `Yodeck API requires field: ${missingKey}`;
            errorDetails.missingField = missingKey;
          }
        }
        // Parse invalid_field (err_1003) - could be any field
        else if (yodeckErr?.code === "err_1003") {
          const invalidField = yodeckErr?.details?.invalid_field || yodeckErr?.message?.match(/Invalid field[:\s]+(\w+)/i)?.[1];
          if (invalidField) {
            yodeckInvalidField = invalidField;
            errorCode = "YODECK_INVALID_FIELD";
            errorMessage = `Yodeck API rejects field: ${invalidField}`;
            errorDetails.invalidField = invalidField;
          }
        }
        // Check for generic missing fields in message
        else if (typeof yodeckErr?.message === 'string' && yodeckErr.message.toLowerCase().includes('missing field')) {
          const match = yodeckErr.message.match(/Missing field[:\s]+(\w+)/i);
          if (match) {
            yodeckMissingField = match[1];
            errorCode = "YODECK_MISSING_FIELD";
            errorMessage = `Yodeck API requires field: ${match[1]}`;
            errorDetails.missingField = match[1];
          }
        }
        // Check for other required fields (e.g., workspace, media_type)
        else if (yodeckErr?.details?.required_fields) {
          errorDetails.requiredFields = yodeckErr.details.required_fields;
          errorMessage = `Yodeck requires fields: ${yodeckErr.details.required_fields.join(', ')}`;
        }
        // Fallback: use raw message
        else {
          errorMessage = yodeckErr?.message || (typeof responseData === 'string' ? responseData : JSON.stringify(responseData));
        }
      } else {
        console.error(`[YodeckPublish] HTTP ${statusCode} | URL: ${url} | Network error: ${errorMessage}`);
      }
      
      return { ok: false, error: errorMessage, errorCode, errorDetails, yodeckErrorCode, yodeckMissingField, yodeckInvalidField };
    }
  }

  /**
   * Upload a video file from Object Storage to Yodeck
   * Uses adaptive retry strategy:
   * 1. First attempt: name + file only
   * 2. If Yodeck says media_origin is missing (err_1002): retry with media_origin
   * 3. Never include media_origin if it was previously rejected (err_1003)
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
      
      // Download file to buffer (required for potential retry)
      const [fileBuffer] = await file.download();
      const fileSize = fileBuffer.length;
      
      if (fileSize > BUFFER_FALLBACK_MAX_BYTES) {
        throw new Error(`File too large (${(fileSize / 1024 / 1024).toFixed(1)}MB > ${BUFFER_FALLBACK_MAX_BYTES / 1024 / 1024}MB)`);
      }
      
      console.log(`[YodeckPublish] File loaded: ${fileSize} bytes`);
      
      // Normalize name
      const normalizedName = this.normalizeMp4Name(mediaName);
      
      // === Use shared two-step upload ===
      const uploadResult = await this.twoStepUploadMedia({
        bytes: fileBuffer,
        name: normalizedName,
        contentType: 'video/mp4',
      });
      
      if (!uploadResult.ok || !uploadResult.mediaId) {
        await db.update(integrationOutbox)
          .set({ 
            status: "failed",
            lastError: JSON.stringify({ 
              code: "TWO_STEP_UPLOAD_FAILED", 
              diagnostics: uploadResult.diagnostics
            }),
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        const lastError = uploadResult.diagnostics.lastError;
        return { 
          ok: false, 
          error: lastError?.message || "Two-step upload failed", 
          errorCode: "TWO_STEP_UPLOAD_FAILED",
          errorDetails: uploadResult.diagnostics
        };
      }
      
      // Success!
      await db.update(integrationOutbox)
        .set({
          status: "succeeded",
          externalId: String(uploadResult.mediaId),
          responseJson: { 
            mediaId: uploadResult.mediaId, 
            method: uploadResult.uploadMethodUsed,
            diagnostics: uploadResult.diagnostics
          },
          processedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
      
      console.log(`[YodeckPublish] Two-step upload SUCCESS: mediaId=${uploadResult.mediaId}`);
      return { ok: true, mediaId: uploadResult.mediaId };
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

      // Get raw items from response - preserve ALL fields exactly as Yodeck returned them
      const rawData = getResult.data as any;
      const rawItems = rawData?.items || [];
      
      // Extract items_url if available for dynamic endpoint
      const itemsUrl = rawData?.items_url || rawData?.related?.items || null;
      
      // Log first item keys for debugging
      const firstItemKeys = rawItems.length > 0 ? Object.keys(rawItems[0]).join(',') : 'none';
      console.log(`[YodeckPublish] PLAYLIST_GET itemsCount=${rawItems.length} firstItemKeys=${firstItemKeys} itemsUrl=${itemsUrl || 'none'}`);
      
      // Check if media already exists in playlist (check both id and media fields)
      const alreadyExists = rawItems.some((item: any) => 
        (item.id === mediaId || item.media === mediaId) && item.type === "media"
      );
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

      // Determine next priority: max of existing priorities + 1 (or 1 if no items)
      const existingPriorities = rawItems
        .map((item: any) => item.priority)
        .filter((p: any): p is number => typeof p === 'number');
      const nextPriority = existingPriorities.length > 0 
        ? Math.max(...existingPriorities) + 1 
        : 1;

      // Build new item payload for POST create endpoint
      const newItemPayload = { 
        media: mediaId, 
        type: "media", 
        duration: durationSeconds,
        priority: nextPriority
      };
      
      // Try multiple POST endpoints in order (stop when one works)
      // Include dynamic items_url from GET response if available
      const createEndpoints: Array<{ path: string; payload: any }> = [];
      
      // If items_url from GET response, try it first (most reliable)
      if (itemsUrl) {
        try {
          // Extract relative path from full URL if needed
          const relativePath = itemsUrl.startsWith('http') 
            ? new URL(itemsUrl).pathname.replace('/api/v2', '')
            : itemsUrl;
          createEndpoints.push({ path: relativePath, payload: newItemPayload });
        } catch (e) {
          // If URL parsing fails, skip this endpoint (fallbacks will still be tried)
          console.log(`[YodeckPublish] Could not parse items_url: ${itemsUrl}`);
        }
      }
      
      // Standard endpoints as fallback
      createEndpoints.push(
        { path: `/playlists/${playlistId}/items`, payload: newItemPayload },
        { path: `/playlists/${playlistId}/items/`, payload: newItemPayload },
        { path: `/playlist_items`, payload: { ...newItemPayload, playlist: playlistId } },
      );
      
      let createResult: { ok: boolean; data?: any; error?: string; status?: number } | null = null;
      let successEndpoint: string | null = null;
      
      const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
      
      for (const endpoint of createEndpoints) {
        const fullUrl = `${YODECK_API_BASE}${endpoint.path}`;
        console.log(`[YodeckPublish] PLAYLIST_ITEM_CREATE attempting POST url=${fullUrl} payload=${JSON.stringify(endpoint.payload)}`);
        
        const result = await this.makeRequest<any>("POST", endpoint.path, endpoint.payload);
        
        if (result.ok) {
          createResult = result;
          successEndpoint = fullUrl;
          break;
        }
        
        // Log the error with full URL
        const bodySnippet = result.error?.substring(0, 200) || 'unknown';
        console.log(`[YodeckPublish] PLAYLIST_ITEM_CREATE url=${fullUrl} status=${result.status} bodySnippet=${bodySnippet}`);
        
        // If not 404, this endpoint exists but request failed - use this result
        if (result.status !== 404) {
          createResult = result;
          break;
        }
      }
      
      if (!createResult || !createResult.ok) {
        const errorCode = "YODECK_PLAYLIST_ITEM_CREATE_FAILED";
        const errorMsg = createResult?.error || "No playlist item create endpoint found";
        console.error(`[YodeckPublish] ${errorCode}: ${errorMsg}`);
        
        // Persist error in outbox (lastError includes error code prefix)
        await db.update(integrationOutbox)
          .set({
            status: "failed",
            lastError: `${errorCode}: ${errorMsg}`,
            processedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(integrationOutbox.idempotencyKey, idempotencyKey));
        
        return { ok: false, error: `${errorCode}: ${errorMsg}` };
      }
      
      // Extract created item ID from response
      const createdItemId = createResult.data?.id;
      console.log(`[YodeckPublish] PLAYLIST_ITEM_CREATE success endpoint=${successEndpoint} createdItemId=${createdItemId}`)

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
      const mediaFound = verifiedItems.some(item => 
        (item.id === mediaId || item.media === mediaId) && item.type === "media"
      );
      
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

      const currentItems: YodeckPlaylistItem[] = getResult.data?.items || [];
      const filteredItems = currentItems.filter(item => 
        !((item.id === mediaId || item.media === mediaId) && item.type === "media")
      );

      if (filteredItems.length === currentItems.length) {
        // Media wasn't in playlist
        return { ok: true };
      }

      // Ensure priority is preserved for remaining items
      const itemsWithPriority = filteredItems.map((item, index) => ({
        ...item,
        priority: item.priority ?? (index + 1),
      }));

      const patchResult = await this.makeRequest(
        "PATCH",
        `/playlists/${playlistId}`,
        { items: itemsWithPriority }
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

  /**
   * Test upload to verify Yodeck API accepts our two-step upload flow
   * Creates a minimal test video and uses the shared twoStepUploadMedia function
   * Returns detailed diagnostics matching the required response format
   */
  async testUpload(): Promise<{
    screensOk: boolean;
    metadata: {
      ok: boolean;
      status?: number;
      mediaId?: number;
      rawKeysFound: string[];
      uploadUrlFoundAt: string;
      error?: string;
    };
    binaryUpload: {
      ok: boolean;
      method: 'presigned_put' | 'patch' | 'none';
      status?: number;
      contentTypeSent?: string;
      bytesSent?: number;
      error?: string;
    };
    confirm: {
      attempted: boolean;
      ok: boolean;
      status?: number;
      error?: string;
    };
    uploadOk: boolean;
    uploadMethodUsed: 'two-step' | 'unknown';
    lastError?: {
      message: string;
      status?: number;
      bodySnippet?: string;
    };
    yodeckMediaId?: number;
  }> {
    console.log(`[YodeckPublish] Running two-step upload test...`);
    
    // Create a minimal test video using ffmpeg (1 second, 100x100, black)
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);
    const fs = await import("fs/promises");
    const path = await import("path");
    
    const testFileName = `yodeck-test-${Date.now()}.mp4`;
    const testFilePath = path.join("/tmp", testFileName);
    
    try {
      // Generate a minimal test video (1 second, 100x100 black frame)
      await execAsync(
        `ffmpeg -y -f lavfi -i color=c=black:s=100x100:d=1 -c:v libx264 -pix_fmt yuv420p -t 1 "${testFilePath}"`,
        { timeout: 30000 }
      );
      
      const fileBuffer = await fs.readFile(testFilePath);
      console.log(`[YodeckPublish] Test video created: ${fileBuffer.length} bytes`);
      
      // Use the shared two-step upload function
      const result = await this.twoStepUploadMedia({
        bytes: fileBuffer,
        name: testFileName,
        contentType: 'video/mp4',
      });
      
      // Clean up test media from Yodeck if upload succeeded
      if (result.mediaId) {
        try {
          const apiKey = await this.getApiKey();
          await axios.delete(`${YODECK_BASE_URL}/media/${result.mediaId}`, {
            headers: { "Authorization": `Token ${apiKey}` },
            timeout: 10000,
          });
          console.log(`[YodeckPublish] Test media cleaned up from Yodeck`);
        } catch (cleanupErr: any) {
          console.log(`[YodeckPublish] Could not clean up test media: ${cleanupErr.message}`);
        }
      }
      
      // Clean up local test file
      await fs.unlink(testFilePath).catch(() => {});
      
      return {
        screensOk: true, // We already have screen access if we got this far
        metadata: result.diagnostics.metadata,
        binaryUpload: result.diagnostics.binaryUpload,
        confirm: result.diagnostics.confirm,
        uploadOk: result.ok,
        uploadMethodUsed: result.uploadMethodUsed,
        lastError: result.diagnostics.lastError,
        yodeckMediaId: result.mediaId,
      };
    } catch (err: any) {
      // Clean up on error
      const fs = await import("fs/promises");
      await fs.unlink(testFilePath).catch(() => {});
      
      console.error(`[YodeckPublish] Upload test error:`, err.message);
      return {
        screensOk: true,
        metadata: { ok: false, rawKeysFound: [], uploadUrlFoundAt: 'none', error: err.message },
        binaryUpload: { ok: false, method: 'none', error: err.message },
        confirm: { attempted: false, ok: false },
        uploadOk: false,
        uploadMethodUsed: 'unknown',
        lastError: { message: err.message },
      };
    }
  }
}

export const yodeckPublishService = new YodeckPublishService();
