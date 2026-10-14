import type { Request, Response, NextFunction } from "express";
import { sendSuccess, errors } from "../utils/response.js";
import { createUserSchema, updateUserSchema, assignRoleSchema } from "../utils/validation.js";
import { hashPassword, assertPasswordPolicy } from "../services/passwordService.js";
import {
  listUsers, createUser, findUserById, findUserByEmail, toPublicUser, setUserStatus,
  assignRole, updateUserFields, getRoleIdByName, ensureOrganization, listOrganizations,
} from "../services/userService.js";
import { disableMfa } from "../services/mfaService.js";
import { revokeAllUserSessions } from "../services/sessionService.js";
import { recordAuditEvent } from "../services/auditService.js";
import type { RoleName } from "../auth/rbac.js";

export function getUsers(req: Request, res: Response, next: NextFunction): void {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    sendSuccess(res, { users: listUsers({ search, role, status }) });
  } catch (err) { next(err); }
}

export function getUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const row = findUserById(Number(req.params.id));
    if (!row) throw errors.notFound("User not found.");
    sendSuccess(res, { user: toPublicUser(row) });
  } catch (err) { next(err); }
}

export function postUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const input = createUserSchema.parse(req.body);
    if (findUserByEmail(input.email)) throw errors.conflict("A user with this email already exists.");
    assertPasswordPolicy(input.password);
    const roleId = getRoleIdByName(input.role as RoleName);
    let organizationId: number | null = null;
    if (input.organizationName) {
      const type = input.role === "institution_issuer" || input.role === "student" ? "institution" : "company";
      organizationId = ensureOrganization(input.organizationName, type);
    }
    const row = createUser({
      email: input.email, passwordHash: hashPassword(input.password), displayName: input.displayName,
      roleId, organizationId, studentIdentifier: input.studentIdentifier ?? null,
      mustChangePassword: input.mustChangePassword ?? true,
    });
    recordAuditEvent({
      action: "USER_CREATED", target: row.email, outcome: "SUCCESS",
      actorId: res.locals.user?.id ?? null, actorRole: res.locals.user?.role, resourceType: "user",
      sourceIp: req.ip ?? null, correlationId: res.locals.correlationId, details: { role: input.role },
    });
    sendSuccess(res, { user: toPublicUser(row) }, "User created.", 201);
  } catch (err) { next(err); }
}

export function patchUser(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    if (!findUserById(id)) throw errors.notFound("User not found.");
    const input = updateUserSchema.parse(req.body);
    updateUserFields(id, { displayName: input.displayName, organizationId: input.organizationId ?? undefined });
    recordAuditEvent({ action: "USER_UPDATED", target: `user:${id}`, outcome: "SUCCESS", actorId: res.locals.user?.id ?? null, actorRole: res.locals.user?.role, resourceType: "user", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { user: toPublicUser(findUserById(id)!) }, "User updated.");
  } catch (err) { next(err); }
}

export function postDeactivate(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    const row = findUserById(id);
    if (!row) throw errors.notFound("User not found.");
    if (res.locals.user?.id === id) throw errors.validation("You cannot deactivate your own account.");
    setUserStatus(id, "inactive");
    revokeAllUserSessions(id);
    recordAuditEvent({ action: "USER_DEACTIVATED", target: row.email, outcome: "SUCCESS", actorId: res.locals.user?.id ?? null, actorRole: res.locals.user?.role, resourceType: "user", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { user: toPublicUser(findUserById(id)!) }, "User deactivated; sessions revoked.");
  } catch (err) { next(err); }
}

export function postActivate(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    const row = findUserById(id);
    if (!row) throw errors.notFound("User not found.");
    setUserStatus(id, "active");
    recordAuditEvent({ action: "USER_ACTIVATED", target: row.email, outcome: "SUCCESS", actorId: res.locals.user?.id ?? null, actorRole: res.locals.user?.role, resourceType: "user", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { user: toPublicUser(findUserById(id)!) }, "User activated.");
  } catch (err) { next(err); }
}

export function postAssignRole(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    const row = findUserById(id);
    if (!row) throw errors.notFound("User not found.");
    const { role } = assignRoleSchema.parse(req.body);
    assignRole(id, getRoleIdByName(role as RoleName));
    revokeAllUserSessions(id); // force re-auth so new permissions apply
    recordAuditEvent({ action: "ROLE_ASSIGNED", target: row.email, outcome: "SUCCESS", actorId: res.locals.user?.id ?? null, actorRole: res.locals.user?.role, resourceType: "user", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId, details: { role } });
    sendSuccess(res, { user: toPublicUser(findUserById(id)!) }, "Role assigned; the user's sessions were revoked.");
  } catch (err) { next(err); }
}

export function postResetUserMfa(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    const row = findUserById(id);
    if (!row) throw errors.notFound("User not found.");
    disableMfa(id);
    recordAuditEvent({ action: "MFA_RESET_BY_ADMIN", target: row.email, outcome: "SUCCESS", actorId: res.locals.user?.id ?? null, actorRole: res.locals.user?.role, resourceType: "user", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, {}, "MFA reset for user; they must re-enroll.");
  } catch (err) { next(err); }
}

export function getOrganizations(_req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { organizations: listOrganizations() });
  } catch (err) { next(err); }
}
