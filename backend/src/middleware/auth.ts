import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { errors } from "../utils/response.js";
import { getValidSession, touchSession, type SessionRow } from "../services/sessionService.js";
import { findUserById, getPermissionsForRole, getRoleNameById, type UserRow } from "../services/userService.js";
import { recordSecurityEvent } from "../services/securityEventService.js";

/** Authenticated context attached to res.locals. */
export interface AuthContext {
  id: number;
  email: string;
  displayName: string;
  roleId: number;
  role: string;
  organizationId: number | null;
  studentIdentifier: string | null;
  permissions: string[];
  session: SessionRow;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: AuthContext;
      correlationId?: string;
    }
  }
}

function logDenied(req: Request, res: Response, reason: string): void {
  recordSecurityEvent({
    eventType: reason === "unauthenticated" ? "AUTH_UNAUTHENTICATED" : "AUTHZ_DENIED",
    severity: "low",
    actorId: res.locals.user?.id ?? null,
    sourceIp: req.ip ?? null,
    resourceType: "endpoint",
    resourceId: `${req.method} ${req.path}`,
    detectionRule: "ACCESS_CONTROL",
    riskContribution: 4,
    correlationId: res.locals.correlationId,
  });
}

/** Populate res.locals.user if a valid session cookie is present (no error if absent). */
export function loadUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const raw = req.cookies?.[config.session.cookieName];
    if (!raw) return next();
    const session = getValidSession(raw);
    if (!session) return next();
    const user = findUserById(session.user_id);
    if (!user || user.status !== "active") return next();
    if (session.mfa_pending) {
      // MFA not completed: expose only minimal pending context, not full access.
      res.locals.user = buildContext(user, session, []);
      return next();
    }
    touchSession(session.id);
    res.locals.user = buildContext(user, session, getPermissionsForRole(user.role_id));
    next();
  } catch {
    next();
  }
}

function buildContext(user: UserRow, session: SessionRow, permissions: string[]): AuthContext {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    roleId: user.role_id,
    role: getRoleNameById(user.role_id),
    organizationId: user.organization_id,
    studentIdentifier: user.student_identifier,
    permissions,
    session,
  };
}

/** Require a fully-authenticated user (MFA completed). */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const user = res.locals.user;
  if (!user || user.session.mfa_pending) {
    logDenied(req, res, "unauthenticated");
    return next(errors.unauthorized("Authentication required."));
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user;
    if (!user || user.session.mfa_pending) return next(errors.unauthorized("Authentication required."));
    if (!roles.includes(user.role)) {
      logDenied(req, res, "role");
      return next(errors.forbidden("You do not have the required role for this action."));
    }
    next();
  };
}

export function requirePermission(...perms: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user;
    if (!user || user.session.mfa_pending) return next(errors.unauthorized("Authentication required."));
    const ok = perms.every((p) => user.permissions.includes(p));
    if (!ok) {
      logDenied(req, res, "permission");
      return next(errors.forbidden("You do not have permission to perform this action."));
    }
    next();
  };
}

/**
 * Resource-ownership guard factory. `resolveOwner` returns the owning user id
 * (or null if not found). Admins bypass ownership; others must match.
 */
export function requireOwnership(
  resolveOwner: (req: Request, res: Response) => number | null | Promise<number | null>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = res.locals.user;
    if (!user) return next(errors.unauthorized("Authentication required."));
    if (user.role === "security_administrator") return next();
    const ownerId = await resolveOwner(req, res);
    if (ownerId == null || ownerId !== user.id) {
      logDenied(req, res, "ownership");
      return next(errors.forbidden("You can only access your own records."));
    }
    next();
  };
}

/**
 * Organization-scope guard. `resolveOrg` returns the resource's org id. Admins
 * bypass; others must belong to the same organization.
 */
export function requireOrganizationScope(
  resolveOrg: (req: Request, res: Response) => number | null | Promise<number | null>
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = res.locals.user;
    if (!user) return next(errors.unauthorized("Authentication required."));
    if (user.role === "security_administrator") return next();
    const orgId = await resolveOrg(req, res);
    if (orgId == null || orgId !== user.organizationId) {
      logDenied(req, res, "organization");
      return next(errors.forbidden("This resource belongs to another organization."));
    }
    next();
  };
}

/**
 * CSRF protection for state-changing cookie-authenticated requests.
 * Double-submit: the client must send the session CSRF token in X-CSRF-Token.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
  const user = res.locals.user;
  if (!user) return next(); // unauthenticated state-changing routes (e.g., login) are protected by other means
  const header = req.header("x-csrf-token");
  if (!header || header !== user.session.csrf_token) {
    logDenied(req, res, "csrf");
    return next(errors.forbidden("Invalid or missing CSRF token."));
  }
  next();
}
