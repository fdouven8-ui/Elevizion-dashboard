import { buildYodeckCreateMediaPayload, assertNoForbiddenKeys } from "./yodeckPayloadBuilder";
import { ObjectStorageService } from "../objectStorage";

const YODECK_API_BASE = "https://app.yodeck.com/api/v2";
const YODECK_TOKEN = process.env.YODECK_AUTH_TOKEN?.trim() || "";
const LOG_PREFIX = "[MediaMigrate]";
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 120_000;
const POLL_TIMEOUT_MS = 180_000;
const POLL_INTERVALS_MS = [2000, 3000, 5000, 8000, 10000, 15000, 15000, 15000, 15000, 15000];

export interface YodeckMediaInfo {
  id: number;
  name: string;
  status: string;
  media_origin: { type?: string; source?: string; format?: string | null } | string | null;
  arguments: { download_from_url?: string; buffering?: boolean; resolution?: string } | null;
  file_extension: string | null;
  filesize: number;
  get_upload_url: string | null;
}

export interface InspectMediaResult {
  ok: boolean;
  media: YodeckMediaInfo | null;
  notFound: boolean;
  error?: string;
}

export async function inspectMedia(mediaId: number): Promise<InspectMediaResult> {
  console.log(`${LOG_PREFIX} inspectMedia id=${mediaId}`);
  try {
    const resp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
      headers: { "Authorization": `Token ${YODECK_TOKEN}` },
    });
    if (resp.status === 404) {
      return { ok: false, media: null, notFound: true, error: "NOT_FOUND" };
    }
    if (!resp.ok) {
      return { ok: false, media: null, notFound: false, error: `HTTP_${resp.status}` };
    }
    const data = await resp.json();
    const media: YodeckMediaInfo = {
      id: data.id,
      name: data.name || "",
      status: (data.status || "").toLowerCase(),
      media_origin: data.media_origin ?? null,
      arguments: data.arguments ?? null,
      file_extension: data.file_extension || null,
      filesize: data.filesize || data.file_size || 0,
      get_upload_url: data.get_upload_url || null,
    };
    console.log(`${LOG_PREFIX} inspectMedia id=${mediaId} status=${media.status} origin=${JSON.stringify(media.media_origin)} ext=${media.file_extension}`);
    return { ok: true, media, notFound: false };
  } catch (err: any) {
    console.error(`${LOG_PREFIX} inspectMedia error:`, err.message);
    return { ok: false, media: null, notFound: false, error: err.message };
  }
}

export function isPlayableLocal(media: YodeckMediaInfo): boolean {
  const READY_STATUSES = ["finished", "ready", "done", "encoded", "active", "ok", "completed"];
  if (!READY_STATUSES.includes(media.status)) return false;

  const origin = media.media_origin;
  if (!origin) return false;

  if (typeof origin === "object") {
    if (origin.source !== "local") return false;
    if (origin.type !== "video") return false;
  } else if (typeof origin === "string") {
    if (origin !== "my_device" && origin !== "local") return false;
  } else {
    return false;
  }

  if (media.filesize <= 0) return false;

  return true;
}

export interface MigrationResult {
  ok: boolean;
  migrated: boolean;
  oldMediaId: number;
  newMediaId: number | null;
  reason?: string;
  error?: string;
}

