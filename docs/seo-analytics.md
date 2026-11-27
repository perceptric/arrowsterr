# Analytics: Search Console and GA4

Visibility › Analytics (`/analytics`, `src/components/AnalyticsPage.tsx`) puts a brand's Google Search Console and
Google Analytics 4 in one place. `AnalyticsPage.tsx` keeps the connect and pick screens and a switch between the two
reports (below), read live from Google. It is the only view: the old visitor breakdowns
("Site traffic") and Rank tracking were removed in November 2026. `/traffic` opens Analytics. The rank tables
(`rank_projects`, `rank_keywords`, `rank_checks`) stay in the database but nothing writes to them any more.

## Connecting

- One Google sign-in (`/api/google/connect`, `src/lib/google.ts`) asks for GA4 (`analytics.readonly`) and Search Console
  (`webmasters.readonly`) together. The granted scopes are saved on `ga4_connections.scopes`.
- After sign-in the callback picks the Search Console property that fits the brand's domain (`pickGscProperty`) and
  starts the first sync. People can change it, and pick the GA4 property, on the page.
- Brands connected before this keep GA4. The page asks them to sign in again to add Search Console.

### Google Cloud, once

1. APIs & Services › Library: enable the **Google Search Console API** (next to the Analytics Data and Admin APIs).
2. OAuth consent screen › Data access: add `https://www.googleapis.com/auth/webmasters.readonly`. It is a sensitive
   scope, like `analytics.readonly`, so it goes through the same verification.

## The sync (`src/lib/seoAnalyticsServer.ts`)

- Job `analytics_sync`, queued by the scheduler once a day per connected brand (01:00 to 06:00 UTC) and right after
  sign-in or a property change. Reading Google is free, so it uses no tasks.
- Search Console: daily totals into `analytics_gsc_days`, rows by day, page and query into `analytics_gsc` (most clicks
  first, up to 100,000 rows per 30-day window). The first run saves the last 30 days, then the job runs again every 20
  seconds to walk back a month at a time to 16 months.
- GA4: sessions, key events and visits from AI by day and landing page into `analytics_ga4`. The first run saves 90
  days; after that the last few days again (GA4 fills in late data).
- The sync feeds Drafts' before and after, Zippie's `get_site_analytics`, Opportunities and reports. The page itself
  reads Google live (below). `supabase/106_analytics_dashboard.sql` (channels, page titles, trends, rank weeks) was for
  the old dashboard; nothing reads or writes it now.
- Pages join on a normalised path (`pagePath` in `src/lib/seoAnalytics.ts`): no host, query or trailing slash.
- Totals come from SQL functions (`analytics_queries`, `analytics_pages`, `analytics_query_pages`, `analytics_ga4_days`,
  `analytics_ai`) so the app never pulls every row. Tables and functions: `supabase/104_analytics.sql`.

## Opportunities (`findOpportunities` in `src/lib/seoAnalytics.ts`)

Worked out after every sync from the last 28 days against the 28 before, saved in `analytics_opportunities`:

