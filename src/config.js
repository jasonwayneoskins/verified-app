// Central config. Secrets come from env vars only — never hardcoded.
const bool = (v) => v === '1' || v === 'true';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-insecure-secret',
  cronSecret: process.env.CRON_SECRET || 'dev-only-insecure-cron',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  appName: process.env.APP_NAME || 'Verified',
  // Production mode = Supabase vars present. Otherwise local demo mode (SQLite).
  useSupabase: !!(process.env.SUPABASE_URL) && !!process.env.DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  sqlitePath: process.env.SQLITE_PATH || './data/verified-demo.db',
  // Trust rules
  minGradedForBadge: 100,
};
