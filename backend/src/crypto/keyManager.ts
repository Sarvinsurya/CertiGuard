import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";
import { generateEd25519KeyPair } from "./signing.js";

/**
 * Issuer key management (PROTOTYPE).
 *
 * SECURITY LIMITATION: The private signing key is stored on the local
 * filesystem (restricted file permissions where supported). This is NOT
 * equivalent to a Hardware Security Module (HSM) or a production key
 * management service. It is adequate for a controlled demonstration only.
 *
 * The private key:
 *   - is generated ONCE and persisted (not regenerated on every restart),
 *   - lives only on the backend filesystem (gitignored),
 *   - is never returned by any API and never logged.
 */

export interface IssuerKeyInit {
  publicKeyPem: string;
  generated: boolean; // true if a new keypair was created this call
}

/**
 * Ensure an issuer keypair exists. If the private key file is absent, generate
 * a new keypair and persist the private key. Returns the public key PEM.
 */
export function ensureIssuerKey(): IssuerKeyInit {
  const { keysDir, privateKeyFile } = config.paths;
  fs.mkdirSync(keysDir, { recursive: true });

  if (fs.existsSync(privateKeyFile)) {
    const privateKeyPem = fs.readFileSync(privateKeyFile, "utf8");
    const publicKeyPem = derivePublicKey(privateKeyPem);
    return { publicKeyPem, generated: false };
  }

  const { privateKeyPem, publicKeyPem } = generateEd25519KeyPair();
  // 0600 => owner read/write only (best-effort; POSIX only).
  fs.writeFileSync(privateKeyFile, privateKeyPem, { mode: 0o600 });
  try {
    fs.chmodSync(privateKeyFile, 0o600);
  } catch {
    /* chmod may be unsupported on some filesystems; ignore */
  }
  return { publicKeyPem, generated: true };
}

/** Load the issuer private key PEM (backend-only). Throws if not initialized. */
export function loadIssuerPrivateKey(): string {
  const { privateKeyFile } = config.paths;
  if (!fs.existsSync(privateKeyFile)) {
    throw new Error("Issuer private key not initialized. Run key initialization first.");
  }
  return fs.readFileSync(privateKeyFile, "utf8");
}

/** Derive the public key PEM from a private key PEM. */
export function derivePublicKey(privateKeyPem: string): string {
  const privateKey = crypto.createPrivateKey(privateKeyPem);
  const publicKey = crypto.createPublicKey(privateKey);
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

export function issuerKeyExists(): boolean {
  return fs.existsSync(config.paths.privateKeyFile);
}

export function privateKeyPath(): string {
  return path.resolve(config.paths.privateKeyFile);
}

/* -------------------------------------------------------------------------- */
/* Phase 2 keys: AES-256 (encryption) and HMAC (pseudonymization).            */
/*                                                                            */
/* These are SEPARATE from the Ed25519 signing key. Never reuse the signing   */
/* key for encryption or pseudonymization. Each key is generated once,        */
/* persisted with 0600 permissions (best-effort), gitignored, and never       */
/* returned by any API or logged.                                             */
/* -------------------------------------------------------------------------- */

function ensureRawKey(filePath: string, byteLength: number): Buffer {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    const key = fs.readFileSync(filePath);
    if (key.length !== byteLength) {
      throw new Error(
        `Key at ${path.basename(filePath)} has unexpected length ${key.length} (expected ${byteLength}).`
      );
    }
    return key;
  }
  const key = crypto.randomBytes(byteLength);
  fs.writeFileSync(filePath, key, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* ignore on filesystems without chmod support */
  }
  return key;
}

/** Ensure the AES-256 key (32 bytes) exists; returns it. Backend-only. */
export function ensureAesKey(): Buffer {
  return ensureRawKey(config.paths.aesKeyFile, 32);
}

/** Load the AES-256 key. Throws if not initialized. */
export function loadAesKey(): Buffer {
  const { aesKeyFile } = config.paths;
  if (!fs.existsSync(aesKeyFile)) {
    throw new Error("AES key not initialized. Run key initialization first.");
  }
  return fs.readFileSync(aesKeyFile);
}

/** Ensure the HMAC pseudonymization key (32 bytes) exists; returns it. */
export function ensurePseudonymKey(): Buffer {
  return ensureRawKey(config.paths.pseudonymKeyFile, 32);
}

/** Load the HMAC pseudonymization key. Throws if not initialized. */
export function loadPseudonymKey(): Buffer {
  const { pseudonymKeyFile } = config.paths;
  if (!fs.existsSync(pseudonymKeyFile)) {
    throw new Error("Pseudonymization key not initialized. Run key initialization first.");
  }
  return fs.readFileSync(pseudonymKeyFile);
}

/**
 * Ensure the MFA-secret encryption key (32 bytes) exists; returns it.
 * This is a DEDICATED key for encrypting TOTP secrets at rest — never reuse the
 * data AES key, the signing key, or the pseudonymization key.
 */
export function ensureMfaKey(): Buffer {
  return ensureRawKey(config.paths.mfaKeyFile, 32);
}

/** Load the MFA-secret encryption key. Throws if not initialized. */
export function loadMfaKey(): Buffer {
  const { mfaKeyFile } = config.paths;
  if (!fs.existsSync(mfaKeyFile)) {
    throw new Error("MFA encryption key not initialized. Run key initialization first.");
  }
  return fs.readFileSync(mfaKeyFile);
}

/** Ensure all keys (signing, AES, HMAC, MFA) exist. Called at bootstrap. */
export function ensureAllKeys(): void {
  ensureIssuerKey();
  ensureAesKey();
  ensurePseudonymKey();
  ensureMfaKey();
}
