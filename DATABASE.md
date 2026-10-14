# Database

SQLite via `better-sqlite3` (WAL mode, foreign keys on). File:
`backend/database/certiguard.db`. Schema is managed by **versioned, idempotent migrations**
in `backend/src/db/migrations.ts`, applied by `backend/src/db/migrator.ts` and tracked in
`schema_migrations`. Existing migrations are never edited; upgrades preserve data.

Current schema version: **2**.

## Migration v1 — certificate foundation
- `issuers` — id, issuer_name, issuer_code (unique), public_key (PEM), key_algorithm, status,
  timestamps. **No private key is ever stored.**
- `certificates` — id, certificate_id (unique, indexed), student_name, student_identifier,
  institution_name, qualification, graduation_year, issue_date, document_hash (SHA-256),
  signature (Ed25519 b64), signature_algorithm, canonical_format_version, issuer_id (FK),
  file_reference, status (active|revoked), timestamps, revoked_at, revocation_reason.
- `audit_logs` — base columns (correlation_id, action, target, outcome, details, created_at).

## Migration v2 — identity & security operations
- `organizations` — id, name, type (institution|company|platform), status, issuer_id (FK), created_at.
- `roles` — id, name (unique), description.
- `permissions` — id, permission_key (unique), description.
- `role_permissions` — (role_id, permission_id) PK.
- `users` — id, email (unique), password_hash (scrypt), display_name, role_id (FK),
  organization_id (FK), student_identifier, status, mfa_enabled, must_change_password,
  failed_login_count, locked_until, last_login_at, timestamps.
- `user_mfa` — user_id PK, secret_encrypted (AES-GCM payload JSON), confirmed_at, created_at.
- `mfa_recovery_codes` — id, user_id (FK), code_hash (SHA-256), used_at, created_at.
- `sessions` — id, user_id (FK), session_hash (unique SHA-256), mfa_pending, csrf_token,
  created_at, expires_at, last_activity_at, revoked_at.
- `password_reset_tokens` — id, user_id (FK), token_hash (unique), used_at, expires_at, created_at.
- `security_events` — id, event_type, severity, actor_id, actor_label, organization_id,
  source_ip, resource_type, resource_id, detection_rule, risk_contribution, metadata_json,
  resolution_status, correlation_id, created_at.
- `risk_assessments` — id, subject_type, subject_id, score, level, contributing_factors_json,
  assessed_at.
- `incidents` — id, title, description, severity, status, risk_score, detection_rule,
  subject_type, subject_id, assigned_to (FK), timestamps, resolved_at, resolution_notes.
- `incident_actions` — id, incident_id (FK), actor_id (FK), action_type, target_type,
  target_id, reason, duration_seconds, created_at, expires_at, reversed_at.
- `account_restrictions` — id, user_id (FK), restriction, reason, created_at, expires_at, reversed_at.
- `security_policies` — id, policy_key (unique), value_json, description, updated_at.
- `audit_logs` extended with: actor_id, actor_role, resource_type, source_ip, prev_hash,
  entry_hash, chain_version (hash chaining).

## Indexes
On certificate_id/status/student_name; users email/role; sessions hash/user; security_events
type/severity/actor/created; audit_logs action/created; risk subject; incidents status;
incident_actions incident; recovery/restrictions by user.

## Integrity & constraints
Foreign keys, unique constraints (emails, certificate IDs, issuer codes, session/reset
hashes), `CHECK` constraints on enums (status/severity/type), UTC ISO timestamps,
transactions for multi-row writes (registration file+row, audit chaining, incident actions).

## What is never stored
Plaintext passwords, raw reset tokens, raw recovery codes, reusable session tokens (only
hashes), private signing keys, raw AES/HMAC/MFA keys, OTP values.

## Reset / backup
Delete `certiguard.db` (+ `-wal`/`-shm`) then `npm run migrate` to recreate an empty schema
(this removes all data). Back up the DB together with `backend/keys/`.
