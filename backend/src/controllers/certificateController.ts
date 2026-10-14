import type { Request, Response, NextFunction } from "express";
import {
  registerCertificate,
  listCertificates,
  getCertificateById,
  revokeCertificate,
  toPublicCertificate,
} from "../services/certificateService.js";
import { getIssuerById, toPublicIssuer } from "../services/issuerService.js";
import { assertValidPdfBuffer } from "../middleware/upload.js";
import { sendSuccess, errors } from "../utils/response.js";
import {
  registerCertificateSchema,
  revokeCertificateSchema,
} from "../utils/validation.js";

export function postCertificate(req: Request, res: Response, next: NextFunction): void {
  try {
    const parsed = registerCertificateSchema.parse(req.body);
    const buffer = assertValidPdfBuffer(req.file?.buffer);

    const record = registerCertificate({
      ...parsed,
      fileBuffer: buffer,
      originalFilename: req.file?.originalname ?? "certificate.pdf",
      correlationId: res.locals.correlationId,
    });

    sendSuccess(
      res,
      { certificate: toPublicCertificate(record) },
      "Certificate registered successfully.",
      201
    );
  } catch (err) {
    next(err);
  }
}

export function getCertificates(req: Request, res: Response, next: NextFunction): void {
  try {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const statusRaw = typeof req.query.status === "string" ? req.query.status : undefined;
    const status =
      statusRaw === "active" || statusRaw === "revoked" ? statusRaw : undefined;

    const records = listCertificates({ search, status });
    sendSuccess(res, {
      certificates: records.map(toPublicCertificate),
      total: records.length,
    });
  } catch (err) {
    next(err);
  }
}

export function getCertificate(req: Request, res: Response, next: NextFunction): void {
  try {
    const record = getCertificateById(req.params.certificateId);
    if (!record) {
      throw errors.notFound(
        `No certificate found with ID "${req.params.certificateId}".`
      );
    }
    // Ownership: students may only view certificates issued to their own identifier.
    const user = res.locals.user;
    if (user && user.role === "student" && record.student_identifier !== user.studentIdentifier) {
      throw errors.forbidden("You can only view your own certificates.");
    }
    const issuer = getIssuerById(record.issuer_id);
    sendSuccess(res, {
      certificate: toPublicCertificate(record),
      issuer: issuer ? toPublicIssuer(issuer) : null,
    });
  } catch (err) {
    next(err);
  }
}

export function postRevoke(req: Request, res: Response, next: NextFunction): void {
  try {
    const { reason } = revokeCertificateSchema.parse(req.body);
    const record = revokeCertificate({
      certificateId: req.params.certificateId,
      reason,
      correlationId: res.locals.correlationId,
    });
    sendSuccess(
      res,
      { certificate: toPublicCertificate(record) },
      record.status === "revoked"
        ? "Certificate revoked."
        : "Certificate processed."
    );
  } catch (err) {
    next(err);
  }
}
