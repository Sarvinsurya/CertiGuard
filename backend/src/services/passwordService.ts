import crypto from "node:crypto";

/**
 * Password hashing using scrypt (Node built-in).
 *
 * We use scrypt (memory-hard KDF) rather than a fast hash. Argon2id is preferred
 * in production, but scrypt avoids a native-build dependency and is a sound,
 * well-understood choice. Format: scrypt$N$r$p$saltB64$hashB64.
 *
 * Verification uses a constant-time comparison. Never store plaintext passwords.
 */

const N = 16384; // CPU/memory cost
const r = 8;
const p = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(password, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = crypto.scryptSync(password, salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: 64 * 1024 * 1024,
    });
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Password strength policy check (used at registration/reset). */
export function assertPasswordPolicy(password: string): void {
  if (password.length < 10) throw new Error("Password must be at least 10 characters.");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Password must contain lowercase, uppercase, and numeric characters.");
  }
}
