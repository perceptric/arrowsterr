# Audit: the plan

Audit keeps a brand's live pages earning, in two parts that share one crawl:

- **Internal Linking Audit:** do the pages that matter get the links they need, and which links should we add?
- **Content Decay:** which pages are losing clicks, rank or AI citations, why, and what to do about each one?

Every finding ends in a button that does the fix: a link added for you in the brand's CMS, or a refresh sent to the writer.

Every feature, its release (v1, v2, Later) and its definition of done are in `docs/audit-features.md`. The Live Writer is built in its own track; Audit only sends it a refresh request (`docs/audit-features.md`, D9). Technical SEO stays out of the app (`docs/archive/technical-seo-plan.md`): Audit runs no technical checks and has no health score.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page. Learns from the tools we built and removed this month (`docs/archive/site-structure.md`, `content-map.md`) and from the Refresh idea in `docs/content-v3-backend.md` (section 7).

---

## 1. Summary

| Part | Answers | Main data |
|---|---|---|
| Overview | What should we fix first, across both parts? | Both of the below, ranked by page value |
| Internal Linking | Which pages are orphans, too deep or starved of links, and which links fix that? | The crawl's link graph, page value, topic match |
| Content Decay | Which pages are fading, why, and which to refresh, merge or leave? | Search Console by page and day, rank checks, AI citations, GA4, the live SERP |

**Why it matters for Arrowsterr:** customers buy us to show up in Google and in AI answers. A page with no links in is hard to find. A page that's losing clicks is losing citations next. Audit closes the loop: Opportunities finds what to write, Drafts writes it, Audit keeps what's live earning.

**How long:** about 9.5 weeks for one engineer, in five phases that each ship on their own (section 12).

**What it costs to run:** about **$45 a month at Beta (50 teams)** and **$400 at Growth (500 teams)** (section 13).

---

## 2. What we have today

From the code (November 2026):

- **No crawler.** The old crawler is gone. The `audit`, `link_check`, `gsc_sync` and `cwv_sync` handlers in `src/lib/worker/handlers.ts` are stubs that only call `finish`. They're still listed in `JobKind` (`src/lib/jobs.ts:6`) and `HANDLERS` (`src/app/api/worker/route.ts:17`).
- **Old tables stay, unused:** `site_audits`, `crawl_queue`, `crawl_pages`, `onpage_audits`, `content_maps`, `gsc_connections`, `gsc_daily`, `gsc_pages`, `gsc_inspections`, `gsc_sitemaps`, `cwv_origin`, `cwv_urls`. `gsc_pages` only held this period against the last one, so there is no per-page history anywhere.
- **No Search Console.** `src/lib/google.ts:8` asks for `analytics.readonly` only.
- **GA4 is live, read on demand:** `ga4Traffic` (`src/lib/ga4.ts:37`) returns landing pages and page views for two periods. It's cached in memory for 10 minutes and never stored.
- **Rank tracking is live:** `rank_checks` holds a daily position and the ranking URL for every tracked keyword (`supabase/083_rank_tracker.sql`).
- **AI citations are live:** every tracked prompt's answers and cited links.
- **Parts we can reuse, all tested and in use:**

| Part | File | Use in Audit |
|---|---|---|
| Safe fetch with redirect chain, timing, byte cap, private IP block | `safeFetch.ts`, `netCheck.ts` | Every crawl fetch |
| robots.txt parser | `robotsTest.ts` | So the crawl respects robots.txt |
| Page facts with Readability and cheerio | `pageFacts.ts`, `pageMeta.ts`, `pageText.ts` | Each page's title, headings, words, author, dates |
| Sitemap finder | `sitemap.ts` (`findPages`) | Seeds the crawl (grows to read `lastmod` and drop the 3,000 cap) |
| String edits that keep WordPress blocks whole | `htmlEdit.ts` (`addLink`, `linksIn`) | Adding and fixing links |
| List, read and write live posts | `cmsEdit.ts` (`listItems`, `getItem`, `writeItem`): WordPress and Ghost | Applying links and refreshes |
| Change sets with approve, apply, undo | `plays.ts`, `change_sets`, `changes` | Every change |
| Job queue with leases, retries and waits | `016_queue.sql`, `jobs.ts` | The crawl as a chain of short jobs |
| Tasks, toolsets and refunds | `entitlements.ts` (`take`, `requireTrack`), `meter.ts` | Limits and charges |
| Alert emails | `notify.ts` (`emailAlert`) | Decay alerts |

---

## 3. Where it lives

A new sidebar group, **Audit**, between Visibility and Plan & Create (`NAV` in `src/components/App.tsx:1107`).