export async function ensureMediaIsLocalPlayable(input: {
  mediaId: number;
  fallbackStorageKey?: string | null;
}): Promise<MigrationResult> {
  const { mediaId, fallbackStorageKey } = input;
  const prefix = `${LOG_PREFIX} [migrate-${mediaId}]`;

  console.log(`${prefix} MIGRATE_CHECK old=${mediaId} fallbackKey=${fallbackStorageKey || "none"}`);

  const inspection = await inspectMedia(mediaId);
  if (!inspection.ok || !inspection.media) {
    if (inspection.notFound) {
      return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: "MEDIA_NOT_FOUND" };
    }
    return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: "INSPECT_FAILED", error: inspection.error };
  }

  const media = inspection.media;

  if (isPlayableLocal(media)) {
    console.log(`${prefix} ALREADY_LOCAL_PLAYABLE status=${media.status} source=${JSON.stringify(media.media_origin)}`);
    return { ok: true, migrated: false, oldMediaId: mediaId, newMediaId: mediaId };
  }

  console.log(`${prefix} MIGRATE_START old=${mediaId} status=${media.status} origin=${JSON.stringify(media.media_origin)}`);

  let downloadUrl: string | null = null;
  let downloadSource = "unknown";

  const argsUrl = media.arguments?.download_from_url;
  if (argsUrl && typeof argsUrl === "string" && argsUrl.startsWith("http")) {
    downloadUrl = argsUrl;
    downloadSource = "download_from_url";
  }

  if (!downloadUrl && fallbackStorageKey) {
    try {
      const r2 = new ObjectStorageService();
      const objResult = await r2.getObjectBuffer(fallbackStorageKey);
      if (objResult && objResult.buffer.length > 0) {
        console.log(`${prefix} MIGRATE_SOURCE=storage bytes=${objResult.buffer.length} key=${fallbackStorageKey}`);
        return await migrateFromBuffer(mediaId, media.name, objResult.buffer, "storageBuffer", prefix);
      }
    } catch (err: any) {
      console.warn(`${prefix} Storage fallback failed: ${err.message}`);
    }
  }

  if (!downloadUrl) {
    console.warn(`${prefix} MIGRATE_FAIL NO_SOURCE_URL - no download_from_url and no storage fallback`);
    return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: "NO_SOURCE_URL" };
  }

  console.log(`${prefix} MIGRATE_SOURCE=${downloadSource} url=${downloadUrl.substring(0, 100)}...`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    const dlResp = await fetch(downloadUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!dlResp.ok) {
      console.error(`${prefix} MIGRATE_FAIL DOWNLOAD_HTTP_${dlResp.status}`);
      return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: `DOWNLOAD_FAILED_${dlResp.status}` };
    }

    const contentLength = parseInt(dlResp.headers.get("content-length") || "0");
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      console.error(`${prefix} MIGRATE_FAIL FILE_TOO_LARGE contentLength=${contentLength}`);
      return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: "FILE_TOO_LARGE" };
    }

    const arrayBuf = await dlResp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length === 0) {
      return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: "DOWNLOAD_EMPTY" };
    }
    if (buffer.length > MAX_DOWNLOAD_BYTES) {
      return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: "FILE_TOO_LARGE" };
    }

    console.log(`${prefix} MIGRATE_DOWNLOADED bytes=${buffer.length}`);
    return await migrateFromBuffer(mediaId, media.name, buffer, downloadSource, prefix);

  } catch (err: any) {
    console.error(`${prefix} MIGRATE_FAIL DOWNLOAD_EXCEPTION: ${err.message}`);
    return { ok: false, migrated: false, oldMediaId: mediaId, newMediaId: null, reason: "DOWNLOAD_EXCEPTION", error: err.message };
  }
}

