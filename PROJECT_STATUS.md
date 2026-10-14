# CertiGuard — Project Status

**Status: COMPLETE integrated platform.** Certificate security, privacy protection, identity &
access management, security operations, audit, and incident response are implemented, wired
together, and tested.

Database schema version: **2**.

## Capability status

| Capability | Status |
|---|---|
| SHA-256 hashing | COMPLETED (implemented + tested) |
| Ed25519 digital signatures | COMPLETED (implemented + tested) |
| Certificate registration / registry / details | COMPLETED (implemented + tested) |
| Certificate verification (4 independent checks) | COMPLETED (implemented + tested) |
| Certificate revocation | COMPLETED (implemented + tested) |
| Issuer key management | COMPLETED (implemented + tested) |
| AES-256-GCM encryption | COMPLETED (implemented + tested) |
| PII detection | COMPLETED (implemented + tested) |
| Data masking | COMPLETED (implemented + tested) |
| Pseudonymization (HMAC-SHA256) | COMPLETED (implemented + tested) |
| Data minimization (backend allowlists) | COMPLETED (implemented + tested) |
| Visual cryptography (2-of-2) | COMPLETED (implemented + tested) |
| PNG LSB steganography | COMPLETED (implemented + tested) |
| Authentication (scrypt, sessions, lockout, reset) | COMPLETED (implemented + tested) |
| TOTP MFA (encrypted secret, recovery codes) | COMPLETED (implemented + tested) |
| RBAC (roles, permissions, ownership, org scope) | COMPLETED (implemented + tested) |
| User management | COMPLETED (implemented + tested) |
| Rate limiting | COMPLETED (implemented + tested) |
| Security event pipeline | COMPLETED (implemented + tested) |
| Rule-based anomaly detection | COMPLETED (implemented + tested) |
| Weighted risk scoring | COMPLETED (implemented + tested) |
| Audit logging (hash-chained) + integrity + CSV | COMPLETED (implemented + tested) |
| Incident response (safe, reversible) | COMPLETED (implemented + tested) |
| Security simulations (drive real backend) | COMPLETED (implemented + tested) |
| Role-aware dashboards + navigation | COMPLETED (implemented; verified live) |

Email delivery for password reset: **not implemented** (dev returns the token; wire an email
provider for production). External KMS/HSM: **requires external infrastructure** (file-based
keys provided with an upgrade path).

## Test results

- Vitest + Supertest: **113/113 passing** across 14 files.
- Backend `tsc` build: exit 0. Frontend `tsc && vite build`: exit 0.
- Live end-to-end confirmed (see TESTING.md). No Phase-1/2 regressions.

## New dependencies (this delivery)

Backend runtime: `otplib`, `cookie-parser`, `helmet`, `qrcode` (added to existing
`better-sqlite3`, `express`, `cors`, `multer`, `zod`, `sharp`, `pngjs`). Backend dev:
`@types/cookie-parser`, `@types/qrcode`. Passwords use Node's built-in scrypt (no native dep).

## New API route groups

`/api/auth/*`, `/api/users/*`, `/api/dashboard`, `/api/security/*`, `/api/incidents/*`,
`/api/audit/*`. Existing certificate/verify/privacy routes are now behind `authenticate` +
`requirePermission`.

## Database migrations

v1 (certificates/issuers/audit_logs) preserved; v2 adds identity + security-operations tables
and audit hash-chaining columns. Idempotent, forward-only, data-preserving.

## Security considerations

See SECURITY.md. Four separate keys (signing/AES/HMAC/MFA), scrypt passwords, HttpOnly+CSRF
sessions, helmet headers, parameterized SQL, validated uploads, safe errors, hash-chained
audit (tamper-evident, documented limits), safe reversible incident actions.

## Deployment assumptions

Single-instance SQLite + in-memory rate limiting (documented). HTTPS, secure cookies,
production CORS, shared rate-limit store for multi-instance, DB + key backups, and key rotation
are deployment responsibilities. See DEPLOYMENT.md.

## Known limitations

- SQLite single-writer; in-memory limiter per process; local file keys (not HSM/KMS).
- Audit hash chain is tamper-evident, not tamper-proof against a privileged DB operator.
- Rule-based detection and pattern-based PII detection have inherent false positives/negatives.
- Password-reset email delivery is not wired (dev token only).

## Documentation

README.md, PROJECT_STATUS.md, ARCHITECTURE.md, SECURITY.md, API_DOCUMENTATION.md,
DEPLOYMENT.md, DATABASE.md, TESTING.md. No implementation-stage labels appear in the
user-facing UI.
