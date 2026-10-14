import { getDb } from "./connection.js";
import { migrations } from "./migrations.js";

/**
 * Applies all pending migrations in version order.
 * Idempotent: already-applied versions are skipped. Existing data is preserved.
 * Returns the current (latest applied) schema version.
 */
export function runMigrations(): number {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db
    .prepare("SELECT version FROM schema_migrations")
    .all() as { version: number }[];
  const applied = new Set(appliedRows.map((r) => r.version));

  const ordered = [...migrations].sort((a, b) => a.version - b.version);

  const insertMigration = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
  );

  for (const migration of ordered) {
    if (applied.has(migration.version)) continue;

    const apply = db.transaction(() => {
      db.exec(migration.up);
      insertMigration.run(migration.version, migration.name, new Date().toISOString());
    });
    apply();
  }

  const latest = db
    .prepare("SELECT MAX(version) AS v FROM schema_migrations")
    .get() as { v: number | null };
  return latest.v ?? 0;
}

export function getSchemaVersion(): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    )
    .get();
  if (!row) return 0;
  const latest = db
    .prepare("SELECT MAX(version) AS v FROM schema_migrations")
    .get() as { v: number | null };
  return latest.v ?? 0;
}
