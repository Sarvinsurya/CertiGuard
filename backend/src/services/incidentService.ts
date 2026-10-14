import { getDb } from "../db/connection.js";
import { recordAuditEvent } from "./auditService.js";
import { recordSecurityEvent } from "./securityEventService.js";
import { revokeAllUserSessions } from "./sessionService.js";
import { findUserById, setPasswordHash } from "./userService.js";

/**
 * Incident lifecycle + SAFE, REVERSIBLE response actions.
 *
 * Response actions are conservative: temporary throttle/suspend, session
 * revocation, require-password-reset, require-MFA, flag-for-review. We never
 * permanently delete users/certificates/files, never auto-revoke real
 * certificates on heuristics, and never auto-disable administrators on an
 * unconfirmed alert.
 */

export type IncidentStatus = "open" | "investigating" | "contained" | "resolved" | "false_positive";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export interface IncidentRow {
  id: number;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  risk_score: number;
  detection_rule: string | null;
  subject_type: string | null;
  subject_id: string | null;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export interface CreateIncidentInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  riskScore?: number;
  detectionRule?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  actorId?: number | null;
  correlationId?: string | null;
}

export function createIncident(input: CreateIncidentInput): IncidentRow {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO incidents (title, description, severity, status, risk_score, detection_rule, subject_type, subject_id, created_at, updated_at)
       VALUES (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.title, input.description, input.severity, input.riskScore ?? 0,
      input.detectionRule ?? null, input.subjectType ?? null, input.subjectId ?? null, now, now
    );
  const id = Number(info.lastInsertRowid);
  recordAuditEvent({
    action: "INCIDENT_CREATED", target: `incident:${id}`, outcome: "SUCCESS",
    actorId: input.actorId ?? null, resourceType: "incident", correlationId: input.correlationId,
    details: { severity: input.severity, detectionRule: input.detectionRule },
  });
  return getIncident(id)!;
}

export function getIncident(id: number): IncidentRow | undefined {
  return getDb().prepare("SELECT * FROM incidents WHERE id = ?").get(id) as IncidentRow | undefined;
}

export function listIncidents(filters: { status?: string; severity?: string; limit?: number; offset?: number } = {}) {
  const db = getDb();
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.status) { clauses.push("status = ?"); values.push(filters.status); }
  if (filters.severity) { clauses.push("severity = ?"); values.push(filters.severity); }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM incidents ${where}`).get(...values) as { c: number }).c;
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const incidents = db
    .prepare(`SELECT * FROM incidents ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...values, limit, offset) as IncidentRow[];
  return { incidents, total };
}

export function updateIncidentStatus(id: number, status: IncidentStatus, actorId: number, notes?: string, correlationId?: string): IncidentRow {
  const db = getDb();
  const now = new Date().toISOString();
  const resolvedAt = status === "resolved" || status === "false_positive" ? now : null;
  db.prepare(
    "UPDATE incidents SET status = ?, resolution_notes = COALESCE(?, resolution_notes), resolved_at = ?, assigned_to = COALESCE(assigned_to, ?), updated_at = ? WHERE id = ?"
  ).run(status, notes ?? null, resolvedAt, actorId, now, id);
  recordAuditEvent({
    action: "INCIDENT_STATUS_CHANGE", target: `incident:${id}`, outcome: status.toUpperCase(),
    actorId, resourceType: "incident", correlationId, details: { status, notes },
  });
  return getIncident(id)!;
}

export const RESPONSE_ACTIONS = [
  "throttle",
  "suspend",
  "revoke_sessions",
  "require_password_reset",
  "require_mfa",
  "flag_review",
] as const;
export type ResponseActionType = (typeof RESPONSE_ACTIONS)[number];

export interface ApplyActionInput {
  incidentId: number;
  actorId: number;
  actionType: ResponseActionType;
  targetUserId: number;
  reason: string;
  durationSeconds?: number;
  correlationId?: string | null;
}

export interface ActionResult {
  actionId: number;
  actionType: ResponseActionType;
  targetUserId: number;
  expiresAt: string | null;
  effect: string;
}

