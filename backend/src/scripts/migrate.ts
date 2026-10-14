import { runMigrations } from "../db/migrator.js";

const version = runMigrations();
// eslint-disable-next-line no-console
console.log(`[CertiGuard] Migrations applied. Current schema version: ${version}.`);
