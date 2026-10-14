import { sha256Hex } from "../crypto/hashing.js";
import { canonicalBuffer } from "../crypto/canonical.js";
import { verifyEd25519 } from "../crypto/signing.js";
import { getCertificateById } from "./certificateService.js";
import { getIssuerById } from "./issuerService.js";
import { recordAuditEvent } from "./auditService.js";
import { recordSecurityEvent } from "./securityEventService.js";
import type {
  VerificationResult,
  IntegrityCheck,
  SignatureCheck,
  RevocationCheck,
} from "../types/index.js";

export interface VerifyParams {
  certificateId: string;
  fileBuffer: Buffer;
  correlationId?: string;
  actorId?: number | null;
  sourceIp?: string | null;
}

/**
 * Verify a candidate certificate. Each check is computed independently and
 * reported separately. The overall result follows a strict precedence:
 *
 *   NOT_REGISTERED > DOCUMENT_MISMATCH > INVALID_SIGNATURE > REVOKED > VERIFIED
 *
 * VERIFIED is returned ONLY when: record found AND hash matches AND signature
 * valid AND status active. A revoked certificate is NEVER shown as VERIFIED,
 * even if its hash and signature are still valid.
 */
export function verifyCertificate(params: VerifyParams): VerificationResult {
  const submittedHash = sha256Hex(params.fileBuffer);
  const record = getCertificateById(params.certificateId);

  // 1. Record existence
  if (!record) {
    const result: VerificationResult = {
      certificateId: params.certificateId,
      issuer: null,
      checks: {
        record: "NOT_FOUND",
        integrity: "NOT_CHECKED",
        signature: "NOT_CHECKED",
        revocation: "UNKNOWN",
      },
      overall: "NOT_REGISTERED",
      explanation:
        "No certificate is registered under this ID. The submitted document cannot be matched against any issued record.",
      details: { submittedHash, registeredHash: null },
    };
    recordAuditEvent({
      action: "CERTIFICATE_VERIFICATION",
      target: params.certificateId,
      outcome: "NOT_REGISTERED",
      actorId: params.actorId ?? null,
      resourceType: "certificate",
      correlationId: params.correlationId,
      details: { submittedHash },
    });
    recordSecurityEvent({
      eventType: "CERT_NOT_FOUND",
      severity: "low",
      actorId: params.actorId ?? null,
      sourceIp: params.sourceIp ?? null,
      resourceType: "certificate",
      resourceId: params.certificateId,
      detectionRule: "ENUMERATION",
      riskContribution: 3,
      correlationId: params.correlationId,
    });
    return result;
  }

  const issuer = getIssuerById(record.issuer_id);

  // 2. Document integrity (hash comparison)
  const integrity: IntegrityCheck =
    submittedHash === record.document_hash ? "MATCH" : "MISMATCH";

  // 3. Signature verification (recompute canonical metadata, verify with issuer public key)
  let signature: SignatureCheck = "NOT_CHECKED";
  if (issuer) {
    const canonical = canonicalBuffer(
      {
        certificateId: record.certificate_id,
        studentName: record.student_name,
        studentIdentifier: record.student_identifier,
        institutionName: record.institution_name,
        qualification: record.qualification,
        graduationYear: record.graduation_year,
        issueDate: record.issue_date,
        documentHash: record.document_hash,
        issuerCode: issuer.issuer_code,
      },
      record.canonical_format_version
    );
    signature = verifyEd25519(canonical, record.signature, issuer.public_key)
      ? "VALID"
      : "INVALID";
  }

  // 4. Revocation status
  const revocation: RevocationCheck =
    record.status === "revoked" ? "REVOKED" : "ACTIVE";

  // Overall precedence
  let overall: VerificationResult["overall"];
  let explanation: string;

  if (integrity === "MISMATCH") {
    overall = "DOCUMENT_MISMATCH";
    explanation =
      "The uploaded document does not match the registered document. Its SHA-256 hash differs from the hash recorded at registration. This means the submitted file is not byte-identical to the original — it may have been edited, re-exported, or is a different file.";
  } else if (signature === "INVALID") {
    overall = "INVALID_SIGNATURE";
    explanation =
      "The registered metadata failed digital-signature verification against the issuer's public key. The signed record may have been altered.";
  } else if (revocation === "REVOKED") {
    overall = "REVOKED";
    explanation =
      "The document matches and the signature is valid, but the issuer has REVOKED this certificate. Integrity and current validity are separate checks: a revoked certificate must not be accepted even though its bytes are unchanged.";
  } else if (
    integrity === "MATCH" &&
    signature === "VALID" &&
    revocation === "ACTIVE"
  ) {
    overall = "VERIFIED";
    explanation =
      "All checks passed: the document matches the registered record, the issuer's signature is valid, and the certificate is active.";
  } else {
    overall = "INCONCLUSIVE";
    explanation =
      "Verification could not be completed conclusively. One or more checks could not be evaluated (for example, the issuer public key was unavailable).";
  }

  const result: VerificationResult = {
    certificateId: record.certificate_id,
    issuer: issuer
      ? { issuerName: issuer.issuer_name, issuerCode: issuer.issuer_code }
      : null,
    checks: { record: "FOUND", integrity, signature, revocation },
    overall,
    explanation,
    details: {
      submittedHash,
      registeredHash: record.document_hash,
      revokedAt: record.revoked_at,
      revocationReason: record.revocation_reason,
    },
  };

  recordAuditEvent({
    action: "CERTIFICATE_VERIFICATION",
    target: record.certificate_id,
    outcome: overall,
    actorId: params.actorId ?? null,
    resourceType: "certificate",
    correlationId: params.correlationId,
    details: {
      integrity,
      signature,
      revocation,
      submittedHash,
    },
  });
  recordSecurityEvent({
    eventType: "CERT_VERIFICATION",
    severity: "info",
    actorId: params.actorId ?? null,
    sourceIp: params.sourceIp ?? null,
    resourceType: "certificate",
    resourceId: record.certificate_id,
    detectionRule: "VERIFICATION",
    riskContribution: 1,
    correlationId: params.correlationId,
    metadata: { overall, integrity, signature, revocation },
  });

  return result;
}
