import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * Assigns a correlation ID to every request (from the X-Correlation-Id header
 * if provided, otherwise generated). Stored in res.locals and echoed back in
 * the response header + envelope. Phase 4 audit logging relies on this.
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-correlation-id");
  const id = incoming && incoming.length <= 100 ? incoming : crypto.randomUUID();
  res.locals.correlationId = id;
  res.setHeader("X-Correlation-Id", id);
  next();
}
