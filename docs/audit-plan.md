# Audit: the plan

Audit tells a brand what is holding its site back, in three parts that share one crawl:

- **Technical Audit:** can Google and AI crawlers find, fetch, render and trust every page?
- **Internal Linking Audit:** do the pages that matter get the links they need, and which links should we add?
- **Content Decay:** which pages are losing clicks, rank or AI citations, why, and what to do about each one?

Every finding ends in a button that does the fix: a change set in the brand's CMS, a link added for you, or a refresh written by the Live Writer (`docs/live-writer-plan.md`).

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page. Learns from the Technical SEO toolset we built and removed this month (`docs/archive/technical-seo-plan.md`, `site-audit.md`, `site-structure.md`, `onpage-audit.md`, `content-map.md`) and from the Refresh idea in `docs/content-v3-backend.md` (section 7). That toolset had eight screens. Audit has one home with three tabs, and every finding leads to a fix.

---

## 1. Summary

| Part | Answers | Main data |
|---|---|---|
| Overview | What should we fix first, across all three? | All of the below, ranked by page value |
| Technical Audit | What's broken, blocked or hidden, and on which pages? | Our crawl, Chromium renders, robots.txt, sitemaps, Search Console, PageSpeed |
| Internal Linking | Which pages are orphans, too deep or starved of links, and which links fix that? | The crawl's link graph, page value, topic match |
| Content Decay | Which pages are fading, why, and which to refresh, merge or leave? | Search Console by page and day, rank checks, AI citations, GA4, the live SERP |

**Why it matters for Arrowsterr:** customers buy us to show up in Google and in AI answers. A page AI bots can't fetch can't be cited. A page with no links in is hard to find. A page that's losing clicks is losing citations next. Audit closes the loop: Opportunities finds what to write, Drafts writes it, Audit keeps what's live healthy.

**How long:** about 12 weeks for one engineer, in six phases that each ship on their own (section 13).

**What it costs to run:** about **$55 a month at Beta (50 teams)** and **$480 at Growth (500 teams)** (section 14).

---

## 2. What we have today

From the code (November 2026):

- **No crawler.** The old crawler is gone. The `audit`, `onpage`, `link_check`, `gsc_sync` and `cwv_sync` handlers in `src/lib/worker/handlers.ts` are stubs that only call `finish`. They're still listed in `JobKind` (`src/lib/jobs.ts:6`) and `HANDLERS` (`src/app/api/worker/route.ts:17`).
- **Old tables stay, unused:** `site_audits`, `crawl_queue`, `crawl_pages`, `onpage_audits`, `content_maps`, `gsc_connections`, `gsc_daily`, `gsc_pages`, `gsc_inspections`, `gsc_sitemaps`, `cwv_origin`, `cwv_urls`. `gsc_pages` only held this period against the last one, so there is no per-page history anywhere.
- **No Search Console.** `src/lib/google.ts:8` asks for `analytics.readonly` only.
- **GA4 is live, read on demand:** `ga4Traffic` (`src/lib/ga4.ts:37`) returns landing pages and page views for two periods. It's cached in memory for 10 minutes and never stored.
- **Rank tracking is live:** `rank_checks` holds a daily position and the ranking URL for every tracked keyword (`supabase/083_rank_tracker.sql`).
- **AI citations are live:** every tracked prompt's answers and cited links.
- **Parts we can reuse, all tested and in use:**

| Part | File | Use in Audit |
|---|---|---|
| Safe fetch with redirect chain, timing, byte cap, private IP block | `safeFetch.ts`, `netCheck.ts` | Every crawl fetch |
| robots.txt parser (RFC 9309, Google rules) | `robotsTest.ts` | Crawl rules and AI access checks |
| AI crawler list and robots verdicts | `freeChecks.ts` (`AI_CRAWLERS`, `robotsVerdicts`) | AI access |
| Page facts with Readability and cheerio | `pageFacts.ts`, `pageMeta.ts`, `pageText.ts` | Each page's title, headings, words, schema, author, dates |
| Title and description rules | `metaRules.ts` | Meta checks |
| Schema builder and checker | `schemaGen.ts` | Structured data checks and fixes |
| Sitemap finder | `sitemap.ts` (`findPages`) | Seeds the crawl (grows to read `lastmod` and drop the 3,000 cap) |
| Chromium page reader and screenshots | `scripts/worker.mjs` (`readPage`, `screenshot`) | The render pass |
| String edits that keep WordPress blocks whole | `htmlEdit.ts` (`addLink`, `linksIn`, `setAlts`) | Link and alt fixes |
| List, read and write live posts | `cmsEdit.ts` (`listItems`, `getItem`, `writeItem`): WordPress and Ghost | Applying fixes |
| Change sets with approve, apply, undo | `plays.ts`, `change_sets`, `changes` | Every fix |
| Job queue with leases, retries and waits | `016_queue.sql`, `jobs.ts` | The crawl as a chain of short jobs |
| Tasks, toolsets and refunds | `entitlements.ts` (`take`, `requireTrack`), `meter.ts` | Limits and charges |
| Alert emails | `notify.ts` (`emailAlert`) | Score drops and decay alerts |

---

## 3. Where it lives

A new sidebar group, **Audit**, between Visibility and Plan & Create (`NAV` in `src/components/App.tsx:1107`).

| Page | Address | Shows |
|---|---|---|
| Overview | `/audit` | The three scores, the top 10 fixes across all parts, the last crawl, Crawl now |
| Technical | `/audit/technical` | Section 6 |
| Internal links | `/audit/links` | Section 7 |
| Content decay | `/audit/decay` | Section 8 |
| Pages | `/audit/pages` | Every crawled URL in a sheet, with every fact as a column |

- Old addresses forward: `/site-audit`, `/technical-seo`, `/site-structure` and `/onpage-audit` open `/audit/technical`; `/content-map` opens `/audit/links`; `/publish/refresh` opens `/audit/decay` (`ALIASES` in `App.tsx:130`).
- Audit opens with the Organic Research toolset (`requireTrack(ws, "seo")`), the same as Research.
- Each brand has one audit home. The brand switcher at the top picks it, as on every other screen.

