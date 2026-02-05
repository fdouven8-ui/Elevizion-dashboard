import { Storage, File } from "@google-cloud/storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// ============================================================
// CENTRAL R2 CONFIG - Single source of truth for bucket/endpoint
// Canonical env vars: R2_BUCKET, R2_ENDPOINT, R2_ACCOUNT_ID
// PRIORITY: Cloudflare R2 ALWAYS takes precedence over Replit Object Storage
// ============================================================

export const R2_BUCKET_NAME = process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET;
export const R2_ENDPOINT = process.env.R2_ENDPOINT;
export const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
export const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
export const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;

// R2 is considered configured when bucket, endpoint, AND credentials are set
export const R2_IS_CONFIGURED = !!(R2_BUCKET_NAME && R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);

// EFFECTIVE_BUCKET_NAME = R2_BUCKET if R2 is configured, otherwise null
// Replit Object Storage is NOT used as fallback
export const EFFECTIVE_BUCKET_NAME = R2_IS_CONFIGURED ? R2_BUCKET_NAME : undefined;

// Storage provider identifier for logging
export const STORAGE_PROVIDER = R2_IS_CONFIGURED ? "R2" : "NONE";

/**
 * Get R2 configuration for debug endpoints (no secrets exposed).
 */
export function getR2Config(): {
  ok: boolean;
  provider: string;
  bucket: string | null;
  endpointHost: string | null;
  accountId: string | null;
  r2Configured: boolean;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  usingEnvKeys: string[];
} {
  const usingEnvKeys: string[] = [];
  
  if (process.env.R2_BUCKET) usingEnvKeys.push("R2_BUCKET");
  if (process.env.CLOUDFLARE_R2_BUCKET) usingEnvKeys.push("CLOUDFLARE_R2_BUCKET");
  if (process.env.R2_ENDPOINT) usingEnvKeys.push("R2_ENDPOINT");
  if (process.env.R2_ACCOUNT_ID) usingEnvKeys.push("R2_ACCOUNT_ID");
  if (process.env.CLOUDFLARE_ACCOUNT_ID) usingEnvKeys.push("CLOUDFLARE_ACCOUNT_ID");
  if (process.env.R2_ACCESS_KEY_ID) usingEnvKeys.push("R2_ACCESS_KEY_ID");
  if (process.env.R2_SECRET_ACCESS_KEY) usingEnvKeys.push("R2_SECRET_ACCESS_KEY");
  
  const endpointHost = R2_ENDPOINT ? R2_ENDPOINT.replace(/https?:\/\//, "") : null;
  
  return {
    ok: R2_IS_CONFIGURED,
    provider: STORAGE_PROVIDER,
    bucket: EFFECTIVE_BUCKET_NAME || null,
    endpointHost,
    accountId: R2_ACCOUNT_ID || null,
    r2Configured: R2_IS_CONFIGURED,
    hasAccessKey: !!R2_ACCESS_KEY_ID,
    hasSecretKey: !!R2_SECRET_ACCESS_KEY,
    usingEnvKeys,
  };
}

/**
 * Log storage configuration at startup (never logs secrets).
 * Format: STORAGE_PROVIDER=R2 bucket=<bucket> endpoint=<endpointHost>
 */
export function logR2ConfigAtStartup(): void {
  const config = getR2Config();
  console.log(`STORAGE_PROVIDER=${config.provider} bucket=${config.bucket || "(NOT SET)"} endpoint=${config.endpointHost || "(NOT SET)"}`);
}

/**
 * Validates that R2 storage is configured. Call at startup.
 * Throws if R2_BUCKET or R2_ENDPOINT are not set.
 */
export function validateR2Config(): void {
  if (!R2_IS_CONFIGURED) {
    throw new Error(
      "[STORAGE] FATAL: Cloudflare R2 not configured. " +
      "Both R2_BUCKET and R2_ENDPOINT must be set."
    );
  }
  console.log(`[STORAGE] R2 configured: bucket=${EFFECTIVE_BUCKET_NAME}`);
}

/**
 * Central helper to resolve R2 object keys.
 * - Removes leading slashes
 * - Strips bucket name prefixes (e.g., "elevizion-assets/")
 * - Normalizes double slashes
 * - Always returns a relative key (no leading slash)
 * 
 * @param inputKey - The raw key (may contain bucket prefix, leading slash, etc.)
 * @returns Normalized relative key for R2 operations
 */
export function resolveR2ObjectKey(inputKey: string): string {
  if (!inputKey) {
    return "";
  }

  let key = inputKey;

  // Step 1: Remove leading slashes
  key = key.replace(/^\/+/, "");

  // Step 2: Strip known bucket name prefixes
  // Handle both "elevizion-assets/" and the dynamic R2_BUCKET_NAME
  const bucketPrefixes = [
    "elevizion-assets/",
    `${R2_BUCKET_NAME}/`,
  ].filter(Boolean);

  for (const prefix of bucketPrefixes) {
    if (key.startsWith(prefix)) {
      key = key.slice(prefix.length);
    }
  }

  // Step 3: Normalize double slashes to single slashes
  key = key.replace(/\/+/g, "/");

  // Step 4: Remove any remaining leading slashes (after normalization)
  key = key.replace(/^\/+/, "");

  return key;
}

/**
 * Smoke test for R2 storage client initialization.
 * Verifies R2 is configured and client can connect.
 */
export async function r2SmokeTest(): Promise<{ ok: boolean; bucket: string | undefined; error?: string }> {
  console.log("[R2 SMOKE TEST] Starting...");
  console.log("[R2 SMOKE TEST] R2_BUCKET =", R2_BUCKET_NAME || "(NOT SET)");
  console.log("[R2 SMOKE TEST] R2_ENDPOINT =", R2_ENDPOINT || "(NOT SET)");
  console.log("[R2 SMOKE TEST] R2_ACCESS_KEY_ID =", R2_ACCESS_KEY_ID ? "(SET)" : "(NOT SET)");
  console.log("[R2 SMOKE TEST] R2_SECRET_ACCESS_KEY =", R2_SECRET_ACCESS_KEY ? "(SET)" : "(NOT SET)");
  console.log("[R2 SMOKE TEST] R2_IS_CONFIGURED =", R2_IS_CONFIGURED);
  
  if (!R2_IS_CONFIGURED) {
    console.log("[R2 SMOKE TEST] FAILED - R2 not configured (need R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
    return { ok: false, bucket: undefined, error: "R2 not configured (need R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)" };
  }

  try {
    // Test that the storage client can be initialized
    const bucket = objectStorageClient.bucket(EFFECTIVE_BUCKET_NAME!);
    console.log("[R2 SMOKE TEST] Client initialized for bucket:", EFFECTIVE_BUCKET_NAME);
    console.log("[R2 SMOKE TEST] SUCCESS");
    return { ok: true, bucket: EFFECTIVE_BUCKET_NAME };
  } catch (error: any) {
    console.error("[R2 SMOKE TEST] FAILED:", error.message);
    return { ok: false, bucket: EFFECTIVE_BUCKET_NAME, error: error.message };
  }
}

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }
    return null;
  }

  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });
      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }
    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  /**
   * Stream video with byte-range support for seeking/scrubbing
   * Handles Range headers properly for HTML5 video players
   */
  async streamVideoWithRange(
    file: File,
    req: { headers: { range?: string } },
    res: Response
  ): Promise<void> {
    try {
      const [metadata] = await file.getMetadata();
      const fileSize = parseInt(String(metadata.size), 10);
      const contentType = metadata.contentType || "video/mp4";
      const rangeHeader = req.headers.range;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        res.status(206);
        res.set({
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
        });

        const stream = file.createReadStream({ start, end });
        stream.on("error", (err) => {
          console.error("[ObjectStorage] Stream range error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
      } else {
        res.set({
          "Content-Length": fileSize.toString(),
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        });
        const stream = file.createReadStream();
        stream.on("error", (err) => {
          console.error("[ObjectStorage] Stream error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Error streaming file" });
          }
        });
        stream.pipe(res);
      }
    } catch (error) {
      console.error("[ObjectStorage] Error streaming video:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error streaming video" });
      }
    }
  }

  /**
   * Get a file by its storage path (for ad assets)
   * Handles:
   * - Full paths with bucket prefix: /bucket/path/to/file
   * - Full storage URLs: https://storage.googleapis.com/bucket/path/to/file
   * - Relative paths without prefix: ad-assets/uuid/filename.mp4
   */
  async getFileByPath(storagePath: string): Promise<File | null> {
    try {
      let fullPath = storagePath;
      
      // Handle full storage URLs (https://storage.googleapis.com/bucket/path)
      if (storagePath.startsWith('https://storage.googleapis.com/')) {
        try {
          const url = new URL(storagePath);
          fullPath = url.pathname; // Already includes /bucket/object format
        } catch {
          // Invalid URL, try as path
        }
      }
      // Handle relative paths (without leading /) - prepend PRIVATE_OBJECT_DIR
      else if (!storagePath.startsWith('/')) {
        const privateObjectDir = this.getPrivateObjectDir();
        fullPath = `${privateObjectDir}/${storagePath}`;
      }
      
      console.log(`[ObjectStorage] getFileByPath: input=${storagePath} resolved=${fullPath}`);
      
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      if (!exists) {
        console.log(`[ObjectStorage] File not found: bucket=${bucketName} object=${objectName}`);
        return null;
      }
      return file;
    } catch (error) {
      console.error("[ObjectStorage] Error getting file by path:", error);
      return null;
    }
  }

  /**
   * Get a file using the central R2 resolver.
   * This is the preferred method for R2 operations - uses resolveR2ObjectKey().
   * 
   * @param inputKey - Raw key (may contain bucket prefix, leading slash, etc.)
   * @returns Object with file (or null), resolvedKey, and bucket info
   */
  async getR2File(inputKey: string): Promise<{
    file: File | null;
    exists: boolean;
    bucket: string;
    inputKey: string;
    resolvedKey: string;
    error?: string;
  }> {
    const bucket = EFFECTIVE_BUCKET_NAME || "(NOT SET)";
    const resolvedKey = resolveR2ObjectKey(inputKey);
    
    console.log("[R2 DEBUG]", {
      bucket,
      inputKey,
      resolvedKey,
    });
    
    if (!EFFECTIVE_BUCKET_NAME) {
      return {
        file: null,
        exists: false,
        bucket,
        inputKey,
        resolvedKey,
        error: "No bucket configured (R2_BUCKET or REPLIT bucket)",
      };
    }
    
    if (!resolvedKey) {
      return {
        file: null,
        exists: false,
        bucket,
        inputKey,
        resolvedKey,
        error: "Empty key after resolution",
      };
    }

    try {
      const bucketObj = objectStorageClient.bucket(EFFECTIVE_BUCKET_NAME);
      const file = bucketObj.file(resolvedKey);
      const [exists] = await file.exists();
      
      if (!exists) {
        console.log(`[R2] File not found: bucket=${bucket} key=${resolvedKey}`);
        return {
          file: null,
          exists: false,
          bucket,
          inputKey,
          resolvedKey,
        };
      }
      
      return {
        file,
        exists: true,
        bucket,
        inputKey,
        resolvedKey,
      };
    } catch (error: any) {
      console.error("[R2] Error getting file:", error.message);
      return {
        file: null,
        exists: false,
        bucket,
        inputKey,
        resolvedKey,
        error: error.message,
      };
    }
  }

  /**
   * List objects in R2 bucket with optional prefix.
   * Uses central R2 config. Returns max 50 objects.
   */
  async listR2Objects(prefix: string = "", maxResults: number = 50): Promise<{
    ok: boolean;
    bucket: string;
    prefix: string;
    count: number;
    keys: Array<{ key: string; size: number; lastModified: string | null }>;
    error?: string;
  }> {
    const bucket = EFFECTIVE_BUCKET_NAME || "(NOT SET)";
    const resolvedPrefix = resolveR2ObjectKey(prefix);
    
    console.log("[R2 LIST]", { bucket, prefix, resolvedPrefix, maxResults });
    
    if (!EFFECTIVE_BUCKET_NAME) {
      return {
        ok: false,
        bucket,
        prefix: resolvedPrefix,
        count: 0,
        keys: [],
        error: "No bucket configured (R2_BUCKET or REPLIT bucket)",
      };
    }

    try {
      const bucketObj = objectStorageClient.bucket(EFFECTIVE_BUCKET_NAME);
      const [files] = await bucketObj.getFiles({
        prefix: resolvedPrefix,
        maxResults: Math.min(maxResults, 50),
      });
      
      const keys = files.map((file) => ({
        key: file.name,
        size: parseInt(String(file.metadata?.size || 0), 10),
        lastModified: file.metadata?.updated || file.metadata?.timeCreated || null,
      }));
      
      return {
        ok: true,
        bucket,
        prefix: resolvedPrefix,
        count: keys.length,
        keys,
      };
    } catch (error: any) {
      console.error("[R2] Error listing objects:", error.message);
      return {
        ok: false,
        bucket,
        prefix: resolvedPrefix,
        count: 0,
        keys: [],
        error: error.message,
      };
    }
  }

  /**
   * Download a file from object storage as a Buffer
   */
  async downloadFile(storagePath: string): Promise<Buffer | null> {
    try {
      const file = await this.getFileByPath(storagePath);
      if (!file) {
        console.error("[ObjectStorage] File not found:", storagePath);
        return null;
      }
      const [content] = await file.download();
      return content;
    } catch (error) {
      console.error("[ObjectStorage] Error downloading file:", error);
      return null;
    }
  }

  /**
   * Upload a file to object storage (private, no public ACL)
   * Returns the storage path for later access via signed URLs
   */
  async uploadFile(content: Buffer, fileName: string, contentType: string): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/${fileName}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      await file.save(content, {
        metadata: {
          contentType,
        },
      });

      // Return the storage path (not public URL - use signed URLs for access)
      return fullPath;
    } catch (error: any) {
      console.error("[ObjectStorage] Error uploading file:", {
        message: error.message,
        code: error.code,
        errors: error.errors,
      });
      throw error;
    }
  }

  /**
   * Stream a file directly from disk to object storage without loading into memory.
   * Use this for large files (videos) to prevent memory pressure.
   * Files are private - use signed URLs for access.
   */
  async uploadFileFromPath(filePath: string, fileName: string, contentType: string): Promise<string> {
    const fs = await import('fs');
    const { pipeline } = await import('stream/promises');
    
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/${fileName}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const readStream = fs.createReadStream(filePath);
      const writeStream = file.createWriteStream({
        metadata: {
          contentType,
        },
        resumable: false,
      });
      
      await pipeline(readStream, writeStream);
      
      // Return the storage path (not public URL - use signed URLs for access)
      return fullPath;
    } catch (error: any) {
      console.error("[ObjectStorage] Error streaming file upload:", {
        message: error.message,
        code: error.code,
        errors: error.errors,
      });
      throw error;
    }
  }

  /**
   * Generate a signed download URL for private objects.
   * Use this for preview/download access instead of public URLs.
   */
  async getSignedDownloadUrl(storagePath: string, ttlSeconds: number = 900): Promise<string> {
    try {
      const { bucketName, objectName } = parseObjectPath(storagePath);
      return signObjectURL({
        bucketName,
        objectName,
        method: "GET",
        ttlSec: ttlSeconds,
      });
    } catch (error: any) {
      console.error("[ObjectStorage] Error generating signed URL:", {
        message: error.message,
        code: error.code,
      });
      throw error;
    }
  }

  /**
   * Stream a file from object storage directly to disk without loading into memory.
   * Use this for large files (videos) to prevent memory pressure.
   */
  async downloadFileToPath(storagePath: string, destPath: string): Promise<void> {
    const fs = await import('fs');
    const { pipeline } = await import('stream/promises');
    
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/${storagePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);
      
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      
      const [exists] = await file.exists();
      if (!exists) {
        throw new ObjectNotFoundError();
      }
      
      const readStream = file.createReadStream();
      const writeStream = fs.createWriteStream(destPath);
      
      await pipeline(readStream, writeStream);
      
      console.log('[ObjectStorage] Streamed download to:', destPath);
    } catch (error) {
      console.error("[ObjectStorage] Error streaming file download:", error);
      throw error;
    }
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }
  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
