import crypto, { type KeyObject } from "node:crypto";

/**
 * Ed25519 digital signatures using Node's built-in crypto.
 *
 * For Ed25519, `crypto.sign`/`crypto.verify` take `null` as the algorithm
 * (the hash is intrinsic to the scheme).
 *
 * A valid signature establishes:
 *   - integrity: the signed bytes were not altered, AND
 *   - possession: the signer held the private key corresponding to the public key.
 * Trust in the issuer additionally requires securely establishing the binding
 * between the issuer and its public key (the trust model).
 */

export interface Ed25519KeyPairPem {
  privateKeyPem: string;
  publicKeyPem: string;
}

/** Generate a fresh Ed25519 keypair as PEM strings. */
export function generateEd25519KeyPair(): Ed25519KeyPairPem {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** Sign a buffer with an Ed25519 private key (PEM). Returns base64 signature. */
export function signEd25519(data: Buffer, privateKeyPem: string): string {
  const key: KeyObject = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, data, key);
  return signature.toString("base64");
}

/**
 * Verify a base64 Ed25519 signature over `data` using a public key (PEM).
 * Returns true/false. Never throws for a merely-invalid signature; malformed
 * inputs are caught and reported as `false` (fail-closed).
 */
export function verifyEd25519(
  data: Buffer,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    const signature = Buffer.from(signatureBase64, "base64");
    return crypto.verify(null, data, key, signature);
  } catch {
    return false;
  }
}
