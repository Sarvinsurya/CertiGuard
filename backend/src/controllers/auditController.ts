import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/response.js";
import {
  listAuditEvents, getAuditEvent, verifyAuditIntegrity, exportAuditCsv,
} from "../services/auditService.js";

export function getAudit(req: Request, res: Response, next: NextFunction): void {
  try {
    const q = req.query;
    sendSuccess(res, listAuditEvents({
      action: typeof q.action === "string" ? q.action : undefined,
      actorId: q.actorId ? Number(q.actorId) : undefined,
      outcome: typeof q.outcome === "string" ? q.outcome : undefined,
      resourceType: typeof q.resourceType === "string" ? q.resourceType : undefined,
      since: typeof q.since === "string" ? q.since : undefined,
      until: typeof q.until === "string" ? q.until : undefined,
      search: typeof q.search === "string" ? q.search : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    }));
  } catch (err) { next(err); }
}

export function getAuditById(req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { event: getAuditEvent(Number(req.params.id)) ?? null });
  } catch (err) { next(err); }
}

export function getIntegrity(_req: Request, res: Response, next: NextFunction): void {
  try {
    sendSuccess(res, { integrity: verifyAuditIntegrity() });
  } catch (err) { next(err); }
}

export function getExport(req: Request, res: Response, next: NextFunction): void {
  try {
    const q = req.query;
    const csv = exportAuditCsv({
      action: typeof q.action === "string" ? q.action : undefined,
      since: typeof q.since === "string" ? q.since : undefined,
      until: typeof q.until === "string" ? q.until : undefined,
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="certiguard-audit.csv"');
    res.send(csv);
  } catch (err) { next(err); }
}