| Kind | When | Action on the page |
|---|---|---|
| Low CTR | Page 1, click rate under 75% of what its position usually gets (`expectedCtr`) | Fix title & meta (Zippie's meta play) |
| Page 2 | Average position 11 to 20 with at least 100 impressions | Refresh the page (Calendar item, action "update") |
| Losing clicks | A page down 25% or more, with its position slipping | Refresh the page |
| Two pages compete | Two pages each take a fifth or more of a query's impressions | Refresh the page |
| New topic | Three or more related queries, all past position 20 | Add to Calendar |
| Needs links | A page at average position 5 to 15 with 100+ impressions, and busier pages on the same topic (`linkSuggestions`) | Add links (Zippie's internal links play, reviewed first) |

Gains are extra clicks a month. Sign-ups use the page's own GA4 conversion rate when it has 50 or more sessions.
"Refresh the page" asks Zippie to run `refresh_page` (below); without Zippie it adds a Calendar update piece.

## The reports (`components/analytics/GscReport.tsx`, `Ga4Report.tsx`)

Google's own Performance and GA4 reports, inside Arrowsterr. A switch by the title picks one; the last pick is kept for
each person on the device. Each report is one call on `/api/seo-analytics` (`gscReport`, `ga4Report` in
`src/lib/googleReportsServer.ts`), read from Google and kept for 3 hours per brand and settings (20 minutes for hours).
When Google fails, they fall back to the synced tables with fewer parts. The pure parts (dates, filters turned into API
bodies, the AI assistants channel, joining by path, weeks, CSV) are in `src/lib/googleReports.ts`.

- **Search Console** (`{ action: "gsc", range, compare, type, filters, hourly }`): 24 hours (by hour, `hourly_all`;
  hidden when the property has no hourly data), 7 and 28 days, 3 months, and 6, 12, 16 months or exact dates. Search type
  (Web, Image, Video, News, Discover, Google News) and Compare (previous period, last year, none) in one dialog.
  Filters on query, page, country, device and search appearance. Four checkable totals draw the lines; tables for
  queries, pages, countries, devices, search appearance and days. Research → on a query opens the keyword research
  panel (the page that ranks comes from `{ action: "toppage" }`). Pages can add GA4 sessions, sign-ups and conversion
  rate by path (`{ action: "join", source: "ga4" }`).
- **Google Analytics** (`{ action: "ga4", range, compare, filters, hourly }`): today (by hour), 7 and 28 days, 3, 6 and 12
  months or exact dates. Filters on channel, source / medium, landing page, country, device and event. Five checkable
  totals. Traffic sources by channel, source / medium or campaign, with **AI assistants** as its own channel
  (`trafficChannels`: visits from AI hosts move out of the channel GA4 gave them) that opens to each AI. Landing pages can
  add Search Console clicks and position (`{ action: "join", source: "gsc" }`) and Refresh page → (Zippie's
  `refresh_page`, or a Calendar update item). Pages, key events, countries and devices. People on the site now come
  from the realtime report (`{ action: "now" }`).
- Both: daily or weekly lines, purple pins for pieces published or refreshed from Arrowsterr, sorting, rows per page,
  and Export › This table as CSV in the header bar.

## Results: before and after (phase 3)

- `calendar_items.published_at` and `refreshed_at` (`supabase/105_analytics_results.sql`) are set by a trigger whenever a
  piece moves to Published, so every way of publishing records them. The first time sets `published_at`; publishing again,
  or an update to an existing page going live, sets `refreshed_at`. Pieces published before 105 take their first push date.
- `articleResults` (seoAnalyticsServer.ts) compares the 28 days before the change with the days since, up to 28
  (`resultWindows`, `compareResult` in seoAnalytics.ts). While a page is younger than 28 days, the days before are
  scaled to the same length. Clicks, impressions, position, sessions, key events and visits from AI.
- Shown on the article in Drafts and its Zippie card (`components/analytics/ArticleResults.tsx`). On the Analytics
  page each change shows as a pin on the chart. Autopilot's daily chat names the best performer.

## Refresh the page (`src/lib/pageRefreshServer.ts`, Zippie's `refresh_page`)

1. Reads the live page into an outline (`pageOutline` in pageText.ts) and its Search Console searches now and 28 days
   before (`analytics_page_queries`).
2. `planSections` marks each section keep (a search it answers still ranks top 5 with a normal click rate) or rewrite
   (its searches slipped 1.5 places or more, or sit past page 1); searches no section answers become new sections; the
   biggest page-1 search with a weak click rate asks for a new title and meta description.
3. Claude writes exact edits for the rewrite sections only, the new sections and the title and meta. They land on the
   piece's draft (made from the live page when there is none) and show on Zippie's Revise card with the kept sections.
4. Apply saves the edits, the new sections (before the FAQ) and the meta, and moves the piece back to Review so the next
   publish counts as a refresh. Publish on the card opens the usual Publish panel. Uses 100 tasks (`TASK_COST.refresh`).

## Cited by AI

The Pages table's "From AI" column shows GA4's visits from AI per page next to the AIs that cite the page in the tracked
AI answers (`runs.chats`, `ownCitations` in seoAnalytics.ts). Sources links each of the brand's own pages to
`/analytics?page=/path`, which puts that page first in the table.

## Elsewhere

- Research › keyword report shows "You rank #X" from the synced data (`OwnRank`).
- Zippie's `get_site_analytics` tool reads the totals, top queries, pages gaining and losing clicks, Opportunities,
  recent articles' before and after, and refresh candidates. The rank-drop, monthly-report, cannibalization and content-refresh skills use it, and
  content-refresh can call `refresh_page`.
