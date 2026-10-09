// SQLite DDL for local demo mode. Mirrors supabase/migrations/001_verified_init.sql.
// Immutability is enforced with triggers here too (SQLite has no RLS,
// so the app layer also refuses pick mutations — defense in depth).
export const SQLITE_DDL = `
create table if not exists profiles (
  id text primary key,
  username text not null,
  display_name text,
  created_at text not null,
  whop_email text,
  whop_status text,
  whop_verified_at text
);
create unique index if not exists profiles_username_lower_uidx on profiles (lower(username));

create table if not exists picks (
  id text primary key,
  user_id text not null references profiles(id) on delete cascade,
  sport text not null,
  espn_game_id text not null,
  game_start text not null,
  home_team text not null,
  away_team text not null,
  market text not null,
  side text not null,
  line real,
  odds integer not null default -110,
  units real not null,
  note text,
  created_at text not null,
  prev_hash text not null,
  hash text not null,
  result text,
  graded_at text,
  graded_score_home integer,
  graded_score_away integer
);
create index if not exists picks_user_created_idx on picks (user_id, created_at desc);
create index if not exists picks_user_ungraded_idx on picks (user_id) where result is null;

create table if not exists waitlist (
  id text primary key,
  email text not null,
  created_at text not null
);
create unique index if not exists waitlist_email_lower_uidx on waitlist (lower(email));

-- No UPDATE of non-grading columns, ever.
drop trigger if exists trg_no_pick_update;
create trigger trg_no_pick_update
before update on picks
for each row
begin
  select case
    when old.id != new.id
      or old.user_id != new.user_id
      or old.sport != new.sport
      or old.espn_game_id != new.espn_game_id
      or old.game_start != new.game_start
      or old.home_team != new.home_team
      or old.away_team != new.away_team
      or old.market != new.market
      or old.side != new.side
      or ifnull(old.line, 1e18) != ifnull(new.line, 1e18)
      or old.odds != new.odds
      or old.units != new.units
      or ifnull(old.note, '') != ifnull(new.note, '')
      or old.created_at != new.created_at
      or old.prev_hash != new.prev_hash
      or old.hash != new.hash
    then raise(abort, 'VERIFIED: picks are immutable')
  end;
end;

-- No DELETE, ever.
drop trigger if exists trg_no_pick_delete;
create trigger trg_no_pick_delete
before delete on picks
for each row
begin
  select raise(abort, 'VERIFIED: picks can never be deleted');
end;
`;
