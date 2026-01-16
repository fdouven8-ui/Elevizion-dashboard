/**
 * Token Encryption Utilities
 * Uses AES-256-GCM for encrypting raw portal tokens to enable reuse
 * Without storing plaintext tokens in the database
 */
import crypto from "crypto";

let encryptionKeyCache: Buffer | null = null;

/**
 * Get the encryption key from environment
 * Returns null if not configured (encryption disabled)
 */
function getEncryptionKey(): Buffer | null {
  if (encryptionKeyCache) {
    return encryptionKeyCache;
  }
  
  const keyEnv = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyEnv || keyEnv.length < 32) {
    // Key not configured or too short - encryption disabled
    return null;
  }
  
  // Derive a 32-byte key using SHA-256 for consistency
  encryptionKeyCache = crypto.createHash("sha256").update(keyEnv).digest();
  return encryptionKeyCache;
}

/**
 * Check if token encryption is available
 */
export function isTokenEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}

/**
 * Encrypt a raw token for storage
 * Returns base64-encoded ciphertext with IV prepended
 * Returns null if encryption is not configured
 */
export function encryptToken(rawToken: string): string | null {
  const key = getEncryptionKey();
  if (!key) {
    return null;
  }
  
  const iv = crypto.randomBytes(12); // GCM uses 12-byte IV
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(rawToken, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  
  // Combine: IV (12) + AuthTag (16) + Ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt a token ciphertext back to raw token
 * Returns null if decryption fails or encryption not configured
 */
export function decryptToken(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) {
    return null;
  }
  
  const key = getEncryptionKey();
  if (!key) {
    return null;
  }
  
  try {
    const combined = Buffer.from(ciphertext, "base64");
    
    // Extract: IV (12) + AuthTag (16) + Ciphertext
    if (combined.length < 29) {
      return null; // Too short to be valid
    }
    
    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(12, 28);
    const encrypted = combined.subarray(28);
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString("utf8");
  } catch (error) {
    // Decryption failed - token may be corrupted or key changed
    return null;
  }
}
