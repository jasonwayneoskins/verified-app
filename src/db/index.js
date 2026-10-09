// Data-access layer. Picks the driver (pg vs sqlite) and exposes
// domain functions used by routes, grader, and seed script.
import { config } from '../config.js';
import * as pgDriver from './pg.js';
import * as sqliteDriver from './sqlite.js';
import { SQLITE_DDL } from './sqlite-ddl.js';

const driver = config.useSupabase ? pgDriver : sqliteDriver;
export const query = driver.query;
export const close = driver.close;

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  if (!config.useSupabase) {
    const { getDb } = sqliteDriver;
    getDb().exec(SQLITE_DDL);
    // Backfill gating columns on demo DBs created before 002_whop_gating.
    for (const col of ['whop_email text', 'whop_status text', 'whop_verified_at text']) {
      try {
        getDb().exec(`alter table profiles add column ${col}`);
      } catch {
        /* column already exists */
      }
    }
  }
  // Production: schema comes from supabase/migrations/001_verified_init.sql
  // applied by Jason in the Supabase SQL editor. Nothing to do here.
  schemaReady = true;
}

// ---------- profiles ----------
export async function getProfileByUsername(username) {
  const { rows } = await query(
    'select * from profiles where lower(username) = lower(?) limit 1',
    [username]
  );
  return rows[0] || null;
}

export async function getProfileById(id) {
  const { rows } = await query('select * from profiles where id = ? limit 1', [id]);
  return rows[0] || null;
}

export async function createProfile({ id, username, display_name }) {
  const created_at = new Date().toISOString();
  await query(
    'insert into profiles (id, username, display_name, created_at) values (?,?,?,?)',
    [id, username.toLowerCase(), display_name || null, created_at]
  );
  return getProfileById(id);
}

// ---------- whop subscription gating ----------
// Link the email the seller used at Whop checkout; clears the cache so the
// next check re-verifies live.
export async function setWhopEmail(user_id, email) {
  await query(
    'update profiles set whop_email = ?, whop_status = null, whop_verified_at = null where id = ?',
    [email.toLowerCase(), user_id]
  );
}

// Cache a live Whop check: status is 'active' | 'inactive'.
export async function updateWhopCache(user_id, status) {
  const verified_at = new Date().toISOString();
  await query(
    'update profiles set whop_status = ?, whop_verified_at = ? where id = ?',
    [status, verified_at, user_id]
  );
}

// ---------- picks ----------
// Portable last-hash (no rowid): order by created_at desc, id desc.
export async function getLastHashSafe(user_id) {
  const { rows } = await query(
    'select hash from picks where user_id = ? order by created_at desc, id desc limit 1',
    [user_id]
  );
  return rows[0]?.hash || null;
}

export async function insertPick(pick) {
  const cols = Object.keys(pick);
  const placeholders = cols.map(() => '?').join(',');
  await query(`insert into picks (${cols.join(',')}) values (${placeholders})`, cols.map((c) => pick[c]));
  const { rows } = await query('select * from picks where id = ? limit 1', [pick.id]);
  return rows[0];
}

export async function listPicks(user_id, { limit = 500 } = {}) {
  const { rows } = await query(
    'select * from picks where user_id = ? order by created_at desc, id desc limit ?',
    [user_id, limit]
  );
  return rows;
}

export async function listUngradedPastGames(nowIso) {
  const { rows } = await query(
    "select * from picks where result is null and game_start <= ? order by game_start asc limit 500",
    [nowIso]
  );
  return rows;
}

// Grader-only mutation. The DB triggers reject any change to
// non-grading columns, so this cannot be abused to rewrite history.
export async function applyGrade(pickId, { result, graded_at, graded_score_home, graded_score_away }) {
  await query(
    'update picks set result = ?, graded_at = ?, graded_score_home = ?, graded_score_away = ? where id = ?',
    [result, graded_at, graded_score_home, graded_score_away, pickId]
  );
}

export async function countGraded(user_id) {
  const { rows } = await query(
    'select count(*) as n from picks where user_id = ? and result is not null',
    [user_id]
  );
  return Number(rows[0].n);
}

// ---------- waitlist ----------
export async function addToWaitlist(email) {
  const id = (await import('node:crypto')).randomUUID();
  const created_at = new Date().toISOString();
  try {
    await query('insert into waitlist (id, email, created_at) values (?,?,?)', [id, email.toLowerCase(), created_at]);
    return true;
  } catch {
    return false; // duplicate or invalid
  }
}
