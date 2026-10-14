import type { Request, Response, NextFunction } from "express";
import { sha256Hex } from "../crypto/hashing.js";
import { canonicalize, canonicalBuffer } from "../crypto/canonical.js";
import { signEd25519, verifyEd25519 } from "../crypto/signing.js";
import { loadIssuerPrivateKey, derivePublicKey } from "../crypto/keyManager.js";
import { assertValidPdfBuffer } from "../middleware/upload.js";
import { sendSuccess } from "../utils/response.js";
import { signatureDemoSchema } from "../utils/validation.js";
import { getDemoIssuer } from "../services/issuerService.js";

/**
 * SHA-256 Hashing Lab: hashes the EXACT uploaded bytes and returns the digest,
 * file name, and size. No predefined hashes — the value is computed live.
 */
export function postHashLab(req: Request, res: Response, next: NextFunction): void {
  try {
    const buffer = assertValidPdfBuffer(req.file?.buffer);
    const hash = sha256Hex(buffer);
    sendSuccess(res, {
      algorithm: "SHA-256",
      fileName: req.file?.originalname ?? "upload.pdf",
      fileSizeBytes: buffer.length,
      hash,
      note: "The digest is computed from the exact uploaded file bytes. A hash proves integrity, not authorship.",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Digital Signature Lab: ISOLATED from real certificate records. Signs a test
 * record with the issuer private key, verifies it, and optionally demonstrates
 * that a tampered record fails verification against the original signature.
 */
export function postSignatureDemo(req: Request, res: Response, next: NextFunction): void {
  try {
    const { record, tamperedRecord } = signatureDemoSchema.parse(req.body);
    const issuer = getDemoIssuer();
    const privateKeyPem = loadIssuerPrivateKey();
    const publicKeyPem = derivePublicKey(privateKeyPem);

    const canonicalInput = {
      certificateId: record.certificateId,
      studentName: record.studentName,
      studentIdentifier: record.studentIdentifier,
      institutionName: record.institutionName,
      qualification: record.qualification,
      graduationYear: record.graduationYear,
      issueDate: record.issueDate,
      documentHash: record.documentHash,
      issuerCode: issuer.issuer_code,
    };

    const canonicalStr = canonicalize(canonicalInput);
    const signature = signEd25519(canonicalBuffer(canonicalInput), privateKeyPem);
    const originalValid = verifyEd25519(
      canonicalBuffer(canonicalInput),
      signature,
      publicKeyPem
    );

    let tampered: {
      canonical: string;
      verified: boolean;
      explanation: string;
    } | null = null;

    if (tamperedRecord) {
      const tamperedInput = {
        certificateId: tamperedRecord.certificateId,
        studentName: tamperedRecord.studentName,
        studentIdentifier: tamperedRecord.studentIdentifier,
        institutionName: tamperedRecord.institutionName,
        qualification: tamperedRecord.qualification,
        graduationYear: tamperedRecord.graduationYear,
        issueDate: tamperedRecord.issueDate,
        documentHash: tamperedRecord.documentHash,
        issuerCode: issuer.issuer_code,
      };
      // Verify the ORIGINAL signature against the TAMPERED canonical data.
      const tamperedVerified = verifyEd25519(
        canonicalBuffer(tamperedInput),
        signature,
        publicKeyPem
      );
      tampered = {
        canonical: canonicalize(tamperedInput),
        verified: tamperedVerified,
        explanation: tamperedVerified
          ? "Unexpected: tampered record verified."
          : "The original signature does not verify against the tampered record. Changing any signed field invalidates the signature.",
      };
    }

    sendSuccess(res, {
      algorithm: "Ed25519",
      issuerCode: issuer.issuer_code,
      canonical: canonicalStr,
      signature,
      publicKey: publicKeyPem,
      originalVerified: originalValid,
      tampered,
      note: "This lab is isolated from registered certificates. A valid signature establishes integrity and possession of the signing key; trust also depends on the issuer-public-key binding.",
    });
  } catch (err) {
    next(err);
  }
}
