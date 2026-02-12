import { Router, Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { Readable } from "stream";

const router = Router();
const LOG_PREFIX = "[MediaCDN]";

function getCdnSecret(): string {
  const secret = process.env.MEDIA_CDN_SIGNING_SECRET || process.env.ADMIN_PASSWORD || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("[MediaCDN] FATAL: No MEDIA_CDN_SIGNING_SECRET, ADMIN_PASSWORD or SESSION_SECRET configured.");
  }
  return secret;
}
const CDN_SECRET = getCdnSecret();
const DEFAULT_TTL_HOURS = 7 * 24;

export interface MediaCdnToken {
  path: string;
  mime: string;
  name: string;
  exp: number;
  nonce: string;
}

export function generateMediaCdnToken(
  storagePath: string,
  options?: { ttlHours?: number; mime?: string; name?: string }
): string {
  const payload: MediaCdnToken = {
    path: storagePath,
    mime: options?.mime || "video/mp4",
    name: options?.name || "video.mp4",
    exp: Date.now() + (options?.ttlHours || DEFAULT_TTL_HOURS) * 60 * 60 * 1000,
    nonce: randomBytes(8).toString("hex"),
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", CDN_SECRET).update(payloadStr).digest("base64url");
  return `${payloadStr}.${sig}`;
}

export function generateMediaCdnUrl(
  storagePath: string,
  options?: { ttlHours?: number; mime?: string; name?: string }
): string {
  const token = generateMediaCdnToken(storagePath, options);
  const baseUrl = process.env.PUBLIC_BASE_URL || "https://elevizion.nl";
  return `${baseUrl}/api/media-cdn/${token}`;
}

function verifyToken(token: string): MediaCdnToken | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadStr, sig] = parts;
  const expectedSig = createHmac("sha256", CDN_SECRET).update(payloadStr).digest("base64url");
  const sigBuf = Buffer.from(sig, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8")) as MediaCdnToken;
    if (Date.now() > payload.exp) {
      console.warn(`${LOG_PREFIX} Token expired for path=${payload.path}`);
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function getR2Clients() {
  const { s3Client, EFFECTIVE_BUCKET_NAME, R2_IS_CONFIGURED, resolveR2ObjectKey } = await import("../objectStorage");
  const { HeadObjectCommand, GetObjectCommand } = await import("@aws-sdk/client-s3");
  if (!R2_IS_CONFIGURED || !EFFECTIVE_BUCKET_NAME) {
    throw new Error("R2 not configured");
  }
  return { s3Client, bucket: EFFECTIVE_BUCKET_NAME, resolveR2ObjectKey, HeadObjectCommand, GetObjectCommand };
}

router.options("/:token", (_req: Request, res: Response) => {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });
  return res.status(204).end();
});

router.head("/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  try {
    const { s3Client, bucket, resolveR2ObjectKey, HeadObjectCommand } = await getR2Clients();
    const key = resolveR2ObjectKey(payload.path);

    const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const contentLength = head.ContentLength || 0;
    const contentType = payload.mime || head.ContentType || "video/mp4";

    res.set({
      "Content-Type": contentType,
      "Content-Length": String(contentLength),
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    });
    return res.status(200).end();
  } catch (err: any) {
    console.error(`${LOG_PREFIX} HEAD error: ${err.message}`);
    return res.status(502).json({ error: "R2 HEAD failed" });
  }
});

router.get("/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const payload = verifyToken(token);

  if (!payload) {
    console.warn(`${LOG_PREFIX} Invalid or expired token`);
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  try {
    const { s3Client, bucket, resolveR2ObjectKey, HeadObjectCommand, GetObjectCommand } = await getR2Clients();
    const key = resolveR2ObjectKey(payload.path);
    const contentType = payload.mime || "video/mp4";
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const fileSize = head.ContentLength || 0;

      const rangeMatch = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      if (!rangeMatch) {
        return res.status(416).set({ "Content-Range": `bytes */${fileSize}` }).end();
      }

      let start: number;
      let end: number;

      if (rangeMatch[1] === "" && rangeMatch[2] !== "") {
        const suffixLen = parseInt(rangeMatch[2], 10);
        start = Math.max(0, fileSize - suffixLen);
        end = fileSize - 1;
      } else if (rangeMatch[2] === "") {
        start = parseInt(rangeMatch[1], 10);
        end = fileSize - 1;
      } else {
        start = parseInt(rangeMatch[1], 10);
        end = parseInt(rangeMatch[2], 10);
      }

      if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || end >= fileSize || start > end) {
        return res.status(416).set({ "Content-Range": `bytes */${fileSize}` }).end();
      }

      const chunkSize = end - start + 1;

      const result = await s3Client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=${start}-${end}`,
      }));

      res.status(206);
      res.set({
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(payload.name)}"`,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=31536000",
      });

      if (result.Body) {
        const stream = result.Body as Readable;
        stream.on("error", (err: Error) => {
          console.error(`${LOG_PREFIX} Stream range error: ${err.message}`);
          if (!res.headersSent) {
            res.status(500).json({ error: "Stream error" });
          }
        });
        stream.pipe(res);
      } else {
        res.status(500).json({ error: "No body from R2" });
      }
    } else {
      const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      const fileSize = head.ContentLength || 0;

      const result = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

      res.set({
        "Content-Type": contentType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Content-Disposition": `inline; filename="${encodeURIComponent(payload.name)}"`,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=31536000",
      });

      if (result.Body) {
        const stream = result.Body as Readable;
        stream.on("error", (err: Error) => {
          console.error(`${LOG_PREFIX} Stream error: ${err.message}`);
          if (!res.headersSent) {
            res.status(500).json({ error: "Stream error" });
          }
        });
        stream.pipe(res);
      } else {
        res.status(500).json({ error: "No body from R2" });
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} GET error: ${err.message}`);
    if (!res.headersSent) {
      return res.status(502).json({ error: "R2 fetch failed" });
    }
  }
});

export default router;
