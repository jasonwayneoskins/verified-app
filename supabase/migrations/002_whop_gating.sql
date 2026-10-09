-- ============================================================
-- Verified — 002: Whop subscription gating.
-- Run in the Supabase SQL editor AFTER 001_verified_init.sql.
--
-- Adds the purchase-email link + verification cache to profiles.
-- The app talks to Postgres with the DATABASE_URL (service role),
-- which bypasses RLS, so no new policies are needed for the
-- server-side cache writes. Existing policies are untouched.
-- ============================================================

alter table public.profiles
  add column if not exists whop_email text;

-- Last known check result: 'active' | 'inactive' | null (never checked).
alter table public.profiles
  add column if not exists whop_status text;

-- When the last live Whop check ran. Cache is valid for
-- WHOP_CACHE_HOURS (default 6) after this timestamp.
alter table public.profiles
  add column if not exists whop_verified_at timestamptz;
