import { describe, it, expect } from "vitest";
import { 
  buildYodeckCreateMediaPayload, 
  assertNoForbiddenKeys, 
  sanitizePayload,
  FORBIDDEN_KEYS
} from "./yodeckPayloadBuilder";

describe("buildYodeckCreateMediaPayload", () => {
  it("should return payload with required keys", () => {
    const payload = buildYodeckCreateMediaPayload("test-video.mp4");
    
    expect(payload).toHaveProperty("name");
    expect(payload).toHaveProperty("description");
    expect(payload).toHaveProperty("arguments");
    
    expect(payload.name).toBe("test-video.mp4");
    expect(payload.description).toBe("");
    expect(payload.arguments.buffering).toBe(true);
    expect(payload.arguments.resolution).toBe("highest");
  });

  it("should NOT include any forbidden keys", () => {
    const payload = buildYodeckCreateMediaPayload("test.mp4");
    const payloadKeys = Object.keys(payload);
    
    for (const key of payloadKeys) {
      expect(FORBIDDEN_KEYS.has(key.toLowerCase())).toBe(false);
    }
    
    const forbiddenKeys = [
      "media_origin", "media_type", "origin", "type", "source",
      "mime_type", "file_type", "content_type", "upload_method", "url_type"
    ];
    
    for (const forbidden of forbiddenKeys) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });

  it("should not have undefined or null values", () => {
    const payload = buildYodeckCreateMediaPayload("video.mp4");
    
    expect(payload.name).not.toBeUndefined();
    expect(payload.name).not.toBeNull();
    expect(payload.description).not.toBeUndefined();
    expect(payload.description).not.toBeNull();
  });
});

describe("assertNoForbiddenKeys", () => {
  it("should pass for valid payloads", () => {
    const validPayload = {
      name: "test.mp4",
      description: "",
      arguments: { buffering: true, resolution: "highest" }
    };
    
    expect(() => assertNoForbiddenKeys(validPayload, "test")).not.toThrow();
  });

  it("should throw for payload with media_origin", () => {
    const badPayload = {
      name: "test.mp4",
      media_origin: { type: "video", source: "upload" }
    };
    
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("BLOCKED");
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("media_origin");
  });

  it("should throw for payload with media_type", () => {
    const badPayload = {
      name: "test.mp4",
      media_type: "video"
    };
    
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("BLOCKED");
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("media_type");
  });

  it("should throw for payload with origin", () => {
    const badPayload = { name: "test.mp4", origin: "upload" };
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("origin");
  });

  it("should throw for payload with source", () => {
    const badPayload = { name: "test.mp4", source: "upload" };
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("source");
  });

  it("should throw for payload with mime_type", () => {
    const badPayload = { name: "test.mp4", mime_type: "video/mp4" };
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("mime_type");
  });

  it("should throw for payload with content_type", () => {
    const badPayload = { name: "test.mp4", content_type: "video/mp4" };
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("content_type");
  });

  it("should throw for payload with upload_method", () => {
    const badPayload = { name: "test.mp4", upload_method: "presigned" };
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("upload_method");
  });

  it("should catch case-insensitive forbidden keys", () => {
    const badPayload = { name: "test.mp4", MEDIA_ORIGIN: {} };
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("BLOCKED");
  });

  it("should list multiple forbidden keys in error", () => {
    const badPayload = { 
      name: "test.mp4", 
      media_origin: {}, 
      media_type: "video" 
    };
    expect(() => assertNoForbiddenKeys(badPayload, "test")).toThrow("media_origin");
  });
});

describe("sanitizePayload", () => {
  it("should remove undefined values", () => {
    const payload = {
      name: "test.mp4",
      description: undefined,
      valid: "value"
    };
    
    const sanitized = sanitizePayload(payload);
    expect(sanitized).not.toHaveProperty("description");
    expect(sanitized.name).toBe("test.mp4");
    expect(sanitized.valid).toBe("value");
  });

  it("should remove null values", () => {
    const payload = {
      name: "test.mp4",
      nullValue: null,
      valid: "value"
    };
    
    const sanitized = sanitizePayload(payload);
    expect(sanitized).not.toHaveProperty("nullValue");
  });

  it("should strip forbidden keys as safety net", () => {
    const payload = {
      name: "test.mp4",
      media_origin: { type: "video" },
      media_type: "video"
    };
    
    const sanitized = sanitizePayload(payload);
    expect(sanitized).not.toHaveProperty("media_origin");
    expect(sanitized).not.toHaveProperty("media_type");
    expect(sanitized.name).toBe("test.mp4");
  });

  it("should handle nested objects", () => {
    const payload = {
      name: "test.mp4",
      arguments: {
        buffering: true,
        undefined_key: undefined
      }
    };
    
    const sanitized = sanitizePayload(payload);
    expect(sanitized.arguments).toBeDefined();
    expect((sanitized.arguments as any).buffering).toBe(true);
    expect((sanitized.arguments as any)).not.toHaveProperty("undefined_key");
  });
});

describe("FORBIDDEN_KEYS", () => {
  it("should contain all critical forbidden keys", () => {
    const requiredForbidden = [
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
    ];
    
    for (const key of requiredForbidden) {
      expect(FORBIDDEN_KEYS.has(key)).toBe(true);
    }
  });
});
