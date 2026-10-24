# RiseLocale: Local Rank Tracker

The first RiseLocale module (`docs/riselocale.md`, section 2.1). A Next.js app with Postgres and a background worker. Ranks come from DataForSEO.

## What it does

- **Grid scans** from 3×3 to 21×21 pins, 100 m to 16 km apart, centered anywhere on the map.
- **Service area scans**: draw the area on the map and pins fill it (441 at most). "Fit to 441 pins" picks the tightest spacing that fits.
- **Three ranks per pin, kept apart**: Google Maps (top 20), Local Pack (spots 1 to 3) and organic (top 20). Switch layers on the map. Pick a pin to see who ranks there.
- **Competitors**: every business in the Maps top 20 across the scan, with rating, reviews, average rank, top 3 pins and share of local voice. Pick one to see its own grid.
- **Change view**: each pin's move since the last scan with the same business, keyword and pins.
- **Recurring scans** (daily, weekly, monthly) with **alerts** when the average rank falls by more than 2, a top 3 pin is lost, or Local Pack pins drop. Alerts show in the app and are emailed to owners and admins.
- **White-label reports**: every scan has a share link (`/r/<token>`) with the agency's name, logo, color and footer and no RiseLocale branding. Recurring scans can email it to clients after each run.
- **Free 5×5 scan** on the website (`/free`): no account, email required, limited per IP and per day.
- **Credits**: 1 pin is 1 credit, charged when a scan starts. Failed pins are refunded. Credits reset monthly.

## Reliability

- The business is matched by its Google listing ID (CID or place ID). Without IDs, the name must match exactly and the websites must not differ. A look-alike never counts.
- A pin whose Maps rank moves more than 5 spots since the last scan is searched again, and the second answer is kept. Both are stored.
- Searches that fail are posted again, up to 3 times. Searches that wait longer than 50 minutes are posted again. Scans still open after 3 hours close with the open pins marked failed.
- Results are collected by our own task IDs, never through DataForSEO's `tasks_ready` list, so sharing a DataForSEO account with Arrowsterr is safe.
- Worker ticks never overlap (Postgres advisory lock), so running several web servers is safe.
- `tests/engine.test.ts` proves these on flaky cases against a real Postgres.

## Run it

```bash
cd apps/riselocale
npm install
cp .env.example .env.local        # set DATABASE_URL, and RL_DATA=demo or DFS_LOGIN / DFS_PASSWORD
npm run migrate
npm run dev                       # http://localhost:3100
```

`RL_DATA=demo` makes up ranks so the app works without DataForSEO. Every page shows a Demo data banner while it's on.

Tests: `TEST_DATABASE_URL=postgres://.../riselocale_test npm test` (run `npm run migrate` on that database first). Without `TEST_DATABASE_URL` the worker tests are skipped.

## Deploy

One web service runs the app and the worker (started from `src/instrumentation.ts`).

1. A Postgres 15+ database. Run `npm run migrate` with its `DATABASE_URL`.
2. A Node 22 web service with root folder `apps/riselocale`, build `npm ci && npm run build`, start `npm start`.
3. Settings: `DATABASE_URL`, `DFS_LOGIN`, `DFS_PASSWORD`, `APP_URL`, `NEXT_PUBLIC_TILE_URL` and `NEXT_PUBLIC_TILE_ATTRIBUTION` for a paid tile host (OpenStreetMap's own tiles are for testing only), and `RESEND_API_KEY` with `EMAIL_FROM` for email.

## Not built yet

- Billing (Stripe) and plan limits beyond monthly credits.
- Inviting teammates (the roles exist in the database).
- PDF export. The report page prints cleanly from the browser.

## Files

| Path | What |
|---|---|
| `src/lib/geo.ts` | Grid and service area pins, map zoom per spacing |
| `src/lib/match.ts` | Parsing DataForSEO results, matching the business |
| `src/lib/metrics.ts` | Averages, share of local voice, competitors |
| `src/lib/compare.ts` | The recheck rule and alerts |
| `src/lib/dataforseo.ts`, `src/lib/demo.ts` | The two rank data sources |
| `src/lib/engine.ts` | The worker: schedules, posting, collecting, closing scans |
| `src/lib/scans.ts` | Creating scans and charging credits |
| `migrations/001_rank_tracker.sql` | The schema |
