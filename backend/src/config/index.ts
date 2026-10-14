import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// backend/src/config -> backend
const BACKEND_ROOT = path.resolve(__dirname, "..", "..");

export interface AppConfig {
  env: string;
  port: number;
  frontendOrigin: string;
  paths: {
    backendRoot: string;
    database: string;
    keysDir: string;
    privateKeyFile: string;
    aesKeyFile: string;
    pseudonymKeyFile: string;
    mfaKeyFile: string;
    storageDir: string; // where registered documents are persisted
    tmpDir: string; // multer scratch space
  };
  upload: {
    maxFileBytes: number;
    allowedMime: string[];
    allowedExt: string[];
  };
  demoIssuer: {
    issuerName: string;
    issuerCode: string;
    keyAlgorithm: string;
  };
  canonicalFormatVersion: string;
  signatureAlgorithm: string;
  // When true, prototype admin endpoints (revocation) are allowed.
  // Phase 3 will replace this with real authentication + RBAC.
  allowPrototypeAdmin: boolean;
  isProduction: boolean;
  session: {
    cookieName: string;
    ttlSeconds: number; // absolute session lifetime
    idleSeconds: number; // inactivity timeout
    cookieSecure: boolean;
    cookieSameSite: "lax" | "strict" | "none";
  };
  auth: {
    maxFailedLogins: number;
    lockoutSeconds: number;
    passwordResetTtlSeconds: number;
    mfaMaxAttempts: number;
    mfaWindow: number; // TOTP step tolerance
  };
  adminBootstrap: {
    email: string | undefined;
    password: string | undefined;
    displayName: string;
  };
}

function resolveFromRoot(relative: string): string {
  const override = process.env.CERTIGUARD_DATA_DIR;
  if (override) {
    return path.resolve(override, relative);
  }
  return path.join(BACKEND_ROOT, relative);
}

export const config: AppConfig = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  paths: {
    backendRoot: BACKEND_ROOT,
    database: resolveFromRoot(path.join("database", "certiguard.db")),
    keysDir: resolveFromRoot("keys"),
    privateKeyFile: resolveFromRoot(path.join("keys", "issuer_ed25519_private.pem")),
    aesKeyFile: resolveFromRoot(path.join("keys", "aes256.key")),
    pseudonymKeyFile: resolveFromRoot(path.join("keys", "pseudonym_hmac.key")),
    mfaKeyFile: resolveFromRoot(path.join("keys", "mfa_aes256.key")),
    storageDir: resolveFromRoot(path.join("storage", "documents")),
    tmpDir: resolveFromRoot("tmp"),
  },
  upload: {
    maxFileBytes: 10 * 1024 * 1024, // 10 MB
    allowedMime: ["application/pdf"],
    allowedExt: [".pdf"],
  },
  demoIssuer: {
    issuerName: "CertiGuard Demonstration University",
    issuerCode: "CGDU-001",
    keyAlgorithm: "Ed25519",
  },
  canonicalFormatVersion: "1.0",
  signatureAlgorithm: "Ed25519",
  allowPrototypeAdmin: process.env.CERTIGUARD_DISABLE_PROTOTYPE_ADMIN !== "true",
  isProduction: (process.env.NODE_ENV ?? "development") === "production",
  session: {
    cookieName: "cg_session",
    ttlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 8), // 8h absolute
    idleSeconds: Number(process.env.SESSION_IDLE_SECONDS ?? 60 * 30), // 30m idle
    cookieSecure:
      process.env.COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false"),
    cookieSameSite: (process.env.COOKIE_SAMESITE as "lax" | "strict" | "none") ?? "lax",
  },
  auth: {
    maxFailedLogins: Number(process.env.AUTH_MAX_FAILED_LOGINS ?? 5),
    lockoutSeconds: Number(process.env.AUTH_LOCKOUT_SECONDS ?? 15 * 60),
    passwordResetTtlSeconds: Number(process.env.AUTH_RESET_TTL_SECONDS ?? 60 * 60),
    mfaMaxAttempts: Number(process.env.AUTH_MFA_MAX_ATTEMPTS ?? 5),
    mfaWindow: Number(process.env.AUTH_MFA_WINDOW ?? 1),
  },
  adminBootstrap: {
    email: process.env.CERTIGUARD_ADMIN_EMAIL,
    password: process.env.CERTIGUARD_ADMIN_PASSWORD,
    displayName: process.env.CERTIGUARD_ADMIN_NAME ?? "Security Administrator",
  },
};
