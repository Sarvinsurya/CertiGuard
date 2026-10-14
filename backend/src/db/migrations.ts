/**
 * Versioned migrations.
 *
 * Each migration has a numeric `version` and an `up` SQL string.
 * The migrator applies pending migrations in order and records them in
 * `schema_migrations`. Future phases MUST add new migration objects here
 * rather than editing existing ones, so existing data is never destroyed.
 */

export interface Migration {
  version: number;
  name: string;
  up: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: "phase1_initial_schema",
    up: `
      -- Issuers: authorized institutions. NEVER stores the private signing key.
      CREATE TABLE IF NOT EXISTS issuers (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        issuer_name    TEXT    NOT NULL,
        issuer_code    TEXT    NOT NULL UNIQUE,
        public_key     TEXT    NOT NULL,          -- PEM-encoded Ed25519 public key
        key_algorithm  TEXT    NOT NULL DEFAULT 'Ed25519',
        status         TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL
      );

      -- Certificates: registered certificate records.
      CREATE TABLE IF NOT EXISTS certificates (
        id                        INTEGER PRIMARY KEY AUTOINCREMENT,
        certificate_id            TEXT    NOT NULL UNIQUE,
        student_name              TEXT    NOT NULL,
        student_identifier        TEXT    NOT NULL,
        institution_name          TEXT    NOT NULL,
        qualification             TEXT    NOT NULL,
        graduation_year           INTEGER NOT NULL,
        issue_date                TEXT    NOT NULL,     -- ISO date (YYYY-MM-DD)
        document_hash             TEXT    NOT NULL,     -- SHA-256 hex of uploaded PDF bytes
        signature                 TEXT    NOT NULL,     -- base64 Ed25519 signature of canonical metadata
        signature_algorithm       TEXT    NOT NULL DEFAULT 'Ed25519',
        canonical_format_version  TEXT    NOT NULL DEFAULT '1.0',
        issuer_id                 INTEGER NOT NULL,
        file_reference            TEXT    NOT NULL,     -- stored filename (not a public path)
        status                    TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
        created_at                TEXT    NOT NULL,
        updated_at                TEXT    NOT NULL,
        revoked_at                TEXT,
        revocation_reason         TEXT,
        FOREIGN KEY (issuer_id) REFERENCES issuers(id)
      );

      CREATE INDEX IF NOT EXISTS idx_certificates_certificate_id ON certificates(certificate_id);
      CREATE INDEX IF NOT EXISTS idx_certificates_status         ON certificates(status);
      CREATE INDEX IF NOT EXISTS idx_certificates_student_name   ON certificates(student_name);

      -- Audit logs: lightweight event trail. Phase 4 will extend this.
      CREATE TABLE IF NOT EXISTS audit_logs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        correlation_id TEXT,
        action         TEXT NOT NULL,
        target         TEXT,
        outcome        TEXT NOT NULL,
        details        TEXT,                             -- JSON string
        created_at     TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    `,
  },
  {
    version: 2,
    name: "identity_security_operations",
    up: `
      -- Organizations: institutions (issuers) and companies (verifiers).
      CREATE TABLE IF NOT EXISTS organizations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        type        TEXT    NOT NULL CHECK (type IN ('institution','company','platform')),
        status      TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        issuer_id   INTEGER,                 -- link an institution org to an issuer, if applicable
        created_at  TEXT    NOT NULL,
        FOREIGN KEY (issuer_id) REFERENCES issuers(id)
      );

      -- Roles.
      CREATE TABLE IF NOT EXISTS roles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        description TEXT    NOT NULL
      );

      -- Permissions.
      CREATE TABLE IF NOT EXISTS permissions (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        permission_key TEXT NOT NULL UNIQUE,
        description    TEXT NOT NULL
      );

      -- Role <-> permission mapping.
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id       INTEGER NOT NULL,
        permission_id INTEGER NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY (role_id) REFERENCES roles(id),
        FOREIGN KEY (permission_id) REFERENCES permissions(id)
      );

      -- Users. Passwords are scrypt-hashed; MFA secrets live in user_mfa.
      CREATE TABLE IF NOT EXISTS users (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        email              TEXT    NOT NULL UNIQUE,
        password_hash      TEXT    NOT NULL,
        display_name       TEXT    NOT NULL,
        role_id            INTEGER NOT NULL,
        organization_id    INTEGER,
        student_identifier TEXT,                 -- links a student user to certificate records
        status             TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
        mfa_enabled        INTEGER NOT NULL DEFAULT 0,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until       TEXT,
        last_login_at      TEXT,
        created_at         TEXT    NOT NULL,
        updated_at         TEXT    NOT NULL,
        FOREIGN KEY (role_id) REFERENCES roles(id),
        FOREIGN KEY (organization_id) REFERENCES organizations(id)
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role_id);

      -- Dedicated MFA table (encrypted secret at rest).
      CREATE TABLE IF NOT EXISTS user_mfa (
        user_id          INTEGER PRIMARY KEY,
        secret_encrypted TEXT    NOT NULL,       -- AES-256-GCM payload JSON (MFA key)
        confirmed_at     TEXT,
        created_at       TEXT    NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Single-use hashed MFA recovery codes.
      CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        code_hash  TEXT    NOT NULL,
        used_at    TEXT,
        created_at TEXT    NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_recovery_user ON mfa_recovery_codes(user_id);

      -- Server-managed sessions. Only a hash of the random session id is stored.
      CREATE TABLE IF NOT EXISTS sessions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id          INTEGER NOT NULL,
        session_hash     TEXT    NOT NULL UNIQUE,
        mfa_pending      INTEGER NOT NULL DEFAULT 0,
        csrf_token       TEXT    NOT NULL,
        created_at       TEXT    NOT NULL,
        expires_at       TEXT    NOT NULL,
        last_activity_at TEXT    NOT NULL,
        revoked_at       TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(session_hash);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      -- Hashed, single-use, expiring password reset tokens.
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        token_hash TEXT    NOT NULL UNIQUE,
        used_at    TEXT,
        expires_at TEXT    NOT NULL,
        created_at TEXT    NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      -- Security events pipeline.
      CREATE TABLE IF NOT EXISTS security_events (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type      TEXT    NOT NULL,
        severity        TEXT    NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
        actor_id        INTEGER,
        actor_label     TEXT,                    -- pseudonymous actor label (never raw PII)
        organization_id INTEGER,
        source_ip       TEXT,
        resource_type   TEXT,
        resource_id     TEXT,
        detection_rule  TEXT,
        risk_contribution INTEGER NOT NULL DEFAULT 0,
        metadata_json   TEXT,
        resolution_status TEXT NOT NULL DEFAULT 'open' CHECK (resolution_status IN ('open','reviewed','resolved')),
        correlation_id  TEXT,
        created_at      TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sec_events_type     ON security_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_sec_events_severity ON security_events(severity);
      CREATE INDEX IF NOT EXISTS idx_sec_events_actor    ON security_events(actor_id);
      CREATE INDEX IF NOT EXISTS idx_sec_events_created  ON security_events(created_at);

      -- Risk assessments (per subject, e.g., an account).
      CREATE TABLE IF NOT EXISTS risk_assessments (
        id                       INTEGER PRIMARY KEY AUTOINCREMENT,
        subject_type             TEXT    NOT NULL,
        subject_id               TEXT    NOT NULL,
        score                    INTEGER NOT NULL,
        level                    TEXT    NOT NULL CHECK (level IN ('low','moderate','high','critical')),
        contributing_factors_json TEXT   NOT NULL,
        assessed_at              TEXT    NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_risk_subject ON risk_assessments(subject_type, subject_id);

      -- Incidents.
      CREATE TABLE IF NOT EXISTS incidents (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        title          TEXT    NOT NULL,
        description    TEXT    NOT NULL,
        severity       TEXT    NOT NULL CHECK (severity IN ('low','medium','high','critical')),
        status         TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','contained','resolved','false_positive')),
        risk_score     INTEGER NOT NULL DEFAULT 0,
        detection_rule TEXT,
        subject_type   TEXT,
        subject_id     TEXT,
        assigned_to    INTEGER,
        created_at     TEXT    NOT NULL,
        updated_at     TEXT    NOT NULL,
        resolved_at    TEXT,
        resolution_notes TEXT,
        FOREIGN KEY (assigned_to) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);

      -- Incident response actions (reversible/temporary).
      CREATE TABLE IF NOT EXISTS incident_actions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id      INTEGER NOT NULL,
        actor_id         INTEGER NOT NULL,
        action_type      TEXT    NOT NULL,
        target_type      TEXT,
        target_id        TEXT,
        reason           TEXT    NOT NULL,
        duration_seconds INTEGER,
        created_at       TEXT    NOT NULL,
        expires_at       TEXT,
        reversed_at      TEXT,
        FOREIGN KEY (incident_id) REFERENCES incidents(id),
        FOREIGN KEY (actor_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_incident_actions_incident ON incident_actions(incident_id);

      -- Configurable security policies (thresholds, etc.).
      CREATE TABLE IF NOT EXISTS security_policies (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        policy_key  TEXT    NOT NULL UNIQUE,
        value_json  TEXT    NOT NULL,
        description TEXT,
        updated_at  TEXT    NOT NULL
      );

      -- Account-level temporary restrictions applied by incident response.
      CREATE TABLE IF NOT EXISTS account_restrictions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL,
        restriction  TEXT    NOT NULL CHECK (restriction IN ('throttle','suspend','require_password_reset','require_mfa','flag_review')),
        reason       TEXT    NOT NULL,
        created_at   TEXT    NOT NULL,
        expires_at   TEXT,
        reversed_at  TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_restrictions_user ON account_restrictions(user_id);

      -- Extend audit_logs for tamper-evident hash chaining + richer attribution.
      ALTER TABLE audit_logs ADD COLUMN actor_id INTEGER;
      ALTER TABLE audit_logs ADD COLUMN actor_role TEXT;
      ALTER TABLE audit_logs ADD COLUMN resource_type TEXT;
      ALTER TABLE audit_logs ADD COLUMN source_ip TEXT;
      ALTER TABLE audit_logs ADD COLUMN prev_hash TEXT;
      ALTER TABLE audit_logs ADD COLUMN entry_hash TEXT;
      ALTER TABLE audit_logs ADD COLUMN chain_version TEXT;
    `,
  },
];
