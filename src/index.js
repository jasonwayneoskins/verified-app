// Verified — Phase 1 web MVP. Entry point.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { ensureSchema, query, getProfileByUsername, insertPick, listPicks, getLastHashSafe, countGraded, addToWaitlist } from './db/index.js';
import { attachUser, requireAuth, setSession, clearSession, supabaseSignUp, supabaseSignIn } from './auth.js';
import { getUpcomingGames } from './espn.js';
import { chainHash, verifyChain, GENESIS_HASH } from './hashchain.js';
import { computeStats } from './stats.js';
import { badgeSvg } from './badge.js';
import { runGrader } from './grader.js';
import { landingPage, loginPage, signupPage } from './views.js';
import { dashboardPage, publicProfilePage, errorPage } from './views2.js';

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
// Tiny cookie parser (no dependency).
app.use((req, _res, next) => {
  req.cookies = {};
  const h = req.headers.cookie;
  if (h) for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  next();
});
app.use(attachUser);

const escUser = (u) => u; // usernames validated at signup

// ---------------- public pages ----------------
app.get('/', (req, res) => {
  res.send(landingPage(req.user, req.query.waitlist === 'done'));
});

app.post('/waitlist', async (req, res) => {
  const email = String(req.body.email || '').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) await addToWaitlist(email);
  res.redirect('/?waitlist=done');
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.send(loginPage({ demoMode: !config.useSupabase, error: req.query.error }));
});

app.get('/signup', (req, res) => {
  if (!config.useSupabase) return res.redirect('/login'); // demo mode has no signup
  if (req.user) return res.redirect('/dashboard');
  res.send(signupPage({ error: req.query.error }));
});

app.get('/logout', (req, res) => {
  clearSession(res);
  res.redirect('/');
});

// ---------------- auth api ----------------
app.post('/api/auth/demo', async (req, res) => {
  if (config.useSupabase) return res.redirect('/login');
  const demo = await getProfileByUsername('demo');
  if (!demo) return res.status(500).send('Demo not seeded. Run: npm run seed');
  setSession(res, demo.id);
  res.redirect('/dashboard');
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const username = String(req.body.username || '').toLowerCase().trim();
    const display_name = String(req.body.display_name || '').trim();
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('Username must be 3–24 chars: letters, numbers, underscore.');
    if (await getProfileByUsername(username)) throw new Error('Username taken.');
    const userId = await supabaseSignUp({ email, password, username, displayName: display_name });
    setSession(res, userId);
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect('/signup?error=' + encodeURIComponent(err.message));
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const userId = await supabaseSignIn({
      email: String(req.body.email || '').trim(),
      password: String(req.body.password || ''),
    });
    setSession(res, userId);
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect('/login?error=' + encodeURIComponent(err.message));
  }
});

// ---------------- dashboard ----------------
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const picks = await listPicks(req.user.id);
    const stats = computeStats(picks);
    const chain = verifyChain([...picks].reverse());
    const gradedCount = stats.total;
    res.send(dashboardPage({
      user: req.user, stats, picks, chain, gradedCount,
      minGraded: config.minGradedForBadge, baseUrl: config.publicBaseUrl,
    }));
  } catch (err) {
    res.status(500).send(errorPage(req.user, err.message));
  }
});

// ---------------- games api (for the pick form) ----------------
app.get('/api/games', requireAuth, async (req, res) => {
  try {
    const sport = req.query.sport === 'nba' ? 'nba' : 'nfl';
    const games = await getUpcomingGames(sport, 7);
    res.json(games.map((g) => ({ id: g.id, date: g.date, homeAbbr: g.homeAbbr, awayAbbr: g.awayAbbr, shortName: g.shortName })));
  } catch (err) {
    res.status(502).json({ error: 'ESPN unavailable: ' + err.message });
  }
});

