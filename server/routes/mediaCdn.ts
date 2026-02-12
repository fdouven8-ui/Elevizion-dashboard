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

async function generateR2RedirectUrl(storagePath: string): Promise<string> {
  const { getR2PresignedUrl, R2_IS_CONFIGURED } = await import("../objectStorage");
  if (!R2_IS_CONFIGURED) {
    throw new Error("R2 not configured");
  }
  return getR2PresignedUrl(storagePath, 7200);
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
    return res.status(404).json({ error: "Invalid or expired token" });
  }

  try {
    const r2Url = await generateR2RedirectUrl(payload.path);
    res.set({
      "Location": r2Url,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
    return res.status(302).end();
  } catch (err: any) {
    console.error(`${LOG_PREFIX} HEAD redirect error: ${err.message}`);
    return res.status(502).json({ error: "Failed to generate signed URL" });
  }
});

router.get("/:token", async (req: Request, res: Response) => {
  const token = req.params.token;
  const payload = verifyToken(token);

  if (!payload) {
    console.warn(`${LOG_PREFIX} Invalid or expired token`);
    return res.status(404).json({ error: "Invalid or expired token" });
  }

  console.log(`${LOG_PREFIX} Redirecting to R2: path=${payload.path}`);

  try {
    const r2Url = await generateR2RedirectUrl(payload.path);
    res.set({
      "Location": r2Url,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
    });
    return res.redirect(302, r2Url);
  } catch (err: any) {
    console.error(`${LOG_PREFIX} GET redirect error: ${err.message}`);
    return res.status(502).json({ error: "Failed to generate signed URL" });
  }
});

export default router;
