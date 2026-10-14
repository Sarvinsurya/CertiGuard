import crypto from "node:crypto";
import fs from "node:fs";

/**
 * SHA-256 hashing over raw bytes.
 *
 * The digest is computed from the EXACT uploaded file bytes. Identical bytes
 * always yield an identical digest; any byte-level change yields a different
 * digest with overwhelming probability (preimage/collision resistance).
 *
 * NOTE: A hash proves integrity (the bytes are unchanged). It does NOT prove
 * authorship or who created the document — that is the role of the issuer's
 * digital signature and the trust model around the issuer public key.
 */
export function sha256Hex(data: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Compute SHA-256 of a file on disk by streaming it (memory-safe for large files).
 */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
