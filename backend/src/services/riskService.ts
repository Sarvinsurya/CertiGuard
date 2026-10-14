import { getDb } from "../db/connection.js";
import { countRecentEvents, recordSecurityEvent, type Severity } from "./securityEventService.js";

/**
 * Explainable, RULE-BASED anomaly detection and weighted risk scoring.
 *
 * This is deterministic rule evaluation — NOT machine learning. A risk score is
 * a heuristic signal, not proof of malicious behaviour. All weights and
 * thresholds are documented here.
 */

export interface DetectionRule {
  id: string;
  description: string;
  eventTypes: string[];
  threshold: number;
  windowSeconds: number;
  severity: Severity;
  riskWeight: number; // points added to the subject's risk score when triggered
  recommended: string;
}

export const DETECTION_RULES: DetectionRule[] = [
  {
    id: "RULE_A_LOGIN_FAILURES",
    description: "Repeated authentication failures from one account/source.",
    eventTypes: ["AUTH_LOGIN_FAILURE"],
    threshold: 5,
    windowSeconds: 300,
    severity: "high",
    riskWeight: 30,
    recommended: "Throttle the account and require review; consider temporary suspension.",
  },
  {
    id: "RULE_B_VERIFICATION_BURST",
    description: "Unusually high number of certificate verification requests.",
    eventTypes: ["CERT_VERIFICATION"],
    threshold: 15,
    windowSeconds: 60,
    severity: "medium",
    riskWeight: 15,
    recommended: "Apply rate limiting; monitor the source for scraping behaviour.",
  },
  {
    id: "RULE_C_UNAUTHORIZED_ACCESS",
    description: "Repeated 401/403 responses indicating access probing.",
    eventTypes: ["AUTHZ_DENIED", "AUTH_UNAUTHENTICATED"],
    threshold: 6,
    windowSeconds: 120,
    severity: "high",
    riskWeight: 25,
    recommended: "Flag the account for review; inspect targeted resources.",
  },
  {
    id: "RULE_D_RESOURCE_ENUMERATION",
    description: "Repeated requests for nonexistent/guessed certificate IDs.",
    eventTypes: ["CERT_NOT_FOUND"],
    threshold: 8,
    windowSeconds: 120,
    severity: "medium",
    riskWeight: 20,
    recommended: "Rate-limit the source; monitor for enumeration patterns.",
  },
  {
    id: "RULE_E_MFA_FAILURES",
    description: "Repeated MFA verification failures (possible OTP guessing).",
    eventTypes: ["MFA_VERIFY_FAILURE"],
    threshold: 5,
    windowSeconds: 300,
    severity: "high",
    riskWeight: 25,
    recommended: "Throttle MFA attempts; require re-verification.",
  },
  {
    id: "RULE_F_RATE_LIMIT_ABUSE",
    description: "Multiple rate-limit violations from one source.",
    eventTypes: ["RATE_LIMIT_EXCEEDED"],
    threshold: 3,
    windowSeconds: 120,
    severity: "medium",
    riskWeight: 15,
    recommended: "Investigate automated client behaviour.",
  },
];

export const RISK_LEVELS = [
  { max: 24, level: "low" as const },
  { max: 49, level: "moderate" as const },
  { max: 74, level: "high" as const },
  { max: 100, level: "critical" as const },
];

export function levelForScore(score: number): "low" | "moderate" | "high" | "critical" {
  const clamped = Math.max(0, Math.min(100, score));
  return RISK_LEVELS.find((l) => clamped <= l.max)!.level;
}

export interface RuleEvaluation {
  rule: DetectionRule;
  count: number;
  triggered: boolean;
}

/**
 * Evaluate all rules for a subject (account and/or source IP). Returns which
 * rules triggered. Each triggered rule contributes its riskWeight (capped).
 */
export function evaluateRules(opts: { actorId?: number | null; sourceIp?: string | null }): RuleEvaluation[] {
  return DETECTION_RULES.map((rule) => {
    const count = countRecentEvents({
      eventTypes: rule.eventTypes,
      actorId: opts.actorId ?? null,
      sourceIp: opts.actorId == null ? (opts.sourceIp ?? null) : null,
      windowSeconds: rule.windowSeconds,
    });
    return { rule, count, triggered: count >= rule.threshold };
  });
}

