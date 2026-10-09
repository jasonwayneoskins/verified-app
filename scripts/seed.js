// Seeds the local demo DB with a demo seller + 120 realistic,
// pre-graded NFL/NBA picks with a VALID hash chain.
// Every pick is graded with the same engine the live grader uses,
// so the demo data is fully self-consistent.
// Usage: node scripts/seed.js   (demo/SQLite mode only)
import { randomUUID } from 'node:crypto';
import { ensureSchema, query, createProfile, insertPick, getProfileByUsername } from '../src/db/index.js';
import { getDb } from '../src/db/sqlite.js';
import { SQLITE_DDL } from '../src/db/sqlite-ddl.js';
import { config } from '../src/config.js';
import { chainHash, verifyChain, GENESIS_HASH } from '../src/hashchain.js';
import { gradePick } from '../src/grade-engine.js';

// Seeded RNG for reproducible demo data.
let s = 1337;
const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7;

const NFL = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LAC','LAR','LV','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SEA','SF','TB','TEN','WSH'];
const NBA = ['ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW','HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NYK','OKC','ORL','PHI','PHX','POR','SAC','SAS','TOR','UTA','WSH'];

const NOTES = ['divisional spot', 'rest advantage', 'home dog system', 'line moved 1.5', 'revenge game', 'back-to-back fade', 'sharp steam', 'weather edge', 'pace matchup', ''];

function makeGame(sport, i) {
  const teams = sport === 'nfl' ? NFL : NBA;
  const away = pick(teams);
  let home = pick(teams);
  while (home === away) home = pick(teams);
  // Random date between 2025-09-01 and 2026-10-08.
  const start = new Date('2025-09-01T00:00:00Z').getTime();
  const end = new Date('2026-10-08T00:00:00Z').getTime();
  const t = new Date(start + rnd() * (end - start));
  const hour = sport === 'nfl' ? pick([13, 16, 20]) : pick([19, 20, 21]);
  t.setUTCHours(hour, ri(0, 30), 0, 0);
  const hs = sport === 'nfl' ? ri(10, 38) : ri(98, 128);
  const as = sport === 'nfl' ? ri(10, 34) : ri(95, 125);
  return { id: `seed-${sport}-${i}`, home, away, start: t, hs, as };
}

function buildPick(game, sport, i) {
  const r = rnd();
  const market = r < 0.45 ? 'spread' : r < 0.8 ? 'total' : 'moneyline';
  const sideIsHome = rnd() < 0.5;
  const sideTeam = sideIsHome ? game.home : game.away;
  const sideScore = sideIsHome ? game.hs : game.as;
  const oppScore = sideIsHome ? game.as : game.hs;

  let side, line = null, odds;
  if (market === 'spread') {
    side = sideTeam;
    const margin = sideScore - oppScore;
    line = Math.round((-margin + gauss() * 2.2) * 2) / 2; // near the true margin
    if (line === 0) line = -0.5;
    odds = -110;
  } else if (market === 'total') {
    const total = game.hs + game.as;
    side = rnd() < 0.5 ? 'over' : 'under';
    line = Math.round((total + gauss() * 3) * 2) / 2;
    odds = -110;
  } else {
    side = sideScore >= oppScore ? sideTeam : (sideIsHome ? game.away : game.home);
    const fav = sideScore >= oppScore;
    odds = fav ? -ri(130, 220) : ri(110, 190);
    odds = Math.round(odds / 5) * 5;
  }

  const units = pick([1, 1, 1, 1, 2, 2, 2, 3, 3, 4]);
  // Logged 3–40 hours before kickoff.
  const created = new Date(game.start.getTime() - ri(3, 40) * 3600000);
  return {
    sport, espn_game_id: game.id,
    game_start: game.start.toISOString(),
    home_team: game.home, away_team: game.away,
    market, side, line, odds, units,
    note: pick(NOTES) || null,
    created_at: created.toISOString(),
    _scores: { hs: game.hs, as: game.as },
  };
}

async function main() {
  if (config.useSupabase) {
    console.error('Seed is for demo (SQLite) mode only. Refusing to seed production.');
    process.exit(1);
  }
  await ensureSchema();

  let profile = await getProfileByUsername('demo');
  if (!profile) {
    profile = await createProfile({ id: 'demo-user-0001', username: 'demo', display_name: 'Demo Capper' });
    console.log('Created demo seller @demo');
  } else {
    // Immutability triggers forbid DELETE — drop them, reseed, restore.
    getDb().exec('drop trigger if exists trg_no_pick_delete; drop trigger if exists trg_no_pick_update;');
    await query('delete from picks where user_id = ?', [profile.id]);
    getDb().exec(SQLITE_DDL);
    console.log('Cleared existing demo picks.');
  }

  // Build 120 picks, grade each with the real engine, nudge win rate to ~55%.
  const raw = [];
  for (let i = 0; i < 120; i++) {
    const sport = i % 2 === 0 ? 'nfl' : 'nba';
    const game = makeGame(sport, i);
    const p = buildPick(game, sport, i);
    p.result = gradePick(p, { homeAbbr: game.home, awayAbbr: game.away, homeScore: game.hs, awayScore: game.as });
    raw.push(p);
  }
  const winRate = () => {
    const d = raw.filter((p) => p.result !== 'push');
    return d.filter((p) => p.result === 'win').length / d.length;
  };
  // Nudge lines toward a realistic ~55% win rate (stays plausible).
  const nudgeOne = (toWin) => {
    const pool = raw.filter((x) => x.line != null && (toWin ? x.result === 'loss' : x.result === 'win'));
    const p = pick(pool);
    if (!p) return false;
    const nudge = p.market === 'total' ? 1.5 : 1.0;
    const dir = toWin ? 1 : -1;
    if (p.market === 'spread') p.line = Math.round((p.line + dir * (p.line < 0 ? nudge : -nudge)) * 2) / 2;
    else p.line = Math.round((p.line + dir * (p.side === 'over' ? nudge : -nudge)) * 2) / 2;
    p.result = gradePick(p, { homeAbbr: p.home_team, awayAbbr: p.away_team, homeScore: p._scores.hs, awayScore: p._scores.as });
    return true;
  };
  let guard = 0;
  while (winRate() < 0.55 && guard++ < 600) if (!nudgeOne(true)) break;
  guard = 0;
  while (winRate() > 0.58 && guard++ < 600) if (!nudgeOne(false)) break;

  // Chronological order -> hash chain -> insert.
  raw.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let prev = GENESIS_HASH;
  let n = 0;
  for (const p of raw) {
    const { _scores, result, ...rest } = p;
    const pickRow = {
      id: randomUUID(), user_id: profile.id, ...rest,
      prev_hash: prev,
      result,
      graded_at: new Date(new Date(p.game_start).getTime() + 4 * 3600000).toISOString(),
      graded_score_home: _scores.hs, graded_score_away: _scores.as,
    };
    pickRow.hash = chainHash(prev, pickRow);
    prev = pickRow.hash;
    await insertPick(pickRow);
    n++;
  }

  // Verify the chain we just wrote.
  const { rows } = await query('select * from picks where user_id = ? order by created_at asc, id asc', [profile.id]);
  const check = verifyChain(rows);
  const wr = winRate();
  console.log(`Seeded ${n} picks for @demo. Chain valid: ${check.ok}. Win rate: ${(wr * 100).toFixed(1)}%`);
  if (!check.ok) { console.error('CHAIN BROKEN', check); process.exit(1); }
}

await main();
process.exit(0);
