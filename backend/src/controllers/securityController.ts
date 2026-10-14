import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/response.js";
import {
  listSecurityEvents, getSecurityEvent, securitySummary, type Severity,
} from "../services/securityEventService.js";
import {
  DETECTION_RULES, latestRiskForSubject, highRiskSubjects,
} from "../services/riskService.js";
import { SIMULATION_SCENARIOS, runSimulation } from "../services/simulationService.js";
import { recordAuditEvent } from "../services/auditService.js";

export function getEvents(req: Request, res: Response, next: NextFunction): void {
  try {
    const q = req.query;
    const result = listSecurityEvents({
      severity: typeof q.severity === "string" ? (q.severity as Severity) : undefined,
      eventType: typeof q.eventType === "string" ? q.eventType : undefined,
      search: typeof q.search === "string" ? q.search : undefined,
      since: typeof q.since === "string" ? q.since : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
    sendSuccess(res, result);
  } catch (err) { next(err); }
}

export function getEvent(req: Request, res: Response, next: NextFunction): void {
  try {
    const event = getSecurityEvent(Number(req.params.id));
    sendSuccess(res, { event: event ?? null });
  } catch (err) { next(err); }
}

export function getSummary(_req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { summary: securitySummary(), highRisk: highRiskSubjects(50) });
  } catch (err) { next(err); }
}

export function getRisk(_req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { highRisk: highRiskSubjects(0) });
  } catch (err) { next(err); }
}

export function getRiskForSubject(req: Request, res: Response, next: NextFunction): void {
  try {
    const subjectId = req.params.subjectId;
    const type = typeof req.query.type === "string" ? req.query.type : "account";
    sendSuccess(res, { assessment: latestRiskForSubject(type, subjectId) });
  } catch (err) { next(err); }
}

export function getRules(_req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { rules: DETECTION_RULES });
  } catch (err) { next(err); }
}

export function getSimulations(_req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { scenarios: SIMULATION_SCENARIOS });
  } catch (err) { next(err); }
}

export async function runSimulationScenario(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scenario = req.params.scenario;
    const result = await runSimulation(scenario, res.locals.correlationId);
    recordAuditEvent({
      action: "SECURITY_SIMULATION", target: scenario, outcome: "SUCCESS",
      actorId: res.locals.user?.id ?? null, actorRole: res.locals.user?.role, resourceType: "simulation",
      sourceIp: req.ip ?? null, correlationId: res.locals.correlationId,
      details: { requests: result.requestsAttempted, http429: result.http429, triggered: result.triggeredRuleIds },
    });
    sendSuccess(res, { result }, "Simulation completed against the live backend.");
  } catch (err) { next(err); }
}

/** Internal ping target for simulations — passes through the real middleware. */
export function simulationPing(req: Request, res: Response): void {
  res.setHeader("X-Simulation", "1");
  sendSuccess(res, { ok: true, scenario: req.query.scenario ?? null });
}
