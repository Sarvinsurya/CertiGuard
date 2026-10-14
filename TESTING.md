# Testing

## How to run
```bash
cd backend && npm test        # Vitest + Supertest, isolated temp DB per file
cd backend && npm run build   # tsc type-check / emit
cd frontend && npm run build  # tsc + vite production build
```

Each backend test file gets a fresh temporary data directory (`CERTIGUARD_DATA_DIR`), so tests
never touch real data or keys. An administrator is bootstrapped deterministically via env vars
inside the harness; `createUser`/`login`/`adminLogin` helpers return `{cookie, csrfToken}`.

## Actual results (last run)

```
 ✓ tests/crypto.test.ts             (12)   SHA-256, canonicalization, Ed25519
 ✓ tests/aesgcm.test.ts             (8)    AES round-trip, wrong key, tamper ct/tag, nonce uniqueness
 ✓ tests/privacyServices.test.ts    (15)   PII detection, masking rules/immutability, minimization allowlists
 ✓ tests/infohiding.test.ts         (9)    visual crypto 2-share + steganography round-trip/capacity
 ✓ tests/registration.test.ts       (7)    valid/missing/non-PDF/duplicate/persist + 401 unauth
 ✓ tests/verification.test.ts       (6)    VERIFIED/MISMATCH/NOT_REGISTERED/REVOKED/INVALID_SIGNATURE
 ✓ tests/revocation.test.ts         (6)    revoke/reason/404/RBAC-403/idempotent/persist
 ✓ tests/labs.test.ts               (4)    health, issuers(no private key), hash lab, signature demo
 ✓ tests/privacyApi.test.ts         (10)   /privacy encrypt/decrypt(+tamper), pii, mask, pseudonymize, VC, stego, 401
 ✓ tests/auth.test.ts               (10)   password hashing, login, generic 401, logout, deactivated, reset single-use, throttling
 ✓ tests/rbac.test.ts               (9)    role boundaries, cross-user denial, admin access, unauth 401
 ✓ tests/mfa.test.ts                (4)    enroll (encrypted secret), invalid/valid OTP, recovery single-use, MFA login flow
 ✓ tests/securityMonitoring.test.ts (7)    rate limit 429 + event, rule triggering, risk score, simulation
 ✓ tests/auditIncidents.test.ts     (9)    hash-chain verify + tamper detection, CSV export, incident suspend+reverse, admin-suspend blocked

 Test Files  14 passed (14)
      Tests  113 passed (113)
```

- Backend `tsc -p tsconfig.json` → exit 0.
- Frontend `tsc && vite build` → exit 0.

## Coverage of required scenarios

- **Authentication:** valid login, invalid password, unknown account (generic 401), disabled
  account, password hashing, logout/session invalidation, password reset + expired/reused token
  rejection, login throttling (429).
- **RBAC:** student cannot register; verifier cannot register/revoke; issuer cannot manage
  users; non-admins cannot access audit/incidents/security; a student cannot read another
  student's certificate via URL; unauthenticated access denied.
- **MFA:** enrollment stores an encrypted secret; invalid vs valid OTP; recovery-code
  single-use; full login→MFA-challenge→completion flow; protected routes blocked while
  MFA-pending.
- **Security monitoring:** rate limiting yields real 429 + `Retry-After` + a recorded event;
  rule triggers at threshold (and not below); risk score + explanations; simulation produces
  measured results.
- **Audit:** chained entries verify; a modified entry is detected (`firstBrokenId`); CSV export
  authorized; no credential/key material in audit records.
- **Incident response:** create → suspend (reversible) blocks login → reverse restores login;
  administrator cannot be auto-suspended; actions recorded in the audit trail.
- **Regression:** all Phase-1/2 certificate + privacy features still pass under authentication.

## Live end-to-end (manual, confirmed against a running server)

issuer login → role-aware dashboard metrics → register certificate → verifier login → verify
= **VERIFIED** (4 checks) → verifier register attempt = **403** → issuer revoke → re-verify =
**REVOKED** → admin login → audit integrity **intact (12 chained entries)** → security events
recorded → `GET /api/users` leaked **0** `password_hash`/`PRIVATE KEY`/`secret_encrypted`.

## Notes

- The simulation test asserts measured outputs (events generated, risk assessment present); it
  is resilient to the ephemeral test server not listening on a fixed port.
- Tests were actually executed; the counts above reflect real runs.
