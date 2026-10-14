import type { Request, Response, NextFunction } from "express";
import { verifyCertificate } from "../services/verificationService.js";
import { assertValidPdfBuffer } from "../middleware/upload.js";
import { sendSuccess, errors } from "../utils/response.js";

export function postVerify(req: Request, res: Response, next: NextFunction): void {
  try {
    const certificateId =
      typeof req.body?.certificateId === "string" ? req.body.certificateId.trim() : "";
    if (!certificateId) {
      throw errors.validation("A certificate ID is required for verification.");
    }
    const buffer = assertValidPdfBuffer(req.file?.buffer);

    const result = verifyCertificate({
      certificateId,
      fileBuffer: buffer,
      correlationId: res.locals.correlationId,
      actorId: res.locals.user?.id ?? null,
      sourceIp: req.ip ?? null,
    });

    sendSuccess(res, result, "Verification completed.");
  } catch (err) {
    next(err);
  }
}
