# Analytics: Search Console and GA4

Visibility › Analytics (`/analytics`, `src/components/AnalyticsPage.tsx`) puts a brand's Google Search Console and
Google Analytics 4 in one place, and turns them into Opportunities. `AnalyticsPage.tsx` keeps the connect and pick
screens; the dashboard itself is `src/components/analytics/Dashboard.tsx` (below). It is the only view: the old visitor breakdowns
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
- GA4 extras (`syncGa4Extras`): sessions by day and default channel group into `analytics_ga4_channels` (90 days the
  first time), and each page's title (the one with the most views in the last 90 days) into `analytics_page_titles`.
  Tables and functions: `supabase/106_analytics_dashboard.sql`.
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

## The dashboard (`components/analytics/Dashboard.tsx`)

One API call, `{ action: "dashboard", days }` on `/api/seo-analytics` (`analyticsDashboard` in seoAnalyticsServer.ts),
for 7, 28, 90 or 365 days against the same number of days before. Every number is real; nothing is made up.

1. **Header**: the site, the connected sources (or a link to pick one), the range and the Compare switch.
2. **Chart**: six metric tabs (clicks, impressions, CTR, position, sessions, sign-ups), each with its change. The line is
   this period day by day (`daySeries`, `periodTotals`), the dashed line the period before, and violet pins the days a
   piece was published or refreshed (`calendar_items.published_at` / `refreshed_at`). Hover shows the day. GA4 tabs show
   "–" and a link to pick a property when there is none.
3. **What to do next**: the top 4 Opportunities with their gain, and "See all N".
4. **What changed**: searches and pages gaining and losing the most clicks (`movers`), each with a 12-point trend over
   both periods (`analytics_trends`, `trendPoints`).
5. **Where visitors come from**: GA4 sessions by channel (`analytics_channels`, `channelMix`). Visits from AI assistants
   are moved out of Referral into their own channel, with a chip per AI.
   **Where you rank**: searches averaging positions 1–3, 4–10 and 11–20, week by week for 12 weeks
   (`analytics_rank_weeks`, `rankWeeks`).
6. **Pages / Searches table**: clicks, impressions, CTR (red under 60% of `expectedCtr`), position and its change,
   sessions, sign-ups, conversion rate, visits from AI with the AIs citing the page in tracked answers, and a 28-day
   trend. Pages show a Published/Refreshed tag. Searches open the Research panel. 8 rows, then View all, then 25 more at
   a time (`{ action: "rows", kind, days, offset }`, `dashboardRows`). `?page=/path` puts that page first.

## Results: before and after (phase 3)

- `calendar_items.published_at` and `refreshed_at` (`supabase/105_analytics_results.sql`) are set by a trigger whenever a
  piece moves to Published, so every way of publishing records them. The first time sets `published_at`; publishing again,
  or an update to an existing page going live, sets `refreshed_at`. Pieces published before 105 take their first push date.
- `articleResults` (seoAnalyticsServer.ts) compares the 28 days before the change with the days since, up to 28
  (`resultWindows`, `compareResult` in seoAnalytics.ts). While a page is younger than 28 days, the days before are
  scaled to the same length. Clicks, impressions, position, sessions, key events and visits from AI.
- Shown on the article in Drafts and its Zippie card (`components/analytics/ArticleResults.tsx`). On the Analytics
  page each change shows as a pin on the chart and a tag in the Pages table. Pages down 25% or more after a full 28 days get a Refresh button. Autopilot's daily chat names the
  best performer.

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
