import crypto from "crypto";

const LOG_PREFIX = "[SourceCheck]";

export interface VideoSourceValidation {
  valid: boolean;
  sourceUrl: string;
  finalUrl: string;
  headStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  acceptRanges: string | null;
  rangeStatus: number | null;
  rangeContentRange: string | null;
  hasFtyp: boolean;
  ftypOffset: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  checkedAt: string;
  correlationId: string;
  durationMs: number;
}

export function detectMp4Signature(bytes: Buffer): { hasFtyp: boolean; offset: number | null } {
  const searchLen = Math.min(64, bytes.length);
  for (let i = 0; i <= searchLen - 4; i++) {
    if (
      bytes[i] === 0x66 &&     // f
      bytes[i + 1] === 0x74 && // t
      bytes[i + 2] === 0x79 && // y
      bytes[i + 3] === 0x70    // p
    ) {
      return { hasFtyp: true, offset: i };
    }
  }
  return { hasFtyp: false, offset: null };
}

export async function validateVideoSource(
  url: string,
  correlationId?: string
): Promise<VideoSourceValidation> {
  const corrId = correlationId || crypto.randomUUID().substring(0, 8);
  const startTime = Date.now();

  const result: VideoSourceValidation = {
    valid: false,
    sourceUrl: url,
    finalUrl: url,
    headStatus: null,
    contentType: null,
    contentLength: null,
    acceptRanges: null,
    rangeStatus: null,
    rangeContentRange: null,
    hasFtyp: false,
    ftypOffset: null,
    errorCode: null,
    errorMessage: null,
    checkedAt: new Date().toISOString(),
    correlationId: corrId,
    durationMs: 0,
  };

  try {
    console.log(`${LOG_PREFIX}[${corrId}] HEAD ${url.substring(0, 120)}...`);

    const headResp = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    result.headStatus = headResp.status;
    result.contentType = headResp.headers.get("content-type");
    const clHeader = headResp.headers.get("content-length");
    result.contentLength = clHeader ? parseInt(clHeader, 10) : null;
    result.acceptRanges = headResp.headers.get("accept-ranges");
    result.finalUrl = headResp.url || url;

    console.log(
      `${LOG_PREFIX}[${corrId}] HEAD result: status=${result.headStatus} ` +
      `content-type=${result.contentType} content-length=${result.contentLength} ` +
      `accept-ranges=${result.acceptRanges} finalUrl=${result.finalUrl.substring(0, 80)}`
    );

    if (headResp.status >= 400) {
      result.errorCode = "HEAD_FAILED";
      result.errorMessage = `HEAD returned ${headResp.status}`;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    if (result.contentType && result.contentType.includes("text/html")) {
      result.errorCode = "INVALID_SOURCE_HTML";
      result.errorMessage = `Source returns text/html instead of video. Yodeck cannot download this.`;
      result.durationMs = Date.now() - startTime;
      console.error(`${LOG_PREFIX}[${corrId}] INVALID: content-type is text/html`);
      return result;
    }

    console.log(`${LOG_PREFIX}[${corrId}] Range GET bytes=0-2047...`);

    const rangeResp = await fetch(url, {
      method: "GET",
      headers: { "Range": "bytes=0-2047" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    result.rangeStatus = rangeResp.status;
    result.rangeContentRange = rangeResp.headers.get("content-range");

    if (rangeResp.status !== 200 && rangeResp.status !== 206) {
      result.errorCode = "RANGE_FAILED";
      result.errorMessage = `Range GET returned ${rangeResp.status}`;
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const MAX_PROBE_BYTES = 8192;
    const reader = rangeResp.body?.getReader();
    const chunks: Uint8Array[] = [];
    let totalRead = 0;
    if (reader) {
      while (totalRead < MAX_PROBE_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        totalRead += value.length;
      }
      try { reader.cancel(); } catch {} // eslint-disable-line no-empty
    }
    const rangeBytes = Buffer.concat(chunks).subarray(0, MAX_PROBE_BYTES);
    console.log(
      `${LOG_PREFIX}[${corrId}] Range result: status=${result.rangeStatus} ` +
      `content-range=${result.rangeContentRange} bytes=${rangeBytes.length} ` +
      `head32=${rangeBytes.subarray(0, 32).toString("hex")}`
    );

    const rangeContentType = rangeResp.headers.get("content-type");
    if (rangeContentType && rangeContentType.includes("text/html")) {
      result.errorCode = "INVALID_SOURCE_HTML";
      result.errorMessage = `Range GET returns text/html. Source is serving a login page or HTML fallback.`;
      result.durationMs = Date.now() - startTime;
      console.error(`${LOG_PREFIX}[${corrId}] INVALID: Range GET content-type is text/html`);
      return result;
    }

    const sig = detectMp4Signature(rangeBytes);
    result.hasFtyp = sig.hasFtyp;
    result.ftypOffset = sig.offset;

    if (!sig.hasFtyp) {
      result.errorCode = "INVALID_SOURCE_NOT_MP4";
      result.errorMessage = `No ftyp signature found in first ${Math.min(64, rangeBytes.length)} bytes. File is not a valid MP4.`;
      result.durationMs = Date.now() - startTime;
      console.error(`${LOG_PREFIX}[${corrId}] INVALID: no ftyp in first bytes`);
      return result;
    }

    const effectiveContentType = result.contentType || rangeContentType || "";
    if (effectiveContentType && !effectiveContentType.startsWith("video/") && !effectiveContentType.includes("octet-stream")) {
      console.warn(`${LOG_PREFIX}[${corrId}] WARNING: content-type=${effectiveContentType} is not video/* but ftyp found - continuing`);
    }

    result.valid = true;
    result.durationMs = Date.now() - startTime;

    console.log(
      `${LOG_PREFIX}[${corrId}] VALID: ftyp at offset ${sig.offset}, ` +
      `content-type=${result.contentType}, size=${result.contentLength}`
    );

    return result;

  } catch (err: any) {
    result.errorCode = "SOURCE_CHECK_ERROR";
    result.errorMessage = err.message;
    result.durationMs = Date.now() - startTime;
    console.error(`${LOG_PREFIX}[${corrId}] ERROR: ${err.message}`);
    return result;
  }
}