async function migrateFromBuffer(
  oldMediaId: number,
  originalName: string,
  buffer: Buffer,
  source: string,
  prefix: string
): Promise<MigrationResult> {
  const mediaName = `EVZ-MIGRATED-${oldMediaId}.mp4`;

  const payload = buildYodeckCreateMediaPayload(mediaName);
  assertNoForbiddenKeys(payload, "migrateFromBuffer");

  console.log(`${prefix} MIGRATE_CREATE name=${mediaName} bytes=${buffer.length} source=${source}`);

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
      console.error(`${prefix} MIGRATE_CREATE_FAILED http=${createResp.status} body=${errText.substring(0, 300)}`);
      return { ok: false, migrated: false, oldMediaId, newMediaId: null, reason: `CREATE_FAILED_${createResp.status}`, error: errText.substring(0, 300) };
    }

    const createData = await createResp.json();
    newMediaId = createData.id;
    if (!newMediaId) {
      return { ok: false, migrated: false, oldMediaId, newMediaId: null, reason: "CREATE_NO_ID" };
    }
    console.log(`${prefix} MIGRATE_CREATED new=${newMediaId}`);
  } catch (err: any) {
    return { ok: false, migrated: false, oldMediaId, newMediaId: null, reason: "CREATE_EXCEPTION", error: err.message };
  }

  let presignedUrl: string;
  try {
    const uploadUrlResp = await fetch(`${YODECK_API_BASE}/media/${newMediaId}/upload`, {
      method: "GET",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Accept": "application/json",
      },
    });

    if (!uploadUrlResp.ok) {
      const errText = await uploadUrlResp.text();
      console.error(`${prefix} MIGRATE_GET_UPLOAD_URL_FAILED http=${uploadUrlResp.status}`);
      return { ok: false, migrated: false, oldMediaId, newMediaId, reason: `GET_UPLOAD_URL_FAILED_${uploadUrlResp.status}`, error: errText.substring(0, 200) };
    }

    const uploadUrlData = await uploadUrlResp.json();
    presignedUrl = uploadUrlData.upload_url;
    if (!presignedUrl) {
      return { ok: false, migrated: false, oldMediaId, newMediaId, reason: "NO_UPLOAD_URL" };
    }
    console.log(`${prefix} MIGRATE_GOT_UPLOAD_URL host=${new URL(presignedUrl).host}`);
  } catch (err: any) {
    return { ok: false, migrated: false, oldMediaId, newMediaId, reason: "GET_UPLOAD_URL_EXCEPTION", error: err.message };
  }

  try {
    const putResp = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": buffer.length.toString(),
      },
      body: buffer,
    });

    if (putResp.status !== 200 && putResp.status !== 204) {
      const errText = await putResp.text();
      console.error(`${prefix} MIGRATE_PUT_FAILED http=${putResp.status} body=${errText.substring(0, 200)}`);
      return { ok: false, migrated: false, oldMediaId, newMediaId, reason: `PUT_FAILED_${putResp.status}` };
    }
    console.log(`${prefix} MIGRATE_UPLOADED new=${newMediaId} http=${putResp.status} bytes=${buffer.length}`);
  } catch (err: any) {
    return { ok: false, migrated: false, oldMediaId, newMediaId, reason: "PUT_EXCEPTION", error: err.message };
  }

  try {
    const completeResp = await fetch(`${YODECK_API_BASE}/media/${newMediaId}/upload/complete`, {
      method: "PUT",
      headers: {
        "Authorization": `Token ${YODECK_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ upload_url: presignedUrl }),
    });
    console.log(`${prefix} MIGRATE_COMPLETE http=${completeResp.status}`);
  } catch (err: any) {
    console.warn(`${prefix} MIGRATE_COMPLETE soft fail: ${err.message}`);
  }

  const pollResult = await pollUntilReady(newMediaId, prefix);
  if (!pollResult.ok) {
    console.error(`${prefix} MIGRATE_POLL_FAILED reason=${pollResult.reason}`);
    return { ok: false, migrated: false, oldMediaId, newMediaId, reason: pollResult.reason || "POLL_FAILED" };
  }

  console.log(`${prefix} MIGRATE_READY new=${newMediaId} polls=${pollResult.polls}`);
  return { ok: true, migrated: true, oldMediaId, newMediaId };
}

async function pollUntilReady(
  mediaId: number,
  prefix: string
): Promise<{ ok: boolean; reason?: string; polls?: number }> {
  const READY_STATUSES = ["ready", "done", "encoded", "active", "ok", "completed", "finished"];
  const FAILED_STATUSES = ["failed", "error", "aborted", "rejected"];

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const delay = POLL_INTERVALS_MS[Math.min(attempt, POLL_INTERVALS_MS.length - 1)];
    await new Promise(r => setTimeout(r, delay));
    attempt++;

    try {
      const resp = await fetch(`${YODECK_API_BASE}/media/${mediaId}/`, {
        headers: { "Authorization": `Token ${YODECK_TOKEN}` },
      });

      if (resp.status === 404) {
        return { ok: false, reason: "POLL_404" };
      }
      if (!resp.ok) {
        console.log(`${prefix} poll ${attempt}: http=${resp.status}`);
        continue;
      }

      const data = await resp.json();
      const status = (data.status || "").toLowerCase();
      const fileObj = data.file;
      const fileSize = fileObj?.size || fileObj?.file_size || data.filesize || data.file_size || 0;
      const hasFile = fileObj != null && fileSize > 0;
      console.log(`${prefix} poll ${attempt}: status=${status} hasFile=${hasFile} filesize=${fileSize}`);

      if (READY_STATUSES.includes(status) && hasFile) {
        console.log(`${prefix} MIGRATE_READY: status=${status} hasFile=true filesize=${fileSize}`);
        return { ok: true, polls: attempt };
      }
      if (READY_STATUSES.includes(status) && !hasFile) {
        console.log(`${prefix} poll ${attempt}: status=${status} but file not present yet, continuing...`);
        continue;
      }
      if (FAILED_STATUSES.includes(status)) {
        return { ok: false, reason: `YODECK_STATUS_${status.toUpperCase()}` };
      }

      if (status === "initialized" && attempt > 20) {
        return { ok: false, reason: "INIT_STUCK" };
      }
    } catch (err: any) {
      console.warn(`${prefix} poll ${attempt} error: ${err.message}`);
    }
  }

  return { ok: false, reason: "MIGRATE_TIMEOUT" };
}
