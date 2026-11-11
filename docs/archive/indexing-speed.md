# Indexing and Speed

Two Technical SEO screens from phase 2 of `docs/technical-seo-plan.md`: **Indexing** (`/indexing`) reads the brand's Google Search Console, and **Speed** (`/speed`) reads the Chrome UX Report. Both feed Site Audit too.

## Setup on the server

- **Search Console:** the Google sign-in already used for GA4 (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`). In the Google Cloud project, turn on the **Google Search Console API** and add the `webmasters.readonly` scope to the OAuth consent screen. Google treats it as a sensitive scope, so a published app may need Google's verification (check).
- **Chrome UX Report:** `CRUX_API_KEY`, a Google Cloud API key with the **Chrome UX Report API** turned on. `GOOGLE_API_KEY` or `PAGESPEED_API_KEY` work too when that key has the API turned on.
- **Lab tests** use PageSpeed Insights with `PAGESPEED_API_KEY`, as the free speed tool does.

## Indexing

- **Connect:** one click, "Connect Search Console" (`/api/google/connect` with kind `gsc`). It asks for Search Console read access only, stored encrypted in `gsc_connections`, separate from the GA4 connection. The brand's property is picked on its own when one matches the domain (the Domain property first, else the best URL-prefix one, `matchProperty`); otherwise the screen lists the account's properties to pick from.
- **Daily sync** (`gsc_sync` job, `src/lib/gsc.ts`):
  - Clicks, impressions and position by day: 16 months on the first sync, then the last 10 days (`gsc_daily`).
  - Each page's last 28 days and the 28 before, both ending 3 days ago because Google's data settles after about 2 days (`gsc_pages`).
  - Sitemaps from the Sitemaps API (`gsc_sitemaps`).
  - URL Inspection, up to 1,500 a day per property (Google allows 2,000 and other tools share them): pages with clicks first, then pages AI answers cite, then sitemap pages, then other indexable pages from the latest crawl; never the same page twice in 3 days (`pickInspections`). A job that runs out of time hands over to the next. A quota answer stops for the day.
- **What it shows:** clicks in 28 days against the 28 before, indexed and not indexed (of the pages inspected), pages submitted in sitemaps, pages with clicks, the median last Google crawl; clicks, impressions or position by day over 3, 12 or 16 months; why pages aren't indexed; sitemaps with errors and when Google read them; clicks by template (from the latest crawl's templates); pages losing clicks with their index status; pages where Google chose a different canonical; and every inspected page with Inspect again, Request indexing (opens Search Console, since the API can't request indexing for normal pages) and CSV export.
- **Disconnect** removes the sign-in and every row it brought.

## Speed

- **Daily sync** (`cwv_sync` job, `src/lib/cwv.ts`): the site's origin on phones and computers, with about 6 months of weekly history from the CrUX History API (`cwv_origin`), and up to 100 pages on phones: the most clicked from Search Console, else the latest crawl's pages with the most links in (`cwv_urls`). A 404 from CrUX means too few Chrome visits, which is a normal answer.
- **What it shows:** pass or fail on Core Web Vitals per device; LCP, INP and CLS at the 75th percentile with the share of good, needs work and poor visits; TTFB and FCP; each metric week by week with the line for good; the share of pages with good LCP by template; every page with page-level data, worst LCP first; and lab tests (PageSpeed Insights) for any page of the brand's own site, with the Lighthouse score, lab metrics and the biggest savings.

## In Site Audit

When the brand has this data, crawls add 9 checks (`src/lib/tech/checks.ts`): pages Google crawled or found but didn't index, Google picking a different canonical, rich result errors, sitemaps not submitted in Search Console, sitemaps with errors there, the site failing Core Web Vitals on phones, and pages with poor LCP, INP or CLS. Each issue also carries the search clicks on the pages it hits, and "What to fix first" ranks by those clicks inside each severity. Google and the crawl may write the same URL with or without a trailing slash or www; `byUrl` matches them.

## Reliability

- Checks that need Google data don't run without it, and "sitemaps not submitted" waits for a finished Search Console sync, so a missing connection never shows as a problem.
- A revoked sign-in or a lost property saves the error on the connection and shows it on the screen instead of retrying forever.
- Tests: `tests/techGoogle.test.ts` (Search Analytics, URL Inspection, the inspection order and budget, property matching, sitemaps, CrUX records and history) and the Google checks in `tests/techChecks.test.ts`. The syncs were run end to end against mocked Google answers: connect, property match, the first sync (days, pages, sitemaps, inspections), a second sync that inspects nothing new within 3 days, and the CrUX sync with a page that has no data.

## Data

`supabase/068_google_tech.sql`: `gsc_connections` (server only), `gsc_daily`, `gsc_pages`, `gsc_inspections`, `gsc_sitemaps`, `cwv_origin`, `cwv_urls` (viewers may read), and `brands.gsc_site` and `gsc_email`. `/api/tech` takes `status`, `indexing` and `speed` from viewers, and `sites`, `pick`, `disconnect`, `sync`, `inspect` and `lab` from editors.

## Running cost

Search Console, the Chrome UX Report and PageSpeed Insights are free within Google's limits (2,000 inspections a day per property, about 150 CrUX calls a minute and 25,000 PageSpeed calls a day per project; check the project's quotas). The syncs are small jobs in the existing worker: a few seconds of work per brand a day, plus up to about 5 minutes of inspections.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Google APIs | $0 | $0 |
| Worker time for syncs (inside the current worker; at Growth inside the crawl workers from phase 1) | $0 | $0 |
| Database rows (about 2 MB a brand) | $0 | $0 |
| **Monthly total added** | **$0** | **$0** |