// ---------------- log a pick (the anti-fraud chokepoint) ----------------
app.post('/api/picks', requireAuth, async (req, res) => {
  try {
    const sport = req.body.sport === 'nba' ? 'nba' : 'nfl';
    const gameId = String(req.body.game || '').trim();
    const market = String(req.body.market || '').trim();
    const side = String(req.body.side || '').trim().toUpperCase();
    const lineRaw = String(req.body.line ?? '').trim();
    const odds = parseInt(req.body.odds, 10);
    const units = parseFloat(req.body.units);
    const note = String(req.body.note || '').trim().slice(0, 120) || null;

    if (!['spread', 'moneyline', 'total'].includes(market)) throw new Error('Invalid market.');
    if (!gameId) throw new Error('Pick a game.');
    if (!Number.isFinite(odds) || Math.abs(odds) < 100 || Math.abs(odds) > 10000) throw new Error('Odds look wrong.');
    if (!Number.isFinite(units) || units < 0.5 || units > 5) throw new Error('Stake must be 0.5–5 units.');

    // Re-fetch the game server-side — never trust the client's game data.
    const games = await getUpcomingGames(sport, 7);
    const game = games.find((g) => g.id === gameId);
    if (!game) throw new Error('Game not found or already started. Picks must be logged before kickoff.');
    const gameStart = new Date(game.date);
    if (!(gameStart.getTime() > Date.now())) throw new Error('That game has already started — late picks are rejected.');

    let line = null;
    if (market === 'spread' || market === 'total') {
      if (lineRaw === '') throw new Error('A line is required for spread/total picks.');
      line = parseFloat(lineRaw);
      if (!Number.isFinite(line) || Math.abs(line) > 80) throw new Error('Line looks wrong.');
    }
    if (market === 'total') {
      if (side !== 'OVER' && side !== 'UNDER') throw new Error("For totals, side must be 'over' or 'under'.");
    } else {
      if (side !== game.homeAbbr.toUpperCase() && side !== game.awayAbbr.toUpperCase()) {
        throw new Error(`Side must be ${game.awayAbbr} or ${game.homeAbbr} for this game.`);
      }
    }

    const nowIso = new Date().toISOString();
    const prevHash = (await getLastHashSafe(req.user.id)) || GENESIS_HASH;
    const pick = {
      id: randomUUID(),
      user_id: req.user.id,
      sport,
      espn_game_id: game.id,
      game_start: gameStart.toISOString(),
      home_team: game.homeAbbr,
      away_team: game.awayAbbr,
      market,
      side: market === 'total' ? side.toLowerCase() : side,
      line,
      odds,
      units,
      note,
      created_at: nowIso,
      prev_hash: prevHash,
    };
    pick.hash = chainHash(prevHash, pick);
    await insertPick(pick);
    res.redirect('/dashboard');
  } catch (err) {
    res.status(400).send(errorPage(req.user, 'Pick rejected: ' + err.message));
  }
});

// ---------------- public verified profile ----------------
app.get('/v/:username', async (req, res) => {
  try {
    const profile = await getProfileByUsername(req.params.username);
    if (!profile) return res.status(404).send(errorPage(req.user, 'No verified record for @' + req.params.username));
    const picks = await listPicks(profile.id, { limit: 1000 });
    const stats = computeStats(picks);
    const chain = verifyChain([...picks].reverse());
    res.send(publicProfilePage({
      profile, stats, picks, chain,
      gradedCount: stats.total, minGraded: config.minGradedForBadge, baseUrl: config.publicBaseUrl,
    }));
  } catch (err) {
    res.status(500).send(errorPage(req.user, err.message));
  }
});

// ---------------- embeddable badge ----------------
app.get('/badge/:username.svg', async (req, res) => {
  try {
    const username = req.params.username.replace(/\.svg$/, '');
    const profile = await getProfileByUsername(username);
    res.type('image/svg+xml');
    res.set('Cache-Control', 'public, max-age=300');
    if (!profile) {
      return res.send(badgeSvg({ username, graded: 0, winPct: 0, total: 0 }));
    }
    const picks = await listPicks(profile.id, { limit: 5000 });
    const stats = computeStats(picks);
    res.send(badgeSvg({ username: profile.username, graded: stats.total, winPct: stats.winPct, total: stats.total }));
  } catch {
    res.status(500).type('image/svg+xml').send(badgeSvg({ username: 'error', graded: 0, winPct: 0, total: 0 }));
  }
});

// ---------------- grading cron ----------------
app.get('/api/cron/grade', async (req, res) => {
  if (req.query.secret !== config.cronSecret) return res.status(401).json({ error: 'unauthorized' });
  try {
    await ensureSchema();
    const summary = await runGrader({});
    res.json({ ok: true, summary });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------- boot ----------------
await ensureSchema();
if (config.useSupabase) {
  console.log('Mode: PRODUCTION (Supabase Postgres + Supabase Auth)');
} else {
  console.log('Mode: DEMO (local SQLite). Run `npm run seed` for the demo seller.');
}
app.listen(config.port, () => {
  console.log(`${config.appName} listening on :${config.port} -> ${config.publicBaseUrl}`);
});
