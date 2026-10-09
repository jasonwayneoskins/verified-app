
// ---- appended: dashboard + public profile views ----
import { layout, esc } from './views.js';
import { config } from './config.js';
import { fmtPct, fmtUnits } from './stats.js';

function statCards(stats) {
  const net = stats.netUnits;
  const netCls = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
  const streak = stats.streak ? `${stats.streak.n}${stats.streak.type === 'win' ? 'W' : 'L'} streak` : '—';
  return `<div class="grid">
<div class="stat"><div class="v">${stats.total}</div><div class="l">Graded picks</div></div>
<div class="stat"><div class="v">${fmtPct(stats.winPct)}</div><div class="l">Win rate</div></div>
<div class="stat"><div class="v ${netCls}">${fmtUnits(net)}</div><div class="l">Net units</div></div>
<div class="stat"><div class="v ${stats.roiPct >= 0 ? 'pos' : 'neg'}">${fmtPct(stats.roiPct)}</div><div class="l">ROI</div></div>
<div class="stat"><div class="v">${stats.wins}W · ${stats.losses}L · ${stats.pushes}P</div><div class="l">Record</div></div>
<div class="stat"><div class="v">${esc(streak)}</div><div class="l">Streak</div></div>
</div>`;
}

function pickRow(p, publicView) {
  const when = new Date(p.created_at).toLocaleString();
  const game = new Date(p.game_start).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const market = { spread: 'Spread', moneyline: 'ML', total: 'Total' }[p.market] || p.market;
  const pickTxt =
    p.market === 'total'
      ? `${p.side} ${p.line}`
      : `${esc(p.side)} ${p.line != null ? p.line : ''} (${Number(p.odds) > 0 ? '+' : ''}${p.odds})`;
  const res = p.result
    ? `<span class="pill ${p.result}">${p.result.toUpperCase()}</span>`
    : `<span class="pill pending">PENDING</span>`;
  const score = p.result ? `${p.graded_score_away}-${p.graded_score_home}` : '—';
  const tip = p.hash ? `<span title="Ledger hash ${esc(p.hash)}" style="color:#4b5563;font-size:11px">⛓ ${esc(p.hash.slice(0, 8))}</span>` : '';
  return `<tr><td>${esc(when)}<br>${tip}</td>
<td><b>${esc(p.away_team)} @ ${esc(p.home_team)}</b><br><span style="color:#9ca3af">${esc(game)}</span></td>
<td>${market}<br><b>${pickTxt}</b><br><span style="color:#9ca3af">${Number(p.units)}u${p.note ? ' · ' + esc(p.note) : ''}</span></td>
<td>${res}<br><span style="color:#9ca3af;font-size:12px">${score}</span></td></tr>`;
}

