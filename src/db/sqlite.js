// SQLite driver (local demo mode). Uses node's built-in node:sqlite.
// Same uniform interface: query(sql, params) -> { rows }.
// SQLite uses ? placeholders natively.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const dir = path.dirname(config.sqlitePath);
fs.mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(config.sqlitePath);

export async function query(sql, params = []) {
  const stmt = db.prepare(sql);
  const trimmed = sql.trim().toUpperCase();
  if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
    return { rows: stmt.all(...params) };
  }
  const info = stmt.run(...params);
  return { rows: [], info };
}

export function getDb() {
  return db;
}

export async function close() {
  db.close();
}
