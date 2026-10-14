import { getDb } from "../db/connection.js";
import {
  ROLES,
  ROLE_DESCRIPTIONS,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  ROLE_PERMISSIONS,
  type RoleName,
  type PermissionKey,
} from "../auth/rbac.js";

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role_id: number;
  organization_id: number | null;
  student_identifier: string | null;
  status: "active" | "inactive";
  mfa_enabled: number;
  must_change_password: number;
  failed_login_count: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  roleId: number;
  organizationId: number | null;
  organizationName: string | null;
  studentIdentifier: string | null;
  status: string;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** Seed roles, permissions, role_permissions, and a platform organization. Idempotent. */
export function seedRbac(): void {
  const db = getDb();
  const now = new Date().toISOString();

  const insRole = db.prepare("INSERT OR IGNORE INTO roles (name, description) VALUES (?, ?)");
  for (const role of Object.values(ROLES)) {
    insRole.run(role, ROLE_DESCRIPTIONS[role as RoleName]);
  }

  const insPerm = db.prepare(
    "INSERT OR IGNORE INTO permissions (permission_key, description) VALUES (?, ?)"
  );
  for (const perm of Object.values(PERMISSIONS)) {
    insPerm.run(perm, PERMISSION_DESCRIPTIONS[perm as PermissionKey]);
  }

  const roleIdByName = new Map<string, number>();
  for (const r of db.prepare("SELECT id, name FROM roles").all() as { id: number; name: string }[]) {
    roleIdByName.set(r.name, r.id);
  }
  const permIdByKey = new Map<string, number>();
  for (const p of db
    .prepare("SELECT id, permission_key FROM permissions")
    .all() as { id: number; permission_key: string }[]) {
    permIdByKey.set(p.permission_key, p.id);
  }

  const insRp = db.prepare(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)"
  );
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) continue;
    for (const perm of perms) {
      const permId = permIdByKey.get(perm);
      if (permId) insRp.run(roleId, permId);
    }
  }

  // Platform organization for administrators.
  const platform = db.prepare("SELECT id FROM organizations WHERE type = 'platform'").get();
  if (!platform) {
    db.prepare(
      "INSERT INTO organizations (name, type, status, created_at) VALUES (?, 'platform', 'active', ?)"
    ).run("CertiGuard Platform", now);
  }
}

export function getRoleIdByName(name: RoleName): number {
  const db = getDb();
  const row = db.prepare("SELECT id FROM roles WHERE name = ?").get(name) as
    | { id: number }
    | undefined;
  if (!row) throw new Error(`Role not found: ${name}`);
  return row.id;
}

export function getRoleNameById(id: number): string {
  const db = getDb();
  const row = db.prepare("SELECT name FROM roles WHERE id = ?").get(id) as
    | { name: string }
    | undefined;
  return row?.name ?? "unknown";
}

/** Resolve the permission keys for a role. */
export function getPermissionsForRole(roleId: number): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.permission_key AS k
       FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id = ?`
    )
    .all(roleId) as { k: string }[];
  return rows.map((r) => r.k);
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase().trim()) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  roleId: number;
  organizationId?: number | null;
  studentIdentifier?: string | null;
  mustChangePassword?: boolean;
}

export function createUser(input: CreateUserInput): UserRow {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, display_name, role_id, organization_id,
         student_identifier, status, mfa_enabled, must_change_password, failed_login_count,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?, 0, ?, ?)`
    )
    .run(
      input.email.toLowerCase().trim(),
      input.passwordHash,
      input.displayName,
      input.roleId,
      input.organizationId ?? null,
      input.studentIdentifier ?? null,
      input.mustChangePassword ? 1 : 0,
      now,
      now
    );
  return findUserById(Number(info.lastInsertRowid))!;
}

