# Security

This document describes CertiGuard's security controls and their honest limitations. It is a
project/demonstration system, not a certified production security product.

## Authentication & sessions

- Passwords hashed with **scrypt** (memory-hard; N=16384, r=8, p=1); never stored in plaintext;
  verified in constant time.
- **Server-managed sessions**: a random 256-bit token is set as an **HttpOnly** cookie; only
  its SHA-256 hash is stored. Cookies use `SameSite` and `Secure` (in production).
- Absolute (8h) and idle (30m) session expiry; session **rotation** after MFA completion and
  after password change; server-side revocation on logout, password reset, and deactivation.
- Login throttling (rate limit) + temporary account lockout after repeated failures; generic
  failure messages (no account enumeration).
- **CSRF**: double-submit token (`X-CSRF-Token`) required for authenticated state-changing
  requests.

## Multi-factor authentication

- TOTP (RFC 6238) via `otplib`; a unique secret per user, **encrypted at rest** with a
  dedicated MFA key (AES-256-GCM); never returned after enrollment; OTPs never logged.
- Ten **single-use** recovery codes, stored only as SHA-256 hashes.
- MFA verification is rate-limited; MFA enroll/confirm/disable/admin-reset are audited.

## Authorization (RBAC)

- Centralized permission map (`auth/rbac.ts`); backend middleware `authenticate`,
  `requireRole`, `requirePermission`, `requireOwnership`, `requireOrganizationScope`.
- Deny by default; least privilege. Students can only read their own certificates. Changing a
  URL/identifier does not grant access.

## Cryptographic key separation

Four distinct keys, generated once, `0600`, gitignored, never in API responses or logs:
1. Ed25519 issuer **signing** key.
2. AES-256 **data** encryption key.
3. HMAC **pseudonymization** key.
4. AES-256 **MFA-secret** encryption key.

No key is reused across purposes.

## Input, upload & output

- zod validation on all inputs; JSON body limit; file size limit; PDF (`%PDF-`) and PNG magic
  bytes checked; uploads kept in memory and stored with random UUID names (no user-controlled
  paths); parameterized SQL everywhere; safe error envelope (no stack traces/paths).

## Browser headers

- `helmet` baseline headers; `Cache-Control: no-store` on API responses; CORS restricted to
  the configured origin with credentials; `trust proxy` for correct client IPs behind a proxy.

## Anomaly detection rules (explainable, NOT ML)

| Rule | Trigger | Threshold / window | Severity | Risk weight |
|---|---|---|---|---|
| RULE_A_LOGIN_FAILURES | repeated login failures | 5 / 300s | high | 30 |
| RULE_B_VERIFICATION_BURST | verification burst | 15 / 60s | medium | 15 |
| RULE_C_UNAUTHORIZED_ACCESS | repeated 401/403 | 6 / 120s | high | 25 |
| RULE_D_RESOURCE_ENUMERATION | repeated unknown cert IDs | 8 / 120s | medium | 20 |
| RULE_E_MFA_FAILURES | repeated MFA failures | 5 / 300s | high | 25 |
| RULE_F_RATE_LIMIT_ABUSE | repeated rate-limit hits | 3 / 120s | medium | 15 |

## Risk scoring

Score = sum of triggered rule weights, capped at 100. Each rule contributes at most its weight
once per assessment, bounding duplicate-event inflation. Levels: 0–24 low, 25–49 moderate,
50–74 high, 75–100 critical. Contributing factors are stored and shown. **A heuristic risk
score is a signal, not proof of malicious behaviour.**

## Audit integrity

Append-only; each entry stores the previous entry's hash and its own hash over a versioned
canonical representation; writes are transactional. `verifyAuditIntegrity()` re-derives the
chain independently. **Limitation:** a hash chain within one database is tamper-**evident**,
not tamper-**proof** — a privileged DB operator could recompute the entire chain. For stronger
guarantees, anchor the head hash externally.

## Incident response

Actions are authorized (`incident.respond`), validated, audited, time-bound, and reversible:
throttle, suspend (temporary; blocked for administrators), revoke sessions, require password
reset, require MFA, flag for review. The system never auto-deletes users/certificates/files
and never auto-revokes real certificates on a heuristic score.

## Honest claims

- Masking is redaction, not encryption; pseudonymization is not anonymization; steganography
  is not encryption and offers no undetectability guarantee.
- A SHA-256 mismatch means the bytes differ — not conclusive proof of fraud.
- Local file key storage is not an HSM/KMS.

## Residual risks / deployment assumptions

HTTPS termination, secure cookies, production CORS, a shared rate-limit store for multi-instance
deployments, database + key backups, and key rotation are deployment responsibilities — see
DEPLOYMENT.md.
