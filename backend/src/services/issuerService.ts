import { getDb } from "../db/connection.js";
import { config } from "../config/index.js";
import { ensureIssuerKey } from "../crypto/keyManager.js";
import type { IssuerRecord } from "../types/index.js";

/**
 * Ensure the demonstration issuer exists with a persisted public key that
 * matches the on-disk private key. Idempotent across restarts.
 *
 * If the private key was (re)generated, the stored public key is refreshed so
 * the two always stay in sync.
 */
export function ensureDemoIssuer(): IssuerRecord {
  const db = getDb();
  const { publicKeyPem } = ensureIssuerKey();
  const now = new Date().toISOString();
  const { issuerName, issuerCode, keyAlgorithm } = config.demoIssuer;

  const existing = db
    .prepare("SELECT * FROM issuers WHERE issuer_code = ?")
    .get(issuerCode) as IssuerRecord | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO issuers (issuer_name, issuer_code, public_key, key_algorithm, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).run(issuerName, issuerCode, publicKeyPem, keyAlgorithm, now, now);
  } else if (existing.public_key !== publicKeyPem) {
    // Keep stored public key in sync with the current private key on disk.
    db.prepare(
      "UPDATE issuers SET public_key = ?, updated_at = ? WHERE issuer_code = ?"
    ).run(publicKeyPem, now, issuerCode);
  }

  return db
    .prepare("SELECT * FROM issuers WHERE issuer_code = ?")
    .get(issuerCode) as IssuerRecord;
}

export function getDemoIssuer(): IssuerRecord {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM issuers WHERE issuer_code = ?")
    .get(config.demoIssuer.issuerCode) as IssuerRecord | undefined;
  if (!row) {
    return ensureDemoIssuer();
  }
  return row;
}

export function listIssuers(): IssuerRecord[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM issuers ORDER BY id ASC")
    .all() as IssuerRecord[];
}

export function getIssuerById(id: number): IssuerRecord | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM issuers WHERE id = ?").get(id) as
    | IssuerRecord
    | undefined;
}

/** Public-facing projection: NEVER includes any private key material. */
export function toPublicIssuer(issuer: IssuerRecord) {
  return {
    id: issuer.id,
    issuerName: issuer.issuer_name,
    issuerCode: issuer.issuer_code,
    publicKey: issuer.public_key,
    keyAlgorithm: issuer.key_algorithm,
    status: issuer.status,
    createdAt: issuer.created_at,
    updatedAt: issuer.updated_at,
  };
}
