/**
 * Canonicalization of certificate metadata for digital signing.
 *
 * The signature protects the INTEGRITY OF THE METADATA (student name, id,
 * qualification, etc.) and binds it to the document hash. The PDF file itself
 * is protected separately by its SHA-256 `document_hash`.
 *
 * Requirements:
 *  - Deterministic: the same metadata ALWAYS produces exactly the same bytes.
 *  - Versioned: a `canonicalVersion` field is embedded so future schema changes
 *    do not silently break verification of previously-signed records.
 *
 * We do NOT rely on arbitrary JS object key ordering. We serialize an explicit,
 * fixed, ordered list of fields.
 */

export const CANONICAL_VERSION = "1.0";

/** Fields that are included in the signed canonical representation (v1.0). */
export const SIGNED_FIELDS_V1 = [
  "certificateId",
  "studentName",
  "studentIdentifier",
  "institutionName",
  "qualification",
  "graduationYear",
  "issueDate",
  "documentHash",
  "issuerCode",
] as const;

export interface CanonicalMetadataInput {
  certificateId: string;
  studentName: string;
  studentIdentifier: string;
  institutionName: string;
  qualification: string;
  graduationYear: number;
  issueDate: string;
  documentHash: string;
  issuerCode: string;
}

/**
 * Produce the canonical string that gets signed.
 * Format: a versioned header line followed by `key=value` lines in a FIXED order,
 * each value JSON-encoded to unambiguously handle special characters.
 */
export function canonicalize(
  input: CanonicalMetadataInput,
  version: string = CANONICAL_VERSION
): string {
  if (version !== "1.0") {
    throw new Error(`Unsupported canonical format version: ${version}`);
  }

  const lines: string[] = [`CERTIGUARD-CANONICAL/v${version}`];
  for (const field of SIGNED_FIELDS_V1) {
    const value = (input as unknown as Record<string, unknown>)[field];
    lines.push(`${field}=${JSON.stringify(value ?? null)}`);
  }
  return lines.join("\n");
}

/** Canonical string as a UTF-8 buffer, ready to pass to the signer. */
export function canonicalBuffer(
  input: CanonicalMetadataInput,
  version: string = CANONICAL_VERSION
): Buffer {
  return Buffer.from(canonicalize(input, version), "utf8");
}