| Page | Address | Shows |
|---|---|---|
| Overview | `/audit` | The two scores, the top 10 fixes across both parts, the last crawl, Crawl now |
| Internal links | `/audit/links` | Section 6 |
| Content decay | `/audit/decay` | Section 7 |
| Pages | `/audit/pages` | Every crawled URL in a sheet, with its link and search facts as columns |

- Old addresses forward: `/site-structure` and `/content-map` open `/audit/links`; `/publish/refresh` opens `/audit/decay` (`ALIASES` in `App.tsx:130`). The old technical addresses keep falling back to Prompts, as today.
- Audit opens with the Organic Research toolset (`requireTrack(ws, "seo")`), the same as Research.
- Each brand has one audit home. The brand switcher at the top picks it, as on every other screen.

---

## 4. The shared foundation

### 4.1 One crawl feeds both

```
            ┌───────── crawl (weekly, or Crawl now) ─────────┐
seed  →  fetch pages  →  link graph  →  enrich  →  score
 │           │                │             │          │
robots    facts, links     depth, links   GSC, GA4,  link findings,
sitemaps  per page         in, link score rank, AI   page facts for decay
```

- A **crawl** reads the site once. The link graph and the decay reasons both read its rows.
- **Content Decay also runs between crawls:** the nightly Search Console sync updates its signals every day, and the page facts it needs come from the last crawl.

### 4.2 Page value

Every list in Audit is ordered by what's at stake on the page, so the first row is always the one worth fixing first.

```
value = 0.45 × pct(clicks 28d) + 0.20 × pct(impressions 28d) + 0.20 × pct(AI citations 30d)
      + 0.10 × pct(conversions 28d, GA4 key events) + 0.05 × pct(link score)
```

- `pct` is the page's percentile on its own site, from 0 to 1.
- A part with no data (no Search Console, no GA4) drops out and the other weights grow to fill its share.
- Pure function `pageValue` in `src/lib/audit/value.ts`, tested.
- Shown on every page row as a small bar with the clicks behind it on hover.

### 4.3 Search Console

Content Decay needs clicks by page by day, so the sync keeps a real history.

- **Connect:** add `https://www.googleapis.com/auth/webmasters.readonly` to the Google sign-in (`src/lib/google.ts`), asked only when someone clicks Connect Search Console (incremental consent). Tokens are sealed with the existing `seal` and `unseal`.
- **Property match:** list the person's properties (`sites.list`), pick the domain property for the brand's domain, else the best URL-prefix match, and show it to confirm. Reuse `gsc_connections` (068, fixed in 070) for the token.
- **Backfill:** 16 months on connect, by `page` and `date`, then by `page` and `query` for the top 1,000 pages by clicks. Large sites page through 25,000 rows at a time.
- **Nightly sync** (`gsc_sync`, the stub gets a body): the last 5 days, since Google's numbers settle in about 2 to 3 days. Rows for a day are replaced, never added, so a re-run can't double count.
- **URL Inspection,** only for decaying pages: up to 100 a day per property, so a decay reason can say "Google dropped this page from its index".

### 4.4 Without Search Console

Audit still works, with less. Every screen says what's missing and has a Connect button.

| Need | Fallback |
|---|---|
| Clicks by page | GA4 organic landing-page sessions, by day (stored nightly when GA4 is connected) |
| Position by page | `rank_checks` for keywords the brand tracks: the ranking URL and its position each day |
| Neither | DataForSEO Labs `relevant_pages` (estimated traffic per page), once a month, 10 tasks |

### 4.5 The crawler

A link crawler: it fetches pages and reads their links and facts. It runs no technical checks and no JavaScript rendering. Built as a chain of short jobs in the web worker, the shape that already works for the draft job.

- **Start (`audit_start`):** read settings and limits. Fetch robots.txt and every sitemap (index included, gzip included, up to 50,000 URLs each, with `lastmod`). Seed `audit_urls` with the home page, the sitemap URLs and the brand's top Search Console and GA4 pages.
- **Fetch (`audit_fetch`):** each job turn leases 40 URLs and fetches them for up to 90 seconds, then requeues. At most 2 requests a second per host by default (or `Crawl-delay`). Redirects followed one hop at a time up to 10, 20 s timeout, 5 MB body cap. HTML goes through `pageFacts`, grown to the fields in section 8. Links are saved to `audit_links`, and new internal URLs join the queue at depth + 1.
- **Retries:** timeouts, resets, 429 and 5xx retry twice (after 5 s, then 30 s). A 429 halves the speed for that host.
- **Stop rules:** the plan's page limit; 4 hours; URL spaces that never end (one path with more than 50 parameter sets, calendars, repeating path parts) are capped and left out of the graph.
- **Graph (`audit_graph`):** click depth by shortest path from the home page, links in, orphans, and link score (PageRank, damping 0.85, 20 rounds, links in the nav and footer counted once per page, shown on a log scale from 0 to 10).
- **Enrich:** join Search Console, GA4, rank checks and AI citations per page. Work out page value.
- **Score (`audit_score`):** run the link checks, write `audit_findings`, the link health score and the change since the last full crawl. Then queue `link_suggest`.
- **Summary:** one Claude call with the top findings and decaying pages, written as three short sentences for the Overview. If the call fails, the Overview shows the list without it.