export function dashboardPage({ user, stats, picks, chain, gradedCount, minGraded, baseUrl }) {
  const badgeUrl = `${baseUrl}/badge/${encodeURIComponent(user.username)}.svg`;
  const profileUrl = `${baseUrl}/v/${encodeURIComponent(user.username)}`;
  const snippet = `<a href="${profileUrl}" target="_blank" rel="noopener"><img src="${badgeUrl}" alt="Verified track record" width="340" height="96"></a>`;
  const body = `
<h1>Dashboard</h1>
<p class="sub">Logged as <b style="color:#fff">@${esc(user.username)}</b> · public page: <a href="${profileUrl}">${profileUrl}</a></p>
${chain.ok
  ? `<div class="card"><span class="check">✓ Ledger intact</span> <span class="sub">— ${stats.total} picks hash-chained, tip <code>${esc(chain.tip.slice(0, 12))}…</code></span></div>`
  : `<div class="card" style="border-color:#7f1d1d"><span class="flag">⛓ CHAIN BROKEN at ${esc(chain.atId)} (${esc(chain.reason)})</span></div>`}
${statCards(stats)}
<h2>Log a pick</h2>
<div class="card">
<p class="sub">Picks are accepted <b>only before</b> the game's scheduled start. Once logged, a pick is permanent — it cannot be edited or deleted.</p>
<form method="post" action="/api/picks" id="pickform">
<div class="row2">
<div><label>Sport</label><select name="sport" id="sport" required><option value="nfl">NFL</option><option value="nba">NBA</option></select></div>
<div><label>Game (upcoming)</label><select name="game" id="game" required><option value="">Loading games…</option></select></div>
</div>
<div class="row2">
<div><label>Market</label><select name="market" id="market" required><option value="spread">Spread</option><option value="moneyline">Moneyline</option><option value="total">Total (O/U)</option></select></div>
<div><label>Side — team abbr (spread/ML) or over/under (total)</label><input name="side" id="side" required placeholder="e.g. KC or over" maxlength="8"></div>
</div>
<div class="row2">
<div><label>Line (spread/total — blank for moneyline)</label><input name="line" id="line" type="number" step="0.5" placeholder="e.g. -3.5"></div>
<div><label>Odds (American)</label><input name="odds" type="number" value="-110" required></div>
</div>
<div class="row2">
<div><label>Stake (units, 0.5–5)</label><input name="units" type="number" step="0.5" min="0.5" max="5" value="1" required></div>
<div><label>Note (optional)</label><input name="note" maxlength="120" placeholder="e.g. divisional spot"></div>
</div>
<button class="btn" type="submit" style="margin-top:12px">Log pick — permanent</button>
</form></div>
<h2>Your badge</h2>
<div class="card">
<p class="sub">${gradedCount >= minGraded
  ? `<span class="check"><b>✓ VERIFIED badge unlocked</b></span> (${gradedCount} graded picks). Put this on your Whop listing:`
  : `Badge unlocks at <b>${minGraded} graded picks</b> — you're at <b>${gradedCount}</b>. Keep logging.`}</p>
<img src="${badgeUrl}" width="340" height="96" style="max-width:100%;height:auto" alt="Verified badge">
<p class="sub" style="margin-top:10px">Copy-paste HTML for your Whop listing:</p>
<pre class="snip">${esc(snippet)}</pre>
</div>
<h2>Pick history (${picks.length})</h2>
<div class="card" style="overflow-x:auto"><table>
<tr><th>Logged</th><th>Game</th><th>Pick</th><th>Result</th></tr>
${picks.map((p) => pickRow(p)).join('') || '<tr><td colspan="4" class="sub">No picks yet — log your first above.</td></tr>'}
</table></div>
<script>
const gameSel = document.getElementById('game');
async function loadGames(){
  const sport = document.getElementById('sport').value;
  gameSel.innerHTML = '<option value="">Loading games…</option>';
  try {
    const r = await fetch('/api/games?sport=' + sport);
    const games = await r.json();
    if (!games.length) { gameSel.innerHTML = '<option value="">No upcoming games found</option>'; return; }
    gameSel.innerHTML = games.map(g =>
      '<option value="' + g.id + '">' + g.awayAbbr + ' @ ' + g.homeAbbr + ' — ' +
      new Date(g.date).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + '</option>'
    ).join('');
  } catch(e){ gameSel.innerHTML = '<option value="">Failed to load games</option>'; }
}
document.getElementById('sport').addEventListener('change', loadGames);
loadGames();
</script>`;
  return layout('Dashboard', body, user);
}

export function publicProfilePage({ profile, stats, picks, chain, gradedCount, minGraded, baseUrl }) {
  const verified = gradedCount >= minGraded;
  const badgeUrl = `${baseUrl}/badge/${encodeURIComponent(profile.username)}.svg`;
  const body = `
<div class="card" style="border-color:${verified ? '#166534' : '#374151'}">
<p class="sub" style="margin:0">${esc(config.appName).toUpperCase()} ${verified ? '<span class="check"><b>✓ VERIFIED TRACK RECORD</b></span>' : '<b>● RECORD IN PROGRESS</b>'}</p>
<h1 style="margin:6px 0">@${esc(profile.username)}</h1>
<p class="sub">${esc(profile.display_name || '')} · member since ${new Date(profile.created_at).toLocaleDateString()}</p>
${verified
  ? `<p class="sub">This seller's full pick history is timestamped, hash-chained, and graded against official final scores. Nothing hidden, nothing backfilled.</p>`
  : `<p class="sub">This seller is building their verified record — the badge unlocks at ${minGraded} graded picks (currently ${gradedCount}).</p>`}
<img src="${badgeUrl}" width="340" height="96" style="max-width:100%;height:auto;margin-top:8px" alt="Verified badge">
</div>
${statCards(stats)}
<h2>Full pick history — every pick, no exceptions (${picks.length})</h2>
<div class="card" style="overflow-x:auto"><table>
<tr><th>Logged</th><th>Game</th><th>Pick</th><th>Result</th></tr>
${picks.map((p) => pickRow(p, true)).join('') || '<tr><td colspan="4" class="sub">No picks logged yet.</td></tr>'}
</table></div>
<div class="card"><p class="sub" style="margin:0">${chain.ok
  ? `<span class="check">✓</span> Ledger integrity verified — ${picks.length} picks, hash chain intact.`
  : `<span class="flag">⛓ Ledger break detected at ${esc(chain.atId)}.</span>`}
  Picks are accepted only before game time and can never be edited or deleted.</p></div>`;
  return layout(`@${profile.username} — verified record`, body, null);
}

export function errorPage(user, message) {
  return layout('Error', `<h1>Something went wrong</h1><div class="card"><p>${esc(message)}</p><p><a class="btn ghost" href="/dashboard">Back to dashboard</a></p></div>`, user);
}

export function paywallPage({ user, profile, error, checkoutUrl }) {
  const email = profile?.whop_email;
  const body = `
<h1>Seller access</h1>
<p class="sub">${esc(config.appName)} seller tools are <b style="color:#fff">$39/month</b>, sold on Whop. Link the email you used at checkout to activate your account.</p>
${error ? `<div class="card" style="border-color:#7f1d1d"><span class="flag">${esc(error)}</span></div>` : ''}
${email
  ? `<div class="card"><p>No active subscription found for <b style="color:#fff">${esc(email)}</b>.</p>
     <form method="post" action="/api/whop/recheck"><button class="btn" type="submit">Recheck my subscription</button></form>
     <p class="sub" style="margin-top:12px">Used a different email at checkout? Update it below.</p></div>`
  : ''}
<div class="card">
<form method="post" action="/subscribe">
<label>${email ? 'Whop purchase email' : 'Email used for your Whop purchase'}</label>
<input name="whop_email" type="email" required placeholder="you@email.com" value="${email ? esc(email) : ''}">
<button class="btn" type="submit">${email ? 'Update & verify' : 'Verify my subscription'}</button>
</form>
</div>
${checkoutUrl
  ? `<p><a class="btn ghost" href="${esc(checkoutUrl)}">Subscribe on Whop — $39/mo</a></p>`
  : `<p class="sub">Checkout link coming soon.</p>`}
<p class="sub">Public profiles, badges, and the landing page stay free for everyone — only the dashboard and pick logging need a subscription.</p>`;
  return layout('Seller access', body, user);
}
