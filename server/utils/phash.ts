import sharp from 'sharp';

const HASH_SIZE = 16;
const HASH_BITS = HASH_SIZE * HASH_SIZE;

export interface ImageHashResult {
  hash: string;
  width: number;
  height: number;
  isEmptyOrBlank: boolean;
}

export async function downloadImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'image/*' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function computePHash(imageBuffer: Buffer): Promise<ImageHashResult | null> {
  try {
    const { width, height, channels } = await sharp(imageBuffer).metadata();
    if (!width || !height) return null;

    const grayscalePixels = await sharp(imageBuffer)
      .resize(HASH_SIZE, HASH_SIZE, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    const pixels = Array.from(grayscalePixels);
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    const hashBits = pixels.map(p => p > mean ? '1' : '0').join('');
    const hash = binaryToHex(hashBits);

    const variance = pixels.reduce((acc, p) => acc + Math.pow(p - mean, 2), 0) / pixels.length;
    const stdDev = Math.sqrt(variance);
    const isEmptyOrBlank = stdDev < 5 || (mean < 10 || mean > 245);

    return { hash, width, height, isEmptyOrBlank };
  } catch {
    return null;
  }
}

export async function computePHashFromUrl(url: string): Promise<ImageHashResult | null> {
  const buffer = await downloadImageBuffer(url);
  if (!buffer) return null;
  return computePHash(buffer);
}

export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return Infinity;
  
  const bin1 = hexToBinary(hash1);
  const bin2 = hexToBinary(hash2);
  
  let distance = 0;
  for (let i = 0; i < bin1.length; i++) {
    if (bin1[i] !== bin2[i]) distance++;
  }
  return distance;
}

export function hashSimilarity(hash1: string, hash2: string): number {
  const dist = hammingDistance(hash1, hash2);
  if (dist === Infinity) return 0;
  return 1 - (dist / HASH_BITS);
}

export function isHashMatch(hash1: string, hash2: string, threshold = 0.85): boolean {
  return hashSimilarity(hash1, hash2) >= threshold;
}

function binaryToHex(binary: string): string {
  let hex = '';
  for (let i = 0; i < binary.length; i += 4) {
    const chunk = binary.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

function hexToBinary(hex: string): string {
  return hex.split('').map(h => parseInt(h, 16).toString(2).padStart(4, '0')).join('');
}

export async function detectEmptyScreen(screenshotUrl: string): Promise<{ isEmpty: boolean; reason?: string }> {
  const result = await computePHashFromUrl(screenshotUrl);
  if (!result) return { isEmpty: false, reason: 'fetch_failed' };
  
  if (result.isEmptyOrBlank) {
    return { isEmpty: true, reason: 'low_variance' };
  }
  
  return { isEmpty: false };
}

export async function findBestCreativeMatch(
  screenshotHash: string,
  creativeHashes: { id: string; hash: string; advertiserId: string }[],
  threshold = 0.80
): Promise<{ creativeId: string; advertiserId: string; similarity: number } | null> {
  let bestMatch: { creativeId: string; advertiserId: string; similarity: number } | null = null;
  
  for (const creative of creativeHashes) {
    const similarity = hashSimilarity(screenshotHash, creative.hash);
    if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { creativeId: creative.id, advertiserId: creative.advertiserId, similarity };
    }
  }
  
  return bestMatch;
}
