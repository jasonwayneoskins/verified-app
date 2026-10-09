// Server-rendered HTML views. Dark, mobile-first, no build step.
import { config } from './config.js';
import { fmtPct, fmtUnits } from './stats.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#070b14;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.5}
a{color:#4ade80}.wrap{max-width:860px;margin:0 auto;padding:20px 16px 64px}
.nav{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;max-width:960px;margin:0 auto}
.brand{font-weight:800;font-size:20px;letter-spacing:.5px;color:#fff;text-decoration:none}.brand span{color:#22c55e}
.nav a.btn{margin-left:8px}
h1{font-size:34px;line-height:1.15;margin:18px 0 10px;color:#fff}h2{color:#fff;margin-top:34px}
.sub{color:#9ca3af;font-size:17px}
.btn{display:inline-block;background:#22c55e;color:#04120a;font-weight:700;padding:12px 22px;border-radius:10px;text-decoration:none;border:0;cursor:pointer;font-size:16px}
.btn.ghost{background:transparent;color:#e5e7eb;border:1px solid #374151}
.btn.small{padding:8px 14px;font-size:14px}
.card{background:#0d1424;border:1px solid #1e293b;border-radius:14px;padding:18px;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0}
.stat{background:#0d1424;border:1px solid #1e293b;border-radius:12px;padding:14px;text-align:center}
.stat .v{font-size:26px;font-weight:800;color:#fff}.stat .l{font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.pos{color:#22c55e}.neg{color:#f87171}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;color:#9ca3af;font-weight:600;padding:10px 8px;border-bottom:1px solid #1e293b;font-size:12px;text-transform:uppercase;letter-spacing:.5px}
td{padding:10px 8px;border-bottom:1px solid #111827;vertical-align:top}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:700}
.pill.win{background:#052e16;color:#4ade80}.pill.loss{background:#450a0a;color:#f87171}.pill.push{background:#1f2937;color:#9ca3af}.pill.pending{background:#1f2937;color:#fbbf24}
input,select,textarea{width:100%;background:#0b1120;border:1px solid #374151;color:#e5e7eb;border-radius:10px;padding:12px;font-size:16px;margin:6px 0}
label{font-size:13px;color:#9ca3af;display:block;margin-top:10px}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
pre.snip{background:#0b1120;border:1px solid #374151;border-radius:10px;padding:12px;overflow-x:auto;font-size:12px;color:#a7f3d0;white-space:pre-wrap;word-break:break-all}
.check{color:#4ade80}.flag{color:#f87171}
.hero{padding:40px 0 10px}.hero .btn{margin:8px 8px 0 0}
.steps{display:grid;gap:12px;margin-top:18px}
.step{background:#0d1424;border:1px solid #1e293b;border-radius:12px;padding:16px}
.step b{color:#4ade80}
footer{color:#6b7280;font-size:13px;text-align:center;padding:30px 0}
@media(max-width:560px){h1{font-size:28px}.row2{grid-template-columns:1fr}table{font-size:13px}}
`;

export function layout(title, body, user) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(config.appName)}</title>
<style>${CSS}</style></head><body>
<nav class="nav"><a class="brand" href="/">${esc(config.appName)} <span>✓</span></a>
<div>${user ? `<a class="btn small ghost" href="/dashboard">Dashboard</a><a class="btn small ghost" href="/logout">Log out</a>` : `<a class="btn small ghost" href="/login">Log in</a><a class="btn small" href="/login">Get verified</a>`}</div></nav>
<div class="wrap">${body}</div>
<footer>${esc(config.appName)} — tamper-proof track records. Every pick timestamped, hash-chained, and public forever.</footer>
</body></html>`;
}

export function landingPage(user, waitlistDone) {
  const body = `
<div class="hero">
<h1>Every picks seller claims 70%.<br>Prove it.</h1>
<p class="sub">${esc(config.appName)} is the tamper-proof track record for sports-betting sellers. Log every pick <b>before</b> the game starts — timestamped and hash-chained so it can't be backfilled, edited, or cherry-picked. We auto-grade against real final scores and give you a public verified profile + badge for your Whop listing.</p>
<p><a class="btn" href="/login">Start logging free</a> <a class="btn ghost" href="/v/demo">See a live verified profile</a></p>
</div>
<h2>How it works</h2>
<div class="steps">
<div class="step"><b>1. Log the pick before kickoff.</b> Pick the game, market, side and line. The app stamps it with a server timestamp and chains it to your history with SHA-256. Late picks are rejected — no exceptions.</div>
<div class="step"><b>2. We grade it automatically.</b> Final scores come straight from ESPN. Wins, losses, pushes — computed, not claimed.</div>
<div class="step"><b>3. Show the badge.</b> At 100+ graded picks your <b>VERIFIED</b> badge unlocks: win %, total picks, net units. Embed it on your Whop listing. Buyers click through to your full public history — every pick, no hiding.</div>
</div>
<h2>Why sellers win with it</h2>
<div class="card"><p>In a market where every group shouts "70% winners" and star ratings can't tell anyone apart, <b>proof is the only differentiator</b>. One extra $50/mo member pays for a year of ${esc(config.appName)}.</p>
<p class="sub">Launching at <b style="color:#fff">$39/mo</b> — sold on Whop. Join the waitlist and lock early pricing.</p>
${waitlistDone
  ? `<p class="check"><b>✓ You're on the list.</b> We'll email you at launch.</p>`
  : `<form method="post" action="/waitlist" style="display:flex;gap:8px;margin-top:8px"><input name="email" type="email" required placeholder="you@email.com" style="margin:0"><button class="btn" type="submit">Join waitlist</button></form>`}
</div>
<h2>Anti-fraud, by design</h2>
<div class="card"><ul>
<li><span class="check">✓</span> Picks only accepted <b>before</b> game start (validated against ESPN)</li>
<li><span class="check">✓</span> Picks can <b>never</b> be edited or deleted — enforced in the database itself</li>
<li><span class="check">✓</span> Full history is public — no date-range cherry-picking on verified pages</li>
<li><span class="check">✓</span> Badge locked until <b>100+ graded picks</b></li>
<li><span class="check">✓</span> SHA-256 hash chain — tamper with one pick and the whole chain breaks</li>
</ul></div>`;
  return layout(config.appName, body, user);
}

export function loginPage({ demoMode, error }) {
  const body = `<h1>Log in</h1>
${error ? `<div class="card" style="border-color:#7f1d1d"><span class="flag">${esc(error)}</span></div>` : ''}
${demoMode
  ? `<div class="card"><p class="sub">Demo mode — no account needed.</p>
     <form method="post" action="/api/auth/demo"><button class="btn" type="submit">Continue as demo seller</button></form>
     <p class="sub" style="margin-top:12px">Try the <a href="/v/demo">public verified profile</a> first — no login needed.</p></div>`
  : `<div class="card"><form method="post" action="/api/auth/signin">
     <label>Email</label><input name="email" type="email" required>
     <label>Password</label><input name="password" type="password" required>
     <button class="btn" type="submit" style="margin-top:12px">Log in</button></form>
     <p class="sub">No account? <a href="/signup">Sign up</a></p></div>`}`;
  return layout('Log in', body, null);
}

export function signupPage({ error }) {
  const body = `<h1>Create your seller account</h1>
${error ? `<div class="card" style="border-color:#7f1d1d"><span class="flag">${esc(error)}</span></div>` : ''}
<div class="card"><form method="post" action="/api/auth/signup">
<label>Username (3–24 chars, letters/numbers/_ — this becomes your public /v/&lt;username&gt; page)</label>
<input name="username" required pattern="[a-zA-Z0-9_]{3,24}">
<label>Display name</label><input name="display_name" required maxlength="40">
<label>Email</label><input name="email" type="email" required>
<label>Password</label><input name="password" type="password" required minlength="8">
<button class="btn" type="submit" style="margin-top:12px">Create account</button></form></div>`;
  return layout('Sign up', body, null);
}
