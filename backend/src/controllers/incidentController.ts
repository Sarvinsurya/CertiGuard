import type { Request, Response, NextFunction } from "express";
import { sendSuccess, errors } from "../utils/response.js";
import { createIncidentSchema, incidentActionSchema, incidentStatusSchema } from "../utils/validation.js";
import {
  createIncident, listIncidents, getIncident, updateIncidentStatus,
  applyResponseAction, reverseAction, listIncidentActions, type ResponseActionType,
} from "../services/incidentService.js";

export function getIncidents(req: Request, res: Response, next: NextFunction): void {
  try {
    const q = req.query;
    sendSuccess(res, listIncidents({
      status: typeof q.status === "string" ? q.status : undefined,
      severity: typeof q.severity === "string" ? q.severity : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }));
  } catch (err) { next(err); }
}

export function postIncident(req: Request, res: Response, next: NextFunction): void {
  try {
    const input = createIncidentSchema.parse(req.body);
    const incident = createIncident({ ...input, actorId: res.locals.user?.id, correlationId: res.locals.correlationId });
    sendSuccess(res, { incident }, "Incident created.", 201);
  } catch (err) { next(err); }
}

export function getIncidentById(req: Request, res: Response, next: NextFunction): void {
  try {
    const incident = getIncident(Number(req.params.id));
    if (!incident) throw errors.notFound("Incident not found.");
    sendSuccess(res, { incident, actions: listIncidentActions(incident.id) });
  } catch (err) { next(err); }
}

export function patchIncident(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    if (!getIncident(id)) throw errors.notFound("Incident not found.");
    const { status, notes } = incidentStatusSchema.parse(req.body);
    const incident = updateIncidentStatus(id, status, res.locals.user!.id, notes, res.locals.correlationId);
    sendSuccess(res, { incident }, "Incident updated.");
  } catch (err) { next(err); }
}

export function postIncidentAction(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    if (!getIncident(id)) throw errors.notFound("Incident not found.");
    const input = incidentActionSchema.parse(req.body);
    const result = applyResponseAction({
      incidentId: id, actorId: res.locals.user!.id, actionType: input.actionType as ResponseActionType,
      targetUserId: input.targetUserId, reason: input.reason, durationSeconds: input.durationSeconds,
      correlationId: res.locals.correlationId,
    });
    sendSuccess(res, { result }, "Response action applied.");
  } catch (err) {
    if (err instanceof Error && /not found|cannot be auto-suspended/.test(err.message)) {
      return next(errors.validation(err.message));
    }
    next(err);
  }
}

export function postReverseAction(req: Request, res: Response, next: NextFunction): void {
  try {
    const actionId = Number(req.params.actionId);
    reverseAction(actionId, res.locals.user!.id, res.locals.correlationId);
    sendSuccess(res, { reversed: true }, "Response action reversed.");
  } catch (err) { next(err); }
}

export function postResolve(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    if (!getIncident(id)) throw errors.notFound("Incident not found.");
    const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
    sendSuccess(res, { incident: updateIncidentStatus(id, "resolved", res.locals.user!.id, notes, res.locals.correlationId) }, "Incident resolved.");
  } catch (err) { next(err); }
}

export function postFalsePositive(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    if (!getIncident(id)) throw errors.notFound("Incident not found.");
    const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;
    sendSuccess(res, { incident: updateIncidentStatus(id, "false_positive", res.locals.user!.id, notes, res.locals.correlationId) }, "Incident marked as false positive.");
  } catch (err) { next(err); }
}
