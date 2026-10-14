import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/connection.js";
import { config } from "../config/index.js";
import { sha256Hex } from "../crypto/hashing.js";
import { canonicalBuffer, CANONICAL_VERSION } from "../crypto/canonical.js";
import { signEd25519 } from "../crypto/signing.js";
import { loadIssuerPrivateKey } from "../crypto/keyManager.js";
import { ensureDemoIssuer } from "./issuerService.js";
import { recordAuditEvent } from "./auditService.js";
import { errors } from "../utils/response.js";
import type { RegisterCertificateInput } from "../utils/validation.js";
import type { CertificateRecord, IssuerRecord } from "../types/index.js";

export interface RegisterParams extends RegisterCertificateInput {
  fileBuffer: Buffer;
  originalFilename: string;
  correlationId?: string;
}

/**
 * Register a certificate:
 *  1. hash the exact uploaded bytes (SHA-256),
 *  2. build the deterministic canonical metadata record,
 *  3. sign it with the issuer Ed25519 private key,
 *  4. persist the stored file + DB row atomically (file write + transaction).
 */
export function registerCertificate(params: RegisterParams): CertificateRecord {
  const db = getDb();
  const issuer: IssuerRecord = ensureDemoIssuer();

  // Reject duplicate certificate IDs up front (also enforced by UNIQUE).
  const existing = db
    .prepare("SELECT id FROM certificates WHERE certificate_id = ?")
    .get(params.certificateId);
  if (existing) {
    throw errors.conflict(
      `A certificate with ID "${params.certificateId}" is already registered.`
    );
  }

  const documentHash = sha256Hex(params.fileBuffer);

  const canonical = canonicalBuffer({
    certificateId: params.certificateId,
    studentName: params.studentName,
    studentIdentifier: params.studentIdentifier,
    institutionName: params.institutionName,
    qualification: params.qualification,
    graduationYear: params.graduationYear,
    issueDate: params.issueDate,
    documentHash,
    issuerCode: issuer.issuer_code,
  });

  const privateKeyPem = loadIssuerPrivateKey();
  const signature = signEd25519(canonical, privateKeyPem);

  // Store the document outside any public directory with a random, safe name.
  fs.mkdirSync(config.paths.storageDir, { recursive: true });
  const fileReference = `${Date.now()}-${crypto.randomUUID()}.pdf`;
  const storedPath = path.join(config.paths.storageDir, fileReference);
  fs.writeFileSync(storedPath, params.fileBuffer);

  const now = new Date().toISOString();

  try {
    const insert = db.transaction(() => {
      db.prepare(
        `INSERT INTO certificates (
           certificate_id, student_name, student_identifier, institution_name,
           qualification, graduation_year, issue_date, document_hash, signature,
           signature_algorithm, canonical_format_version, issuer_id, file_reference,
           status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).run(
        params.certificateId,
        params.studentName,
        params.studentIdentifier,
        params.institutionName,
        params.qualification,
        params.graduationYear,
        params.issueDate,
        documentHash,
        signature,
        config.signatureAlgorithm,
        CANONICAL_VERSION,
        issuer.id,
        fileReference,
        now,
        now
      );
    });
    insert();
  } catch (err) {
    // Roll back the orphaned file if the DB write failed.
    try {
      fs.unlinkSync(storedPath);
    } catch {
      /* ignore cleanup failure */
    }
    throw err;
  }

  const record = getCertificateById(params.certificateId)!;

  recordAuditEvent({
    action: "CERTIFICATE_REGISTERED",
    target: params.certificateId,
    outcome: "SUCCESS",
    correlationId: params.correlationId,
    details: { documentHash, issuerCode: issuer.issuer_code },
  });

  return record;
}

export function getCertificateById(
  certificateId: string
): CertificateRecord | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM certificates WHERE certificate_id = ?")
    .get(certificateId) as CertificateRecord | undefined;
}

export interface ListFilters {
  search?: string;
  status?: "active" | "revoked";
}

export function listCertificates(filters: ListFilters = {}): CertificateRecord[] {
  const db = getDb();
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  if (filters.search && filters.search.trim()) {
    clauses.push("(certificate_id LIKE ? OR student_name LIKE ?)");
    const like = `%${filters.search.trim()}%`;
    values.push(like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM certificates ${where} ORDER BY id DESC`)
    .all(...values) as CertificateRecord[];
}

export interface RevokeParams {
  certificateId: string;
  reason: string;
  correlationId?: string;
}

export function revokeCertificate(params: RevokeParams): CertificateRecord {
  const db = getDb();
  const record = getCertificateById(params.certificateId);
  if (!record) {
    throw errors.notFound(
      `No certificate found with ID "${params.certificateId}".`
    );
  }

  if (record.status === "revoked") {
    // Idempotent: repeated revocation requests are handled consistently.
    recordAuditEvent({
      action: "CERTIFICATE_REVOCATION",
      target: params.certificateId,
      outcome: "ALREADY_REVOKED",
      correlationId: params.correlationId,
    });
    return record;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE certificates
       SET status = 'revoked', revoked_at = ?, revocation_reason = ?, updated_at = ?
     WHERE certificate_id = ?`
  ).run(now, params.reason, now, params.certificateId);

  recordAuditEvent({
    action: "CERTIFICATE_REVOCATION",
    target: params.certificateId,
    outcome: "SUCCESS",
    correlationId: params.correlationId,
    details: { reason: params.reason },
  });

  return getCertificateById(params.certificateId)!;
}

/** Public projection of a certificate (safe to send to the frontend). */
export function toPublicCertificate(record: CertificateRecord) {
  return {
    certificateId: record.certificate_id,
    studentName: record.student_name,
    studentIdentifier: record.student_identifier,
    institutionName: record.institution_name,
    qualification: record.qualification,
    graduationYear: record.graduation_year,
    issueDate: record.issue_date,
    documentHash: record.document_hash,
    signature: record.signature,
    signatureAlgorithm: record.signature_algorithm,
    canonicalFormatVersion: record.canonical_format_version,
    issuerId: record.issuer_id,
    status: record.status,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    revokedAt: record.revoked_at,
    revocationReason: record.revocation_reason,
  };
}
