import { Router, Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const router = Router();
const LOG_PREFIX = "[MediaCDN]";

function getCdnSecret(): string {
  const secret = process.env.ADMIN_PASSWORD || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("[MediaCDN] FATAL: No ADMIN_PASSWORD or SESSION_SECRET configured. Cannot generate secure CDN tokens.");
  }
  return secret;
}
const CDN_SECRET = getCdnSecret();
const DEFAULT_TTL_HOURS = 24;

export interface MediaCdnToken {
  path: string;
  exp: number;
  nonce: string;
}

export function generateMediaCdnToken(storagePath: string, ttlHours: number = DEFAULT_TTL_HOURS): string {
  const payload: MediaCdnToken = {
    path: storagePath,
    exp: Date.now() + ttlHours * 60 * 60 * 1000,
    nonce: randomBytes(8).toString("hex"),
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", CDN_SECRET).update(payloadStr).digest("base64url");
  return `${payloadStr}.${sig}`;
}

export function generateMediaCdnUrl(storagePath: string, ttlHours: number = DEFAULT_TTL_HOURS): string {
  const token = generateMediaCdnToken(storagePath, ttlHours);
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS || "";
  if (!domain) {
    throw new Error("Cannot determine public domain for media CDN URL");
  }
  return `https://${domain}/api/media-cdn/${token}`;
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

router.get("/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const payload = verifyToken(token);

  if (!payload) {
    console.warn(`${LOG_PREFIX} Invalid or expired token`);
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  console.log(`${LOG_PREFIX} Serving file: path=${payload.path}`);

  try {
    const { ObjectStorageService, R2_IS_CONFIGURED } = await import("../objectStorage");

    if (!R2_IS_CONFIGURED) {
      const { Client } = await import("@replit/object-storage");
      const client = new Client();
      const result = await client.downloadAsBytes(payload.path);
      if (!result.ok) {
        console.error(`${LOG_PREFIX} File not found in Replit storage: ${payload.path}`);
        return res.status(404).json({ error: "File not found" });
      }
      const buf = Buffer.from(result.value as unknown as ArrayBuffer);
      console.log(`${LOG_PREFIX} Serving ${buf.length} bytes from Replit storage`);
      res.set({
        "Content-Type": "video/mp4",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400",
        "Accept-Ranges": "bytes",
      });
      return res.send(buf);
    }

    const r2Service = new ObjectStorageService();
    const objData = await r2Service.getObjectBuffer(payload.path);

    if (!objData) {
      console.error(`${LOG_PREFIX} File not found in R2: ${payload.path}`);
      return res.status(404).json({ error: "File not found" });
    }

    console.log(`${LOG_PREFIX} Serving ${objData.buffer.length} bytes from R2, key=${objData.key}`);

    const head32 = objData.buffer.subarray(0, 32).toString("hex");
    console.log(`${LOG_PREFIX} head32=${head32}`);

    res.set({
      "Content-Type": "video/mp4",
      "Content-Length": String(objData.buffer.length),
      "Cache-Control": "public, max-age=86400",
      "Accept-Ranges": "bytes",
    });
    return res.send(objData.buffer);

  } catch (err: any) {
    console.error(`${LOG_PREFIX} Error serving file:`, err.message);
    return res.status(500).json({ error: "Internal error serving file" });
  }
});

export default router;
