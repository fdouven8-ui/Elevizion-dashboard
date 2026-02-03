/**
 * Canonical Yodeck Payload Builder
 * 
 * This module provides a single source of truth for building Yodeck create-media payloads.
 * For presigned uploads, Yodeck determines the media origin automatically.
 * 
 * CRITICAL: Do NOT add media_origin, media_type, or any origin-related fields.
 * These cause err_1003 "invalid_field" errors with presigned uploads.
 */

export const FORBIDDEN_KEYS = new Set([
  "media_origin",
  "media_type", 
  "origin",
  "type",
  "source",
  "mime_type",
  "file_type",
  "content_type",
  "upload_method",
  "url_type"
]);

export interface YodeckCreateMediaPayload {
  name: string;
  description: string;
  arguments: {
    buffering: boolean;
    resolution: string;
  };
}

/**
 * Build a clean payload for POST /api/v2/media (presigned upload flow)
 * Returns ONLY the fields Yodeck accepts for this flow.
 */
export function buildYodeckCreateMediaPayload(name: string): YodeckCreateMediaPayload {
  return {
    name,
    description: "",
    arguments: {
      buffering: true,
      resolution: "highest"
    }
  };
}

/**
 * Assert that a payload does NOT contain any forbidden keys.
 * Throws immediately if forbidden keys are found - fail fast before API call.
 */
export function assertNoForbiddenKeys(payload: object, context: string): void {
  const keys = Object.keys(payload);
  const forbidden = keys.filter(k => FORBIDDEN_KEYS.has(k.toLowerCase()));
  
  if (forbidden.length > 0) {
    throw new Error(
      `[YodeckPayload] BLOCKED: Payload for ${context} contains forbidden keys: ${forbidden.join(", ")}. ` +
      `These cause err_1003 errors. Remove them before calling Yodeck API.`
    );
  }
}

/**
 * Deep sanitize an object by removing undefined and null values.
 * Also removes any forbidden keys as a safety net.
 */
export function sanitizePayload<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      console.warn(`[YodeckPayload] WARN: Stripped forbidden key "${key}" from payload`);
      continue;
    }
    
    if (value === undefined || value === null) {
      continue;
    }
    
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizePayload(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else {
      result[key] = value;
    }
  }
  
  return result as Partial<T>;
}

/**
 * Log the create-media payload for debugging.
 * Shows both full JSON and keys for easy verification.
 */
export function logCreateMediaPayload(payload: YodeckCreateMediaPayload, correlationId?: string): void {
  const prefix = correlationId ? `[${correlationId}]` : "";
  console.log(`[YodeckPayload]${prefix} CREATE_MEDIA payload:`, JSON.stringify(payload, null, 2));
  console.log(`[YodeckPayload]${prefix} CREATE_MEDIA payload keys:`, Object.keys(payload).join(", "));
}
