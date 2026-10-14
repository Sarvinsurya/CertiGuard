import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "../config/index.js";
import { sendSuccess, errors } from "../utils/response.js";
import {
  loginSchema, mfaVerifySchema, passwordChangeSchema, passwordForgotSchema,
  passwordResetSchema, mfaConfirmSchema, mfaDisableSchema,
} from "../utils/validation.js";
import { verifyPassword, hashPassword, assertPasswordPolicy } from "../services/passwordService.js";
import {
  findUserByEmail, findUserById, recordLoginFailure, recordLoginSuccess, isLocked,
  getPermissionsForRole, setPasswordHash, getRoleNameById, toPublicUser, setMfaEnabled,
} from "../services/userService.js";
import {
  createSession, completeMfa, revokeSessionById, revokeAllUserSessions, listUserSessions, revokeSessionByToken,
} from "../services/sessionService.js";
import {
  beginEnrollment, confirmEnrollment, verifyTotp, consumeRecoveryCode, disableMfa, isMfaConfirmed, remainingRecoveryCodes,
} from "../services/mfaService.js";
import { recordAuditEvent } from "../services/auditService.js";
import { recordSecurityEvent } from "../services/securityEventService.js";
import { runDetectionForSubject } from "../services/riskService.js";
import { getDb } from "../db/connection.js";

