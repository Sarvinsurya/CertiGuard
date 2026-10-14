import crypto from "node:crypto";

/**
 * AES-256-GCM authenticated encryption.
 *
 * Properties demonstrated:
 *   - Confidentiality: the plaintext is hidden in the ciphertext.
 *   - Integrity + authentication: the 128-bit GCM tag detects any modification
 *     of the ciphertext, nonce, or associated data. Decryption FAILS CLOSED —
 *     no plaintext is returned if authentication fails.
 *
 * This is reversible authenticated encryption and is fundamentally different
 * from SHA-256 hashing (one-way). The key never leaves the backend.
 */

export const AES_ALG = "aes-256-gcm";
export const AES_PAYLOAD_VERSION = 1;
const NONCE_BYTES = 12; // 96-bit nonce recommended for GCM
const TAG_BYTES = 16; // 128-bit authentication tag
const KEY_BYTES = 32; // 256-bit key

export interface EncryptedPayload {
  alg: "AES-256-GCM";
  v: number;
  /** base64 nonce/IV */
  nonce: string;
  /** base64 authentication tag */
  tag: string;
  /** base64 ciphertext */
  ciphertext: string;
  encoding: "base64";
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DecryptionError";
  }
}

function assertKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTES) {
    throw new Error(`AES key must be ${KEY_BYTES} bytes.`);
  }
}

/**
 * Encrypt UTF-8 plaintext with a fresh, unique 96-bit nonce.
 * A NEW random nonce is generated for every call (never reused with a key).
 */
export function encryptData(plaintext: string, key: Buffer): EncryptedPayload {
  assertKey(key);
  const nonce = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv(AES_ALG, key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    alg: "AES-256-GCM",
    v: AES_PAYLOAD_VERSION,
    nonce: nonce.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    encoding: "base64",
  };
}

/** Validate payload shape + field lengths before attempting decryption. */
function validatePayload(payload: EncryptedPayload): {
  nonce: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
} {
  if (!payload || typeof payload !== "object") {
    throw new DecryptionError("Invalid encrypted payload.");
  }
  if (payload.alg !== "AES-256-GCM") {
    throw new DecryptionError("Unsupported algorithm in payload.");
  }
  if (payload.v !== AES_PAYLOAD_VERSION) {
    throw new DecryptionError(`Unsupported payload version: ${payload.v}.`);
  }
  let nonce: Buffer;
  let tag: Buffer;
  let ciphertext: Buffer;
  try {
    nonce = Buffer.from(payload.nonce, "base64");
    tag = Buffer.from(payload.tag, "base64");
    ciphertext = Buffer.from(payload.ciphertext, "base64");
  } catch {
    throw new DecryptionError("Malformed base64 in payload.");
  }
  if (nonce.length !== NONCE_BYTES) {
    throw new DecryptionError("Invalid nonce length.");
  }
  if (tag.length !== TAG_BYTES) {
    throw new DecryptionError("Invalid authentication tag length.");
  }
  return { nonce, tag, ciphertext };
}

/**
 * Decrypt an encrypted payload. Returns plaintext ONLY if the GCM
 * authentication tag verifies. Any tampering (ciphertext, tag, nonce) or a
 * wrong key causes authentication to fail and throws DecryptionError.
 */
export function decryptData(payload: EncryptedPayload, key: Buffer): string {
  assertKey(key);
  const { nonce, tag, ciphertext } = validatePayload(payload);

  try {
    const decipher = crypto.createDecipheriv(AES_ALG, key, nonce);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(), // throws if authentication fails
    ]);
    return plaintext.toString("utf8");
  } catch {
    // Never return partially decrypted data on authentication failure.
    throw new DecryptionError(
      "Authentication failed: the payload was altered or the key is incorrect."
    );
  }
}
