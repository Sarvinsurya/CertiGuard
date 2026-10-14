import type { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.js";
import { recordSecurityEvent } from "../services/securityEventService.js";

/**
 * Configurable fixed-window rate limiter (in-memory).
 *
 * LIMITATION: the store is per-process. For multi-instance deployments a shared
 * store (e.g., Redis) is required — documented in DEPLOYMENT.md. Rate-limit
 * violations are recorded as security events (feeding anomaly detection).
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  category: string;
  windowMs: number;
  max: number;
  /** key by ip (default), authenticated user id, or both. */
  by?: "ip" | "user" | "ip+user";
}

const store = new Map<string, Bucket>();

// Periodic cleanup of expired buckets.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
}, 60_000);
cleanup.unref?.();

function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function rateLimit(options: RateLimitOptions) {
  const { category, windowMs, max, by = "ip" } = options;
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = clientIp(req);
    const userId = res.locals.user?.id as number | undefined;
    const keyParts: string[] = [category];
    if (by === "ip" || by === "ip+user") keyParts.push(`ip:${ip}`);
    if ((by === "user" || by === "ip+user") && userId) keyParts.push(`user:${userId}`);
    const key = keyParts.join("|");

    const now = Date.now();
    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      store.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      recordSecurityEvent({
        eventType: "RATE_LIMIT_EXCEEDED",
        severity: "medium",
        actorId: userId ?? null,
        sourceIp: ip,
        resourceType: "endpoint",
        resourceId: category,
        detectionRule: "RATE_LIMIT",
        riskContribution: 5,
        correlationId: res.locals.correlationId,
        metadata: { category, max, windowMs },
      });
      sendError(res, "RATE_LIMITED", "Too many requests. Please slow down and try again.", 429);
      return;
    }
    next();
  };
}

/** Reset all buckets (used in tests). */
export function resetRateLimiter(): void {
  store.clear();
}
