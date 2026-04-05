import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALG = "aes-256-gcm";

function derivedKey(): Buffer {
  const k = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!k || k.length < 16) {
    throw new Error("SPOTIFY_TOKEN_ENCRYPTION_KEY must be set (at least 16 characters).");
  }
  return scryptSync(k, "spotify-rt-cookie", 32);
}

export function encryptRefreshTokenForCookie(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptRefreshTokenFromCookie(blob: string): string {
  const buf = Buffer.from(blob, "base64url");
  if (buf.length < 28) throw new Error("invalid");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv(ALG, derivedKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