**Identity.** User agent `ArrowsterrBot/3.0 (+https://arrowsterr.com/bot)`, with a page explaining the bot and how to slow or block it. robots.txt is respected for our bot. Two workspaces never crawl the same host at once; the second waits.

---

## 5. The Overview

- **Two scores,** each 0 to 100 with its change since the last full crawl and a line of the last 8: Link health and Content freshness.
- **Fix first:** the top 10 findings across both parts, ordered by `value × need`. Each row says what's wrong in one line, the clicks at stake, and its button.
- **Since the last crawl:** new orphans, pages that got links, pages added and pages gone, and pages that started or stopped decaying.
- **The summary** in three sentences.
- **Crawl facts:** when it crawled, pages read of pages found, how long it took, Crawl now.
- **Connections:** Search Console, GA4 and the CMS, each with its state and Connect.

---

## 6. Internal Linking Audit

### 6.1 The screen

- **Link health score** (6.3) with its parts below it.
- **Numbers:** pages crawled, average click depth, pages 4 or more clicks deep, orphans, pages with 1 link in, links to redirects or broken pages.
- **Opportunities** (the main list): one row per suggested link, grouped by the page that needs it. Each shows the target page and its value, the source page, the sentence the link goes in with the anchor highlighted, and why ("Both cover CRM pricing; the source page has 1,200 clicks"). Buttons: **Add**, **Add all for this page**, **Skip**.
- **Problems:** orphans, deep pages, starved pages (value in the top 20% with links in under the site median), pages with too many links out (over 150), nofollowed internal links, links to redirects or broken pages, generic anchors ("click here", "read more") and anchors that point the same words at different pages.
- **Clusters:** pages grouped by topic (the Opportunities clusters from `content_clusters` when the brand has them, else 6.2's groups). For each: the pillar, whether every page links to the pillar, whether the pillar links to every page, and Fix this cluster.
- **Map:** every page as a dot (up to 2,000), its folder as the angle and its click depth as the ring, colored by link score. Orphans sit outside the rings. Click a dot to open its page panel.

### 6.2 How suggestions are made

All rules in `src/lib/audit/links.ts`, pure and tested, except step 4.

1. **Targets:** pages that need links, ordered by `value × need`. Need is high for orphans, pages 4+ deep, starved pages, new posts under 30 days old, and pages in a cluster that the pillar doesn't link to.
2. **Topic match:** each page gets a term set from its title, H1, H2s and its top Search Console queries. Two pages match when they share at least 2 meaningful terms (two-word phrases count double; stop words and the brand's name are left out). Pages in the same cluster always match.
3. **Sources:** for each target, the 30 best-matching pages that are indexable, have value, don't already link to the target, and have fewer than 100 links out. A source with more clicks and link score passes more value, so it ranks higher.
4. **Anchors:** one Claude call per target with the target's terms and up to 10 source passages (the paragraphs that mention the target's terms). It returns, for each source, an anchor that already appears word for word in that paragraph, or "none". The model never writes new text. This is the method in `proposeLinks` (`plays.ts:212`), grown to use the crawl's data.
5. **Checks in code:** the anchor is in the paragraph; it sits outside headings, existing links, buttons and code (`addLink` rules); it's 2 to 8 words; it isn't a generic anchor; the same anchor doesn't already point elsewhere on the site; at most 3 new links per source page per run, and at most 1 per paragraph.
6. **Saved** to `audit_link_suggestions` with state (`open`, `added`, `skipped`, `stale`). A suggestion whose paragraph changed since the crawl turns `stale` and is checked again on the next run.

**Add** prepares a change set with `addLink` on the source page, opened in the side panel to approve, apply and undo, exactly like the old links play. On a site we can't write to, Add shows the paragraph with the link in place and the HTML to copy.

**Links to new posts.** When a draft is published, Audit suggests links **to** it from older pages (step 1 marks it new). Once both ship, the writer's `site_pages` tool can read the same term sets, so a new article links to the right pages from the start.

**Fixing bad links.** Links that hit a redirect get their `href` swapped to the final URL. Links to a page that's gone are removed, keeping their text. Both go through the same change sets.

### 6.3 Link health score

```
link health = 100 − 30 × share(valued pages 4+ deep)
                  − 25 × share(valued pages that are orphans)
                  − 20 × share(valued pages with 1 or fewer links in)
                  − 15 × share(internal links to redirects or broken pages)
                  − 10 × share(cluster pages missing the pillar link)
```

"Valued" means page value above zero. Every share is out of the pages it applies to. Clipped to 0 to 100. Partial crawls get no score (section 10).

### 6.4 Link checks

| Id | Severity | Rule |
|---|---|---|
| `orphan` | High if it has value, else Low | In a sitemap, Search Console or GA4, with no links in from crawled pages |
| `deep_valued` | Medium | Value in the top half and 4+ clicks deep |
| `starved` | Medium | Value in the top 20% and links in under the site median |
| `one_link_in` | Low | Exactly 1 link in |
| `too_many_out` | Low | Over 150 links out |
| `nofollow_internal` | Medium | `rel=nofollow` on an internal link |
| `links_to_redirect` | Medium | Internal links that hit a redirect |
| `links_to_broken` | High | Internal links that hit a 4xx or 5xx |
| `generic_anchor` | Low | "click here", "read more", "learn more", "here", "this" |
| `anchor_conflict` | Low | One anchor text pointing to 2 or more pages |
| `pillar_missing` | Medium | Cluster page that doesn't link to its pillar |
| `pillar_not_linking` | Low | Pillar that doesn't link to a page in its cluster |

---

## 7. Content Decay

### 7.1 The screen

- **Content freshness score:** the share of valued pages that aren't decaying, weighted by value.
- **Clicks lost:** the sum of clicks lost on decaying pages over the last 28 days against their peak, the number that makes the case.
- **The list:** one row per decaying page, ordered by clicks lost. Each row shows:
  - a small line of weekly clicks over 16 months, with the peak marked;
  - clicks, impressions and position now against the comparison period;
  - AI citations now against 4 weeks before;
  - the **reason** (7.3) in one line, for example "Rank slipped from 3 to 8 for 'crm for startups'. Two new pages in the top 5.";
  - the **action** (7.4): Refresh, Merge, Redirect, Fix the page, Add links, Rework intent, or Leave;
  - the button for that action.
- **Filters:** reason, action, cluster, "Arrowsterr-written", and the stage tag from the Content Plan.
- **Page panel:** the full chart with clicks, impressions and position, the queries that lost the most (from page and query data), the SERP now against when it peaked, the AI engines that stopped citing it, and the page's own facts from the crawl (word count, last modified, dated year in the title).
- **Watching:** pages that showed one week of decay go here first and move to the list if the second week agrees (7.2). Nothing on the main list is a one-week blip.
- **Done:** pages refreshed in the last 90 days, with clicks before and after the refresh, so the team sees what the work earned.

### 7.2 Finding decay

Runs nightly after the Search Console sync (`decay_check`), on every page with value. All rules in `src/lib/audit/decay.ts`, pure and tested on recorded data.

| Signal | Rule | Data |
|---|---|---|
| **Click decline** | Clicks over the last 28 days are 25% or more under the same page's best 28-day window of the last 12 months, and at least 40 clicks under it | Search Console by page and day |
| **Trend** | Three 28-day windows in a row, each lower than the one before | Same |
| **Rank slip** | Average position for the page's top 5 queries worse by 2.5 or more against 28 days before | Page and query data |
| **CTR drop** | Position steady (within 1) and impressions steady (within 15%), but CTR down 30% or more | Same, usually an AI Overview or a new SERP feature |
| **Impressions drop** | Impressions down 30% or more with position steady | Same, usually less demand or lost queries |
| **AI citation drop** | Citations in the brand's tracked AI answers down by half over 4 weeks against the 4 before, with 3 or more before | `answers` and their cited links |
| **Without Search Console** | The page's tracked keyword fell 3 or more spots and stayed there for 7 days | `rank_checks` |
| **Old year** | Title or H1 names a past year | The crawl |
| **Old page** | No update in 12 months and the page is in the Buy stage | The crawl's modified date, `docs.updated_at` |

**Noise guards:**

- **Two weeks to show:** a page needs the signal on two weekly checks in a row before it joins the list. Old year shows at once.
- **Seasonality:** with 13 months or more of data, the comparison uses the same 28 days a year ago too. A page that is down against its peak but up against last year is a seasonal page and goes to Watching with the tag "Seasonal".
- **Site-wide drops:** when the whole site's clicks fall 20% or more in the same window (a Google update, an outage, tracking broke), every page's decline is first measured against the site's. Only pages that fell more than the site join the list, and the Overview shows one banner for the site-wide drop.
- **Small pages:** pages with under 50 clicks in their best 28 days are left out of click rules. AI and old year rules still apply.
- **Data lag:** the last 3 days are never used, since Google's numbers aren't settled.

### 7.3 Finding the reason

For every page on the list, code finds the reason first. Claude only writes the sentence.

| Reason | How code knows |
|---|---|
| **Page broke** | The crawl shows the page now answers 4xx or 5xx, redirects, or is noindex; or URL Inspection says Google dropped it from the index |
| **Cannibalized** | Another page on the site now ranks for the page's top queries (page and query data) |
| **Outranked by newer pages** | The live SERP for the top query (DataForSEO, 20 tasks, 7-day cache) has pages in the top 5 that weren't there at the page's peak (from `rank_checks` history when tracked, else the SERP saved by an earlier decay check) |
| **SERP changed** | The CTR drop rule fired, and the live SERP shows an AI Overview, AI Mode, a video or a People Also Ask box above the page |
| **Intent shifted** | The top 5 now are a different kind of page (list against guide against tool against product), read from their titles and schema |
| **Out of date** | Old year, old page, or prices, versions or dates on the page that the newer top pages state differently |
| **Lost AI citations** | AI citation drop, with which engines stopped and which pages they cite now |
| **Lost internal links** | The page had more links in at its peak crawl than now (from the link graph) |
| **Less demand** | Impressions drop with position steady, and the top queries' search volume fell (DataForSEO, cached) |

A page can have more than one reason. They're listed by how much of the loss each explains, and the first one picks the action.

One Claude call per page (Haiku 5.5) turns the reasons and their numbers into one or two plain sentences for the row. It may only use the numbers it's given, and code checks every number in its answer against them.

### 7.4 The action

| Action | When | The button |
|---|---|---|
| **Fix the page** | Page broke | Shows what broke (status, redirect, noindex, dropped from the index) with the steps to fix it by hand |
| **Add links** | Lost internal links first | Opens Get links for the page (`docs/audit-features.md` L6) |
| **Merge** | Cannibalized, and the other page is stronger | Prepares a merge: a refresh of the stronger page folds in the weaker page's best parts, and a 301 from the weaker page (plugin on WordPress, steps elsewhere) |
| **Refresh** | Outranked, out of date, lost AI citations, or SERP changed | **Refresh** (7.5) |
| **Rework intent** | Intent shifted | Adds a planned piece to the Content Plan with the new format and links it to this page |
| **Redirect** | Less demand, under 20 clicks now, and a close page exists | Prepares the 301 to that page |
| **Leave** | Seasonal, or less demand with nothing better to do | Moves the page to Watching with a note |

People can change the action on any row. The choice is saved, and the next run respects it.

### 7.5 Refresh

Audit plans the refresh and sends it to the writer with one request (`RefreshRequest`, `docs/audit-features.md` D9). The writer is built in its own track. Until the Live Writer ships, the request runs the existing `writer_brief` and `writer_draft` jobs with the live page as a source.

1. **Refresh** opens the refresh plan, then hands it to the writer in refresh mode.
2. **The plan (Audit):** before anything is written, Audit lists what the refresh will change, each with its reason: "Update the 2025 prices", "Add a section on AI CRMs (4 of the top 5 cover it)", "Answer 'is HubSpot free' near the top (AI Overview asks it)". You can untick any line or add your own (`docs/audit-features.md` D8).
3. **Research (writer):** the live page is read first and kept as a source. Then the usual research: the top 10 now, People Also Ask, the AI Overview, the AI engines' answers.
4. **The rewrite (writer):** sections that need no change are kept word for word. Only the ticked changes are made. The title and meta description stay unless ticked. The URL never changes.
5. **Internal links:** the plan asks the writer to link to the page's cluster, and Audit queues suggestions to the refreshed page from older pages.
6. **Publish:** **Update** sends it to the same post.
   - A page Arrowsterr wrote: a new version of the same doc (`doc_versions`), pushed with the existing update path (`doc_publications`, `wpSync`).
   - A page someone else wrote on WordPress or Ghost: imported into a new doc on first refresh (new `importPost` in `src/lib/cmsImport.ts`: `getItem`, then the post's HTML turned into ProseMirror JSON), then written back with `writeItem`. The before copy is kept in the change set, so Undo puts the old page back.
   - Other CMSs: the same once phase 5's writers ship. Until then, Copy HTML.
7. **After:** the page goes to Done with its refresh date. Its chart marks the date, and 28 days later the row shows clicks before and after.

A refresh counts as one of the month's drafts (`draftsPerBrand`), the same as a new draft.

---

## 8. Data

One migration per phase, starting at `085`, each safe to run twice. Old tables stay unused for now and are dropped in a later migration once nothing reads them. `gsc_connections` and `gsc_inspections` are reused.

| Table | Columns |
|---|---|
| `audits` | id, workspace_id, brand_id, root, settings jsonb, status (`queued`, `fetching`, `scoring`, `done`, `partial`, `failed`), partial_reason, started_at, finished_at, heartbeat_at, pages_found, pages_done, scores jsonb (links, freshness), summary, previous_full_id, started_by |
| `audit_urls` | audit_id, url_hash, url, depth, found_from (`home`, `sitemap`, `link`, `gsc`, `ga4`), state (`queued`, `leased`, `done`, `skipped`, `error`), lease_until, tries. The crawl queue |
| `audit_pages` | audit_id, url_hash, url, final_url, status, redirect_chain jsonb, title, h1 text[], h2 text[], canonical, meta_robots, indexable, words, links_in, links_out, depth, link_score, in_sitemap, sitemap_lastmod, modified_at, published_at, terms text[], value, findings text[] (GIN index) |
| `audit_links` | audit_id, from_hash, to_hash, to_url, anchor, rel, place (`body`, `nav`, `footer`), status |
| `audit_findings` | audit_id, check_id, severity, pages, share, value_at_stake, pages_sample text[], change (`new`, `more`, `fewer`, `same`) |
| `audit_link_suggestions` | id, brand_id, audit_id, target_url, source_url, anchor, paragraph_hash, reason, score, state, change_set_id, created_at, decided_by, decided_at |
| `audit_link_rules` | brand_id, kind (`no_source`, `no_target`, `max_added`, `preferred_anchor`), pattern, target_url, value |
| `gsc_page_days` | brand_id, day, page_hash, page, clicks, impressions, ctr, position. 16 months kept. Primary key (brand_id, page_hash, day) |
| `gsc_page_queries` | brand_id, week, page_hash, query, clicks, impressions, position. Weekly, top 1,000 pages, 16 months |
| `ga4_landing_days` | brand_id, day, page_hash, page, sessions, key_events. Only when GA4 is connected and Search Console isn't |
| `decay_pages` | brand_id, page_hash, url, state (`watching`, `decaying`, `refreshing`, `done`, `left`), signals jsonb, reasons jsonb, action, action_by_person bool, sentence, peak_clicks, clicks_now, clicks_lost, first_seen, last_seen, weeks_seen, refreshed_at, doc_id |
| `decay_serps` | brand_id, query, day, top jsonb, features text[]. The SERP saved at each check, for "new in the top 5" |
| `audit_notes` | brand_id, day, page_hash (null for the whole site), text, kind (`person`, `refresh`, `link_added`, `google_update`) |

- Every table has row-level security by workspace role, like the rest of the schema. Viewers read; only the server writes, except `audit_link_rules`, `audit_notes` and `decay_pages.action`, which editors may change.
- **Kept:** the last 2 full crawls' `audit_pages` and `audit_links` per brand, plus `audit_findings` and scores for every crawl. The daily job deletes older page and link rows.
- **Size:** about 3 KB a page and 40 links a page at 100 bytes each, so a 2,000-page crawl is about 14 MB, and 2 crawls are about 28 MB a site.

---

## 9. Jobs, schedule and alerts

| Job | Started by | Key | At once | Notes |
|---|---|---|---|---|
| `audit_start` | Crawl now, weekly schedule | brand + week, or audit id for Crawl now | 1 per brand, 1 per host across workspaces | Replaces the `audit` stub |
| `audit_fetch` | `audit_start`, then itself | audit id + turn | 1 per audit | 90 s turns, requeues itself |
| `audit_graph` | Fetch done | audit id | 1 | Depth, links in, link score, orphans |
| `audit_score` | `audit_graph` | audit id | 1 | Link checks, scores, summary |
| `link_suggest` | `audit_score`, a publish, Get links, Fix this cluster | brand + target set | 2 per workspace | Section 6.2 |
| `gsc_sync` | Nightly, connect (backfill) | brand + day | 4 overall | Replaces the stub |
| `decay_check` | After `gsc_sync`, weekly without Search Console | brand + day | 4 overall | Sections 7.2 to 7.4 |

- The `link_check` and `cwv_sync` stubs are removed from `JobKind` and `HANDLERS`.
- **Weekly crawl:** each brand crawls a week after its last full crawl, spread across the day by brand id (the `startMinute` idea from rank tracking). Brands start weekly crawls only after their first crawl. Editors can turn it off.
- **Heartbeat:** every `audit_fetch` turn writes `audits.heartbeat_at`. A crawl with no heartbeat for 20 minutes is resumed by the next job. After 3 resumes, it's marked failed and keeps what it read.
- **Alerts,** through `emailAlert` to people with alerts on, at most one email per brand per day:
  - link health drops 5 or more points against the last full crawl;
  - a page with value starts answering 4xx or 5xx (it will decay next);
  - 3 or more pages join the decay list in one week, with the clicks at stake.
- **Webhooks and Slack:** `audit.done`, `audit.alert` and `decay.new` through the existing `dispatch` in `integrations.ts`.

---

## 10. Reliability

A false alarm costs more than a missing finding. These are part of each phase's definition of done.

1. **Partial crawls get no score and no alert:** the home page didn't load, over half the pages didn't answer, or the crawl hit its time cap before half the pages it found. The screen says which.
2. **A firewall that blocks our bot stops the crawl** with "Your firewall blocked our crawler" and the allow-list steps. It never reports hundreds of fake broken pages.
3. **Errors retry first.** A page that fails once and loads on the retry is fine.
4. **Unknown is never broken.** A link to a page we didn't fetch is "Not checked". Orphans are only pages we know exist from a sitemap, Search Console or GA4.
5. **Links in the nav and footer count once per page,** so a site's menu never makes every page look well linked.
6. **One URL cleaner everywhere** (`normUrl`, tested): lowercase host, no default port, no fragment, sorted query, tracking parameters dropped (`utm_*`, `gclid`, `fbclid`, `msclkid`), trailing slash kept as is. CMS pages match with or without www, a trailing slash or different case.
7. **Search Console rows are replaced by day,** never added, so a re-sync can't double count. The last 3 days are never used for decay.
8. **Decay needs two weeks** and survives the seasonal and site-wide guards (7.2) before it shows.
9. **The model never decides facts.** Link anchors must already be in the paragraph. Decay sentences may only use numbers code gave them. Both are checked in code.
10. **Every change is undoable.** Every write keeps a before copy, and Undo refuses a page someone edited since (the existing `undoSet` rule).
11. **Queue rows are leased** for 2 minutes. A dead worker's rows come back.

**Tests:**

- `tests/auditCrawl.test.ts`: a local 300-page test site with redirects, loops, an endless calendar, slow pages, robots rules, sitemaps and an orphan. The crawl finds exactly the expected pages, depths, links in and orphans, and gives the same result when split across many short jobs or killed and resumed.
- `tests/auditLinks.test.ts`: every suggestion's anchor is in its paragraph and outside headings and links; no page gets more than 3; a changed paragraph turns the suggestion stale; nav links count once.
- `tests/decay.test.ts` on recorded Search Console data: a seasonal page goes to Watching; a site-wide drop shows one banner and only pages that fell further; a one-week dip never shows; a real two-week slide shows the next day; cannibalization finds the other page.
- `tests/gscSync.test.ts`: syncing the same day twice leaves the same rows.

---

## 11. Plan limits

Crawling uses no paid API, so crawls inside the limit take no tasks.

| | Free | Starter (Organic) | Pro | Agency | Enterprise |
|---|---|---|---|---|---|
| Pages per crawl | 100 | 2,000 | 10,000 | 50,000 | custom |
| Crawls | Monthly | Weekly | Weekly | Weekly, daily for 2 sites | Daily |
| Search Console | 1 property | Yes | Yes | Yes | Yes |
| Internal link suggestions | Top 10 shown | All | All | All | All |
| Add links for you | – | 50 a month | 500 a month | 2,000 a month | custom |
| Content Decay | List only | List and reasons | All | All | All |
| Refresh a decaying page | – | – | Counts as a draft | Counts as a draft | Counts as a draft |
| Extra pages | – | 1 task per 50 pages | same | same | contract |

| Job | Tasks |
|---|---|
| Crawl inside the limit | 0 |
| Live SERP for a decay reason (7-day cache) | 20 |
| Link suggestions run (per 50 targets) | 15 |
| Add a link (per page changed) | 3, as the links play today |
| Decay sentences | 0 (Haiku, about $0.0005 a page) |
| Estimated traffic per page without Search Console | 10 a month |

---

## 12. Phases

Estimates are for one engineer who knows the codebase. Each phase ships behind the `seo` toolset and works on its own.

| Phase | Weeks | What ships | Done when |
|---|---|---|---|
| 1. Link crawler and Audit home | 2.5 | `audits` tables, the crawl jobs, the link graph, the Pages sheet, the page panel, the sidebar group, the Overview shell, the old addresses forwarding | A crawl of the 300-page test site gives exactly the expected pages, depths and links in, and survives a kill |
| 2. Search Console | 1.5 | Connect, property match, backfill, nightly sync, page value | A connected brand has 16 months of page and day rows, and re-syncing a day changes nothing |
| 3. Internal Linking | 2 | Link health, problems lists, suggestions, Add and Add all, Get links, fixing bad links | On a test site, every suggestion's anchor is already in its paragraph, and Add puts the link in the live post with Undo |
| 4. Content Decay | 2.5 | Signals, guards, reasons, actions, the screen, the refresh plan and hand-off, Done with before and after | On recorded data from 3 real sites, every page on the list held for two weeks, and a refresh updates the live WordPress post with Undo |
| 5. Reach and polish | 1 | Link and update writers for Webflow, Shopify and HubSpot; alerts and webhooks; Zippie and MCP tools | A link applies and undoes on each of those three CMSs, and Zippie answers "what should I fix first?" from the audit |

About 9.5 weeks in all. Phase 4's Refresh works with today's writer and moves to the Live Writer when that track ships, with no change on the Audit side. `docs/audit-features.md` section 4 has the v1 order by feature.

**Zippie and MCP get:** `get_audit` (scores and top fixes), `get_link_suggestions`, `get_decaying_pages` (with reasons and actions), and for editors `start_audit` and `add_links` (a change set, approved in the app as today).

---

## 13. Running cost

**Assumptions:** about 2 sites per team, 2,000 pages a site, crawled weekly: about 16,000 page loads per team a month. About 20 decaying pages a site a month need a reason. Claude Sonnet 5.5 at $2 in and $10 out per million tokens, Haiku 5.5 at $0.10 and $0.50 (check). DataForSEO SERP at about $0.003 (check).

| Line | Beta (50 teams, 100 sites) | Growth (500 teams, 1,000 sites) |
|---|---|---|
| Crawl compute: plain fetches, no rendering (fits the current VPS at Beta; one size up at Growth, check) | ~$5 | ~$20 |
| Database storage (about 28 MB a site for 2 crawls, plus Search Console rows at about 30 MB a site for 16 months) | ~6 GB, VPS disk: $0 | ~58 GB, bigger disk and backups: ~$10 (check) |
| Overview summaries (Sonnet, ~$0.02 a crawl, 4 a site a month) | ~$8 | ~$80 |
| Link suggestion anchors (Sonnet, ~$0.10 a site a month) | ~$10 | ~$100 |
| Decay SERPs (DataForSEO, 20 a site a month, cached 7 days) | ~$6 | ~$60 |
| Decay sentences (Haiku, 20 a site a month) | ~$1 | ~$10 |
| Estimated traffic without Search Console (DataForSEO Labs, ~$0.04, about 1 site in 4) | ~$1 | ~$10 |
| Search Console API, URL Inspection | $0 | $0 |
| Alert emails (inside Resend's current plan, check) | $0 | ~$20 (next tier, check) |
| Refreshes | in the draft count | in the draft count |
| **Monthly total added** | **~$31** | **~$310** |

With some headroom for heavier sites (Agency teams with 50,000-page crawls), budget **about $45 at Beta and $400 at Growth**. The searches and anchors use plan tasks, so heavy use is paid for by the plan it runs on.

---

## 14. Open questions

1. **Competitor links.** Crawling a rival's top pages could show how they link their clusters, and sharpen the "outranked" reason. Worth a later phase?
2. **Merge on non-WordPress sites.** Redirects need the CMS's own redirect feature. Shopify and Webflow have one; HubSpot does too (check). Which comes first depends on connection counts.
3. **Free plan Search Console.** It costs us nothing and makes the free decay list real. Recommended: yes, 1 property.

---

## Sources

- [Search Console API: Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Search Console URL Inspection API](https://developers.google.com/search/blog/2022/01/url-inspection-api)
- [Frase: content decay, detect and fix ranking drops](https://www.frase.io/blog/content-decay-how-to-fix-ranking-drops-automatically)
- [Rankability: detecting content decay](https://help.rankability.com/track/detecting-content-decay)
- [Wellows content decay tool](https://wellows.com/tools/content-decay/)
- [Semrush: internal linking mistakes](https://www.semrush.com/blog/internal-linking-mistakes/)
- [Ahrefs internal links guide (Miniloop)](https://www.miniloop.ai/blog/ahrefs-internal-links-guide)
- [Best internal linking tools for 2026 (LinkStorm)](https://linkstorm.io/resources/best-internal-linking-tools-for-seo)
