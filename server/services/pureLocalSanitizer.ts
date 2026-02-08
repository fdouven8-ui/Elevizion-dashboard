import { type YodeckMediaInfo } from "./yodeckMediaMigrationService";
import { buildYodeckCreateMediaPayload, assertNoForbiddenKeys } from "./yodeckPayloadBuilder";

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN?.trim() || "";
const LOG_PREFIX = "[PureLocal]";

export interface PurifyMediaResult {
  mediaId: number;
  cloned: boolean;
  oldMediaId?: number;
  newMediaId?: number;
  reason?: string;
  error?: string;
}

const YODECK_CDN_PATTERNS = [
  "dsbackend.s3.amazonaws.com",
  "yodeck.com",
  "yodeck-",
];

function isYodeckOwnUrl(url: string): boolean {
  return YODECK_CDN_PATTERNS.some(pat => url.includes(pat));
}

function hasProblematicUrlArgs(media: YodeckMediaInfo): boolean {
  const args = media.arguments as any;
  const topLevel = media as any;
  const playUrl = args?.play_from_url || topLevel?.play_from_url;
  if (playUrl && typeof playUrl === "string" && playUrl.startsWith("http")) {
    if (!isYodeckOwnUrl(playUrl)) return true;
  }
  const dlUrl = args?.download_from_url || topLevel?.download_from_url;
  const hasPlayNullOrFalse = args?.play_from_url === false || args?.play_from_url === null;
  if (dlUrl && typeof dlUrl === "string" && dlUrl.startsWith("http") && !hasPlayNullOrFalse) {
    if (!isYodeckOwnUrl(dlUrl)) return true;
  }
  return false;
}

function isLocalVideo(media: YodeckMediaInfo): boolean {
  const origin = media.media_origin;
  if (!origin || typeof origin !== "object") return false;
  return origin.source === "local" && origin.type === "video";
}

