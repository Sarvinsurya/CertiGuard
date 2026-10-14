import crypto from "node:crypto";
import { getDb } from "../db/connection.js";

/**
 * Application audit trail with tamper-evident hash chaining.
 *
 * Each entry stores the hash of the previous entry; its own entry_hash is
 * computed over a versioned canonical representation that includes prev_hash.
 * Writes are transactional so concurrent inserts cannot fork the chain.
 *
 * HONEST LIMITATION: a hash chain inside a single database does NOT prevent a
 * privileged database operator from rewriting the entire chain (they could
 * recompute all hashes). It makes casual/partial tampering detectable, not
 * impossible. For stronger guarantees, anchor the head hash externally.
 *
 * Never store passwords, OTPs, recovery codes, private keys, session cookies,
 * authorization headers, or unnecessary PII in audit records.
 */

export const AUDIT_CHAIN_VERSION = "1";
const GENESIS = "0".repeat(64);

export interface AuditEventInput {
  action: string;
  target?: string | null;
  outcome: string;
  correlationId?: string | null;
  details?: Record<string, unknown> | null;
  actorId?: number | null;
  actorRole?: string | null;
  resourceType?: string | null;
  sourceIp?: string | null;
}

export interface AuditLogRow {
  id: number;
  correlation_id: string | null;
  action: string;
  target: string | null;
  outcome: string;
  details: string | null;
  actor_id: number | null;
  actor_role: string | null;
  resource_type: string | null;
  source_ip: string | null;
  prev_hash: string | null;
  entry_hash: string | null;
  chain_version: string | null;
  created_at: string;
}

/** Canonical representation of an entry for hashing (fixed field order). */
function canonicalEntry(fields: {
  prevHash: string;
  action: string;
  target: string | null;
  outcome: string;
  actorId: number | null;
  actorRole: string | null;
  resourceType: string | null;
  details: string | null;
  correlationId: string | null;
  createdAt: string;
}): string {
  return [
    `v${AUDIT_CHAIN_VERSION}`,
    `prev=${fields.prevHash}`,
    `action=${fields.action}`,
    `target=${fields.target ?? ""}`,
    `outcome=${fields.outcome}`,
    `actor=${fields.actorId ?? ""}`,
    `role=${fields.actorRole ?? ""}`,
    `resourceType=${fields.resourceType ?? ""}`,
    `details=${fields.details ?? ""}`,
    `corr=${fields.correlationId ?? ""}`,
    `at=${fields.createdAt}`,
  ].join("\n");
}

