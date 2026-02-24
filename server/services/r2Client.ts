import { s3Client, EFFECTIVE_BUCKET_NAME, R2_IS_CONFIGURED, resolveR2ObjectKey } from "../objectStorage";
import { HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";

export interface R2HeadResult {
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
}

export interface R2StreamResult {
  stream: Readable;
  contentLength: number | null;
  contentType: string | null;
}

export async function headR2(storagePath: string): Promise<R2HeadResult> {
  if (!R2_IS_CONFIGURED || !EFFECTIVE_BUCKET_NAME) {
    throw new Error("[R2Client] R2 not configured");
  }

  const key = resolveR2ObjectKey(storagePath);
  console.log(`[R2Client] HEAD key=${key} bucket=${EFFECTIVE_BUCKET_NAME}`);

  const result = await s3Client.send(new HeadObjectCommand({
    Bucket: EFFECTIVE_BUCKET_NAME,
    Key: key,
  }));

  return {
    contentLength: result.ContentLength ?? null,
    contentType: result.ContentType ?? null,
    etag: result.ETag ?? null,
  };
}

export async function getR2Stream(storagePath: string): Promise<R2StreamResult> {
  if (!R2_IS_CONFIGURED || !EFFECTIVE_BUCKET_NAME) {
    throw new Error("[R2Client] R2 not configured");
  }

  const key = resolveR2ObjectKey(storagePath);
  console.log(`[R2Client] GET stream key=${key} bucket=${EFFECTIVE_BUCKET_NAME}`);

  const result = await s3Client.send(new GetObjectCommand({
    Bucket: EFFECTIVE_BUCKET_NAME,
    Key: key,
  }));

  if (!result.Body) {
    throw new Error(`[R2Client] No body returned for key=${key}`);
  }

  return {
    stream: result.Body as Readable,
    contentLength: result.ContentLength ?? null,
    contentType: result.ContentType ?? null,
  };
}

export interface R2BufferResult {
  buffer: Buffer;
  contentType: string | null;
  etag: string | null;
}

const R2_BUFFER_MAX_BYTES = 200 * 1024 * 1024; // 200MB safety cap

export async function getR2Buffer(storagePath: string, expectedSize?: number | null): Promise<R2BufferResult> {
  if (!R2_IS_CONFIGURED || !EFFECTIVE_BUCKET_NAME) {
    throw new Error("[R2Client] R2 not configured");
  }

  const key = resolveR2ObjectKey(storagePath);
  console.log(`[R2Client] GET buffer key=${key} bucket=${EFFECTIVE_BUCKET_NAME} expectedSize=${expectedSize ?? "unknown"}`);

  const result = await s3Client.send(new GetObjectCommand({
    Bucket: EFFECTIVE_BUCKET_NAME,
    Key: key,
  }));

  if (!result.Body) {
    throw new Error(`[R2Client] No body returned for key=${key}`);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  const stream = result.Body as Readable;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > R2_BUFFER_MAX_BYTES) {
      throw new Error(`[R2Client] Buffer exceeded safety cap ${R2_BUFFER_MAX_BYTES} bytes for key=${key}`);
    }
    chunks.push(buf);
  }

  const buffer = Buffer.concat(chunks);

  if (buffer.length === 0) {
    throw new Error(`[R2Client] R2 returned empty body (0 bytes) for key=${key}`);
  }

  if (expectedSize && buffer.length !== expectedSize) {
    console.warn(`[R2Client] Size mismatch for key=${key}: expected=${expectedSize} got=${buffer.length}`);
  }

  console.log(`[R2Client] Buffer read OK: key=${key} bytes=${buffer.length}`);

  return {
    buffer,
    contentType: result.ContentType ?? null,
    etag: result.ETag ?? null,
  };
}
