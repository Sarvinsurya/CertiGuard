import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config/index.js";

let db: Database.Database | null = null;

/**
 * Returns a singleton better-sqlite3 connection.
 * The database file persists on disk so data survives restarts.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = config.paths.database;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

/**
 * Close the connection (used in tests / graceful shutdown).
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
