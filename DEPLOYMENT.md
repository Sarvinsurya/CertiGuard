# Deployment

CertiGuard runs as two processes: an Express API and a static frontend bundle. The reference
configuration is a single backend instance with SQLite — suitable for a controlled
demonstration or a small production deployment. It is **not** automatically horizontally
scalable.

## 1. Build

```bash
# Backend
cd backend && npm ci && npm run build        # emits dist/
# Frontend
cd ../frontend && npm ci && npm run build     # emits dist/ (static files)
```

## 2. Environment

Copy `backend/.env.example` → `.env` and set production values:
- `NODE_ENV=production`
- `PORT` (e.g., 4000, behind a reverse proxy)
- `FRONTEND_ORIGIN=https://your-domain` (HTTPS)
- `COOKIE_SECURE=true`, `COOKIE_SAMESITE=lax` (or `strict`)
- Session/auth policy as desired.

The server runs `validateProductionConfig()` at startup and warns if `COOKIE_SECURE` is off or
`FRONTEND_ORIGIN` is not HTTPS in production.

## 3. One-time initialization

```bash
cd backend
NODE_ENV=production node dist/scripts/migrate.js      # or: npm run migrate
NODE_ENV=production node dist/scripts/initKeys.js     # generate keys ONCE
CERTIGUARD_ADMIN_EMAIL=... CERTIGUARD_ADMIN_PASSWORD=... node dist/scripts/bootstrapAdmin.js
```

Do **not** run `seed` in production (it creates demo accounts).

## 4. Run

```bash
cd backend && NODE_ENV=production node dist/server.js
```

Serve the frontend `dist/` from a static host or the reverse proxy. The proxy must forward
`/api/*` to the backend on the **same origin** so the HttpOnly session cookie is sent.

### Example reverse proxy (nginx sketch)
```
server {
  listen 443 ssl;
  server_name your-domain;
  # ssl_certificate / ssl_certificate_key ...
  location /api/ { proxy_pass http://127.0.0.1:4000; proxy_set_header X-Forwarded-For $remote_addr; }
  location / { root /var/www/certiguard; try_files $uri /index.html; }
}
```

The backend sets `trust proxy` so `X-Forwarded-For` yields correct client IPs for rate
limiting and security events.

## 5. HTTPS & cookies

Terminate TLS at the proxy. With `COOKIE_SECURE=true`, cookies are only sent over HTTPS.
Keep API and frontend on the same site so `SameSite=lax` cookies flow correctly.

## 6. Keys: backup, rotation, recovery

- Keys live in `backend/keys/` (`0600`, gitignored). **Back them up with the database.**
- **Signing key loss:** previously-issued signatures can no longer be verified against that
  issuer. Rotating the signing key requires re-signing existing records (migrate the canonical
  format version if the schema changes) or maintaining the old public key as a trust anchor.
- **AES/MFA key loss:** encrypted data (incl. MFA secrets) becomes undecryptable; affected
  users must re-enroll MFA.
- **HMAC key rotation:** changes all pseudonyms (expected). Bump the key version.
- Upgrade path: move keys to a KMS/HSM and load them at startup instead of from files.

## 7. Database

- Back up `certiguard.db` (and `-wal`/`-shm`) regularly. SQLite allows one writer at a time.
- For higher concurrency/scale, migrate to a managed SQL database; the data-access layer is
  centralized in `services/` + `db/` to make this feasible.

## 8. Multi-instance considerations

- The rate limiter is **in-memory per process**. Running more than one backend instance
  requires a shared store (e.g., Redis) for consistent limiting; otherwise limits apply
  per-instance.
- Sessions are stored in the database, so they already work across instances that share the DB.

## 9. Operations

- Health check: `GET /api/health`.
- Graceful shutdown: the server handles `SIGTERM`/`SIGINT`, stops accepting connections, and
  closes the database.
- Do not enable debug logging of sensitive data in production.

## 10. Honest statement

A single-instance SQLite deployment is appropriate for demonstrations and small installations.
It is not, by itself, a horizontally scalable production architecture.
