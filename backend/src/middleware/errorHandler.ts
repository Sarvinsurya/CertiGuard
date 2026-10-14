import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError, sendError } from "../utils/response.js";
import { config } from "../config/index.js";

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, "NOT_FOUND", "The requested resource was not found.", 404);
}

/**
 * Central error handler. Returns safe, structured errors and NEVER leaks stack
 * traces, filesystem paths, or internal details to the client.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Known operational errors
  if (err instanceof AppError) {
    sendError(res, err.code, err.message, err.statusCode);
    return;
  }

  // Validation errors from zod
  if (err instanceof ZodError) {
    const message = err.errors
      .map((e) => `${e.path.join(".") || "field"}: ${e.message}`)
      .join("; ");
    sendError(res, "VALIDATION_ERROR", message, 400);
    return;
  }

  // Multer upload errors (size, count, etc.)
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const mb = (config.upload.maxFileBytes / (1024 * 1024)).toFixed(0);
      sendError(
        res,
        "PAYLOAD_TOO_LARGE",
        `File exceeds the maximum allowed size of ${mb} MB.`,
        413
      );
      return;
    }
    sendError(res, "UPLOAD_ERROR", `File upload error: ${err.code}.`, 400);
    return;
  }

  // Unknown / unexpected errors: log server-side, return generic message.
  // eslint-disable-next-line no-console
  console.error("[CertiGuard] Unhandled error:", err);
  sendError(
    res,
    "INTERNAL_ERROR",
    "An unexpected error occurred. Please try again later.",
    500
  );
}
