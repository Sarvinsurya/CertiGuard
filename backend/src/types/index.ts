export type CertificateStatus = "active" | "revoked";
export type IssuerStatus = "active" | "suspended";

export interface IssuerRecord {
  id: number;
  issuer_name: string;
  issuer_code: string;
  public_key: string;
  key_algorithm: string;
  status: IssuerStatus;
  created_at: string;
  updated_at: string;
}

export interface CertificateRecord {
  id: number;
  certificate_id: string;
  student_name: string;
  student_identifier: string;
  institution_name: string;
  qualification: string;
  graduation_year: number;
  issue_date: string;
  document_hash: string;
  signature: string;
  signature_algorithm: string;
  canonical_format_version: string;
  issuer_id: number;
  file_reference: string;
  status: CertificateStatus;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  revocation_reason: string | null;
}

// Independent verification check outcomes
export type RecordCheck = "FOUND" | "NOT_FOUND";
export type IntegrityCheck = "MATCH" | "MISMATCH" | "NOT_CHECKED";
export type SignatureCheck = "VALID" | "INVALID" | "NOT_CHECKED";
export type RevocationCheck = "ACTIVE" | "REVOKED" | "UNKNOWN";

export type OverallResult =
  | "VERIFIED"
  | "DOCUMENT_MISMATCH"
  | "INVALID_SIGNATURE"
  | "REVOKED"
  | "NOT_REGISTERED"
  | "INCONCLUSIVE";

export interface VerificationResult {
  certificateId: string;
  issuer: { issuerName: string; issuerCode: string } | null;
  checks: {
    record: RecordCheck;
    integrity: IntegrityCheck;
    signature: SignatureCheck;
    revocation: RevocationCheck;
  };
  overall: OverallResult;
  explanation: string;
  details: {
    submittedHash: string | null;
    registeredHash: string | null;
    revokedAt?: string | null;
    revocationReason?: string | null;
  };
}
