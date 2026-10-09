// Creates the SQLite schema for local demo mode. (Production uses the
// Supabase migration in supabase/migrations/001_verified_init.sql.)
import { ensureSchema } from '../src/db/index.js';
import { config } from '../src/config.js';

if (config.useSupabase) {
  console.log('Supabase mode: apply supabase/migrations/001_verified_init.sql in the Supabase SQL editor instead.');
  process.exit(0);
}
await ensureSchema();
console.log('SQLite schema ready at', config.sqlitePath);
process.exit(0);