export async function ensurePureLocalVideo(
  mediaId: number,
  correlationId: string,
  options?: { skipDetection?: boolean }
): Promise<PurifyMediaResult> {
  const prefix = `${LOG_PREFIX} [${correlationId}]`;
  console.log(`${prefix} PURIFY_CHECK mediaId=${mediaId} skipDetection=${!!options?.skipDetection}`);

  const rawResult = await getMediaRaw(mediaId);
  if (!rawResult.ok || !rawResult.data) {
    console.warn(`${prefix} MEDIA_NOT_FOUND mediaId=${mediaId} http=${rawResult.http} error=${rawResult.error}`);
    return { mediaId, cloned: false, reason: rawResult.notFound ? "MEDIA_NOT_FOUND" : "INSPECT_FAILED", error: rawResult.error };
  }

  const media = rawResult.data;
  const localVid = media.media_origin?.source === "local" && media.media_origin?.type === "video";
  const urlArgs = hasProblematicUrlArgs(media);

  console.log(`${prefix} [INSPECT] mediaId=${mediaId} isLocalVideo=${localVid} hasUrlArgs=${urlArgs} top.play_from_url=${media.play_from_url ?? "null"} top.download_from_url=${media.download_from_url ?? "null"} args=${JSON.stringify(media.arguments)}`);

  if (!options?.skipDetection && !(localVid && urlArgs)) {
    console.log(`${prefix} SKIP mediaId=${mediaId} reason=not_local_video_with_urls (localVid=${localVid}, urlArgs=${urlArgs})`);
    return { mediaId, cloned: false, reason: "NOT_AFFECTED" };
  }

  if (options?.skipDetection) {
    console.log(`${prefix} SKIP_DETECTION: caller already determined media is affected, proceeding to clone`);
  }

  console.log(`${prefix} CLONE_URL_MEDIA_START old=${mediaId}`);

  const downloadUrl = (media.arguments as any)?.download_from_url ||
    (media.arguments as any)?.play_from_url ||
    (media as any)?.download_from_url ||
    (media as any)?.play_from_url;

  let buffer: Buffer | null = null;
  let downloadSource = "none";

  // Try 1: Download from Yodeck URL
  if (downloadUrl && typeof downloadUrl === "string" && downloadUrl.startsWith("http")) {
    console.log(`${prefix} DOWNLOADING from=${downloadUrl.substring(0, 100)}...`);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const dlResp = await fetch(downloadUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (dlResp.ok) {
        const arrayBuf = await dlResp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length > 0) {
          buffer = buf;
          downloadSource = "yodeck_url";
          console.log(`${prefix} DOWNLOADED bytes=${buffer.length} from yodeck_url`);
        }
      } else {
        console.warn(`${prefix} URL download failed: HTTP ${dlResp.status}, trying ObjectStorage fallback...`);
      }
    } catch (err: any) {
      console.warn(`${prefix} URL download exception: ${err.message}, trying ObjectStorage fallback...`);
    }
  }

  // Try 2: Fallback to ObjectStorage (R2) if URL download failed
  if (!buffer) {
    try {
      const { ObjectStorageService, R2_IS_CONFIGURED } = await import("../objectStorage");
      if (R2_IS_CONFIGURED) {
        const r2 = new ObjectStorageService();
        // Search for matching asset in common paths
        const searchPaths = [
          `.private/ads/${mediaId}.mp4`,
          `.private/videos/${mediaId}.mp4`,
          `public/ads/${mediaId}.mp4`,
        ];
        for (const path of searchPaths) {
          try {
            const objResult = await r2.getObjectBuffer(path);
            if (objResult && objResult.buffer.length > 0) {
              buffer = objResult.buffer;
              downloadSource = `r2:${path}`;
              console.log(`${prefix} FALLBACK_R2 bytes=${buffer.length} path=${path}`);
              break;
            }
          } catch {}
        }
      }
      if (!buffer) {
        console.warn(`${prefix} ObjectStorage fallback: no matching file found`);
      }
    } catch (err: any) {
      console.warn(`${prefix} ObjectStorage fallback failed: ${err.message}`);
    }
  }

  if (!buffer) {
    console.warn(`${prefix} SOURCE_UNAVAILABLE: neither URL nor ObjectStorage has the file`);
    return { mediaId, cloned: false, reason: "SOURCE_UNAVAILABLE" };
  }

  const mediaName = `EVZ-PURE-${mediaId}.mp4`;
  const payload = buildYodeckCreateMediaPayload(mediaName);
  assertNoForbiddenKeys(payload, "purifyLocalVideo");

  let newMediaId: number;
  try {
    const createResp = await fetch(`${YODECK_API_BASE}/media/`, {
      method: "POST",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!createResp.ok) {
      const errText = await createResp.text();
      return { mediaId, cloned: false, reason: `CREATE_FAILED_${createResp.status}`, error: errText.substring(0, 300) };
    }
    const createData = await createResp.json();
    newMediaId = createData.id;
    if (!newMediaId) {
      return { mediaId, cloned: false, reason: "CREATE_NO_ID" };
    }
    console.log(`${prefix} CREATED new=${newMediaId}`);
  } catch (err: any) {
    return { mediaId, cloned: false, reason: "CREATE_EXCEPTION", error: err.message };
  }

  let presignedUrl: string;
  try {
    const uploadUrlResp = await fetch(`${YODECK_API_BASE}/media/${newMediaId}/upload`, {
      method: "GET",
      headers: { "Authorization": `Token ${YODECK_TOKEN}`, "Accept": "application/json" },
    });
    if (!uploadUrlResp.ok) {
      return { mediaId, cloned: false, reason: `GET_UPLOAD_URL_FAILED_${uploadUrlResp.status}` };
    }
    const uploadUrlData = await uploadUrlResp.json();
    presignedUrl = uploadUrlData.upload_url;
    if (!presignedUrl) {
      return { mediaId, cloned: false, reason: "NO_UPLOAD_URL" };
    }
    console.log(`${prefix} GOT_UPLOAD_URL host=${new URL(presignedUrl).host}`);
  } catch (err: any) {
    return { mediaId, cloned: false, reason: "GET_UPLOAD_URL_EXCEPTION", error: err.message };
  }

  try {
    const putResp = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": buffer.length.toString() },
      body: buffer,
    });
    if (putResp.status !== 200 && putResp.status !== 204) {
      return { mediaId, cloned: false, reason: `PUT_FAILED_${putResp.status}` };
    }
    console.log(`${prefix} UPLOADED new=${newMediaId} bytes=${buffer.length}`);
  } catch (err: any) {
    return { mediaId, cloned: false, reason: "PUT_EXCEPTION", error: err.message };
  }

  try {
    const completeResp = await fetch(`${YODECK_API_BASE}/media/${newMediaId}/upload/complete`, {
      method: "PUT",
      headers: { "Authorization": `Token ${YODECK_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ upload_url: presignedUrl }),
    });
    console.log(`${prefix} COMPLETE http=${completeResp.status}`);
  } catch (err: any) {
    console.warn(`${prefix} COMPLETE soft fail: ${err.message}`);
  }

  const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed", "finished", "processing", "encoding", "live"];
  const FAILED_STATUSES = ["failed", "error", "aborted", "rejected"];
  const POLL_TIMEOUT = 180_000;
  const POLL_INTERVALS = [2000, 3000, 5000, 8000, 10000, 15000, 15000, 15000, 15000, 15000];
  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < POLL_TIMEOUT) {
    const delay = POLL_INTERVALS[Math.min(attempt, POLL_INTERVALS.length - 1)];
    await new Promise(r => setTimeout(r, delay));
    attempt++;

    try {
      const resp = await fetch(`${YODECK_API_BASE}/media/${newMediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });
      if (resp.status === 404) {
        return { mediaId, cloned: false, reason: "POLL_404" };
      }
      if (!resp.ok) continue;
      const data = await resp.json();
      const status = (data.status || "").toLowerCase();
      console.log(`${prefix} poll ${attempt}: status=${status}`);
      if (READY_STATUSES.includes(status)) break;
      if (FAILED_STATUSES.includes(status)) {
        return { mediaId, cloned: false, reason: `YODECK_STATUS_${status.toUpperCase()}` };
      }
      if (status === "initialized" && attempt > 20) {
        return { mediaId, cloned: false, reason: "INIT_STUCK" };
      }
    } catch {}
  }

  // CRITICAL: Yodeck auto-generates play_from_url/download_from_url after upload.
  // We must PATCH both top-level AND arguments fields to null to force pure-local playback.
  try {
    console.log(`${prefix} PATCH_STRIP_URLS old=${mediaId} new=${newMediaId}`);
    const stripPayload = {
      arguments: {
        play_from_url: null,
        download_from_url: null,
      },
    };
    const patchResp = await fetch(`${YODECK_API_BASE}/media/${newMediaId}/`, {
      method: "PATCH",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stripPayload),
    });
    if (patchResp.ok) {
      console.log(`[Purify] Stripped URL fields from cloned media`, { oldMediaId: mediaId, newMediaId, correlationId });
    } else {
      const errText = await patchResp.text().catch(() => "");
      console.warn(`${prefix} PATCH_STRIP_URLS_WARN new=${newMediaId} http=${patchResp.status} body=${errText.substring(0, 200)}`);
    }
  } catch (err: any) {
    console.warn(`${prefix} PATCH_STRIP_URLS_SOFT_FAIL new=${newMediaId}: ${err.message}`);
  }

  console.log(`${prefix} CLONE_URL_MEDIA old=${mediaId} new=${newMediaId} correlationId=${correlationId}`);
  return { mediaId: newMediaId, cloned: true, oldMediaId: mediaId, newMediaId };
}