function setSessionCookie(res: Response, rawToken: string): void {
  res.cookie(config.session.cookieName, rawToken, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: config.session.cookieSameSite,
    maxAge: config.session.ttlSeconds * 1000,
    path: "/",
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(config.session.cookieName, { path: "/" });
}

export function postLogin(req: Request, res: Response, next: NextFunction): void {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = findUserByEmail(email);
    const genericFail = () => {
      recordSecurityEvent({
        eventType: "AUTH_LOGIN_FAILURE", severity: "medium", sourceIp: req.ip ?? null,
        detectionRule: "LOGIN", riskContribution: 6, correlationId: res.locals.correlationId,
        metadata: { emailProvided: true },
      });
      runDetectionForSubject({ sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      next(errors.unauthorized("Invalid email or password."));
    };

    if (!user) return genericFail();
    if (user.status !== "active") {
      recordAuditEvent({ action: "AUTH_LOGIN", target: user.email, outcome: "DENIED_INACTIVE", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      return next(errors.forbidden("This account is not active. Contact an administrator."));
    }
    if (isLocked(user)) {
      recordSecurityEvent({ eventType: "AUTH_LOGIN_FAILURE", severity: "high", actorId: user.id, sourceIp: req.ip ?? null, detectionRule: "LOCKOUT", riskContribution: 8, correlationId: res.locals.correlationId, metadata: { locked: true } });
      return next(errors.forbidden("Account temporarily locked due to repeated failed logins. Try again later."));
    }
    if (!verifyPassword(password, user.password_hash)) {
      const locked = recordLoginFailure(user.id, config.auth.maxFailedLogins, config.auth.lockoutSeconds);
      recordAuditEvent({ action: "AUTH_LOGIN", target: user.email, outcome: "FAILURE", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      recordSecurityEvent({ eventType: "AUTH_LOGIN_FAILURE", severity: locked ? "high" : "medium", actorId: user.id, sourceIp: req.ip ?? null, detectionRule: "LOGIN", riskContribution: 6, correlationId: res.locals.correlationId });
      runDetectionForSubject({ actorId: user.id, sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      return next(errors.unauthorized("Invalid email or password."));
    }

    // First factor OK. Determine whether MFA is required.
    const mfaRequired = user.mfa_enabled === 1 && isMfaConfirmed(user.id);
    const { rawToken, csrfToken } = createSession(user.id, mfaRequired);
    setSessionCookie(res, rawToken);

    if (mfaRequired) {
      recordAuditEvent({ action: "AUTH_LOGIN", target: user.email, outcome: "MFA_PENDING", actorId: user.id, actorRole: getRoleNameById(user.role_id), resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      sendSuccess(res, { mfaRequired: true, csrfToken }, "Enter your authenticator code to continue.");
      return;
    }

    recordLoginSuccess(user.id);
    recordAuditEvent({ action: "AUTH_LOGIN", target: user.email, outcome: "SUCCESS", actorId: user.id, actorRole: getRoleNameById(user.role_id), resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { mfaRequired: false, csrfToken, user: publicMe(user.id) }, "Signed in.");
  } catch (err) {
    next(err);
  }
}

export function postMfaVerify(req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user;
    if (!user || !user.session.mfa_pending) {
      return next(errors.unauthorized("No MFA challenge is pending."));
    }
    const { token, recoveryCode } = mfaVerifySchema.parse(req.body);
    let ok = false;
    if (token) ok = verifyTotp(user.id, token);
    else if (recoveryCode) ok = consumeRecoveryCode(user.id, recoveryCode);

    if (!ok) {
      recordSecurityEvent({ eventType: "MFA_VERIFY_FAILURE", severity: "high", actorId: user.id, sourceIp: req.ip ?? null, detectionRule: "MFA", riskContribution: 8, correlationId: res.locals.correlationId });
      recordAuditEvent({ action: "MFA_VERIFY", target: user.email, outcome: "FAILURE", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      runDetectionForSubject({ actorId: user.id, sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      return next(errors.unauthorized("Invalid authentication code."));
    }

    const { rawToken, csrfToken } = completeMfa(user.session.id);
    setSessionCookie(res, rawToken);
    recordLoginSuccess(user.id);
    recordAuditEvent({ action: "MFA_VERIFY", target: user.email, outcome: "SUCCESS", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { csrfToken, user: publicMe(user.id) }, "Signed in.");
  } catch (err) {
    next(err);
  }
}

export function postLogout(req: Request, res: Response, next: NextFunction): void {
  try {
    const raw = req.cookies?.[config.session.cookieName];
    if (raw) revokeSessionByToken(raw);
    const user = res.locals.user;
    if (user) recordAuditEvent({ action: "AUTH_LOGOUT", target: user.email, outcome: "SUCCESS", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    clearSessionCookie(res);
    sendSuccess(res, { loggedOut: true }, "Signed out.");
  } catch (err) {
    next(err);
  }
}

export function getMe(_req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user;
    if (!user) return next(errors.unauthorized("Not authenticated."));
    if (user.session.mfa_pending) {
      sendSuccess(res, { mfaPending: true });
      return;
    }
    sendSuccess(res, {
      user: publicMe(user.id),
      permissions: user.permissions,
      csrfToken: user.session.csrf_token,
    });
  } catch (err) {
    next(err);
  }
}

export function postPasswordChange(req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user!;
    const { currentPassword, newPassword } = passwordChangeSchema.parse(req.body);
    const row = findUserById(user.id)!;
    if (!verifyPassword(currentPassword, row.password_hash)) {
      return next(errors.unauthorized("Current password is incorrect."));
    }
    assertPasswordPolicy(newPassword);
    setPasswordHash(user.id, hashPassword(newPassword), false);
    revokeAllUserSessions(user.id); // invalidate other sessions
    const fresh = createSession(user.id, false);
    setSessionCookie(res, fresh.rawToken);
    recordAuditEvent({ action: "PASSWORD_CHANGE", target: user.email, outcome: "SUCCESS", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { csrfToken: fresh.csrfToken }, "Password changed. Other sessions were signed out.");
  } catch (err) {
    next(err);
  }
}

export function postPasswordForgot(req: Request, res: Response, next: NextFunction): void {
  try {
    const { email } = passwordForgotSchema.parse(req.body);
    const user = findUserByEmail(email);
    // Always return success (do not reveal account existence).
    if (user) {
      const db = getDb();
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const now = Date.now();
      db.prepare(
        "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)"
      ).run(user.id, tokenHash, new Date(now + config.auth.passwordResetTtlSeconds * 1000).toISOString(), new Date(now).toISOString());
      recordAuditEvent({ action: "PASSWORD_RESET_REQUEST", target: user.email, outcome: "SUCCESS", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
      // In a real deployment this token is emailed. For the demo we return it in dev only.
      if (!config.isProduction) {
        sendSuccess(res, { resetTokenDev: rawToken }, "If the account exists, a reset token was issued (shown in development only).");
        return;
      }
    }
    sendSuccess(res, {}, "If the account exists, a reset link has been sent.");
  } catch (err) {
    next(err);
  }
}

export function postPasswordReset(req: Request, res: Response, next: NextFunction): void {
  try {
    const { token, newPassword } = passwordResetSchema.parse(req.body);
    const db = getDb();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const row = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?").get(tokenHash) as
      | { id: number; user_id: number; used_at: string | null; expires_at: string }
      | undefined;
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      return next(errors.validation("This reset token is invalid or has expired."));
    }
    assertPasswordPolicy(newPassword);
    const tx = db.transaction(() => {
      setPasswordHash(row.user_id, hashPassword(newPassword), false);
      db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
      revokeAllUserSessions(row.user_id); // invalidate sessions after reset
    });
    tx();
    const u = findUserById(row.user_id)!;
    recordAuditEvent({ action: "PASSWORD_RESET", target: u.email, outcome: "SUCCESS", actorId: u.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, {}, "Password has been reset. Please sign in.");
  } catch (err) {
    next(err);
  }
}

// ---- MFA enrollment ----

export async function postMfaEnroll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = res.locals.user!;
    const row = findUserById(user.id)!;
    const result = await beginEnrollment(user.id, row.email);
    recordAuditEvent({ action: "MFA_ENROLL_BEGIN", target: row.email, outcome: "SUCCESS", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    // Recovery codes shown ONCE.
    sendSuccess(res, { qrDataUrl: result.qrDataUrl, otpauthUrl: result.otpauthUrl, recoveryCodes: result.recoveryCodes }, "Scan the QR code, then confirm with a code.");
  } catch (err) {
    next(err);
  }
}

export function postMfaConfirm(req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user!;
    const { token } = mfaConfirmSchema.parse(req.body);
    if (!confirmEnrollment(user.id, token)) {
      return next(errors.validation("Invalid code. Enrollment not confirmed."));
    }
    setMfaEnabled(user.id, true);
    recordAuditEvent({ action: "MFA_ENROLL_CONFIRM", target: user.email, outcome: "SUCCESS", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { mfaEnabled: true }, "Multi-factor authentication enabled.");
  } catch (err) {
    next(err);
  }
}

export function postMfaDisable(req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user!;
    const { password, token } = mfaDisableSchema.parse(req.body);
    const row = findUserById(user.id)!;
    if (!verifyPassword(password, row.password_hash)) return next(errors.unauthorized("Password is incorrect."));
    if (!verifyTotp(user.id, token)) return next(errors.unauthorized("Invalid authentication code."));
    disableMfa(user.id);
    setMfaEnabled(user.id, false);
    recordAuditEvent({ action: "MFA_DISABLE", target: user.email, outcome: "SUCCESS", actorId: user.id, resourceType: "auth", sourceIp: req.ip ?? null, correlationId: res.locals.correlationId });
    sendSuccess(res, { mfaEnabled: false }, "Multi-factor authentication disabled.");
  } catch (err) {
    next(err);
  }
}

export function getSessions(_req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user!;
    sendSuccess(res, { sessions: listUserSessions(user.id), recoveryCodesRemaining: remainingRecoveryCodes(user.id) });
  } catch (err) {
    next(err);
  }
}

export function deleteSession(req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user!;
    const id = Number(req.params.id);
    const db = getDb();
    const owned = db.prepare("SELECT id FROM sessions WHERE id = ? AND user_id = ?").get(id, user.id);
    if (!owned) return next(errors.notFound("Session not found."));
    revokeSessionById(id);
    sendSuccess(res, { revoked: true }, "Session revoked.");
  } catch (err) {
    next(err);
  }
}

function publicMe(userId: number) {
  const row = findUserById(userId)!;
  const pub = toPublicUser(row);
  return { ...pub, permissions: getPermissionsForRole(row.role_id) };
}
