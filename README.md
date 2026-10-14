# CertiGuard

**Privacy-Preserving Digital Certificate Verification & Security Platform**

CertiGuard is an integrated platform for issuing, verifying, and governing digital
certificates. It combines certificate integrity (SHA-256), issuer authenticity (Ed25519
signatures), privacy-protection tooling, authenticated access control, security monitoring,
auditability, and safe incident response into one product.

Every security decision is computed by the backend from real data — nothing is hardcoded.

---

## 1. Main capabilities

- **Certificate Management** — register certificates (SHA-256 hash + Ed25519 signature over
  canonical metadata), browse the registry, verify candidate PDFs with four independent
  checks, revoke certificates, and manage trusted issuers.
- **Privacy & Information Protection** — AES-256-GCM authenticated encryption, PII detection,
  data masking, HMAC pseudonymization, data minimization, 2-of-2 visual cryptography, and
  PNG LSB steganography.
- **Identity & Access Management** — user accounts, four roles, backend-enforced RBAC,
  server-managed sessions (HttpOnly cookies + CSRF), scrypt password hashing, TOTP MFA with
  recovery codes, and administrative user management.
- **Security Operations** — per-category rate limiting, a security-event pipeline, explainable
  rule-based anomaly detection, transparent weighted risk scoring, an operations dashboard,
  and controlled security simulations that drive the real backend.
- **Audit & Compliance** — append-only, hash-chained audit trail with independent integrity
  verification and CSV export.
- **Incident Response** — incident lifecycle plus safe, reversible response actions
  (throttle, suspend, revoke sessions, require password reset, require MFA, flag for review).

## 2. Technology stack

**Frontend:** React 18, Vite 6, TypeScript, React Router 6, Axios, a custom CSS design system
(dark charcoal with warm orange/red gradients, motion-aware with `prefers-reduced-motion`).

**Backend:** Node.js (ESM), Express 4, TypeScript (NodeNext), `better-sqlite3`, Node `crypto`,
`multer` 2.x, `zod`, `helmet`, `cookie-parser`, `cors`, `otplib` (TOTP), `qrcode`, `sharp`,
`pngjs`.

**Database:** SQLite via `better-sqlite3` (WAL), file `backend/database/certiguard.db`.

**Testing:** Vitest + Supertest.

## 3. Architecture (summary)

```
React SPA (Vite)  ──HTTP/REST (cookies + CSRF)──►  Express API  ──►  SQLite
   UI only                                          routes → controllers → services
   no secrets                                        middleware: correlationId, loadUser,
   no authz logic                                    csrf, authenticate, requirePermission,
                                                      rateLimit, errorHandler
                                                      crypto keys live on the backend only
```

See **ARCHITECTURE.md** for the full design and data flows.

## 4. Repository structure

```
CertiGuard/
├── backend/   Express API, services, crypto, migrations, tests, scripts
├── frontend/  React SPA (pages, components, auth context, api client, theme)
├── screenshots/
├── README.md  PROJECT_STATUS.md  ARCHITECTURE.md  SECURITY.md
├── API_DOCUMENTATION.md  DEPLOYMENT.md  DATABASE.md  TESTING.md
```

## 5. Installation & running

**Prerequisites:** Node.js 20+ (developed on Node 24), npm.

### Backend
```bash
cd backend
npm install
cp .env.example .env            # fill in values (see §6)
npm run migrate                 # initialize / upgrade the SQLite schema (idempotent)
npm run init:keys               # generate all cryptographic keys (only if absent)
# Provision the first administrator (reads CERTIGUARD_ADMIN_EMAIL/PASSWORD from env):
CERTIGUARD_ADMIN_EMAIL=admin@your.org CERTIGUARD_ADMIN_PASSWORD='ChangeMe#2024' npm run bootstrap:admin
npm run seed                    # OPTIONAL: synthetic demo users + sample certificates
npm run dev                     # http://localhost:4000  (or: npm run build && npm start)
```

### Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api -> :4000)
# production: npm run build && npm run preview
```

Open **http://localhost:5173** and sign in.

### Tests
```bash
cd backend && npm test          # Vitest + Supertest (isolated temp DB per file)
```

## 6. Environment configuration

See `backend/.env.example`. Key variables: `NODE_ENV`, `PORT`, `FRONTEND_ORIGIN`,
`COOKIE_SECURE`, `COOKIE_SAMESITE`, session/auth policy, and the one-time
`CERTIGUARD_ADMIN_EMAIL`/`CERTIGUARD_ADMIN_PASSWORD`. Cryptographic keys are **files** under
`backend/keys/` (not env vars). Never commit `.env` or key files.

## 7. Authentication workflow

1. `POST /api/auth/login` with email + password → if MFA is enabled, the server returns
   `mfaRequired: true` and an MFA-pending session cookie.
2. `POST /api/auth/mfa/verify` with a TOTP token or a recovery code → the session is rotated
   to a fully-authenticated session.
3. The session is an **HttpOnly cookie**; a CSRF token (returned in the login response and
   `/api/auth/me`) must be sent in `X-CSRF-Token` for state-changing requests.
4. `POST /api/auth/logout` revokes the session server-side.

Passwords are scrypt-hashed. Repeated failures lock the account temporarily; login failure
messages are generic (no account enumeration).

## 8. Role & permission matrix

| Permission | Issuer | Verifier | Student | Admin |
|---|:--:|:--:|:--:|:--:|
| certificate.register | ✓ | | | |
| certificate.verify | ✓ | ✓ | ✓ | ✓ |
| certificate.view | ✓ | ✓ | | ✓ |
| certificate.view_own | | | ✓ | |
| certificate.revoke | ✓ | | | |
| certificate.download | ✓ | | ✓ | |
| privacy.use | ✓ | ✓ | | ✓ |
| user.view / create / update / deactivate | | | | ✓ |
| role.assign | | | | ✓ |
| security.view / configure | | | | ✓ |
| audit.view | | | | ✓ |
| incident.view / respond | | | | ✓ |
| account.manage | ✓ | ✓ | ✓ | ✓ |

RBAC is enforced on the backend by `requirePermission`/`requireRole` middleware. Hiding
navigation is a convenience only — the server authorizes every request. The "Roles &
Permissions" page renders this matrix in-app.

## 9. MFA setup

Account Security → **Enable MFA** shows a QR code (scan with Google/Microsoft Authenticator)
and ten single-use recovery codes (displayed once). Confirm with a code to activate. The TOTP
secret is encrypted at rest with a dedicated MFA key and never returned after enrollment.
Recovery codes are stored only as hashes. Administrators can reset a user's MFA (audited).

## 10. Certificate registration & verification

- **Register** (issuer): fill the form + upload a PDF. The backend validates the PDF (MIME +
  `%PDF-` magic bytes, size limit), computes its SHA-256, builds a deterministic canonical
  record, and signs it with the issuer's Ed25519 private key.
- **Verify** (any permitted role): upload the candidate PDF + certificate ID. The backend
  reports four independent checks — **Record**, **Document integrity** (SHA-256), **Signature**
  (Ed25519), **Revocation** — and an overall result: `VERIFIED`, `DOCUMENT_MISMATCH`,
  `NOT_REGISTERED`, `INVALID_SIGNATURE`, `REVOKED`, or `INCONCLUSIVE`.

A hash mismatch means the submitted bytes differ from the registered file — it is **not**
automatically proof of fraud. A revoked certificate can still have a matching hash and valid
signature; the individual checks are shown accurately while the overall status is `REVOKED`.

## 11. Privacy functionality

Seven tools, each with a normal demonstration, a controlled failure/misuse demonstration, and
honest limitations: Encryption Lab (AES-256-GCM), PII Detection, Data Masking, Pseudonymization
(HMAC-SHA256), Data Minimization (backend allowlists), Visual Cryptography (2-of-2
Naor–Shamir), Steganography (PNG LSB). Masking is not encryption; pseudonymization is not
anonymization; steganography is not encryption — stated in-app and in **SECURITY.md**.

## 12. Security monitoring, risk scoring, audit, incidents, simulation

- **Rate limiting** returns real HTTP 429 with `Retry-After` and records a security event.
- **Anomaly detection** uses six explainable rules (not ML). See **SECURITY.md** for each
  rule's trigger/threshold/weight.
- **Risk scoring** is a documented weighted sum (0–100) → low / moderate / high / critical,
  with contributing factors. A heuristic score is a signal, not proof of an attack.
- **Audit logging** is append-only and hash-chained; integrity is independently verifiable
  and the log is CSV-exportable (admins only).
- **Incident response** actions are authorized, audited, reversible, and conservative.
- **Security simulations** send real requests through the live middleware/event pipeline and
  report measured results — never fabricated numbers.

## 13. API reference

See **API_DOCUMENTATION.md** for the full endpoint list with methods, permissions, and
request/response shapes.

## 14. Production deployment

See **DEPLOYMENT.md** (HTTPS, reverse proxy, secure cookies, production CORS, environment
validation, key backup/rotation, database backup, graceful shutdown, and the limitations of
single-instance SQLite + in-memory rate limiting).

## 15. Backup & recovery

Back up `backend/database/certiguard.db` and the `backend/keys/` directory **together** —
losing the signing key means previously-issued signatures can no longer be verified against
that issuer. See **DEPLOYMENT.md** for rotation guidance.

## 16. Known limitations

- SQLite is single-instance (one writer at a time); not horizontally scalable without
  migrating to a managed database.
- The rate limiter is in-memory (per process); multi-instance deployments need a shared store.
- Cryptographic keys are local files (strict permissions), not an HSM/KMS.
- Audit hash chaining is tamper-**evident**, not tamper-**proof** against a privileged DB
  operator.
- Anomaly detection is rule-based; PII detection is pattern-based with false positives/negatives.
- Password reset tokens are returned in the API response in development only; wire an email
  provider for production.

## 17. Demo accounts

After `npm run seed` (local only): `issuer@demo.certiguard`, `verifier@demo.certiguard`,
`student@demo.certiguard` — password = `CERTIGUARD_DEMO_PASSWORD` (default `DemoPass123!`).
Create the administrator with `npm run bootstrap:admin`. Reset the demo by deleting
`backend/database/certiguard.db` and re-running migrate/seed (this also removes issued data).

## 18. Verification status

- Backend: `tsc` build exit 0; **113/113** Vitest tests pass.
- Frontend: `tsc && vite build` exit 0.
- Live end-to-end confirmed (issuer login → register → verifier VERIFIED → RBAC 403 →
  revoke → REVOKED → admin audit-integrity intact → security events recorded → no secret
  leakage). See **TESTING.md**.