---

## 4. The shared foundation

### 4.1 One crawl feeds all three

```
            ┌──────────── crawl (weekly, or Crawl now) ────────────┐
seed  →  fetch pages  →  render sample  →  link graph  →  enrich  →  score
 │           │                 │               │             │          │
robots    facts, links     rendered facts   depth, links   GSC, GA4,  technical issues,
sitemaps  per page         per page         in, link score rank, AI   link findings,
                                                                     decay signals
```

- A **crawl** reads the site once. The Technical Audit, the link graph and the decay signals all read its rows. Nothing crawls twice.
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

### 4.3 Search Console, done properly this time

Content Decay needs clicks by page by day, so the sync keeps a real history.

- **Connect:** add `https://www.googleapis.com/auth/webmasters.readonly` to the Google sign-in (`src/lib/google.ts`), asked only when someone clicks Connect Search Console (incremental consent). Tokens are sealed with the existing `seal` and `unseal`.
- **Property match:** list the person's properties (`sites.list`), pick the domain property for the brand's domain, else the best URL-prefix match, and show it to confirm. Reuse `gsc_connections` (068, fixed in 070) for the token.
- **Backfill:** 16 months on connect, by `page` and `date`, then by `page` and `query` for the top 1,000 pages by clicks. Large sites page through 25,000 rows at a time.
- **Nightly sync** (`gsc_sync`, the stub gets a body): the last 5 days, since Google's numbers settle in about 2 to 3 days. Rows for a day are replaced, never added, so a re-run can't double count.
- **URL Inspection:** up to 500 a day per property (Google allows 2,000, shared with the customer's other tools), for the top pages by value, pages with new indexing issues, and pages a fix just changed.
- **Sitemaps:** `sitemaps.list` once a day for submitted and indexed counts and errors.
- **What the API can't do:** there is no API for the Page indexing report, so index counts come from inspected pages and are labeled "of pages inspected".

### 4.4 Without Search Console

Audit still works, with less. Every screen says what's missing and has a Connect button.

| Need | Fallback |
|---|---|
| Clicks by page | GA4 organic landing-page sessions, by day (stored nightly when GA4 is connected) |
| Position by page | `rank_checks` for keywords the brand tracks: the ranking URL and its position each day |
| Neither | DataForSEO Labs `relevant_pages` (estimated traffic per page), once a month, 10 tasks |
| Indexing | Our own indexability rules only, labeled "from our crawl" |

### 4.5 The crawler

Rebuilt as a chain of short jobs in the web worker, the shape that already works for the draft job.

- **Start (`audit_start`):** read settings and limits. Fetch robots.txt (for our bot and every bot in `AI_CRAWLERS`), llms.txt, and every sitemap (index included, gzip included, up to 50,000 URLs each, with `lastmod`). Seed `audit_urls` with the home page, the sitemap URLs and the brand's top Search Console pages.
- **Fetch (`audit_fetch`):** each job turn leases 40 URLs and fetches them for up to 90 seconds, then requeues. At most 2 requests a second per host by default (or `Crawl-delay`). Redirects followed one hop at a time up to 10, 20 s timeout, 5 MB body cap. HTML goes through `pageFacts` grown to every field in section 9. Links are saved to `audit_links`, and new internal URLs join the queue at depth + 1.
- **Retries:** timeouts, resets, 429 and 5xx retry twice (after 5 s, then 30 s). A 429 halves the speed for that host. After retries, the error stays as a finding.
- **Stop rules:** the plan's page limit; 4 hours; URL spaces that never end (one path with more than 50 parameter sets, calendars, repeating path parts) are capped and flagged.
- **Render (`audit_render`):** the worker's Chromium (`scripts/worker.mjs`) gets a new loop that leases pages from `/api/audit/render-next`, renders them on a phone screen (412 by 915), waits for the network to settle (up to 10 s), and posts the rendered facts and links to `/api/audit/render-done`. A phone screenshot of the first page of each template is kept 30 days.
- **Graph (`audit_graph`):** click depth by shortest path from the home page, links in, orphans, and link score (PageRank, damping 0.85, 20 rounds, links in the nav and footer counted once per page, shown on a log scale from 0 to 10).
- **Enrich:** join Search Console, GA4, rank checks and AI citations per page. Work out page value.
- **Score (`audit_score`):** run every check, write `audit_issues`, the three scores and the change since the last full crawl.
- **Summary:** one Claude call with the top issues, their counts, their change and their page values, written as three short sentences for the Overview. If the call fails, the Overview shows the list without it.
- **Notify:** "Crawl done" for someone who clicked Crawl now, and the drop alert (section 10).

**Templates.** Pages that share a layout are fixed together. URL patterns first (`/blog/*`, `/products/*`), then a fingerprint of the page's outline for groups over 500 or under 3 pages. Names come from schema types or URL words ("Blog post", "Product"). People can rename and merge them, saved per site.

**Identity.** User agent `ArrowsterrBot/3.0 (+https://arrowsterr.com/bot)`, with a page explaining the bot and how to slow or block it. robots.txt is respected for our bot. A brand with a connected CMS or Search Console can turn on "Crawl pages robots.txt hides from us". Two workspaces never crawl the same host at once; the second waits.

---

## 5. The Overview

- **Three scores,** each 0 to 100 with its change since the last full crawl and a line of the last 8: Technical health, Link health, Content freshness.
- **Fix first:** the top 10 findings across all three parts, ordered by `value × severity`. Each row says what's wrong in one line, how many pages, the clicks at stake, and its fix button.
- **Since the last crawl:** new issues, fixed issues, pages added and pages gone.
- **The summary** in three sentences.
- **Crawl facts:** when it crawled, pages read of pages found, how long it took, Crawl now.
- **Connections:** Search Console, GA4 and the CMS, each with its state and Connect.

---

## 6. Technical Audit

### 6.1 The screen

- **Health score** as a half dial with the area scores beneath it: Crawlability, Indexability, Rendering, On-page, Speed, Structured data, Security, International, AI access.
- **Issues** grouped by Error, Warning and Notice. Each row: the check's name, a bar for the share of pages it hits, the clicks at stake, the change since the last crawl (New, more, fewer), and Fix when we can fix it.
- **Opening an issue** shows why it matters in two lines, how to fix it by hand, and every page it hits with page value, template and the fact that failed. Pages can be grouped by template.
- **Filters:** area, severity, template, New only, Has a fix, Pages with clicks.
- **Page panel:** open any URL to see every fact from the crawl, raw against rendered side by side, its issues, its links in and out, its Search Console line, its indexing state from URL Inspection, and its screenshot.
- **Export:** CSV of any issue's pages, and the whole audit in the PDF report (`src/lib/pdf`).

### 6.2 Health score

```
health = 100 × (1 − Σ weight(issue) × share(issue)) clipped to 0..100
weight: Error 15, Warning 7, Notice 2, divided by the sum over all checks that ran
share:  pages failing ÷ pages the check applies to, weighted by page value
```

- A check counts only on pages where it applies. A noindex page that's meant to be hidden (kept out of the sitemaps and the navigation) skips the indexability checks.
- Weighting by page value means one broken page with 5,000 clicks hurts more than 50 broken tag pages with none.
- Partial crawls get no score (section 11).

### 6.3 Checks

Each check has an id, area, severity, rule, data source, a fix by hand, and a play when we can make the change. Sources: **C** crawl, **R** render, **G** Search Console, **P** PageSpeed or CrUX, **A** AI answers we track. All rules live in `src/lib/audit/checks.ts`, pure and tested with HTML fixtures.

**Crawlability**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `http_4xx` | Error | Internal page answers 4xx | C | Redirect or fix links |
| `http_5xx` | Error | Internal page answers 5xx after retries | C | Server |
| `redirect_chain` | Warning | 2 or more hops to the final page | C | Point to the end |
| `redirect_loop` | Error | Redirects never end | C | Server |
| `redirect_temp` | Notice | 302 or 307 that's been there for 2 crawls | C | Make it 301 |
| `links_to_redirect` | Warning | Internal links that hit a redirect | C | Play: update links |
| `links_to_broken` | Error | Internal links that hit a 4xx or 5xx | C | Play: update links |
| `ext_broken` | Notice | Outbound links that answer 404 or 410 (401, 403 and 429 are bots refused, never broken) | C | Edit the link |
| `robots_blocks_page` | Error | robots.txt blocks a page that's in the sitemap or has clicks | C, G | Edit robots.txt |
| `robots_5xx` | Error | robots.txt answers 5xx (Google stops crawling) | C | Server |
| `infinite_space` | Warning | A path with endless parameter sets or calendar pages | C | Block in robots.txt or nofollow |
| `slow_ttfb` | Warning | Server answers in over 800 ms on 3 or more tries | C | Hosting, cache |
| `deep_page` | Warning | More than 3 clicks from the home page and has value | C | See Internal links |

**Indexability**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `noindex_valued` | Error | noindex on a page in the sitemap or with clicks in the last 90 days | C, G | Play: remove noindex |
| `canonical_other` | Warning | Canonical points to another page that isn't a near copy | C | Play: set canonical |
| `canonical_broken` | Error | Canonical points to a 3xx, 4xx or noindex page | C | Play: set canonical |
| `canonical_missing` | Notice | No canonical on an indexable page | C | Play: set canonical |
| `google_canonical_differs` | Warning | Google chose a different canonical than the page asks for | G | Merge or tell them apart |
| `duplicate_title` | Warning | Same title on 2 or more indexable pages | C | Play: titles |
| `duplicate_content` | Warning | Main text over 90% the same as another page | C | Merge or canonical |
| `thin_content` | Notice | Under 200 words of main text on an indexable page that isn't a tool or a form | C | Grow or noindex |
| `soft_404` | Warning | 200 status with "not found" text, or Google calls it a soft 404 | C, G | Return 404 |
| `not_indexed` | Error | URL Inspection: crawled or discovered, not indexed, on a page with value | G | Depends on the reason, shown |
| `sitemap_bad_url` | Warning | Sitemap lists a URL that redirects, 404s or is noindex | C | Fix the sitemap |
| `sitemap_missing_url` | Notice | Indexable page with value that no sitemap lists | C | Add to the sitemap |
| `sitemap_stale_lastmod` | Notice | `lastmod` older than the page's own modified date | C | Fix the sitemap |
| `sitemap_not_in_robots` | Notice | robots.txt has no Sitemap line | C | Add it |

**Rendering**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `js_only_text` | Error | Over 50% of main text shows only after JavaScript (AI crawlers mostly don't run it) | C, R | Render on the server |
| `js_only_links` | Warning | Internal links that exist only after JavaScript | C, R | Plain `<a href>` links |
| `js_changes_robots` | Error | JavaScript changes the robots tag | C, R | Set it in the HTML |
| `js_changes_canonical` | Warning | JavaScript changes the canonical | C, R | Set it in the HTML |
| `js_only_schema` | Notice | Structured data added only by JavaScript | C, R | Put it in the HTML |
| `blocked_resources` | Warning | robots.txt blocks scripts or styles the page needs | C, R | Edit robots.txt |
| `js_errors` | Notice | JavaScript errors on load | R | Code |

**On-page**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `title_missing` | Error | No title | C | Play: titles |
| `title_length` | Notice | Outside 30 to 60 characters (`metaRules.ts`) | C | Play: titles |
| `desc_missing` | Warning | No meta description | C | Play: meta |
| `desc_length` | Notice | Outside 120 to 160 characters | C | Play: meta |
| `h1_missing` | Warning | No H1 | C | Edit the page |
| `h1_many` | Notice | More than one H1 | C | Edit the page |
| `img_no_alt` | Notice | Images with no alt text | C | Play: alt |
| `img_heavy` | Notice | Image over 300 KB | C | Compress |
| `no_date` | Notice | Article with no published or updated date shown | C | Show dates |
| `no_author` | Notice | Article with no named author | C | Add a byline |

**Speed (Core Web Vitals)**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `lcp_poor` | Warning | Field LCP over 2.5 s at p75 (CrUX), else lab LCP over 4 s | P | Shown per cause |
| `inp_poor` | Warning | Field INP over 200 ms at p75 | P | Shown per cause |
| `cls_poor` | Warning | Field CLS over 0.1 at p75 | P | Shown per cause |
| `no_viewport` | Error | No viewport meta | C | Add it |

PageSpeed Insights runs on 3 pages per template per crawl, phone first. CrUX gives field data for the origin and the top 200 pages by value. Both use one key on our side (`GOOGLE_API_KEY`), so customers set nothing up. Without data, these checks show "Not measured".

**Structured data**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `schema_invalid` | Warning | JSON-LD that doesn't parse | C | Play: schema |
| `schema_required` | Warning | Missing required fields for its type (`checkSchema`) | C | Play: schema |
| `schema_mismatch` | Notice | FAQ or Product data that disagrees with the visible page | C | Play: schema |
| `schema_missing_article` | Notice | Blog post with no Article schema | C | Play: schema |
| `org_schema_missing` | Notice | Home page with no Organization schema | C | Play: schema |

**Security**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `http_live` | Error | `http://` pages answer 200 with no redirect to https | C | Redirect |
| `mixed_content` | Warning | https page loads http files | C | Fix the file links |
| `two_hosts` | Warning | Both www and the bare domain answer 200 | C | Redirect one |
| `no_hsts` | Notice | No Strict-Transport-Security header | C | Server |

**International**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `hreflang_no_return` | Warning | hreflang to a page that doesn't link back | C | Add the return tag |
| `hreflang_bad_code` | Warning | Unknown language or country code | C | Fix the code |
| `hreflang_vs_canonical` | Warning | hreflang points to a page whose canonical is elsewhere | C | Point to canonicals |

**AI access**

| Id | Severity | Rule | Source | Fix |
|---|---|---|---|---|
| `ai_bot_blocked` | Error | robots.txt blocks GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot or Google-Extended on pages with value (`robotsVerdicts`) | C | Edit robots.txt, or the plugin writes it |
| `ai_firewall` | Error | A bot user agent gets a challenge or 403 where a browser gets 200, twice a minute apart | C | Allow-list steps per CDN |
| `ai_js_only` | Error | `js_only_text` on a page AI answers cite, or a rival's page they cite for our prompts | C, R, A | Render on the server |
| `ai_cited_broken` | Error | A page AI answers cite answers 4xx or 5xx | C, A | Redirect |
| `no_llms_txt` | Notice | No llms.txt | C | Plugin writes it, or `buildLlmsTxt` makes one to copy |
| `no_indexnow` | Notice | No IndexNow key file (Bing feeds ChatGPT search) | C | Plugin turns it on |

That's 66 checks. A check that lacks its data shows "Not checked" and never counts.

### 6.4 Fixes

The Fix pattern stays from the old toolset: a change set for exactly the pages an issue lists, opened in a side panel to approve, apply and undo (`plays.ts`), then a recrawl of those pages within 5 minutes.

| Fix | How | CMS |
|---|---|---|
| Titles, descriptions, alt text, structured data | Existing plays | WordPress (meta and schema need the connector plugin), Ghost |
| Remove noindex, set canonical | The connector plugin's `arrowsterr` REST field writes the Yoast, Rank Math, AIOSEO or SEOPress field | WordPress |
| Update links that hit redirects or 404s | `htmlEdit.ts` swaps the `href`, `writeItem` saves | WordPress, Ghost |
| Redirects for 404s with clicks or backlinks | Plugin writes to Redirection or Rank Math | WordPress |
| robots.txt for AI bots, llms.txt, IndexNow | Plugin endpoints (`/llms`, `/indexnow`), plus a new `/robots` | WordPress |
| Anything else | The steps to do it by hand, the pages as CSV | Every site |

**Grow the fix list beyond WordPress and Ghost** in phase 6: Webflow items (Data API v2 `PATCH` on the item's rich text and SEO fields), Shopify articles and pages (GraphQL `articleUpdate`, `pageUpdate`) and HubSpot blog posts. `cmsEdit.ts` gets `listItems`, `getItem` and `writeItem` for each.

After a fix: recrawl the changed pages, ping IndexNow, and queue URL Inspection for them the next day, so the row reads "Fixed. Google saw it on Nov 20."

---

## 7. Internal Linking Audit

### 7.1 The screen

- **Link health score** (7.3) with its parts below it.
- **Numbers:** pages crawled, average click depth, pages 4 or more clicks deep, orphans, pages with 1 link in, links to redirects or broken pages.
- **Opportunities** (the main list): one row per suggested link, grouped by the page that needs it. Each shows the target page and its value, the source page, the sentence the link goes in with the anchor highlighted, and why ("Both cover CRM pricing; the source page has 1,200 clicks"). Buttons: **Add**, **Add all for this page**, **Skip**.
- **Problems:** orphans, deep pages, starved pages (value in the top 20% with links in under the site median), pages with too many links out (over 150), nofollowed internal links, generic anchors ("click here", "read more") and anchors that point the same words at different pages.
- **Clusters:** pages grouped by topic (the Opportunities clusters from `content_clusters` when the brand has them, else 7.2's groups). For each: the pillar, whether every page links to the pillar, whether the pillar links to every page, and Fix this cluster.
- **Map:** every page as a dot (up to 2,000), its folder as the angle and its click depth as the ring, colored by link score. Orphans sit outside the rings. Click a dot to open its page panel.

### 7.2 How suggestions are made

All rules in `src/lib/audit/links.ts`, pure and tested, except step 4.

1. **Targets:** pages that need links, ordered by `value × need`. Need is high for orphans, pages 4+ deep, starved pages, new posts under 30 days old, and pages in a cluster that the pillar doesn't link to.
2. **Topic match:** each page gets a term set from its title, H1, H2s and its top Search Console queries. Two pages match when they share at least 2 meaningful terms (two-word phrases count double; stop words and the brand's name are left out). Pages in the same cluster always match.
3. **Sources:** for each target, the 30 best-matching pages that are indexable, have value, don't already link to the target, and have fewer than 100 links out. A source with more clicks and link score passes more value, so it ranks higher.
4. **Anchors:** one Claude call per target with the target's terms and up to 10 source passages (the paragraphs that mention the target's terms). It returns, for each source, an anchor that already appears word for word in that paragraph, or "none". The model never writes new text. This is the method in `proposeLinks` (`plays.ts:212`), grown to use the crawl's data.
5. **Checks in code:** the anchor is in the paragraph; it sits outside headings, existing links, buttons and code (`addLink` rules); it's 2 to 8 words; it isn't a generic anchor; the same anchor doesn't already point elsewhere on the site; at most 3 new links per source page per run, and at most 1 per paragraph.
6. **Saved** to `audit_link_suggestions` with state (`open`, `added`, `skipped`, `stale`). A suggestion whose paragraph changed since the crawl turns `stale` and is checked again on the next run.

**Add** prepares a change set with `addLink` on the source page, opened in the side panel to approve, apply and undo, exactly like the old links play. On a site we can't write to, Add shows the paragraph with the link in place and the HTML to copy.

**New drafts get links too.** The Live Writer's `site_pages` tool reads the same term sets, so a new article links to the right pages from the start. When a draft is published, Audit suggests links **to** it from older pages (step 1 marks it new).

### 7.3 Link health score

```
link health = 100 − 30 × share(valued pages 4+ deep)
                  − 25 × share(valued pages that are orphans)
                  − 20 × share(valued pages with 1 or fewer links in)
                  − 15 × share(internal links to redirects or broken pages)
                  − 10 × share(cluster pages missing the pillar link)
```

"Valued" means page value above zero. Every share is out of the pages it applies to. Clipped to 0 to 100.

### 7.4 Link checks

| Id | Severity | Rule |
|---|---|---|
| `orphan` | Error if it has value, else Notice | In a sitemap, Search Console or GA4, with no links in from crawled pages |
| `deep_valued` | Warning | Value in the top half and 4+ clicks deep |
| `starved` | Warning | Value in the top 20% and links in under the site median |
| `one_link_in` | Notice | Exactly 1 link in |
| `too_many_out` | Notice | Over 150 links out |
| `nofollow_internal` | Warning | `rel=nofollow` on an internal link |
| `generic_anchor` | Notice | "click here", "read more", "learn more", "here", "this" |
| `anchor_conflict` | Notice | One anchor text pointing to 2 or more pages |
| `pillar_missing` | Warning | Cluster page that doesn't link to its pillar |
| `pillar_not_linking` | Notice | Pillar that doesn't link to a page in its cluster |
| `links_only_js` | Warning | From the Technical Audit, shown here too |
| `links_to_redirect`, `links_to_broken` | As in 6.3 | Shown here too |

---

## 8. Content Decay

### 8.1 The screen

- **Content freshness score:** the share of valued pages that aren't decaying, weighted by value.
- **Clicks lost:** the sum of clicks lost on decaying pages over the last 28 days against their peak, the number that makes the case.
- **The list:** one row per decaying page, ordered by clicks lost. Each row shows:
  - a small line of weekly clicks over 16 months, with the peak marked;
  - clicks, impressions and position now against the comparison period;
  - AI citations now against 4 weeks before;
  - the **reason** (8.3) in one line, for example "Rank slipped from 3 to 8 for 'crm for startups'. Two new pages in the top 5.";
  - the **action** (8.4): Refresh, Merge, Redirect, Fix technical, Rework intent, or Leave;
  - the button for that action.
- **Filters:** reason, action, template, cluster, "Arrowsterr-written", and the stage tag from the Content Plan.
- **Page panel:** the full chart with clicks, impressions and position, the queries that lost the most (from page and query data), the SERP now against when it peaked, the AI engines that stopped citing it, and the page's own facts from the crawl (word count, last modified, dated year in the title).
- **Watching:** pages that showed one week of decay go here first and move to the list if the second week agrees (8.2). Nothing on the main list is a one-week blip.
- **Done:** pages refreshed in the last 90 days, with clicks before and after the refresh, so the team sees what the work earned.

### 8.2 Finding decay

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

### 8.3 Finding the reason

For every page on the list, code finds the reason first. Claude only writes the sentence.

| Reason | How code knows |
|---|---|
| **Technical** | The page has a new Error in the Technical Audit (noindex, canonical change, 5xx, `js_only_text`), or URL Inspection says it fell out of the index |
| **Cannibalized** | Another page on the site now ranks for the page's top queries (page and query data), or `google_canonical_differs` |
| **Outranked by newer pages** | The live SERP for the top query (DataForSEO, 20 tasks, 7-day cache) has pages in the top 5 that weren't there at the page's peak (from `rank_checks` history when tracked, else the SERP saved by an earlier decay check) |
| **SERP changed** | The CTR drop rule fired, and the live SERP shows an AI Overview, AI Mode, a video or a People Also Ask box above the page |
| **Intent shifted** | The top 5 now are a different kind of page (list against guide against tool against product), read from their titles and schema |
| **Out of date** | Old year, old page, or prices, versions or dates on the page that the newer top pages state differently |
| **Lost AI citations** | AI citation drop, with which engines stopped and which pages they cite now |
| **Less demand** | Impressions drop with position steady, and the top queries' search volume fell (DataForSEO, cached) |

A page can have more than one reason. They're listed by how much of the loss each explains, and the first one picks the action.

One Claude call per page (Haiku 5.5) turns the reasons and their numbers into one or two plain sentences for the row. It may only use the numbers it's given, and code checks every number in its answer against them.

### 8.4 The action

| Action | When | The button |
|---|---|---|
| **Fix technical** | Technical reason first | Opens the issue's Fix (6.4) |
| **Merge** | Cannibalized, and the other page is stronger | Prepares a merge: the Live Writer folds the weaker page's best parts into the stronger one, and a 301 from the weaker page (plugin on WordPress, steps elsewhere) |
| **Refresh** | Outranked, out of date, lost AI citations, or SERP changed | **Refresh with the Live Writer** (8.5) |
| **Rework intent** | Intent shifted | Adds a planned piece to the Content Plan with the new format and links it to this page |
| **Redirect** | Less demand, under 20 clicks now, and a close page exists | Prepares the 301 to that page |
| **Leave** | Seasonal, or less demand with nothing better to do | Moves the page to Watching with a note |

People can change the action on any row. The choice is saved, and the next run respects it.

### 8.5 Refresh with the Live Writer

The refresh is where Audit and the Live Writer meet.

1. **Refresh** opens the Live Writer sidebar in refresh mode.
2. **Research:** the live page is read first and kept as a source. Then the usual research: the top 10 now, People Also Ask, the AI Overview, the AI engines' answers. The feed shows what changed since the page peaked: "3 new pages in the top 5", "The AI Overview now lists 7 tools; you show 5".
3. **The plan:** the writer lists what it will change before it writes, each with its reason: "Update the 2025 prices", "Add a section on AI CRMs (4 of the top 5 cover it)", "Answer 'is HubSpot free' near the top (AI Overview asks it)". You can untick any line, or add your own in the steer box.
4. **The rewrite:** sections that need no change are kept word for word and shown greyed. Changed sections stream in with the old text struck through beside them. The title, meta description and URL stay unless you change them. The URL never changes on its own.
5. **Internal links:** the writer adds links to the page's cluster, and Audit queues suggestions to the refreshed page from older pages.
6. **Publish:** **Update** sends it to the same post.
   - A page Arrowsterr wrote: a new version of the same doc (`doc_versions`), pushed with the existing update path (`doc_publications`, `wpSync`).
   - A page someone else wrote on WordPress or Ghost: imported into a new doc on first refresh (new `importPost` in `src/lib/cmsImport.ts`: `getItem`, then the post's HTML turned into ProseMirror JSON), then written back with `writeItem`. The before copy is kept in the change set, so Undo puts the old page back.
   - Other CMSs: the same once 6.4's writers ship. Until then, Copy HTML.
7. **After:** the page goes to Done with its refresh date. Its chart marks the date, and 28 days later the row shows clicks before and after.

A refresh counts as one of the month's drafts (`draftsPerBrand`), the same as a new draft.

---

## 9. Data

One migration per phase, starting at `085`, each safe to run twice. Old tables (`site_audits`, `crawl_*`, `onpage_audits`, `content_maps`, `gsc_daily`, `gsc_pages`, `cwv_*`) stay unused for now and are dropped in a later migration once nothing reads them. `gsc_connections`, `gsc_inspections` and `gsc_sitemaps` are reused.

| Table | Columns |
|---|---|
| `audits` | id, workspace_id, brand_id, root, settings jsonb, status (`queued`, `fetching`, `rendering`, `scoring`, `done`, `partial`, `failed`), partial_reason, started_at, finished_at, heartbeat_at, pages_found, pages_done, pages_rendered, scores jsonb (technical, links, freshness, each area), summary, previous_full_id, started_by |
| `audit_urls` | audit_id, url_hash, url, depth, found_from (`home`, `sitemap`, `link`, `gsc`, `ga4`), state (`queued`, `leased`, `done`, `skipped`, `error`), lease_until, tries. The crawl queue |
| `audit_pages` | audit_id, url_hash, url, final_url, status, redirect_chain jsonb, ms, bytes, content_type, template_id, title, description, h1 text[], h2 text[], canonical, meta_robots, x_robots, indexable, indexable_reason, words, raw_words, rendered_words, main_hash, links_in, links_out, ext_links, depth, link_score, in_sitemap, sitemap_lastmod, modified_at, published_at, author, schema jsonb, hreflang jsonb, images, images_no_alt, viewport, mixed_content, terms text[], rendered jsonb, shot, value, issues text[] (GIN index) |
| `audit_links` | audit_id, from_hash, to_hash, to_url, anchor, rel, kind (`a`, `img`, `canonical`, `hreflang`, `redirect`), place (`body`, `nav`, `footer`), js_only, status |
| `audit_issues` | audit_id, check_id, area, severity, pages, share, value_at_stake, pages_sample text[], change (`new`, `more`, `fewer`, `same`) |
| `audit_templates` | brand_id, template_id, pattern, name, pages, sample_urls. Names saved per site |
| `audit_link_suggestions` | id, brand_id, audit_id, target_url, source_url, anchor, paragraph_hash, reason, score, state, change_set_id, created_at, decided_by, decided_at |
| `gsc_page_days` | brand_id, day, page_hash, page, clicks, impressions, ctr, position. 16 months kept. Primary key (brand_id, page_hash, day) |
| `gsc_page_queries` | brand_id, week, page_hash, query, clicks, impressions, position. Weekly, top 1,000 pages, 16 months |
| `ga4_landing_days` | brand_id, day, page_hash, page, sessions, key_events. Only when GA4 is connected and Search Console isn't |
| `decay_pages` | brand_id, page_hash, url, state (`watching`, `decaying`, `refreshing`, `done`, `left`), signals jsonb, reasons jsonb, action, action_by_person bool, sentence, peak_clicks, clicks_now, clicks_lost, first_seen, last_seen, weeks_seen, refreshed_at, doc_id |
| `decay_serps` | brand_id, query, day, top jsonb, features text[]. The SERP saved at each check, for "new in the top 5" |
| `cwv_pages` | brand_id, url_hash, form_factor, fetched_at, lcp, inp, cls, ttfb, source (`crux`, `lab`) |

- Every table has row-level security by workspace role, like the rest of the schema. Viewers read; only the server writes, except `audit_templates` names and `decay_pages.action`, which editors may change.
- **Kept:** the last 2 full crawls' `audit_pages` and `audit_links` per brand, plus `audit_issues` and scores for every crawl. The daily job deletes older page and link rows.
- **Size:** about 9 KB a page and 40 links a page at 100 bytes each, so a 2,000-page crawl is about 26 MB, and 2 crawls are about 52 MB a site.

---

## 10. Jobs, schedule and alerts

| Job | Started by | Key | At once | Notes |
|---|---|---|---|---|
| `audit_start` | Crawl now, weekly schedule | brand + week, or audit id for Crawl now | 1 per brand, 1 per host across workspaces | Replaces the `audit` stub |
| `audit_fetch` | `audit_start`, then itself | audit id + turn | 1 per audit | 90 s turns, requeues itself |
| `audit_render` | `audit_fetch` when the queue is empty | audit id | on the worker's Chromium (`RENDERERS`, default 2) | Separate lease table, like `article_pages` |
| `audit_graph` | Render done or skipped | audit id | 1 | Depth, links in, link score, orphans |
| `audit_score` | `audit_graph` | audit id | 1 | Checks, scores, summary, alerts |
| `link_suggest` | `audit_score`, a publish, Fix this cluster | brand + audit | 2 per workspace | Section 7.2 |
| `gsc_sync` | Nightly, connect (backfill) | brand + day | 4 overall | Replaces the stub |
| `cwv_sync` | Weekly | brand + week | 2 overall | Replaces the stub |
| `decay_check` | After `gsc_sync`, weekly without Search Console | brand + day | 4 overall | Section 8.2 to 8.4 |

- **Weekly crawl:** each brand crawls a week after its last full crawl, spread across the day by brand id (the `startMinute` idea from rank tracking). Brands start weekly crawls only after their first crawl. Editors can turn it off.
- **Heartbeat:** every `audit_fetch` turn writes `audits.heartbeat_at`. A crawl with no heartbeat for 20 minutes is resumed by the next job. After 3 resumes, it's marked failed and keeps what it read.
- **Alerts,** through `emailAlert` to people with alerts on, at most one email per brand per day:
  - health drops 5 or more points against the last full crawl, with the new issues first;
  - a page with value goes noindex, 5xx, or loses its index state;
  - robots.txt starts blocking an AI bot;
  - 3 or more pages join the decay list in one week, with the clicks at stake.
- **Webhooks and Slack:** `audit.done`, `audit.alert` and `decay.new` through the existing `dispatch` in `integrations.ts`.

---

## 11. Reliability

A false alarm costs more than a missing check. These are part of each phase's definition of done.

1. **Partial crawls get no score and no alert:** the home page didn't load, over half the pages didn't answer, robots.txt gave a 5xx, the firewall challenged our bot on the home page, or the crawl hit its time cap before half the pages it found. The screen says which.
2. **A firewall that blocks our bot stops the crawl** with "Your firewall blocked our crawler" and the allow-list steps for the CDN we detect (Cloudflare, Fastly, Akamai, Sucuri). It never reports hundreds of fake 403s.
3. **Errors retry first.** A page that fails once and loads on the retry is fine.
4. **Unknown is never broken.** A link to a page we didn't fetch, a canonical to a page we didn't fetch, a check without its data: all "Not checked". Outbound 401, 403 and 429 are bots refused.
5. **Raw against rendered compares main text only.** Navigation, footer and cookie banners are stripped first, so a cookie banner never makes a page "JavaScript only".
6. **One URL cleaner everywhere** (`normUrl`, tested): lowercase host, no default port, no fragment, sorted query, tracking parameters dropped (`utm_*`, `gclid`, `fbclid`, `msclkid`), trailing slash kept as is. Fix matches CMS pages with or without www, a trailing slash or different case.
7. **Bot checks need two strikes:** a block counts only when two fetches a minute apart both fail for the bot and both succeed for a browser user agent.
8. **Search Console rows are replaced by day,** never added, so a re-sync can't double count. The last 3 days are never used for decay.
9. **Decay needs two weeks** and survives the seasonal and site-wide guards (8.2) before it shows.
10. **The model never decides facts.** Link anchors must already be in the paragraph. Decay sentences may only use numbers code gave them. Both are checked in code.
11. **Fixes are undoable.** Every write keeps a before copy, and Undo refuses a page someone edited since (the existing `undoSet` rule).
12. **Queue rows are leased** for 2 minutes. A dead worker's rows come back.

**Tests:**

- `tests/auditChecks.test.ts`: every check passes its clean fixture and fails its broken one, including a page that times out once, a 429 then 200, a challenge page, a JavaScript-only shell, an hreflang set with one bad return link and a canonical loop.
- `tests/auditCrawl.test.ts`: a local 300-page test site with redirects, loops, an endless calendar, slow pages, robots rules, sitemaps and an orphan. The crawl finds exactly the expected pages, depths and issues, and gives the same result when split across many short jobs or killed and resumed.
- `tests/auditLinks.test.ts`: every suggestion's anchor is in its paragraph and outside headings and links; no page gets more than 3; a changed paragraph turns the suggestion stale.
- `tests/decay.test.ts` on recorded Search Console data: a seasonal page goes to Watching; a site-wide drop shows one banner and only pages that fell further; a one-week dip never shows; a real two-week slide shows the next day; cannibalization finds the other page.
- `tests/gscSync.test.ts`: syncing the same day twice leaves the same rows.

---

## 12. Plan limits

Crawling uses no paid API, so crawls inside the limit take no tasks.

| | Free | Starter (Organic) | Pro | Agency | Enterprise |
|---|---|---|---|---|---|
| Pages per crawl | 100 | 2,000 | 10,000 | 50,000 | custom |
| Crawls | Monthly | Weekly | Weekly | Weekly, daily for 2 sites | Daily |
| JavaScript rendering | Off | 3 per template plus thin pages, 100 at most | Up to 2,000 | Up to 20,000 | All |
| Search Console | 1 property | Yes | Yes | Yes | Yes |
| URL Inspection a day | 50 | 200 | 500 | 500 | 500 |
| Internal link suggestions | Top 10 shown | All | All | All | All |
| Add links for you | – | 50 a month | 500 a month | 2,000 a month | custom |
| Content Decay | List only | List and reasons | All | All | All |
| Refresh with the Live Writer | – | – | Counts as a draft | Counts as a draft | Counts as a draft |
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

## 13. Phases

Estimates are for one engineer who knows the codebase. Each phase ships behind the `seo` toolset and works on its own.

| Phase | Weeks | What ships | Done when |
|---|---|---|---|
| 1. Crawler and Technical Audit | 3.5 | `audits` tables, the crawl jobs, the render loop on the worker, 66 checks, health score, the Technical tab, the Pages sheet, Overview v1, the sidebar group, the old addresses forwarding | A crawl of the 300-page test site gives exactly the expected issues, survives a kill, and a real customer site's audit matches a Screaming Frog crawl on status codes, depth and indexability |
| 2. Search Console | 1.5 | Connect, property match, backfill, nightly sync, URL Inspection, sitemaps, page value | A connected brand has 16 months of page and day rows, and re-syncing a day changes nothing |
| 3. Fixes | 1.5 | Remove noindex, set canonical, update links to redirects and 404s, redirects, robots.txt and llms.txt through the plugin, recrawl after a fix, IndexNow | Each fix applies and undoes on a test WordPress site, and the issue row shows Fixed after the recrawl |
| 4. Internal Linking | 2 | Link graph screens, link health, suggestions, Add and Add all, clusters, the map, links to new drafts | On a test site, every suggestion's anchor is already in its paragraph, and Add puts the link in the live post with Undo |
| 5. Content Decay | 2.5 | Signals, guards, reasons, actions, the screen, Refresh with the Live Writer, Done with before and after | On recorded data from 3 real sites, every page on the list held for two weeks, and a refresh updates the live WordPress post with Undo |
| 6. Reach and polish | 1.5 | Fix writers for Webflow, Shopify and HubSpot; alerts and webhooks; Zippie and MCP tools; Audit in the PDF report | A fix applies and undoes on each of those three CMSs, and Zippie answers "what should I fix first?" from the audit |

About 12.5 weeks in all. The Live Writer (`docs/live-writer-plan.md`) should ship first, since phase 5's Refresh runs on it.

**Zippie and MCP get:** `get_audit` (scores and top fixes), `get_audit_issue` (pages for one check), `get_link_suggestions`, `get_decaying_pages` (with reasons and actions), and for editors `start_audit` and `propose_fix` (a change set, approved in the app as today). A built-in skill, "Fix what matters", walks the Overview's top 10.

---

## 14. Running cost

**Assumptions:** about 2 sites per team, 2,000 pages a site, crawled weekly: about 16,000 page loads per team a month. Rendering on about 10% of pages. About 20 decaying pages a site a month need a reason. Claude Sonnet 5.5 at $2 in and $10 out per million tokens, Haiku 5.5 at $0.10 and $0.50 (check). DataForSEO SERP at about $0.003 (check).

| Line | Beta (50 teams, 100 sites) | Growth (500 teams, 1,000 sites) |
|---|---|---|
| Crawl and render compute (one VPS size up at Beta; a second VPS for crawl workers at Growth, check) | ~$10 | ~$35 |
| Database storage (about 52 MB a site for 2 crawls, plus Search Console rows at about 30 MB a site for 16 months) | ~8 GB, VPS disk: $0 | ~80 GB, bigger disk and backups: ~$10 (check) |
| Crawl summaries (Sonnet, ~$0.02 a crawl, 4 a site a month) | ~$8 | ~$80 |
| Link suggestion anchors (Sonnet, ~$0.10 a site a month) | ~$10 | ~$100 |
| Decay SERPs (DataForSEO, 20 a site a month, cached 7 days) | ~$6 | ~$60 |
| Decay sentences (Haiku, 20 a site a month) | ~$1 | ~$10 |
| Estimated traffic without Search Console (DataForSEO Labs, ~$0.04, about 1 site in 4) | ~$1 | ~$10 |
| Google APIs: Search Console, URL Inspection, CrUX, PageSpeed | $0 | $0 |
| Alert emails (inside Resend's current plan, check) | $0 | ~$20 (next tier, check) |
| Refreshes with the Live Writer | in the draft count | in the draft count |
| **Monthly total added** | **~$36** | **~$325** |

With some headroom for heavier sites (Agency teams with 50,000-page crawls), budget **about $55 at Beta and $480 at Growth**. The searches and anchors use plan tasks, so heavy use is paid for by the plan it runs on.

**Compared with buying the crawl:** DataForSEO's On-Page API at about $0.00015 a page and $0.0015 with JavaScript (check) would cost about $2,400 a month at Growth for the same pages. Our own crawler costs about $35 of servers.

---

## 15. Open questions

1. **Competitor crawls.** Crawling a rival's site within robots.txt and polite speed could feed a Compare view (their speed, AI access and structure next to ours) and sharpen the decay reasons. Worth a phase 7?
2. **Bot logs.** Real visits from GPTBot and ClaudeBot would make AI access certain. A Cloudflare app is the shortest path for Cloudflare sites. Later.
3. **Merge on non-WordPress sites.** Redirects need the CMS's own redirect feature. Shopify and Webflow have one; HubSpot does too (check). Which comes first depends on connection counts.
4. **Free plan Search Console.** It costs us nothing and makes the free audit much better. Recommended: yes, 1 property.

---

## Sources

- [Search Console API: Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Search Console URL Inspection API](https://developers.google.com/search/blog/2022/01/url-inspection-api)
- [CrUX History API](https://developer.chrome.com/docs/crux/history-api)
- [Frase: content decay, detect and fix ranking drops](https://www.frase.io/blog/content-decay-how-to-fix-ranking-drops-automatically)
- [Rankability: detecting content decay](https://help.rankability.com/track/detecting-content-decay)
- [Wellows content decay tool](https://wellows.com/tools/content-decay/)
- [Semrush: internal linking mistakes](https://www.semrush.com/blog/internal-linking-mistakes/)
- [Ahrefs internal links guide (Miniloop)](https://www.miniloop.ai/blog/ahrefs-internal-links-guide)
- [Best internal linking tools for 2026 (LinkStorm)](https://linkstorm.io/resources/best-internal-linking-tools-for-seo)
- [DataForSEO On-Page API pricing](https://dataforseo.com/pricing/on-page/onpage-api) (check)
