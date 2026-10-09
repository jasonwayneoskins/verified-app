// ESPN scoreboard client (free, no API key).
//   https://site.api.espn.com/apis/site/v2/sports/<league>/scoreboard
// MVP scope: NFL + NBA only.
const LEAGUES = {
  nfl: 'football/nfl',
  nba: 'basketball/nba',
};

const cache = new Map(); // key -> { at, data }
const CACHE_MS = 5 * 60 * 1000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  return null;
}
function cacheSet(key, data) {
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 200) cache.clear();
}

async function fetchScoreboard(sport, dateStr) {
  const key = `sb:${sport}:${dateStr}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const url = `https://site.api.espn.com/apis/site/v2/sports/${LEAGUES[sport]}/scoreboard?dates=${dateStr}&limit=100`;
  const res = await fetch(url, { headers: { 'User-Agent': 'verified-app/1.0' } });
  if (!res.ok) throw new Error(`ESPN scoreboard fetch failed: ${res.status}`);
  const data = await res.json();
  cacheSet(key, data);
  return data;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizeEvent(ev) {
  const comp = ev.competitions?.[0];
  const competitors = comp?.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  return {
    id: String(ev.id),
    sport: null, // filled by caller
    date: ev.date, // ISO start time
    state: ev.status?.type?.state, // 'pre' | 'in' | 'post'
    completed: !!ev.status?.type?.completed,
    homeAbbr: home?.team?.abbreviation || '?',
    awayAbbr: away?.team?.abbreviation || '?',
    homeScore: home?.score != null ? parseInt(home.score, 10) : null,
    awayScore: away?.score != null ? parseInt(away.score, 10) : null,
    shortName: ev.shortName || `${away?.team?.abbreviation} @ ${home?.team?.abbreviation}`,
  };
}

// Upcoming (not-started) games for the next `days` days, soonest first.
export async function getUpcomingGames(sport, days = 7) {
  if (!LEAGUES[sport]) throw new Error('unsupported sport');
  const out = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() + i * 86400000);
    let data;
    try {
      data = await fetchScoreboard(sport, fmtDate(d));
    } catch {
      continue; // one bad day shouldn't kill the list
    }
    for (const ev of data.events || []) {
      const g = normalizeEvent(ev);
      g.sport = sport;
      if (g.state === 'pre' && new Date(g.date).getTime() > Date.now()) out.push(g);
    }
  }
  out.sort((a, b) => new Date(a.date) - new Date(b.date));
  // de-dupe by id
  const seen = new Set();
  return out.filter((g) => (seen.has(g.id) ? false : (seen.add(g.id), true)));
}

// Find one game by ESPN id, searching the last `lookbackDays` days.
// Returns the normalized game or null.
export async function findGame(sport, gameId, lookbackDays = 14) {
  if (!LEAGUES[sport]) throw new Error('unsupported sport');
  const today = new Date();
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    let data;
    try {
      data = await fetchScoreboard(sport, fmtDate(d));
    } catch {
      continue;
    }
    for (const ev of data.events || []) {
      if (String(ev.id) === String(gameId)) {
        const g = normalizeEvent(ev);
        g.sport = sport;
        return g;
      }
    }
  }
  return null;
}

// Completed games (for the grader): scan recent days, return games
// with final scores, keyed by id.
export async function getRecentCompletedGames(sport, lookbackDays = 10) {
  if (!LEAGUES[sport]) throw new Error('unsupported sport');
  const out = new Map();
  const today = new Date();
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(today.getTime() - i * 86400000);
    let data;
    try {
      data = await fetchScoreboard(sport, fmtDate(d));
    } catch {
      continue;
    }
    for (const ev of data.events || []) {
      const g = normalizeEvent(ev);
      if (g.completed && g.homeScore != null && g.awayScore != null) {
        g.sport = sport;
        out.set(g.id, g);
      }
    }
  }
  return out;
}
