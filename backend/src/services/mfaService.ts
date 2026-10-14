import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { getDb } from "../db/connection.js";
import { config } from "../config/index.js";
import { loadMfaKey } from "../crypto/keyManager.js";
import { encryptData, decryptData, type EncryptedPayload } from "../crypto/aesgcm.js";

/**
 * TOTP-based MFA (RFC 6238) via otplib.
 *
 * - A unique secret is generated per user and stored ENCRYPTED (AES-256-GCM)
 *   using a DEDICATED MFA key.
 * - Secrets are never returned after enrollment.
 * - Recovery codes are stored only as SHA-256 hashes and are single-use.
 * - OTP values and recovery codes are never logged.
 */

authenticator.options = { window: config.auth.mfaWindow };

const ISSUER_LABEL = "CertiGuard";

export interface EnrollmentResult {
  otpauthUrl: string;
  qrDataUrl: string;
  recoveryCodes: string[]; // shown ONCE at enrollment
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/** Begin enrollment: generate secret (encrypted, unconfirmed) + recovery codes. */
export async function beginEnrollment(userId: number, email: string): Promise<EnrollmentResult> {
  const db = getDb();
  const secret = authenticator.generateSecret();
  const encrypted = encryptData(secret, loadMfaKey());
  const now = new Date().toISOString();

  db.prepare("DELETE FROM user_mfa WHERE user_id = ?").run(userId);
  db.prepare(
    "INSERT INTO user_mfa (user_id, secret_encrypted, confirmed_at, created_at) VALUES (?, ?, NULL, ?)"
  ).run(userId, JSON.stringify(encrypted), now);

  // Fresh single-use recovery codes.
  db.prepare("DELETE FROM mfa_recovery_codes WHERE user_id = ?").run(userId);
  const recoveryCodes: string[] = [];
  const insRc = db.prepare(
    "INSERT INTO mfa_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)"
  );
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    recoveryCodes.push(code);
    insRc.run(userId, hashCode(code), now);
  }

  const otpauthUrl = authenticator.keyuri(email, ISSUER_LABEL, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { otpauthUrl, qrDataUrl, recoveryCodes };
}

function loadSecret(userId: number): string | null {
  const row = getDb()
    .prepare("SELECT secret_encrypted FROM user_mfa WHERE user_id = ?")
    .get(userId) as { secret_encrypted: string } | undefined;
  if (!row) return null;
  try {
    const payload = JSON.parse(row.secret_encrypted) as EncryptedPayload;
    return decryptData(payload, loadMfaKey());
  } catch {
    return null;
  }
}

/** Confirm enrollment with a valid code; marks MFA confirmed. */
export function confirmEnrollment(userId: number, token: string): boolean {
  const secret = loadSecret(userId);
  if (!secret) return false;
  const ok = authenticator.verify({ token: token.trim(), secret });
  if (ok) {
    getDb()
      .prepare("UPDATE user_mfa SET confirmed_at = ? WHERE user_id = ?")
      .run(new Date().toISOString(), userId);
  }
  return ok;
}

export function isMfaConfirmed(userId: number): boolean {
  const row = getDb()
    .prepare("SELECT confirmed_at FROM user_mfa WHERE user_id = ?")
    .get(userId) as { confirmed_at: string | null } | undefined;
  return !!row?.confirmed_at;
}

/** Verify a TOTP code for an enrolled+confirmed user. */
export function verifyTotp(userId: number, token: string): boolean {
  const secret = loadSecret(userId);
  if (!secret) return false;
  return authenticator.verify({ token: token.trim(), secret });
}

/** Verify + consume a single-use recovery code. */
export function consumeRecoveryCode(userId: number, code: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL"
    )
    .get(userId, hashCode(code)) as { id: number } | undefined;
  if (!row) return false;
  db.prepare("UPDATE mfa_recovery_codes SET used_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    row.id
  );
  return true;
}

/** Disable MFA for a user (removes secret + recovery codes). */
export function disableMfa(userId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM user_mfa WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM mfa_recovery_codes WHERE user_id = ?").run(userId);
}

export function remainingRecoveryCodes(userId: number): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NULL")
    .get(userId) as { c: number };
  return row.c;
}
