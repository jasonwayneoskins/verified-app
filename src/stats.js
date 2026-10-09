// Stats engine: computed ONLY from graded picks. Pushes don't count
// as wins or losses in win% (industry standard). There is deliberately
// NO date-range filter here — the public record is always the full
// record, which is what makes cherry-picking impossible.
import { profitUnits } from './grade-engine.js';

export function computeStats(picks) {
  const graded = picks.filter((p) => p.result === 'win' || p.result === 'loss' || p.result === 'push');
  const wins = graded.filter((p) => p.result === 'win').length;
  const losses = graded.filter((p) => p.result === 'loss').length;
  const pushes = graded.filter((p) => p.result === 'push').length;
  const decided = wins + losses;

  let netUnits = 0;
  let risked = 0;
  for (const p of graded) {
    netUnits += profitUnits(p, p.result);
    risked += Number(p.units);
  }

  // Current streak from most recent graded pick (picks assumed newest-first).
  let streakType = null;
  let streakN = 0;
  for (const p of graded) {
    if (p.result === 'push') continue;
    if (streakType === null) {
      streakType = p.result;
      streakN = 1;
    } else if (p.result === streakType) {
      streakN++;
    } else break;
  }

  const bySport = {};
  for (const p of graded) {
    const s = (bySport[p.sport] = bySport[p.sport] || { n: 0, wins: 0, losses: 0, pushes: 0, netUnits: 0 });
    s.n++;
    if (p.result === 'win') s.wins++;
    else if (p.result === 'loss') s.losses++;
    else s.pushes++;
    s.netUnits += profitUnits(p, p.result);
  }
  for (const s of Object.values(bySport)) {
    const d = s.wins + s.losses;
    s.winPct = d ? (s.wins / d) * 100 : 0;
  }

  return {
    total: graded.length,
    wins,
    losses,
    pushes,
    winPct: decided ? (wins / decided) * 100 : 0,
    netUnits,
    risked,
    roiPct: risked ? (netUnits / risked) * 100 : 0,
    streak: streakType ? { type: streakType, n: streakN } : null,
    bySport,
  };
}

export const fmtPct = (n) => `${n.toFixed(1)}%`;
export const fmtUnits = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}u`;
