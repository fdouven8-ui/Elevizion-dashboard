import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || process.env.DATABASE_URL;
  if (!key) {
    throw new Error("No encryption key available");
  }
  return key;
}

export function encryptCredentials(data: Record<string, string>): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const key = crypto.pbkdf2Sync(
    getEncryptionKey(),
    salt,
    ITERATIONS,
    KEY_LENGTH,
    "sha512"
  );
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(data);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  
  const tag = cipher.getAuthTag();
  
  const result = Buffer.concat([salt, iv, tag, encrypted]);
  return result.toString("base64");
}

export function decryptCredentials(encryptedData: string): Record<string, string> {
  const buffer = Buffer.from(encryptedData, "base64");
  
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
  
  const key = crypto.pbkdf2Sync(
    getEncryptionKey(),
    salt,
    ITERATIONS,
    KEY_LENGTH,
    "sha512"
  );
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  
  return JSON.parse(decrypted.toString("utf8"));
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return key.substring(0, 4) + "****" + key.substring(key.length - 4);
}
