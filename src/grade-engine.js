// Grading engine: turns a pick + final score into win/loss/push,
// and computes unit profit. Pure functions — easy to test, no I/O.
export function americanProfitPerUnit(odds) {
  if (odds > 0) return odds / 100;
  return 100 / Math.abs(odds); // e.g. -110 -> 0.909...
}

export function profitUnits(pick, result) {
  const units = Number(pick.units);
  if (result === 'push' || !result) return 0;
  if (result === 'win') return units * americanProfitPerUnit(Number(pick.odds));
  return -units; // loss
}

// pick: { market, side, line, home_team, away_team }
// game: { homeAbbr, awayAbbr, homeScore, awayScore } (final)
export function gradePick(pick, game) {
  const hs = Number(game.homeScore);
  const as = Number(game.awayScore);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) {
    throw new Error('game has no final score');
  }
  const sideIsHome = String(pick.side).toUpperCase() === String(pick.home_team).toUpperCase();
  const sideIsAway = String(pick.side).toUpperCase() === String(pick.away_team).toUpperCase();

  if (pick.market === 'moneyline') {
    if (!sideIsHome && !sideIsAway) throw new Error('moneyline side must be a team in the game');
    if (hs === as) return 'push';
    const sideWon = (sideIsHome && hs > as) || (sideIsAway && as > hs);
    return sideWon ? 'win' : 'loss';
  }

  if (pick.market === 'spread') {
    if (!sideIsHome && !sideIsAway) throw new Error('spread side must be a team in the game');
    const line = Number(pick.line);
    if (!Number.isFinite(line)) throw new Error('spread requires a line');
    const margin = sideIsHome ? hs - as : as - hs; // from the picked side's perspective
    const diff = margin + line; // line is negative for favorites, e.g. -3.5
    if (diff > 0) return 'win';
    if (diff < 0) return 'loss';
    return 'push';
  }

  if (pick.market === 'total') {
    const line = Number(pick.line);
    if (!Number.isFinite(line)) throw new Error('total requires a line');
    const total = hs + as;
    const s = String(pick.side).toLowerCase();
    if (s !== 'over' && s !== 'under') throw new Error("total side must be 'over' or 'under'");
    if (total === line) return 'push';
    const overHit = total > line;
    return (s === 'over') === overHit ? 'win' : 'loss';
  }

  throw new Error(`unknown market: ${pick.market}`);
}