export function recordAuditEvent(event: AuditEventInput): AuditLogRow {
  const db = getDb();
  const insert = db.transaction((): number => {
    const prev = db
      .prepare("SELECT entry_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
      .get() as { entry_hash: string | null } | undefined;
    const prevHash = prev?.entry_hash ?? GENESIS;
    const createdAt = new Date().toISOString();
    const detailsStr = event.details ? JSON.stringify(event.details) : null;

    const entryHash = crypto
      .createHash("sha256")
      .update(
        canonicalEntry({
          prevHash,
          action: event.action,
          target: event.target ?? null,
          outcome: event.outcome,
          actorId: event.actorId ?? null,
          actorRole: event.actorRole ?? null,
          resourceType: event.resourceType ?? null,
          details: detailsStr,
          correlationId: event.correlationId ?? null,
          createdAt,
        })
      )
      .digest("hex");

    const info = db
      .prepare(
        `INSERT INTO audit_logs (correlation_id, action, target, outcome, details,
           actor_id, actor_role, resource_type, source_ip, prev_hash, entry_hash, chain_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.correlationId ?? null,
        event.action,
        event.target ?? null,
        event.outcome,
        detailsStr,
        event.actorId ?? null,
        event.actorRole ?? null,
        event.resourceType ?? null,
        event.sourceIp ?? null,
        prevHash,
        entryHash,
        AUDIT_CHAIN_VERSION,
        createdAt
      );
    return Number(info.lastInsertRowid);
  });
  const id = insert();
  return db.prepare("SELECT * FROM audit_logs WHERE id = ?").get(id) as AuditLogRow;
}

export interface AuditFilters {
  action?: string;
  actorId?: number;
  outcome?: string;
  resourceType?: string;
  since?: string;
  until?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function listAuditEvents(filters: AuditFilters = {}): { events: AuditLogRow[]; total: number } {
  const db = getDb();
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.action) { clauses.push("action = ?"); values.push(filters.action); }
  if (filters.actorId) { clauses.push("actor_id = ?"); values.push(filters.actorId); }
  if (filters.outcome) { clauses.push("outcome = ?"); values.push(filters.outcome); }
  if (filters.resourceType) { clauses.push("resource_type = ?"); values.push(filters.resourceType); }
  if (filters.since) { clauses.push("created_at >= ?"); values.push(filters.since); }
  if (filters.until) { clauses.push("created_at <= ?"); values.push(filters.until); }
  if (filters.search) {
    clauses.push("(action LIKE ? OR target LIKE ? OR outcome LIKE ?)");
    const like = `%${filters.search}%`;
    values.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${where}`).get(...values) as { c: number }).c;
  const limit = Math.min(filters.limit ?? 50, 500);
  const offset = filters.offset ?? 0;
  const events = db
    .prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as AuditLogRow[];
  return { events, total };
}

export function getAuditEvent(id: number): AuditLogRow | undefined {
  return getDb().prepare("SELECT * FROM audit_logs WHERE id = ?").get(id) as AuditLogRow | undefined;
}

export function listRecentAuditEvents(limit = 50): AuditLogRow[] {
  return getDb().prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?").all(limit) as AuditLogRow[];
}

export interface IntegrityResult {
  ok: boolean;
  checked: number;
  firstBrokenId: number | null;
  message: string;
}

/**
 * Independently re-verify the hash chain. Entries written before chaining was
 * introduced (entry_hash IS NULL) are skipped as "pre-chain" and reported.
 */
export function verifyAuditIntegrity(): IntegrityResult {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM audit_logs WHERE entry_hash IS NOT NULL ORDER BY id ASC")
    .all() as AuditLogRow[];
  let prevHash = GENESIS;
  let checked = 0;
  for (const row of rows) {
    if ((row.prev_hash ?? GENESIS) !== prevHash) {
      return { ok: false, checked, firstBrokenId: row.id, message: `Chain link broken at entry ${row.id} (prev_hash mismatch).` };
    }
    const recomputed = crypto
      .createHash("sha256")
      .update(
        canonicalEntry({
          prevHash: row.prev_hash ?? GENESIS,
          action: row.action,
          target: row.target,
          outcome: row.outcome,
          actorId: row.actor_id,
          actorRole: row.actor_role,
          resourceType: row.resource_type,
          details: row.details,
          correlationId: row.correlation_id,
          createdAt: row.created_at,
        })
      )
      .digest("hex");
    if (recomputed !== row.entry_hash) {
      return { ok: false, checked, firstBrokenId: row.id, message: `Entry ${row.id} hash does not match its contents (tampering detected).` };
    }
    prevHash = row.entry_hash!;
    checked++;
  }
  return { ok: true, checked, firstBrokenId: null, message: `Verified ${checked} chained audit entries; chain intact.` };
}

/** CSV export of audit events (authorized callers only). */
export function exportAuditCsv(filters: AuditFilters = {}): string {
  const { events } = listAuditEvents({ ...filters, limit: 5000, offset: 0 });
  const header = [
    "id", "created_at", "actor_id", "actor_role", "action", "resource_type",
    "target", "outcome", "source_ip", "correlation_id", "entry_hash",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const e of events.reverse()) {
    lines.push([
      e.id, e.created_at, e.actor_id ?? "", e.actor_role ?? "", e.action,
      e.resource_type ?? "", e.target ?? "", e.outcome, e.source_ip ?? "",
      e.correlation_id ?? "", e.entry_hash ?? "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}
