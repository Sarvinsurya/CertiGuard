/**
 * Centralized RBAC definitions. Role → permission mappings are seeded into the
 * database so they can evolve, but these constants are the source of truth.
 */

export const ROLES = {
  ISSUER: "institution_issuer",
  VERIFIER: "company_verifier",
  STUDENT: "student",
  ADMIN: "security_administrator",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  [ROLES.ISSUER]: "Registers and manages certificates for an institution.",
  [ROLES.VERIFIER]: "Verifies certificates on behalf of a company.",
  [ROLES.STUDENT]: "Views their own certificates and verification status.",
  [ROLES.ADMIN]: "Manages users, security operations, audit, and incidents.",
};

export const PERMISSIONS = {
  CERT_REGISTER: "certificate.register",
  CERT_VERIFY: "certificate.verify",
  CERT_VIEW: "certificate.view",
  CERT_REVOKE: "certificate.revoke",
  CERT_DOWNLOAD: "certificate.download",
  CERT_VIEW_OWN: "certificate.view_own",
  PRIVACY_USE: "privacy.use",
  USER_VIEW: "user.view",
  USER_CREATE: "user.create",
  USER_UPDATE: "user.update",
  USER_DEACTIVATE: "user.deactivate",
  ROLE_ASSIGN: "role.assign",
  SECURITY_VIEW: "security.view",
  SECURITY_CONFIGURE: "security.configure",
  AUDIT_VIEW: "audit.view",
  INCIDENT_VIEW: "incident.view",
  INCIDENT_RESPOND: "incident.respond",
  ACCOUNT_MANAGE: "account.manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.CERT_REGISTER]: "Register new certificates.",
  [PERMISSIONS.CERT_VERIFY]: "Verify submitted certificates.",
  [PERMISSIONS.CERT_VIEW]: "View certificate records in scope.",
  [PERMISSIONS.CERT_REVOKE]: "Revoke certificates in scope.",
  [PERMISSIONS.CERT_DOWNLOAD]: "Download certificate files in scope.",
  [PERMISSIONS.CERT_VIEW_OWN]: "View own certificate records.",
  [PERMISSIONS.PRIVACY_USE]: "Use privacy & information-protection tools.",
  [PERMISSIONS.USER_VIEW]: "View user accounts.",
  [PERMISSIONS.USER_CREATE]: "Create user accounts.",
  [PERMISSIONS.USER_UPDATE]: "Update user accounts.",
  [PERMISSIONS.USER_DEACTIVATE]: "Activate/deactivate user accounts.",
  [PERMISSIONS.ROLE_ASSIGN]: "Assign roles to users.",
  [PERMISSIONS.SECURITY_VIEW]: "View security events and risk.",
  [PERMISSIONS.SECURITY_CONFIGURE]: "Configure security rules/policies.",
  [PERMISSIONS.AUDIT_VIEW]: "View and export audit logs.",
  [PERMISSIONS.INCIDENT_VIEW]: "View incidents.",
  [PERMISSIONS.INCIDENT_RESPOND]: "Perform incident response actions.",
  [PERMISSIONS.ACCOUNT_MANAGE]: "Manage own account security settings.",
};

/** Role → permission allowlist. Least privilege; deny by default. */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  [ROLES.ISSUER]: [
    PERMISSIONS.CERT_REGISTER,
    PERMISSIONS.CERT_VIEW,
    PERMISSIONS.CERT_REVOKE,
    PERMISSIONS.CERT_DOWNLOAD,
    PERMISSIONS.CERT_VERIFY,
    PERMISSIONS.PRIVACY_USE,
    PERMISSIONS.ACCOUNT_MANAGE,
  ],
  [ROLES.VERIFIER]: [
    PERMISSIONS.CERT_VERIFY,
    PERMISSIONS.CERT_VIEW,
    PERMISSIONS.PRIVACY_USE,
    PERMISSIONS.ACCOUNT_MANAGE,
  ],
  [ROLES.STUDENT]: [
    PERMISSIONS.CERT_VIEW_OWN,
    PERMISSIONS.CERT_DOWNLOAD,
    PERMISSIONS.CERT_VERIFY,
    PERMISSIONS.ACCOUNT_MANAGE,
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.CERT_VIEW,
    PERMISSIONS.CERT_VERIFY,
    PERMISSIONS.PRIVACY_USE,
    PERMISSIONS.USER_VIEW,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.USER_DEACTIVATE,
    PERMISSIONS.ROLE_ASSIGN,
    PERMISSIONS.SECURITY_VIEW,
    PERMISSIONS.SECURITY_CONFIGURE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.INCIDENT_VIEW,
    PERMISSIONS.INCIDENT_RESPOND,
    PERMISSIONS.ACCOUNT_MANAGE,
  ],
};