export async function deleteMediaById(mediaId: number, correlationId: string): Promise<{ ok: boolean; error?: string }> {
  const prefix = `${LOG_PREFIX} [${correlationId}]`;
  console.log(`${prefix} DELETE_MEDIA_START id=${mediaId}`);

  try {
    const resp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      method: "DELETE",
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });

    if (resp.status === 204 || resp.status === 200) {
      console.log(`${prefix} DELETE_MEDIA_OK id=${mediaId}`);
      return { ok: true };
    }
    if (resp.status === 404) {
      console.log(`${prefix} DELETE_MEDIA_ALREADY_GONE id=${mediaId}`);
      return { ok: true };
    }

    const errText = await resp.text().catch(() => "");
    console.warn(`${prefix} DELETE_MEDIA_FAILED id=${mediaId} http=${resp.status} body=${errText.substring(0, 200)}`);
    return { ok: false, error: `HTTP_${resp.status}: ${errText.substring(0, 200)}` };
  } catch (err: any) {
    console.error(`${prefix} DELETE_MEDIA_EXCEPTION id=${mediaId}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function getMediaRaw(mediaId: number): Promise<{ ok: boolean; data?: any; notFound?: boolean; error?: string; http?: number }> {
  try {
    const resp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });
    if (resp.status === 404) {
      console.warn(`${LOG_PREFIX} [GET_MEDIA_RAW] mediaId=${mediaId} 404 NOT_FOUND`);
      return { ok: false, notFound: true, http: 404, error: "MEDIA_NOT_FOUND" };
    }
    if (!resp.ok) {
      console.warn(`${LOG_PREFIX} [GET_MEDIA_RAW] mediaId=${mediaId} HTTP_${resp.status}`);
      return { ok: false, notFound: false, http: resp.status, error: `HTTP_${resp.status}` };
    }
    const raw = await resp.json();
    const media = raw?.media ?? raw;
    if (!media || (typeof media === "object" && !media.id && !media.name && !media.status)) {
      console.warn(`${LOG_PREFIX} [GET_MEDIA_EMPTY] mediaId=${mediaId} envelope had no usable media object`, { keys: Object.keys(raw || {}) });
      return { ok: false, notFound: true, http: resp.status, error: "MEDIA_EMPTY_RESPONSE" };
    }
    return { ok: true, data: media };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} [GET_MEDIA_RAW] mediaId=${mediaId} exception: ${err.message}`);
    return { ok: false, error: err.message };
  }
}
