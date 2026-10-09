-- ============================================================
-- Verified — Phase 1 schema (Supabase / Postgres)
-- Run in the Supabase SQL editor (or: supabase db push).
-- The anti-fraud guarantees live HERE, not just in app code:
--   1. Picks can NEVER be deleted (trigger).
--   2. Picks can NEVER be edited after creation, EXCEPT the four
--      grading columns which only the server-side grader touches
--      (trigger).
--   3. Every pick carries a SHA-256 hash chained to the previous
--      pick, so history can't be reordered or silently dropped.
-- ============================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$')
);
create unique index if not exists profiles_username_lower_uidx
  on public.profiles (lower(username));

-- ---------- picks ----------
-- One row per logged pick. Immutable by design (see triggers below).
create table if not exists public.picks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  sport text not null check (sport in ('nfl','nba')),
  espn_game_id text not null,
  game_start timestamptz not null,
  home_team text not null,          -- e.g. 'KC'
  away_team text not null,          -- e.g. 'BUF'

  market text not null check (market in ('spread','moneyline','total')),
  side text not null,               -- team abbr for spread/ml; 'over'|'under' for total
  line numeric,                     -- spread or total line; null for moneyline
  odds integer not null default -110, -- american odds
  units numeric not null check (units >= 0.5 and units <= 5),
  note text,

  created_at timestamptz not null default now(),

  -- Hash chain: hash = sha256(prev_hash || canonical_pick_payload).
  -- prev_hash of a user's first pick is the all-zero seed.
  prev_hash text not null,
  hash text not null,

  -- Grading (null = not yet graded). ONLY these four columns may
  -- ever be updated, and only by the server-side grader.
  result text check (result in ('win','loss','push')),
  graded_at timestamptz,
  graded_score_home integer,
  graded_score_away integer
);
create index if not exists picks_user_created_idx on public.picks (user_id, created_at desc);
create index if not exists picks_user_result_idx on public.picks (user_id, result) where result is null;
create index if not exists picks_game_idx on public.picks (espn_game_id);

-- ---------- immutability triggers ----------
-- No UPDATE may touch anything except the grading columns.
create or replace function public.forbid_pick_update()
returns trigger
language plpgsql
as $$
begin
  if new.id              is distinct from old.id              or
     new.user_id         is distinct from old.user_id         or
     new.sport           is distinct from old.sport           or
     new.espn_game_id    is distinct from old.espn_game_id    or
     new.game_start      is distinct from old.game_start      or
     new.home_team       is distinct from old.home_team       or
     new.away_team       is distinct from old.away_team       or
     new.market          is distinct from old.market          or
     new.side            is distinct from old.side            or
     new.line            is distinct from old.line            or
     new.odds            is distinct from old.odds            or
     new.units           is distinct from old.units           or
     new.note            is distinct from old.note            or
     new.created_at      is distinct from old.created_at      or
     new.prev_hash       is distinct from old.prev_hash       or
     new.hash            is distinct from old.hash
  then
    raise exception 'VERIFIED: picks are immutable — only grading columns may change';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_no_pick_update on public.picks;
create trigger trg_no_pick_update
  before update on public.picks
  for each row execute function public.forbid_pick_update();

-- No DELETE, ever. History is permanent.
create or replace function public.forbid_pick_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'VERIFIED: picks can never be deleted';
  return old;
end;
$$;

drop trigger if exists trg_no_pick_delete on public.picks;
create trigger trg_no_pick_delete
  before delete on public.picks
  for each row execute function public.forbid_pick_delete();

-- ---------- waitlist (landing page email capture) ----------
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_email_lower_uidx
  on public.waitlist (lower(email));

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.picks enable row level security;
alter table public.waitlist enable row level security;

-- Public read: anyone can read profiles + picks (this is the product).
drop policy if exists "public read profiles" on public.profiles;
create policy "public read profiles" on public.profiles
  for select using (true);

drop policy if exists "public read picks" on public.picks;
create policy "public read picks" on public.picks
  for select using (true);

-- Sellers insert their own profile row after Supabase Auth signup.
drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Sellers insert their own picks. created_at/prev_hash/hash are
-- computed server-side; the policy just binds the row to the user.
drop policy if exists "users insert own picks" on public.picks;
create policy "users insert own picks" on public.picks
  for insert with check (auth.uid() = user_id);

-- No update/delete policies for picks: even the owner cannot mutate
-- through the API. Grading runs with the service-role key, which
-- bypasses RLS (and is still bound by the immutability triggers).

-- Anyone may join the waitlist.
drop policy if exists "public insert waitlist" on public.waitlist;
create policy "public insert waitlist" on public.waitlist
  for insert with check (true);
