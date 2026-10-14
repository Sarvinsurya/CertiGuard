import type { Request, Response, NextFunction } from "express";
import { listIssuers, getIssuerById, toPublicIssuer } from "../services/issuerService.js";
import { sendSuccess, errors } from "../utils/response.js";

export function getIssuers(_req: Request, res: Response, next: NextFunction): void {
  try {
    const issuers = listIssuers().map(toPublicIssuer);
    sendSuccess(res, { issuers, total: issuers.length });
  } catch (err) {
    next(err);
  }
}

export function getIssuer(req: Request, res: Response, next: NextFunction): void {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw errors.validation("Invalid issuer id.");
    }
    const issuer = getIssuerById(id);
    if (!issuer) {
      throw errors.notFound(`No issuer found with id ${id}.`);
    }
    sendSuccess(res, { issuer: toPublicIssuer(issuer) });
  } catch (err) {
    next(err);
  }
}
