import { getDb } from "../db/connection.js";

/**
 * Centralized security-event pipeline. Events are recorded from REAL application
 * activity (auth failures, rate-limit violations, unauthorized access, etc.).
 * Never store raw passwords, OTPs, recovery codes, session secrets, or keys.
 */

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface SecurityEventInput {
  eventType: string;
  severity: Severity;
  actorId?: number | null;
  actorLabel?: string | null;
  organizationId?: number | null;
  sourceIp?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  detectionRule?: string | null;
  riskContribution?: number;
  metadata?: Record<string, unknown> | null;
  correlationId?: string | null;
}

export interface SecurityEventRow {
  id: number;
  event_type: string;
  severity: Severity;
  actor_id: number | null;
  actor_label: string | null;
  organization_id: number | null;
  source_ip: string | null;
  resource_type: string | null;
  resource_id: string | null;
  detection_rule: string | null;
  risk_contribution: number;
  metadata_json: string | null;
  resolution_status: string;
  correlation_id: string | null;
  created_at: string;
}

export function recordSecurityEvent(input: SecurityEventInput): SecurityEventRow {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO security_events (event_type, severity, actor_id, actor_label, organization_id,
         source_ip, resource_type, resource_id, detection_rule, risk_contribution, metadata_json,
         resolution_status, correlation_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
    )
    .run(
      input.eventType,
      input.severity,
      input.actorId ?? null,
      input.actorLabel ?? null,
      input.organizationId ?? null,
      input.sourceIp ?? null,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.detectionRule ?? null,
      input.riskContribution ?? 0,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.correlationId ?? null,
      new Date().toISOString()
    );
  return db.prepare("SELECT * FROM security_events WHERE id = ?").get(Number(info.lastInsertRowid)) as SecurityEventRow;
}

export interface EventFilters {
  severity?: Severity;
  eventType?: string;
  actorId?: number;
  since?: string; // ISO
  search?: string;
  limit?: number;
  offset?: number;
}

export function listSecurityEvents(filters: EventFilters = {}): { events: SecurityEventRow[]; total: number } {
  const db = getDb();
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.severity) { clauses.push("severity = ?"); values.push(filters.severity); }
  if (filters.eventType) { clauses.push("event_type = ?"); values.push(filters.eventType); }
  if (filters.actorId) { clauses.push("actor_id = ?"); values.push(filters.actorId); }
  if (filters.since) { clauses.push("created_at >= ?"); values.push(filters.since); }
  if (filters.search) {
    clauses.push("(event_type LIKE ? OR detection_rule LIKE ? OR resource_id LIKE ?)");
    const like = `%${filters.search}%`;
    values.push(like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM security_events ${where}`).get(...values) as { c: number }).c;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const events = db
    .prepare(`SELECT * FROM security_events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as SecurityEventRow[];
  return { events, total };
}

export function getSecurityEvent(id: number): SecurityEventRow | undefined {
  return getDb().prepare("SELECT * FROM security_events WHERE id = ?").get(id) as SecurityEventRow | undefined;
}

/** Count recent events of a type for a subject within a time window (for detection rules). */
export function countRecentEvents(opts: {
  eventTypes: string[];
  actorId?: number | null;
  sourceIp?: string | null;
  windowSeconds: number;
}): number {
  const db = getDb();
  const since = new Date(Date.now() - opts.windowSeconds * 1000).toISOString();
  const placeholders = opts.eventTypes.map(() => "?").join(",");
  const clauses = [`event_type IN (${placeholders})`, "created_at >= ?"];
  const values: unknown[] = [...opts.eventTypes, since];
  if (opts.actorId != null) { clauses.push("actor_id = ?"); values.push(opts.actorId); }
  if (opts.sourceIp != null) { clauses.push("source_ip = ?"); values.push(opts.sourceIp); }
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM security_events WHERE ${clauses.join(" AND ")}`)
    .get(...values) as { c: number };
  return row.c;
}

export function securitySummary(sinceIso?: string) {
  const db = getDb();
  const since = sinceIso ?? new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const total = (db.prepare("SELECT COUNT(*) AS c FROM security_events WHERE created_at >= ?").get(since) as { c: number }).c;
  const bySeverity = db
    .prepare("SELECT severity, COUNT(*) AS c FROM security_events WHERE created_at >= ? GROUP BY severity")
    .all(since) as { severity: string; c: number }[];
  const byType = db
    .prepare("SELECT event_type AS type, COUNT(*) AS c FROM security_events WHERE created_at >= ? GROUP BY event_type ORDER BY c DESC LIMIT 10")
    .all(since) as { type: string; c: number }[];
  const openIncidents = (db.prepare("SELECT COUNT(*) AS c FROM incidents WHERE status NOT IN ('resolved','false_positive')").get() as { c: number }).c;
  const resolvedIncidents = (db.prepare("SELECT COUNT(*) AS c FROM incidents WHERE status IN ('resolved','false_positive')").get() as { c: number }).c;
  return { since, total, bySeverity, byType, openIncidents, resolvedIncidents };
}
