# API Documentation

Base URL: `/api`. All responses use the envelope
`{ success, data, message, correlationId }` (errors: `{ success:false, error:{code,message}, correlationId }`).
Authenticated requests send the HttpOnly session cookie automatically; state-changing requests
must include `X-CSRF-Token`.

## Health
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | public | status + DB schema version |

## Authentication
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | public | `{email,password}` → `{mfaRequired, csrfToken, user?}` (rate-limited) |
| POST | `/auth/mfa/verify` | mfa-pending session | `{token}` or `{recoveryCode}` (rate-limited) |
| POST | `/auth/logout` | session | revokes session |
| GET | `/auth/me` | session | current user + permissions + csrfToken |
| POST | `/auth/password/change` | authenticated | `{currentPassword,newPassword}` |
| POST | `/auth/password/forgot` | public | `{email}` (rate-limited; dev returns token) |
| POST | `/auth/password/reset` | public | `{token,newPassword}` |
| POST | `/auth/mfa/enroll` | authenticated | returns QR + recovery codes (once) |
| POST | `/auth/mfa/confirm` | authenticated | `{token}` enables MFA |
| POST | `/auth/mfa/disable` | authenticated | `{password,token}` |
| GET | `/auth/sessions` | authenticated | list sessions + recovery codes remaining |
| DELETE | `/auth/sessions/:id` | authenticated | revoke a specific session |

## User management (admin)
| Method | Path | Permission |
|---|---|---|
| GET | `/users` | user.view |
| GET | `/users/organizations` | user.view |
| POST | `/users` | user.create |
| GET | `/users/:id` | user.view |
| PATCH | `/users/:id` | user.update |
| POST | `/users/:id/deactivate` | user.deactivate |
| POST | `/users/:id/activate` | user.deactivate |
| POST | `/users/:id/role` | role.assign |
| POST | `/users/:id/mfa/reset` | user.update |

## Dashboard
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/dashboard` | authenticated | role-aware metrics from real queries |

## Certificates
| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/issuers`, `/issuers/:id` | authenticated | public key only |
| POST | `/certificates` | certificate.register | multipart; rate-limited |
| GET | `/certificates` | certificate.view | search/status filters |
| GET | `/certificates/:certificateId` | authenticated | students: own only (ownership) |
| POST | `/certificates/:certificateId/revoke` | certificate.revoke | `{reason}` |
| POST | `/verify` | certificate.verify | multipart; rate-limited; 4 independent checks |

## Privacy & information protection (permission: privacy.use)
| Method | Path |
|---|---|
| POST | `/privacy/encrypt`, `/privacy/decrypt` |
| POST | `/privacy/pii/detect` |
| POST | `/privacy/masking/demo` |
| POST | `/privacy/pseudonymize` |
| GET | `/privacy/minimization/sample` · POST `/privacy/minimization/demo` |
| POST | `/privacy/visual-cryptography/split` · `/privacy/visual-cryptography/reconstruct` |
| GET | `/privacy/steganography/sample-carrier` · POST `/privacy/steganography/embed` · `/extract` |
| POST | `/lab/hash` · `/lab/signature-demo` |

## Security operations (permission: security.view)
| Method | Path | Notes |
|---|---|---|
| GET | `/security/summary` | metrics + high-risk subjects |
| GET | `/security/events`, `/security/events/:id` | filters + pagination |
| GET | `/security/risk`, `/security/risk/:subjectId` | risk assessments |
| GET | `/security/rules` | detection rule definitions |
| GET | `/security/simulations` | available scenarios |
| POST | `/security/simulations/:scenario/run` | security.configure; drives real backend |

## Incidents (permission: incident.view; mutations: incident.respond)
| Method | Path |
|---|---|
| GET | `/incidents` · POST `/incidents` |
| GET | `/incidents/:id` · PATCH `/incidents/:id` |
| POST | `/incidents/:id/actions` · `/incidents/:id/resolve` · `/incidents/:id/false-positive` |
| POST | `/incidents/actions/:actionId/reverse` |

## Audit (permission: audit.view)
| Method | Path | Notes |
|---|---|---|
| GET | `/audit` | filters + pagination |
| GET | `/audit/integrity` | re-verify hash chain |
| GET | `/audit/export` | CSV download |
| GET | `/audit/:id` | single entry |

## Status codes
`200/201` success · `400` validation · `401` unauthenticated · `403` forbidden (RBAC/CSRF/
ownership) · `404` not found · `409` conflict · `429` rate limited (with `Retry-After`) ·
`500` internal (safe message only).
