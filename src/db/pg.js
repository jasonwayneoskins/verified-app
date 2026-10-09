// Postgres driver (production / Supabase mode).
// Uses the Supabase Postgres connection string via the `pg` driver.
// Uniform interface: query(sql, params) -> { rows }
import pg from 'pg';
import { config } from '../config.js';

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

// pg uses $1 placeholders; our shared SQL is written with ? placeholders.
// Convert ? -> $n for pg.
export async function query(sql, params = []) {
  let i = 0;
  const pgSql = sql.replace(/\?/g, () => `$${++i}`);
  const res = await pool.query(pgSql, params);
  return { rows: res.rows };
}

export async function close() {
  await pool.end();
}
