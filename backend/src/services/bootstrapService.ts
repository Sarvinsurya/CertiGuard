import { config } from "../config/index.js";
import { getDb } from "../db/connection.js";
import { hashPassword } from "./passwordService.js";
import { createUser, findUserByEmail, getRoleIdByName, ensureOrganization } from "./userService.js";
import { ROLES } from "../auth/rbac.js";
import { recordAuditEvent } from "./auditService.js";

/**
 * Secure initial administrator bootstrap.
 *
 * Creates ONE security administrator from CERTIGUARD_ADMIN_EMAIL /
 * CERTIGUARD_ADMIN_PASSWORD, and ONLY if no administrator already exists. This
 * prevents the process from silently creating additional admins after setup.
 * Credentials are never hardcoded and never printed.
 */
export function bootstrapAdmin(): void {
  const { email, password, displayName } = config.adminBootstrap;
  if (!email || !password) return; // nothing to do without provisioning env vars

  const db = getDb();
  const adminRoleId = getRoleIdByName(ROLES.ADMIN);
  const existingAdmin = db
    .prepare("SELECT id FROM users WHERE role_id = ? LIMIT 1")
    .get(adminRoleId);
  if (existingAdmin) return; // an administrator already exists; do not create another

  if (findUserByEmail(email)) return; // email already taken

  if (password.length < 10) {
    // eslint-disable-next-line no-console
    console.warn("[CertiGuard] Admin bootstrap skipped: CERTIGUARD_ADMIN_PASSWORD too short (min 10).");
    return;
  }

  const orgId = ensureOrganization("CertiGuard Platform", "platform");
  const user = createUser({
    email,
    passwordHash: hashPassword(password),
    displayName,
    roleId: adminRoleId,
    organizationId: orgId,
    mustChangePassword: true,
  });
  recordAuditEvent({
    action: "ADMIN_BOOTSTRAP",
    target: user.email,
    outcome: "SUCCESS",
    actorId: null,
    actorRole: "system",
    resourceType: "user",
    details: { note: "Initial administrator created from environment configuration." },
  });
  // Do NOT print the password.
  // eslint-disable-next-line no-console
  console.log(`[CertiGuard] Initial administrator provisioned: ${user.email} (must change password on first login).`);
}