export function listUsers(filters: { search?: string; role?: string; status?: string } = {}): PublicUser[] {
  const db = getDb();
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filters.search) {
    clauses.push("(u.email LIKE ? OR u.display_name LIKE ?)");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.role) {
    clauses.push("r.name = ?");
    values.push(filters.role);
  }
  if (filters.status) {
    clauses.push("u.status = ?");
    values.push(filters.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT u.*, r.name AS role_name, o.name AS org_name
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.organization_id
       ${where} ORDER BY u.id DESC`
    )
    .all(...values) as (UserRow & { role_name: string; org_name: string | null })[];
  return rows.map(toPublicUserRow);
}

function toPublicUserRow(row: UserRow & { role_name?: string; org_name?: string | null }): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role_name ?? getRoleNameById(row.role_id),
    roleId: row.role_id,
    organizationId: row.organization_id,
    organizationName: row.org_name ?? null,
    studentIdentifier: row.student_identifier,
    status: row.status,
    mfaEnabled: row.mfa_enabled === 1,
    mustChangePassword: row.must_change_password === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export function toPublicUser(row: UserRow): PublicUser {
  const db = getDb();
  const extra = db
    .prepare(
      `SELECT r.name AS role_name, o.name AS org_name
       FROM users u JOIN roles r ON r.id = u.role_id
       LEFT JOIN organizations o ON o.id = u.organization_id WHERE u.id = ?`
    )
    .get(row.id) as { role_name: string; org_name: string | null } | undefined;
  return toPublicUserRow({ ...row, role_name: extra?.role_name, org_name: extra?.org_name ?? null });
}

export function setUserStatus(id: number, status: "active" | "inactive"): void {
  getDb()
    .prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
}

export function assignRole(id: number, roleId: number): void {
  getDb()
    .prepare("UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?")
    .run(roleId, new Date().toISOString(), id);
}

export function updateUserFields(id: number, fields: { displayName?: string; organizationId?: number | null }): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  if (fields.displayName !== undefined) {
    sets.push("display_name = ?");
    values.push(fields.displayName);
  }
  if (fields.organizationId !== undefined) {
    sets.push("organization_id = ?");
    values.push(fields.organizationId);
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), id);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}

export function recordLoginSuccess(id: number): void {
  getDb()
    .prepare(
      "UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?"
    )
    .run(new Date().toISOString(), new Date().toISOString(), id);
}

/** Returns whether the account is now locked. */
export function recordLoginFailure(id: number, maxFailed: number, lockoutSeconds: number): boolean {
  const db = getDb();
  const user = findUserById(id);
  if (!user) return false;
  const count = user.failed_login_count + 1;
  let lockedUntil: string | null = null;
  if (count >= maxFailed) {
    lockedUntil = new Date(Date.now() + lockoutSeconds * 1000).toISOString();
  }
  db.prepare(
    "UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?"
  ).run(count, lockedUntil, new Date().toISOString(), id);
  return lockedUntil !== null;
}

export function isLocked(user: UserRow): boolean {
  return user.locked_until != null && new Date(user.locked_until).getTime() > Date.now();
}

export function setPasswordHash(id: number, passwordHash: string, mustChange = false): void {
  getDb()
    .prepare(
      "UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?"
    )
    .run(passwordHash, mustChange ? 1 : 0, new Date().toISOString(), id);
}

export function setMfaEnabled(id: number, enabled: boolean): void {
  getDb()
    .prepare("UPDATE users SET mfa_enabled = ?, updated_at = ? WHERE id = ?")
    .run(enabled ? 1 : 0, new Date().toISOString(), id);
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  return row.c;
}

/** Ensure an organization exists; returns its id. */
export function ensureOrganization(name: string, type: "institution" | "company" | "platform"): number {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM organizations WHERE name = ? AND type = ?")
    .get(name, type) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = db
    .prepare("INSERT INTO organizations (name, type, status, created_at) VALUES (?, ?, 'active', ?)")
    .run(name, type, new Date().toISOString());
  return Number(info.lastInsertRowid);
}

export function listOrganizations() {
  return getDb()
    .prepare("SELECT id, name, type, status, created_at FROM organizations ORDER BY id ASC")
    .all();
}
