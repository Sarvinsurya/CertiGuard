import crypto from "node:crypto";
import { getDb } from "../db/connection.js";
import { config } from "../config/index.js";

/**
 * Server-managed sessions. The raw random session id is returned to the client
 * ONCE (as an HttpOnly cookie); only its SHA-256 hash is stored. This means a
 * database read cannot reconstruct a usable session token.
 */

export interface SessionRow {
  id: number;
  user_id: number;
  session_hash: string;
  mfa_pending: number;
  csrf_token: string;
  created_at: string;
  expires_at: string;
  last_activity_at: string;
  revoked_at: string | null;
}

export interface CreatedSession {
  rawToken: string; // set as the cookie value; never stored
  csrfToken: string;
  sessionId: number;
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function createSession(userId: number, mfaPending: boolean): CreatedSession {
  const db = getDb();
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO sessions (user_id, session_hash, mfa_pending, csrf_token, created_at, expires_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      hashToken(rawToken),
      mfaPending ? 1 : 0,
      csrfToken,
      new Date(now).toISOString(),
      new Date(now + config.session.ttlSeconds * 1000).toISOString(),
      new Date(now).toISOString()
    );
  return { rawToken, csrfToken, sessionId: Number(info.lastInsertRowid) };
}

export function getValidSession(rawToken: string): SessionRow | undefined {
  if (!rawToken) return undefined;
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM sessions WHERE session_hash = ?")
    .get(hashToken(rawToken)) as SessionRow | undefined;
  if (!row) return undefined;
  if (row.revoked_at) return undefined;
  const now = Date.now();
  if (new Date(row.expires_at).getTime() <= now) return undefined;
  if (new Date(row.last_activity_at).getTime() + config.session.idleSeconds * 1000 <= now) {
    return undefined; // idle timeout
  }
  return row;
}

export function touchSession(id: number): void {
  getDb()
    .prepare("UPDATE sessions SET last_activity_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

/** Clear the mfa_pending flag + rotate the session token after full auth. */
export function completeMfa(sessionId: number): CreatedSession {
  const db = getDb();
  const row = db.prepare("SELECT user_id FROM sessions WHERE id = ?").get(sessionId) as
    | { user_id: number }
    | undefined;
  if (!row) throw new Error("Session not found.");
  // Rotate: revoke the old session, create a fresh non-pending one.
  revokeSessionById(sessionId);
  return createSession(row.user_id, false);
}

export function revokeSessionById(id: number): void {
  getDb()
    .prepare("UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), id);
}

export function revokeSessionByToken(rawToken: string): void {
  getDb()
    .prepare("UPDATE sessions SET revoked_at = ? WHERE session_hash = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), hashToken(rawToken));
}

/** Revoke ALL sessions for a user (logout-everywhere / password reset / deactivation). */
export function revokeAllUserSessions(userId: number): number {
  const info = getDb()
    .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
    .run(new Date().toISOString(), userId);
  return info.changes;
}

export function listUserSessions(userId: number) {
  return getDb()
    .prepare(
      `SELECT id, created_at, expires_at, last_activity_at, revoked_at, mfa_pending
       FROM sessions WHERE user_id = ? ORDER BY id DESC`
    )
    .all(userId);
}
