import type { Response } from "express";

/** Operational error with a safe, user-facing message and HTTP status. */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const errors = {
  validation: (msg: string) => new AppError(400, "VALIDATION_ERROR", msg),
  unauthorized: (msg: string) => new AppError(401, "UNAUTHORIZED", msg),
  notFound: (msg: string) => new AppError(404, "NOT_FOUND", msg),
  conflict: (msg: string) => new AppError(409, "CONFLICT", msg),
  forbidden: (msg: string) => new AppError(403, "FORBIDDEN", msg),
  payloadTooLarge: (msg: string) => new AppError(413, "PAYLOAD_TOO_LARGE", msg),
  tooManyRequests: (msg: string) => new AppError(429, "RATE_LIMITED", msg),
  internal: (msg: string) => new AppError(500, "INTERNAL_ERROR", msg),
};

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  message: string;
  correlationId: string;
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string };
  correlationId: string;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Operation completed successfully",
  statusCode = 200
): void {
  const body: SuccessEnvelope<T> = {
    success: true,
    data,
    message,
    correlationId: res.locals.correlationId ?? "",
  };
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number
): void {
  const body: ErrorEnvelope = {
    success: false,
    error: { code, message },
    correlationId: res.locals.correlationId ?? "",
  };
  res.status(statusCode).json(body);
}
