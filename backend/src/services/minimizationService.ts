import { maskEmail, maskId, maskPhone } from "./maskingService.js";

/**
 * Data minimization.
 *
 * Different operations receive only the fields they need, enforced by explicit
 * backend allowlists (never by returning raw DB rows or relying on the frontend
 * to hide fields).
 *
 * Serializers:
 *   - full:          issuer/admin prototype view (all fields).
 *   - verification:  what a verifier needs (no personal contact/DOB/internal id).
 *   - publicStatus:  minimal public lookup (status + qualification + institution).
 *   - maskedDisplay: masked PII for a display context.
 */

export interface FullCertificateRecord {
  certificateId: string;
  studentName: string;
  studentIdentifier: string;
  studentEmail?: string;
  studentPhone?: string;
  dateOfBirth?: string;
  address?: string;
  institutionName: string;
  qualification: string;
  graduationYear: number;
  issueDate: string;
  documentHash: string;
  signatureAlgorithm: string;
  status: string;
  [key: string]: unknown;
}

// Explicit allowlists ---------------------------------------------------------

const VERIFICATION_FIELDS = [
  "certificateId",
  "qualification",
  "institutionName",
  "issueDate",
  "graduationYear",
  "status",
  "signatureAlgorithm",
] as const;

const PUBLIC_STATUS_FIELDS = [
  "certificateId",
  "qualification",
  "institutionName",
  "status",
] as const;

function pick<T extends Record<string, unknown>>(
  obj: T,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (obj[f] !== undefined) out[f] = obj[f];
  }
  return out;
}

export function serializeVerification(record: FullCertificateRecord) {
  return pick(record, VERIFICATION_FIELDS);
}

export function serializePublicStatus(record: FullCertificateRecord) {
  return pick(record, PUBLIC_STATUS_FIELDS);
}

export function serializeMaskedDisplay(record: FullCertificateRecord) {
  return {
    certificateId: record.certificateId,
    studentName: record.studentName,
    studentIdentifier: maskId(record.studentIdentifier),
    studentEmail: record.studentEmail ? maskEmail(record.studentEmail) : undefined,
    studentPhone: record.studentPhone ? maskPhone(record.studentPhone) : undefined,
    qualification: record.qualification,
    institutionName: record.institutionName,
    status: record.status,
  };
}

export type MinimizationOperation =
  | "verification"
  | "publicStatus"
  | "maskedDisplay"
  | "fullAdmin";

export interface MinimizationComparison {
  operation: MinimizationOperation;
  fullFieldCount: number;
  responseFieldCount: number;
  includedFields: string[];
  excludedFields: string[];
  exclusionReasons: Record<string, string>;
  response: Record<string, unknown>;
}

const SENSITIVE_REASON: Record<string, string> = {
  studentIdentifier: "Internal identifier — not needed to confirm a qualification.",
  studentEmail: "Personal contact detail — unnecessary for verification.",
  studentPhone: "Personal contact detail — unnecessary for verification.",
  dateOfBirth: "Sensitive personal data — not required by a verifier.",
  address: "Sensitive location data — not required by a verifier.",
  studentName: "Personal data — excluded from minimal public status lookups.",
  documentHash: "Internal integrity value — not part of a minimal public view.",
  graduationYear: "Not required for a minimal public status lookup.",
  issueDate: "Not required for a minimal public status lookup.",
  signatureAlgorithm: "Internal cryptographic detail — not part of a public view.",
};

export function minimize(
  record: FullCertificateRecord,
  operation: MinimizationOperation
): MinimizationComparison {
  let response: Record<string, unknown>;
  switch (operation) {
    case "verification":
      response = serializeVerification(record);
      break;
    case "publicStatus":
      response = serializePublicStatus(record);
      break;
    case "maskedDisplay":
      response = Object.fromEntries(
        Object.entries(serializeMaskedDisplay(record)).filter(([, v]) => v !== undefined)
      );
      break;
    case "fullAdmin":
    default:
      response = { ...record };
      break;
  }

  const allFields = Object.keys(record);
  const includedFields = Object.keys(response);
  const excludedFields = allFields.filter((f) => !includedFields.includes(f));
  const exclusionReasons: Record<string, string> = {};
  for (const f of excludedFields) {
    exclusionReasons[f] =
      SENSITIVE_REASON[f] ?? "Not required for this operation (minimized).";
  }

  return {
    operation,
    fullFieldCount: allFields.length,
    responseFieldCount: includedFields.length,
    includedFields,
    excludedFields,
    exclusionReasons,
    response,
  };
}

/** A synthetic full record used by the lab (no real personal data). */
export function sampleFullRecord(): FullCertificateRecord {
  return {
    certificateId: "SAMPLE-CGDU-2024-0001",
    studentName: "Aarav Sharma",
    studentIdentifier: "CGDU-STU-2024-0001",
    studentEmail: "aarav.sharma@example.edu",
    studentPhone: "9876543210",
    dateOfBirth: "2002-03-14",
    address: "42 College Road, Example City",
    institutionName: "CertiGuard Demonstration University",
    qualification: "B.Tech Computer Science and Engineering",
    graduationYear: 2024,
    issueDate: "2024-06-15",
    documentHash: "0".repeat(64),
    signatureAlgorithm: "Ed25519",
    status: "active",
  };
}
