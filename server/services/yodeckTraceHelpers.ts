/**
 * Yodeck Trace Helpers — forensic Sentry instrumentation for publish pipeline.
 *
 * To find breadcrumbs for a specific publish attempt in Sentry:
 *   Search by tag: correlationId = "publish-{assetId}-{timestamp}"
 *   Category filter: "yodeck"
 */

import * as Sentry from "@sentry/node";

export type YodeckFlow = "publish" | "retryPublish" | "admin-trace";

export interface TraceStepInput {
  correlationId: string;
  assetId?: string;
  mediaId?: number;
  step: string;
  ok: boolean;
  durationMs?: number;
  flow?: YodeckFlow;
  data?: Record<string, any>;
}

export function logYodeckStep(input: TraceStepInput): void {
  const { correlationId, assetId, mediaId, step, ok, durationMs, flow, data } = input;

  const prefix = `[YodeckTrace][${correlationId}]`;
  const suffix = durationMs !== undefined ? ` (${durationMs}ms)` : "";
  const msg = `${prefix} ${step} ok=${ok}${suffix}`;

  if (ok) {
    console.info(msg, data ? JSON.stringify(data) : "");
  } else {
    console.error(msg, data ? JSON.stringify(data) : "");
  }

  Sentry.addBreadcrumb({
    category: "yodeck",
    message: `${step} ok=${ok}${suffix}`,
    level: ok ? "info" : "error",
    data: {
      correlationId,
      assetId,
      mediaId,
      step,
      ok,
      durationMs,
      ...data,
    },
  });

  if (!ok) {
    Sentry.captureMessage(`[YodeckTrace] ${step} failed`, {
      level: "error",
      tags: {
        component: "yodeck",
        flow: flow || "publish",
        step,
        ...(assetId ? { assetId } : {}),
        ...(mediaId ? { mediaId: String(mediaId) } : {}),
        correlationId,
      },
      extra: {
        correlationId,
        assetId,
        mediaId,
        step,
        durationMs,
        ...data,
      },
    });
  }
}

export function sanitizeUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split("?")[0];
  }
}

export function pickMediaFields(media: any): Record<string, any> {
  if (!media) return {};
  return {
    id: media.id,
    name: media.name,
    status: media.status ?? media.media_status ?? media.encoding_status,
    fileSize: media.file_size ?? media.fileSize ?? media.size,
    duration: media.duration ?? media.file_duration,
    mimeType: media.mime_type ?? media.type ?? media.content_type,
    createdAt: media.created_at ?? media.createdAt,
    updatedAt: media.updated_at ?? media.updatedAt,
    mediaOriginSource: media.media_origin?.source,
    hasDownloadUrl: !!(media.media_origin?.download_from_url || media.download_from_url),
    error: media.error ?? media.message,
    encodingProgress: media.encoding_progress ?? media.progress,
    isReady: media.is_ready,
  };
}

export function pickUploadFields(resp: any): Record<string, any> {
  if (!resp) return {};
  const rawUrl = resp.upload_url || resp.url;
  return {
    hasUploadUrl: !!rawUrl,
    uploadUrlHost: rawUrl ? (() => { try { return new URL(rawUrl).hostname; } catch { return "unknown"; } })() : undefined,
    expiresAt: resp.expires_at ?? resp.expiry,
    method: resp.method ?? resp.type,
  };
}

export function pickPlaylistFields(playlist: any): Record<string, any> {
  if (!playlist) return {};
  return {
    id: playlist.id,
    name: playlist.name,
    itemsCount: playlist.items?.length ?? playlist.items_count ?? playlist.itemsCount,
  };
}

export function makePublishCorrelationId(assetId: string): string {
  return `publish-${assetId}-${Date.now()}`;
}

export function traceExternalCall(opts: {
  correlationId: string;
  method: string;
  url: string;
  statusCode?: number;
  durationMs: number;
  retryAttempt?: number;
  responseSummary?: Record<string, any>;
}): void {
  Sentry.addBreadcrumb({
    category: "yodeck",
    message: `${opts.method} ${sanitizeUrl(opts.url)} → ${opts.statusCode ?? "?"}`,
    level: (opts.statusCode && opts.statusCode >= 400) ? "warning" : "info",
    data: {
      correlationId: opts.correlationId,
      method: opts.method,
      url: sanitizeUrl(opts.url),
      statusCode: opts.statusCode,
      durationMs: opts.durationMs,
      retryAttempt: opts.retryAttempt,
      ...opts.responseSummary,
    },
  });
}
