import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/response.js";
import { getDb } from "../db/connection.js";
import { ROLES } from "../auth/rbac.js";
import { securitySummary, listSecurityEvents } from "../services/securityEventService.js";
import { highRiskSubjects } from "../services/riskService.js";
import { listRecentAuditEvents } from "../services/auditService.js";

/** Role-aware dashboard metrics computed from REAL database queries. */
export function getDashboard(_req: Request, res: Response, next: NextFunction): void {
  try {
    const user = res.locals.user!;
    const db = getDb();

    if (user.role === ROLES.ADMIN) {
      const totalUsers = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
      const activeUsers = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE status = 'active'").get() as { c: number }).c;
      const mfaUsers = (db.prepare("SELECT COUNT(*) AS c FROM users WHERE mfa_enabled = 1").get() as { c: number }).c;
      const summary = securitySummary();
      sendSuccess(res, {
        role: user.role,
        metrics: {
          totalUsers, activeUsers,
          mfaAdoption: totalUsers ? Math.round((mfaUsers / totalUsers) * 100) : 0,
          securityEvents: summary.total,
          openIncidents: summary.openIncidents,
          resolvedIncidents: summary.resolvedIncidents,
          highRiskAccounts: highRiskSubjects(50).length,
        },
        eventsBySeverity: summary.bySeverity,
        topEventTypes: summary.byType,
        recentEvents: listSecurityEvents({ limit: 8 }).events,
        recentAudit: listRecentAuditEvents(8),
      });
      return;
    }

    if (user.role === ROLES.ISSUER) {
      const orgIssuer = db.prepare("SELECT issuer_id FROM organizations WHERE id = ?").get(user.organizationId ?? -1) as { issuer_id: number | null } | undefined;
      const total = (db.prepare("SELECT COUNT(*) AS c FROM certificates").get() as { c: number }).c;
      const active = (db.prepare("SELECT COUNT(*) AS c FROM certificates WHERE status = 'active'").get() as { c: number }).c;
      const revoked = (db.prepare("SELECT COUNT(*) AS c FROM certificates WHERE status = 'revoked'").get() as { c: number }).c;
      const recent = db.prepare("SELECT certificate_id, student_name, qualification, status, created_at FROM certificates ORDER BY id DESC LIMIT 6").all();
      const verifications = (db.prepare("SELECT COUNT(*) AS c FROM security_events WHERE event_type = 'CERT_VERIFICATION'").get() as { c: number }).c;
      sendSuccess(res, {
        role: user.role,
        metrics: { totalCertificates: total, activeCertificates: active, revokedCertificates: revoked, verificationActivity: verifications },
        recentCertificates: recent,
        issuerLinked: !!orgIssuer?.issuer_id,
      });
      return;
    }

    if (user.role === ROLES.VERIFIER) {
      const base = { event_type: "CERT_VERIFICATION" };
      const totalVer = (db.prepare("SELECT COUNT(*) AS c FROM security_events WHERE event_type = 'CERT_VERIFICATION'").get() as { c: number }).c;
      const byOutcome = db.prepare(
        "SELECT json_extract(metadata_json,'$.overall') AS outcome, COUNT(*) AS c FROM security_events WHERE event_type='CERT_VERIFICATION' GROUP BY outcome"
      ).all() as { outcome: string | null; c: number }[];
      void base;
      const recent = db.prepare(
        "SELECT resource_id AS certificateId, json_extract(metadata_json,'$.overall') AS overall, created_at FROM security_events WHERE event_type='CERT_VERIFICATION' ORDER BY id DESC LIMIT 8"
      ).all();
      const count = (o: string) => byOutcome.find((r) => r.outcome === o)?.c ?? 0;
      sendSuccess(res, {
        role: user.role,
        metrics: {
          totalVerifications: totalVer,
          verified: count("VERIFIED"),
          documentMismatch: count("DOCUMENT_MISMATCH"),
          revoked: count("REVOKED"),
        },
        recentVerifications: recent,
      });
      return;
    }

    // Student
    const sid = user.studentIdentifier;
    const mine = sid
      ? db.prepare("SELECT certificate_id, qualification, institution_name, status, issue_date, created_at FROM certificates WHERE student_identifier = ? ORDER BY id DESC").all(sid)
      : [];
    const active = (mine as { status: string }[]).filter((c) => c.status === "active").length;
    const revoked = (mine as { status: string }[]).filter((c) => c.status === "revoked").length;
    sendSuccess(res, {
      role: user.role,
      metrics: { myCertificates: mine.length, activeCertificates: active, revokedCertificates: revoked },
      certificates: mine,
    });
  } catch (err) {
    next(err);
  }
}
