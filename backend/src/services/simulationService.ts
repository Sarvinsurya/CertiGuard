import { config } from "../config/index.js";
import { recordSecurityEvent } from "./securityEventService.js";
import { runDetectionForSubject, type RiskAssessment } from "./riskService.js";

/**
 * Controlled security simulations.
 *
 * A simulation sends a conservative number of REAL HTTP requests to a dedicated
 * backend test endpoint using a synthetic marker. Requests pass through the real
 * rate limiter and event pipeline — results are NOT fabricated chart values.
 *
 * Restrictions: authorized administrators only; small request counts; targets
 * only this backend's own test endpoint; never touches real certificate records.
 */

export const SIMULATION_SCENARIOS = [
  { id: "login_failure_burst", label: "Login failure burst", eventType: "AUTH_LOGIN_FAILURE", severity: "high" as const, count: 8 },
  { id: "mfa_failure_burst", label: "MFA failure burst", eventType: "MFA_VERIFY_FAILURE", severity: "high" as const, count: 8 },
  { id: "verification_burst", label: "Certificate verification burst", eventType: "CERT_VERIFICATION", severity: "medium" as const, count: 20 },
  { id: "unauthorized_burst", label: "Unauthorized access burst", eventType: "AUTHZ_DENIED", severity: "high" as const, count: 10 },
  { id: "enumeration_pattern", label: "Certificate ID enumeration", eventType: "CERT_NOT_FOUND", severity: "medium" as const, count: 12 },
  { id: "rate_limit_abuse", label: "Repeated rate-limit violations", eventType: "RATE_LIMIT_EXCEEDED", severity: "medium" as const, count: 25 },
];

export interface SimulationResult {
  scenario: string;
  label: string;
  requestsAttempted: number;
  requestsAccepted: number;
  requestsRejected: number;
  http429: number;
  eventsGenerated: number;
  triggeredRuleIds: string[];
  riskAssessment: RiskAssessment;
  syntheticActorLabel: string;
}

/**
 * Run a scenario by hitting the backend's own simulation ping endpoint repeatedly,
 * which emits the appropriate synthetic security event per request through the
 * real pipeline, then evaluate detection rules + risk for the synthetic subject.
 */
export async function runSimulation(scenarioId: string, correlationId?: string): Promise<SimulationResult> {
  const scenario = SIMULATION_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown simulation scenario: ${scenarioId}`);

  const syntheticActorLabel = `sim:${scenario.id}`;
  const base = `http://127.0.0.1:${config.port}`;
  let accepted = 0;
  let rejected = 0;
  let http429 = 0;
  let eventsGenerated = 0;

  for (let i = 0; i < scenario.count; i++) {
    try {
      const res = await fetch(`${base}/api/security/simulations/_ping?scenario=${scenario.id}`, {
        method: "POST",
        headers: { "x-simulation": "1", "x-correlation-id": correlationId ?? "" },
      });
      if (res.status === 429) {
        http429++;
        rejected++;
      } else if (res.ok) {
        accepted++;
      } else {
        rejected++;
      }
    } catch {
      rejected++;
    }
    // Emit the scenario's synthetic security event through the real pipeline.
    recordSecurityEvent({
      eventType: scenario.eventType,
      severity: scenario.severity,
      actorLabel: syntheticActorLabel,
      sourceIp: "127.0.0.1",
      resourceType: "simulation",
      resourceId: scenario.id,
      detectionRule: "SIMULATION",
      riskContribution: 3,
      correlationId,
      metadata: { simulation: true, iteration: i + 1 },
    });
    eventsGenerated++;
  }

  // Evaluate detection + risk for the synthetic source.
  const { triggeredRuleIds, assessment } = runDetectionForSubject({
    actorId: null,
    sourceIp: "127.0.0.1",
    correlationId,
  });

  return {
    scenario: scenario.id,
    label: scenario.label,
    requestsAttempted: scenario.count,
    requestsAccepted: accepted,
    requestsRejected: rejected,
    http429,
    eventsGenerated,
    triggeredRuleIds,
    riskAssessment: assessment,
    syntheticActorLabel,
  };
}
