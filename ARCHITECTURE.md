# Architecture

## Overview

CertiGuard is a separated frontend + backend application. The React SPA is a pure
presentation layer; all trust decisions, cryptography, and persistence live in the Express
backend. SQLite is the single data store.

```
┌────────────────────────────┐
│  React + Vite SPA (5173)    │  pages, components, auth context, axios client
│  - no DB access             │  - sends HttpOnly cookie + X-CSRF-Token
│  - no secrets / keys        │  - hides nav by permission (convenience only)
└──────────────┬─────────────┘
               │ REST / JSON + multipart (credentials: include)
               ▼
┌────────────────────────────┐
│  Express API (4000)         │
│  middleware pipeline:       │
│   helmet → cors(creds) →    │
│   json → cookieParser →     │
│   correlationId → loadUser →│
│   csrfProtection →          │
│   [route] authenticate →    │
│     requirePermission →     │
│     rateLimit → controller  │
│   → services → errorHandler │
│                             │
│  layers:                    │
│   routes/        HTTP wiring │
│   controllers/   req/res + validation (zod)
│   services/      business + crypto + DB access
│   crypto/        hashing, signing, aesgcm, keyManager
│   middleware/    auth, rateLimit, upload, correlationId, errorHandler
│   db/            connection, migrations, migrator
└──────────────┬─────────────┘
               ▼
┌────────────────────────────┐
│  SQLite (WAL)               │  certificates, issuers, users, roles, permissions,
│  better-sqlite3             │  sessions, user_mfa, security_events, risk_assessments,
│                             │  incidents, audit_logs (hash-chained), …
└────────────────────────────┘

Backend-only, gitignored, outside any served directory:
  keys/      Ed25519 signing · AES data · HMAC pseudonymization · MFA-secret encryption
  storage/   registered PDF documents (random UUID filenames)
```

## Request lifecycle

1. `helmet` sets security headers; `cors` allows the configured frontend origin with
   credentials; `/api` responses set `Cache-Control: no-store`.
2. `correlationId` assigns/echoes `X-Correlation-Id`.
3. `loadUser` resolves a valid session cookie into `res.locals.user` (or leaves it empty).
   MFA-pending sessions carry no permissions.
4. `csrfProtection` enforces `X-CSRF-Token` on authenticated state-changing requests.
5. Route-level `authenticate` + `requirePermission`/`requireRole` + `rateLimit` guard the
   handler. Ownership (`requireOwnership`) and org scope (`requireOrganizationScope`) guard
   resource access.
6. Controllers validate input with zod, call services, and return the standard envelope.
7. The central `errorHandler` maps `AppError`/`ZodError`/multer errors to safe responses
   (no stack traces or filesystem paths).

## Response envelope

Success: `{ success: true, data, message, correlationId }`
Error: `{ success: false, error: { code, message }, correlationId }`

## Cryptographic services

- **Hashing** (`crypto/hashing.ts`): SHA-256 over exact uploaded bytes.
- **Signing** (`crypto/signing.ts`): Ed25519 sign/verify, fail-closed on malformed input.
- **Canonical** (`crypto/canonical.ts`): deterministic, versioned metadata serialization.
- **AES-GCM** (`crypto/aesgcm.ts`): AES-256-GCM with per-op 96-bit nonce + 128-bit tag;
  decryption returns plaintext only after authentication succeeds.
- **Key manager** (`crypto/keyManager.ts`): generates/loads four separate keys, each once,
  with `0600` permissions.

## Security operations data flow

Real activity (auth, verification, authz denials, rate-limit hits) → `recordSecurityEvent`
→ `security_events`. `riskService` evaluates rules over recent events and writes
`risk_assessments`. Incidents and their reversible actions are recorded in `incidents` /
`incident_actions` and mirrored into the hash-chained `audit_logs`.

## Extensibility

New capabilities add a service + controller + route and (if persistent) a new versioned
migration object. Existing migrations are never edited; data is preserved across upgrades.