/** Apply a safe, reversible response action against a target account. */
export function applyResponseAction(input: ApplyActionInput): ActionResult {
  const db = getDb();
  const target = findUserById(input.targetUserId);
  if (!target) throw new Error("Target account not found.");
  if (target.role_id && isAdministrator(target.role_id) && (input.actionType === "suspend")) {
    throw new Error("Administrator accounts cannot be auto-suspended by a response action.");
  }

  const now = Date.now();
  const expiresAt = input.durationSeconds ? new Date(now + input.durationSeconds * 1000).toISOString() : null;
  let effect = "";

  const tx = db.transaction(() => {
    // Record the account restriction (reversible).
    const restrictionMap: Record<ResponseActionType, string | null> = {
      throttle: "throttle",
      suspend: "suspend",
      revoke_sessions: null,
      require_password_reset: "require_password_reset",
      require_mfa: "require_mfa",
      flag_review: "flag_review",
    };
    const restriction = restrictionMap[input.actionType];
    if (restriction) {
      db.prepare(
        "INSERT INTO account_restrictions (user_id, restriction, reason, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
      ).run(input.targetUserId, restriction, input.reason, new Date(now).toISOString(), expiresAt);
    }

    switch (input.actionType) {
      case "suspend":
        db.prepare("UPDATE users SET status = 'inactive', updated_at = ? WHERE id = ?").run(new Date(now).toISOString(), input.targetUserId);
        revokeAllUserSessions(input.targetUserId);
        effect = "Account temporarily suspended and all sessions revoked.";
        break;
      case "revoke_sessions": {
        const n = revokeAllUserSessions(input.targetUserId);
        effect = `Revoked ${n} active session(s).`;
        break;
      }
      case "require_password_reset":
        db.prepare("UPDATE users SET must_change_password = 1, updated_at = ? WHERE id = ?").run(new Date(now).toISOString(), input.targetUserId);
        revokeAllUserSessions(input.targetUserId);
        effect = "User must reset password on next login; sessions revoked.";
        break;
      case "require_mfa":
        revokeAllUserSessions(input.targetUserId);
        effect = "User must re-authenticate (and complete MFA) on next login.";
        break;
      case "throttle":
        effect = "Account flagged for temporary rate throttling.";
        break;
      case "flag_review":
        effect = "Account flagged for manual review.";
        break;
    }

    const info = db
      .prepare(
        `INSERT INTO incident_actions (incident_id, actor_id, action_type, target_type, target_id, reason, duration_seconds, created_at, expires_at)
         VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?)`
      )
      .run(
        input.incidentId, input.actorId, input.actionType, String(input.targetUserId),
        input.reason, input.durationSeconds ?? null, new Date(now).toISOString(), expiresAt
      );
    // Move the incident to 'contained' when an action is applied.
    db.prepare("UPDATE incidents SET status = CASE WHEN status = 'open' THEN 'contained' ELSE status END, updated_at = ? WHERE id = ?")
      .run(new Date(now).toISOString(), input.incidentId);
    return Number(info.lastInsertRowid);
  });

  const actionId = tx();

  recordAuditEvent({
    action: "INCIDENT_RESPONSE_ACTION", target: `user:${input.targetUserId}`, outcome: "SUCCESS",
    actorId: input.actorId, resourceType: "incident_action", correlationId: input.correlationId,
    details: { incidentId: input.incidentId, actionType: input.actionType, reason: input.reason, expiresAt },
  });
  recordSecurityEvent({
    eventType: "INCIDENT_RESPONSE", severity: "medium", actorId: input.actorId,
    resourceType: "user", resourceId: String(input.targetUserId), detectionRule: "RESPONSE_ACTION",
    correlationId: input.correlationId, metadata: { actionType: input.actionType, incidentId: input.incidentId },
  });

  return { actionId, actionType: input.actionType, targetUserId: input.targetUserId, expiresAt, effect };
}

/** Reverse a previously-applied action (e.g., un-suspend). */
export function reverseAction(actionId: number, actorId: number, correlationId?: string): void {
  const db = getDb();
  const action = db.prepare("SELECT * FROM incident_actions WHERE id = ?").get(actionId) as
    | { id: number; action_type: string; target_id: string; reversed_at: string | null }
    | undefined;
  if (!action || action.reversed_at) return;
  const userId = Number(action.target_id);
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    if (action.action_type === "suspend") {
      db.prepare("UPDATE users SET status = 'active', updated_at = ? WHERE id = ?").run(now, userId);
    }
    db.prepare("UPDATE account_restrictions SET reversed_at = ? WHERE user_id = ? AND reversed_at IS NULL").run(now, userId);
    db.prepare("UPDATE incident_actions SET reversed_at = ? WHERE id = ?").run(now, actionId);
  });
  tx();
  recordAuditEvent({
    action: "INCIDENT_ACTION_REVERSED", target: `user:${userId}`, outcome: "SUCCESS",
    actorId, resourceType: "incident_action", correlationId, details: { actionId, actionType: action.action_type },
  });
}

export function listIncidentActions(incidentId: number) {
  return getDb()
    .prepare("SELECT * FROM incident_actions WHERE incident_id = ? ORDER BY id DESC")
    .all(incidentId);
}

function isAdministrator(roleId: number): boolean {
  const row = getDb().prepare("SELECT name FROM roles WHERE id = ?").get(roleId) as { name: string } | undefined;
  return row?.name === "security_administrator";
}