export interface RiskAssessment {
  subjectType: string;
  subjectId: string;
  score: number;
  level: "low" | "moderate" | "high" | "critical";
  contributingFactors: Array<{ ruleId: string; description: string; count: number; weight: number }>;
  assessedAt: string;
}

/**
 * Compute and persist a risk assessment for a subject from triggered rules.
 * Score is the sum of triggered rule weights (capped at 100). Duplicate event
 * inflation is bounded because each rule contributes AT MOST its weight once.
 */
export function assessRisk(opts: {
  subjectType: "account" | "source_ip";
  subjectId: string;
  actorId?: number | null;
  sourceIp?: string | null;
}): RiskAssessment {
  const evals = evaluateRules({ actorId: opts.actorId, sourceIp: opts.sourceIp });
  const triggered = evals.filter((e) => e.triggered);
  let score = triggered.reduce((sum, e) => sum + e.rule.riskWeight, 0);
  score = Math.max(0, Math.min(100, score));
  const level = levelForScore(score);
  const contributingFactors = triggered.map((e) => ({
    ruleId: e.rule.id,
    description: e.rule.description,
    count: e.count,
    weight: e.rule.riskWeight,
  }));
  const assessedAt = new Date().toISOString();

  getDb()
    .prepare(
      `INSERT INTO risk_assessments (subject_type, subject_id, score, level, contributing_factors_json, assessed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(opts.subjectType, opts.subjectId, score, level, JSON.stringify(contributingFactors), assessedAt);

  return { subjectType: opts.subjectType, subjectId: opts.subjectId, score, level, contributingFactors, assessedAt };
}

export function latestRiskForSubject(subjectType: string, subjectId: string): RiskAssessment | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM risk_assessments WHERE subject_type = ? AND subject_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(subjectType, subjectId) as
    | { subject_type: string; subject_id: string; score: number; level: string; contributing_factors_json: string; assessed_at: string }
    | undefined;
  if (!row) return null;
  return {
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    score: row.score,
    level: row.level as RiskAssessment["level"],
    contributingFactors: JSON.parse(row.contributing_factors_json),
    assessedAt: row.assessed_at,
  };
}

/** High-risk accounts (latest assessment per subject with score >= 50). */
export function highRiskSubjects(minScore = 50) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ra.* FROM risk_assessments ra
       JOIN (SELECT subject_type, subject_id, MAX(id) AS mid FROM risk_assessments GROUP BY subject_type, subject_id) latest
       ON ra.id = latest.mid
       WHERE ra.score >= ? ORDER BY ra.score DESC`
    )
    .all(minScore) as { subject_type: string; subject_id: string; score: number; level: string; assessed_at: string }[];
  return rows;
}

/**
 * Evaluate rules for a subject and record a SECURITY_ANOMALY event + risk
 * assessment for any newly-triggered rule. Returns the triggered rule ids.
 */
export function runDetectionForSubject(opts: {
  actorId?: number | null;
  sourceIp?: string | null;
  correlationId?: string | null;
}): { triggeredRuleIds: string[]; assessment: RiskAssessment } {
  const evals = evaluateRules({ actorId: opts.actorId, sourceIp: opts.sourceIp });
  const triggered = evals.filter((e) => e.triggered);
  for (const e of triggered) {
    recordSecurityEvent({
      eventType: "SECURITY_ANOMALY",
      severity: e.rule.severity,
      actorId: opts.actorId ?? null,
      sourceIp: opts.sourceIp ?? null,
      detectionRule: e.rule.id,
      riskContribution: e.rule.riskWeight,
      correlationId: opts.correlationId ?? null,
      metadata: { count: e.count, threshold: e.rule.threshold, recommended: e.rule.recommended },
    });
  }
  const assessment = assessRisk({
    subjectType: opts.actorId != null ? "account" : "source_ip",
    subjectId: opts.actorId != null ? String(opts.actorId) : String(opts.sourceIp ?? "unknown"),
    actorId: opts.actorId,
    sourceIp: opts.sourceIp,
  });
  return { triggeredRuleIds: triggered.map((t) => t.rule.id), assessment };
}
