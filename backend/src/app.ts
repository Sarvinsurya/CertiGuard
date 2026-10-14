import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/index.js";
import { runMigrations } from "./db/migrator.js";
import { ensureDemoIssuer } from "./services/issuerService.js";
import { ensureAesKey, ensurePseudonymKey, ensureMfaKey } from "./crypto/keyManager.js";
import { seedRbac } from "./services/userService.js";
import { bootstrapAdmin } from "./services/bootstrapService.js";
import { apiRouter } from "./routes/index.js";
import { correlationId } from "./middleware/correlationId.js";
import { loadUser, csrfProtection } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/**
 * Initialize persistent state. Idempotent and safe to call repeatedly.
 * Order matters: migrations → keys → RBAC seed → demo issuer → admin bootstrap.
 */
export function bootstrap(): void {
  runMigrations();
  ensureAesKey();
  ensurePseudonymKey();
  ensureMfaKey();
  seedRbac();
  ensureDemoIssuer();
  bootstrapAdmin();
}

/** Validate required production secrets at startup (fail fast in production). */
export function validateProductionConfig(): void {
  if (!config.isProduction) return;
  const problems: string[] = [];
  if (!config.session.cookieSecure) problems.push("COOKIE_SECURE should be true in production.");
  if (config.frontendOrigin.startsWith("http://")) problems.push("FRONTEND_ORIGIN should use HTTPS in production.");
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.warn("[CertiGuard] Production config warnings:\n - " + problems.join("\n - "));
  }
}

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP is served by the frontend host; API is JSON-only
      crossOriginResourcePolicy: { policy: "same-site" },
    })
  );
  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true,
      exposedHeaders: ["X-Correlation-Id", "X-RateLimit-Remaining", "Retry-After"],
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(correlationId);
  app.use(loadUser); // populate res.locals.user if a valid session exists
  app.use(csrfProtection); // enforce CSRF on state-changing authenticated requests

  // Sensitive responses should not be cached.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
