import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ??
  "evyemeklerimm-super-secret-hmac-key-2026-production-grade";

/**
 * Parolayı scrypt + 16-bayt rastgele salt ile güvenli şekilde özetler (hash).
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

/**
 * Sabit zamanlı (timing-safe) parola doğrulaması yapar.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return timingSafeEqual(derived, keyBuf);
}

/**
 * İmzalı oturum belirteci (signed token) üretir ve doğrular.
 */
export function createSignedSessionToken(): { rawToken: string; tokenHash: string } {
  const rawId = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", SESSION_SECRET).update(rawId).digest("hex");
  const rawToken = `${rawId}.${sig}`;
  const tokenHash = createHmac("sha256", SESSION_SECRET).update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function verifyAndHashSessionToken(rawToken: string): string | null {
  const parts = rawToken.split(".");
  if (parts.length !== 2) return null;
  const [rawId, providedSig] = parts;
  const expectedSig = createHmac("sha256", SESSION_SECRET).update(rawId).digest("hex");
  const a = Buffer.from(providedSig, "hex");
  const b = Buffer.from(expectedSig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }
  return createHmac("sha256", SESSION_SECRET).update(rawToken).digest("hex");
}

export function generateId(prefix?: string): string {
  const uuid = randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function generateOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `EVY-${y}${m}${d}-${rand}`;
}
