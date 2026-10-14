import crypto from "node:crypto";
import { loadPseudonymKey } from "../crypto/keyManager.js";

/**
 * Pseudonymization using keyed HMAC-SHA-256.
 *
 * Replaces a direct identifier with a consistent pseudonymous reference such as
 * `PG-7F39A12C`. The same (identifier, scope, keyVersion) always maps to the
 * same pseudonym; the pseudonym does not reveal the original identifier.
 *
 * Why HMAC and not plain SHA-256? Identifiers are often guessable/low-entropy,
 * so a plain hash can be reversed by dictionary enumeration. A secret key makes
 * that attack infeasible without the key.
 *
 * This is pseudonymization, NOT anonymization: with the key (and, for reversal,
 * a separately protected mapping store) the link can be re-established. Key
 * rotation (new keyVersion) intentionally changes all pseudonyms.
 */

const DEFAULT_SCOPE = "default";
export const PSEUDONYM_KEY_VERSION = 1;
export const PSEUDONYM_PREFIX = "PG-";

/** Normalize input so trivially different forms map consistently. */
export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toUpperCase().replace(/\s+/g, "");
}

export interface PseudonymizeOptions {
  scope?: string;
  keyVersion?: number;
}

export interface PseudonymResult {
  pseudonym: string;
  scope: string;
  keyVersion: number;
  method: string;
}

export function pseudonymize(
  identifier: string,
  options: PseudonymizeOptions = {}
): PseudonymResult {
  if (typeof identifier !== "string" || identifier.trim() === "") {
    throw new Error("A non-empty identifier is required.");
  }
  const scope = options.scope?.trim() || DEFAULT_SCOPE;
  const keyVersion = options.keyVersion ?? PSEUDONYM_KEY_VERSION;

  const key = loadPseudonymKey();
  const normalized = normalizeIdentifier(identifier);
  // Domain separation: bind the pseudonym to scope + key version + input.
  const message = `v${keyVersion}:${scope}:${normalized}`;
  const digest = crypto.createHmac("sha256", key).update(message, "utf8").digest("hex");

  const pseudonym = PSEUDONYM_PREFIX + digest.slice(0, 8).toUpperCase();

  return {
    pseudonym,
    scope,
    keyVersion,
    method: "HMAC-SHA256",
  };
}

/**
 * Educational comparison: plain SHA-256 of the identifier (NO key). This is
 * used ONLY to demonstrate why keyless hashing of guessable identifiers is weak
 * against dictionary guessing. Never use this for real pseudonymization.
 */
export function insecurePlainHashDemo(identifier: string): string {
  return crypto
    .createHash("sha256")
    .update(normalizeIdentifier(identifier), "utf8")
    .digest("hex")
    .slice(0, 16);
}
