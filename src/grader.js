// Grading job: finds ungraded picks whose games have started,
// pulls final scores from ESPN, grades them, and writes ONLY the
// grading columns (the DB triggers forbid anything else).
// Run via:  node scripts/grade.js
// Or HTTP:  GET /api/cron/grade?secret=<CRON_SECRET>  (cron-job.org etc.)
import { listUngradedPastGames, applyGrade } from './db/index.js';
import { findGame } from './espn.js';
import { gradePick } from './grade-engine.js';

export async function runGrader({ log = console } = {}) {
  const nowIso = new Date().toISOString();
  const pending = await listUngradedPastGames(nowIso);
  const summary = { checked: pending.length, graded: 0, skipped: 0, errors: [] };

  // Group by sport to batch ESPN lookups efficiently.
  const bySport = {};
  for (const p of pending) (bySport[p.sport] = bySport[p.sport] || []).push(p);

  for (const [sport, picks] of Object.entries(bySport)) {
    for (const pick of picks) {
      try {
        const game = await findGame(sport, pick.espn_game_id, 14);
        if (!game) {
          summary.skipped++;
          continue; // game not found in recent window (old pick or bad id)
        }
        if (!game.completed || game.homeScore == null || game.awayScore == null) {
          summary.skipped++;
          continue; // not final yet
        }
        const result = gradePick(pick, game);
        await applyGrade(pick.id, {
          result,
          graded_at: new Date().toISOString(),
          graded_score_home: game.homeScore,
          graded_score_away: game.awayScore,
        });
        summary.graded++;
        log.log?.(`graded ${pick.id.slice(0, 8)} ${pick.sport} ${pick.away_team}@${pick.home_team} -> ${result}`);
      } catch (err) {
        summary.errors.push({ pick: pick.id, error: String(err.message || err) });
      }
    }
  }
  return summary;
}
