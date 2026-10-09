# Verified — tamper-proof track records for sports-betting sellers

**Phase 1: web MVP.** Sellers log every bet *before* the game starts. Each pick gets a
server timestamp plus a SHA-256 hash chained to their previous pick, so records can't be
backfilled, edited, or cherry-picked. Picks auto-grade against real ESPN final scores.
At 100+ graded picks, the seller unlocks a public verified profile (`/v/<username>`) and
an embeddable badge (`/badge/<username>.svg`) for their Whop listing.

This is Myfxbook-for-sports-betting. Anti-fraud is the product.

---

## How it works (architecture)

```
Browser ──> Express app (src/index.js)
              ├── Auth: Supabase Auth (prod) or demo login (local)
              ├── Picks API: validates vs ESPN *before* kickoff, hash-chains, inserts
              ├── Grader: pulls ESPN finals, writes ONLY grading columns
              ├── Stats engine: computed from graded picks only, no date filters
              ├── Public profile /v/:username + SVG badge endpoint
              └── DB: Supabase Postgres (prod) or local SQLite (demo)
```

**The trust guarantees live in the database, not just the app code**
(`supabase/migrations/001_verified_init.sql`):

1. A trigger **forbids UPDATE of any pick column except** `result`, `graded_at`,
   `graded_score_home`, `graded_score_away` — and only the server-side grader
   touches those.
2. A trigger **forbids DELETE of picks entirely**. History is permanent.
3. Every pick stores `prev_hash` + `hash = sha256(prev_hash | pick data)`.
   The public profile page re-verifies the whole chain on every load.

**What v1 chose on purpose:**
- Odds: the seller's claimed line/odds are recorded, and the app validates the
  game hasn't started via ESPN. We do **not** yet independently verify the line
  against a live odds feed (TheOddsAPI free tier = 500 calls/mo — Phase 2).
- Sports: NFL + NBA only (ESPN's free scoreboard API, no key needed).
- Grading runs on a schedule (below), not instantly at final whistle.

---

## Run it locally right now (no accounts needed)

```bash
cd ~/workspace/verified-app
npm install
npm run seed     # creates demo seller @demo + 120 graded picks
node src/index.js
```

Open http://localhost:3000 — click **"See a live verified profile"** or go to
`/v/demo`. Log in with **"Continue as demo seller"** to log picks.

---

## What Jason must do himself (two accounts, ~10 minutes)

Nothing below can be done without your email — that's why it's on you.

### 1. Create the Supabase project (database + login system) — ~5 min

1. Go to https://supabase.com and click **Start your project** → sign up with
   your Google account (jasonoskins6@gmail.com).
2. Click **New project**. Name it `verified`, set a database password
   (save it somewhere), pick any region, click **Create project**. Wait ~2 min.
3. In the left sidebar click **SQL Editor** → **New query**. Open the file
   `supabase/migrations/001_verified_init.sql` from this folder, paste it in,
   click **Run**. You should see "Success".
4. Go to **Authentication → Sign In / Up** and turn **OFF** "Confirm email"
   (under Email provider). This lets sellers sign up without an email round-trip.
5. Go to **Project Settings → API**. Copy these three values:
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)
6. Go to **Project Settings → Database**. Under **Connection string → URI**,
   copy it, replacing `[YOUR-PASSWORD]` with the database password from step 2.
   → `DATABASE_URL`

### 2. Deploy the app (Render free tier) — ~5 min

1. Go to https://render.com → sign up with Google.
2. **New + → Web Service** → connect your GitHub (push this folder to a repo
   first) **or** use "Deploy from public Git URL".
3. Settings: **Build Command** `npm install`, **Start Command** `node src/index.js`,
   plan **Free**.
4. Under **Environment**, add every variable from `.env.example` with your real
   values (the four Supabase values from step 1, plus generated secrets):
   - `SESSION_SECRET`: any long random string
   - `CRON_SECRET`: another long random string (used by the grading job)
   - `PUBLIC_BASE_URL`: your Render URL, e.g. `https://verified-xyz.onrender.com`
   - `PORT`: Render sets this automatically — leave it out or keep 3000.
5. Click **Deploy**. When it's live, visit `/v/demo` — it will 404 (no demo data
   in production, correct). Sign up a real seller account to test.

Alternatives if Render doesn't suit you: Railway, Fly.io, or any VPS —
all have free tiers (see https://free-for.dev). The app is a plain Node server;
nothing is Vercel/Render-specific.

### 3. Schedule the grading job (so picks grade themselves) — ~3 min

Picks don't grade instantly — a scheduled job checks ESPN for final scores.

1. Go to https://cron-job.org → sign up free.
2. Create a cron job: **every 30 minutes**, URL:
   `https://<your-render-url>/api/cron/grade?secret=<your CRON_SECRET>`
3. Done. You can also run it by hand any time: `node scripts/grade.js`
   (needs `DATABASE_URL` in the environment).

---

## Environment variables

| Var | What | Required |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL | prod only |
| `SUPABASE_ANON_KEY` | Supabase anon key | prod only |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only) | prod only |
| `DATABASE_URL` | Postgres connection string | prod only |
| `SESSION_SECRET` | Signs login cookies — long random string | always |
| `CRON_SECRET` | Password for the grading endpoint | always |
| `PUBLIC_BASE_URL` | Public URL, no trailing slash (badge links) | always |
| `APP_NAME` | Brand shown on pages/badges (default `Verified`) | optional |
| `PORT` | default 3000 | optional |

Leave the four Supabase vars **empty** to run local demo mode (SQLite file at
`./data/verified-demo.db`).

---

## Key routes

| Route | What |
|---|---|
| `/` | Landing page + waitlist capture |
| `/login`, `/signup`, `/logout` | Auth (Supabase in prod, demo button locally) |
| `/dashboard` | Seller home: log picks, stats, badge HTML snippet |
| `/api/games?sport=nfl\|nba` | Upcoming games from ESPN (for the pick form) |
| `/api/picks` (POST) | Log a pick — rejected if game started |
| `/v/<username>` | Public verified profile (the product) |
| `/badge/<username>.svg` | Embeddable badge for Whop listings |
| `/api/cron/grade?secret=` | Grading job endpoint |

---

## Trust rules enforced in the product

- Picks accepted **only before** the game's scheduled start (server re-checks ESPN).
- Picks **never editable, never deletable** — database triggers, not just UI.
- Public pages show **all** picks — no date-range picker, no hiding losses.
- Badge stays in "building" state until **100+ graded picks**.
- Full **hash chain re-verified** on every public profile load.
- Pushes excluded from win % (industry standard), counted separately.

## Known limits / cut corners (honest list)

- **Line verification**: v1 trusts the seller's claimed line/odds; it only proves
  the pick was logged *before* the game. A seller could log a stale/favorable line.
  Phase 2 should snapshot the line from TheOddsAPI at pick time.
- **Game identity**: picks reference ESPN game IDs; a seller can't fake the score
  (grading uses ESPN finals), but could theoretically pick the wrong game ID —
  mitigated because the pick form only offers real upcoming games.
- **Demo mode auth** is a single shared demo account — fine for preview, never for
  production (production uses Supabase Auth).
- **No rate limiting** on pick creation yet — add express-rate-limit before
  marketing it.
- **SQLite demo DB** is a local file — ephemeral on free hosts; production must
  use Supabase Postgres.
- NBA preseason/NFL offseason weeks return few games — the pick form shows
  whatever ESPN has for the next 7 days.
