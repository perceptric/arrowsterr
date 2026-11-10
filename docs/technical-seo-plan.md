# Technical SEO: the plan

How Arrowsterr grows its Site Audit into a full Technical SEO toolset. The toolset should cover what Semrush, Ahrefs, Screaming Frog and Sitebulb check. It should add Google's own index and speed data, and lead on what no one else does well: whether AI crawlers can read a site and cite it.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page.

---

## 1. Summary

**What we build:** eight screens under Technical SEO, one new crawler, three Google connections and one monitoring loop.

| Screen | What it answers |
|---|---|
| Site Audit (rebuilt) | How healthy is the site, what broke, and what to fix first? |
| Pages | What does every URL look like to Google and to AI bots? |
| Indexing | Which pages Google has indexed, which it hasn't, and why? |
| Speed | Do real visitors get fast pages (Core Web Vitals), and which templates are slow? |
| Site structure | How do pages link together, how deep are they, and which pages have no links in? |
| AI access | Can GPTBot, ClaudeBot, PerplexityBot and Google's AI read each page, with and without JavaScript? |
| Monitoring | What changed on key pages since yesterday (noindex, robots.txt, titles, status codes)? |
| Bot logs (later) | Which bots actually visit, how often, and what they hit? |

**Why it matters for Arrowsterr:** our customers buy us for AI visibility and organic research. Technical problems block both. A page AI bots can't fetch, or that only shows its text after JavaScript runs, can't be cited. Today our Site Audit reads 200 pages with plain requests and 17 checks. It finds the obvious problems and misses most of the rest.

**What it costs to run:** about **$21 a month at Beta (50 teams)** and **$160 a month at Growth (500 teams)**. Section 13 has the full bill. We crawl with our own crawler on our own servers. Buying the same crawling from DataForSEO's On-Page API would cost about $2,400 a month at Growth.

**How long:** about 16 to 20 weeks for one engineer, in six phases (section 12). Each phase ships on its own.

---

## 2. What technical SEO covers

Technical SEO is everything that decides whether search engines and AI systems can **find**, **fetch**, **render**, **understand** and **trust** a site's pages. Content and links matter only after these work. The research (sources at the end) groups the work into twelve areas.

| # | Area | What it means | Typical problems |
|---|---|---|---|
| 1 | Crawlability | Bots can reach every page that matters | robots.txt blocks, broken links, redirect chains and loops, orphan pages, deep pages, infinite URL spaces (filters, calendars), server errors, firewalls blocking bots |
| 2 | Indexability | Pages that should be in Google are allowed in, and the rest are kept out | stray noindex, canonical to the wrong page, duplicates, soft 404s, thin pages, pages left out of sitemaps, "Crawled, currently not indexed" |
| 3 | Rendering | The content exists in the HTML bots read | text, links, titles or schema only added by JavaScript; blocked JS or CSS files; hydration errors |
| 4 | Site structure and internal links | Important pages get the most links and sit close to the home page | pages more than 3 clicks deep, orphans, nofollowed internal links, links to redirects, weak anchor text |
| 5 | Page speed and Core Web Vitals | Real visitors get fast, stable pages | LCP over 2.5 s, INP over 200 ms, CLS over 0.1, heavy images, render-blocking scripts, slow server (TTFB) |
| 6 | Mobile | The mobile page has the same content and works on small screens | missing viewport, content hidden on mobile, tap targets too small |
| 7 | Structured data | Schema.org markup is valid and matches the page | invalid JSON-LD, missing required fields, markup that disagrees with the page |
| 8 | International | Each language and country version is tied together | hreflang without return links, wrong codes, missing x-default, hreflang that disagrees with the canonical |
| 9 | Security and protocol | HTTPS everywhere, one version of the site | mixed content, HTTP pages still live, www and non-www both live, expired certificates, missing HSTS |
| 10 | Sitemaps and feeds | Sitemaps list every page that should be indexed, and nothing else | sitemap URLs that redirect, 404 or are noindex; missing pages; stale lastmod; sitemap not in robots.txt |
| 11 | Crawl budget and logs | On big sites, bots spend their time on the right pages | bots stuck in filters and parameters, important pages rarely visited, spikes of errors |
| 12 | AI search readiness (new) | AI crawlers and answer engines can fetch, read and cite pages | robots.txt or CDN blocking AI bots, JavaScript-only content (AI crawlers mostly don't run JavaScript), no llms.txt, no IndexNow for Bing (which feeds ChatGPT search) |

Thresholds most sources agree on, taken from Google's own guidance: LCP under 2.5 seconds, INP under 200 milliseconds (INP replaced FID in March 2024), CLS under 0.1. Important pages within 3 clicks of the home page. Canonical, hreflang, sitemap and internal links all agree on one preferred URL.

---

## 3. What other tools do

| Tool | Strengths | Gaps we can beat |
|---|---|---|
| Semrush Site Audit | 140+ checks, thematic reports, an AI Search category (blocked AI bots, llms.txt), optional JavaScript rendering, scheduled crawls | Reports what's wrong without fixing it; JavaScript rendering misses content on some sites; no Search Console index data per page |
| Ahrefs Site Audit | 170+ checks, Execute JavaScript option, free crawls for verified sites, page explorer with custom filters, flags robots rules that block AI crawlers | No AI citation link; no fixes; no field speed data per template |
| Screaming Frog | The power user's crawler: every column, custom extraction, JavaScript rendering, Search Console, PageSpeed and GA4 connections, crawl comparison | A desktop app; free version stops at 500 URLs; hard for non-experts; no monitoring |
| Sitebulb | The clearest explanations and visuals (crawl maps, hints that teach why), Chrome rendering on every paid tier, URL Inspection report from Search Console | Desktop or paid cloud; no AI angle; no fixes |
| Lumar, Botify, JetOctopus | Enterprise crawling at millions of pages, log file analysis, segments by template, crawl budget work | Expensive (custom pricing, or from about €379 a month for JetOctopus); built for large teams |
| Conductor (ContentKing) | 24/7 monitoring of key pages, change history, alerts within minutes | Enterprise pricing; little auditing depth |

**Our angle, in one line each:**
1. **What AI bots see:** every page fetched as GPTBot, ClaudeBot and PerplexityBot, with and without JavaScript, next to what Googlebot sees.
2. **Tied to AI citations:** issues on pages that AI answers already cite, or that competitors get cited for, come first.
3. **Fix, then prove:** Fix buttons change the CMS (we already do this for titles, descriptions, alt text and schema). After a fix we ping IndexNow, recheck the page and show when Google reindexed it.
4. **Plain words:** each issue says why it matters and what to do in one or two sentences, the Sitebulb way.
5. **Included in the plan:** crawling costs no tasks up to the plan's page limit.

---

## 4. What we have today

| Part | Where | What it does now | Keep, grow or replace |
|---|---|---|---|
| Crawler | `src/lib/audit.ts` | Up to 200 pages from the sitemap and home page, plain `fetch`, cheerio parsing, 120 link checks, 15 s timeout, runs inside the web process as job kind `audit` | **Replace** with crawler v2 (section 6). Keep the parsing rules and tests. |
| Checks | `issuesOf` in `audit.ts` | 17 checks: AI bots blocked, broken links, error pages, missing title, missing description, missing alt, no schema, duplicate title and description, noindex, long title and description, no share image, canonical elsewhere, thin, slow, no llms.txt | **Grow** to about 140 checks (section 7) |
| Score and history | `src/lib/siteAudit.ts`, `site_audits` | Score 0 to 100, partial crawls get no score, weekly crawl, drop alert email, stuck crawl closed after 45 minutes | **Keep** every reliability rule; add area scores |
| Site Audit screen | `src/components/SiteAuditPage.tsx` | Dial, facts, issues by priority, Fix buttons | **Rebuild** as the hub (section 5.1) |
| On-page Audit | `src/lib/onpage*.ts` | One page against Google's top 10 for one keyword | **Keep** as is; link to it from Pages |
| Fix plays | `src/lib/fixServer.ts`, `plays.ts` | Titles, descriptions, alt text and structured data changed in the brand's CMS, approve, apply and undo | **Grow:** redirects, canonicals, noindex, internal links, robots.txt, llms.txt |
| robots.txt tester | `src/lib/robotsTest.ts` | Tests rules for a bot | **Reuse** in AI access |
| Sitemap reader | `src/lib/sitemap.ts` | Finds pages from sitemaps | **Grow:** sitemap index, all sitemaps, lastmod, image and news sitemaps |
| Schema generator | `src/lib/schemaGen.ts` | Writes JSON-LD | **Reuse** for schema fixes |
| Google sign-in | `src/lib/google.ts` | OAuth for GA4 (`analytics.readonly`), tokens encrypted | **Grow:** add the Search Console scope |
| PageSpeed | `PAGESPEED_API_KEY`, `freeRunners.ts`, `onpageServer.ts` | Lab speed for one page | **Grow:** add the CrUX API for field data |
| Chromium | `Dockerfile.worker` (Playwright 1.56.1 image) | Prints report PDFs | **Reuse** for JavaScript rendering |
| WordPress plugin | `wp-plugin/` | Connects WordPress sites for fixes | **Grow:** IndexNow key file, redirects, robots.txt and llms.txt edits |

---

## 5. Screens

All screens follow the Backlinks pattern: a title, a search bar where it fits, a row of tabs or one page of cards, a StatStrip for numbers, cards with real charts, tables with CSV export, and a tool intro before there's data. Every site name and URL opens its own detail.

The Technical SEO group in the sidebar becomes:

```
Technical SEO
  Site Audit
  Pages
  Indexing        (needs Search Console)
  Speed
  Site structure
  AI access
  Monitoring
  On-page Audit
```

### 5.1 Site Audit (the hub)

**Top:** site picker (the brand's domain, or any subdomain), crawl settings button, "Crawl now" (primary), "Updated" with the time and pages read.

**StatStrip:** Health score (0 to 100, trend over the last 8 full crawls), Pages crawled (of pages found), Errors, Warnings, Notices, Indexable pages (share), AI-readable pages (share).

**Area scores:** one card with ten small dials or bars, each clickable to filter the issue list: Crawlability, Indexability, Rendering, Links, Content, Speed, Structured data, International, Security, AI access. Each area score uses the same formula as the health score, limited to that area's checks.

**What to fix first:** the top 5 issues ranked by `impact = severity weight × share of pages hit × page value`. Page value comes from Search Console clicks and impressions, AI citations and backlinks (section 8.2). Each row: issue, pages hit, a short "why", and a Fix button when a play exists. One Claude call per crawl writes a three-sentence summary above the list ("Most of the drop comes from 140 product pages that now return a noindex…"). It's tagged as written by Zippie.

**Charts:**
- Issues over time: errors, warnings and notices for the last 12 crawls (stacked bars).
- Status codes: 2xx, 3xx, 4xx, 5xx and timeouts (donut).
- Crawl depth: pages by clicks from home (bars, depth 4+ in orange).
- Indexability: indexable, noindex, canonicalized elsewhere, blocked by robots, error (stacked bar).

**Issues table:** grouped by Errors, Warnings, Notices. Each row has the area tag, the title, pages hit, change since the last crawl (New, +n, −n, Fixed), share bar, and Fix. Filters: area, severity, new only, has a fix, template. Opening a row shows the why, how to fix, a "learn more" link to Google's own documentation, and every URL it hits (with template and page value), exportable.

**Compare crawls:** pick two crawls and get new issues, fixed issues, pages added, pages removed, and pages whose status, title, canonical or indexability changed.

**Crawl settings (side panel):** start URLs; sitemaps to include; page limit (up to the plan's); render JavaScript (off, sample, all, by plan); crawl as (Arrowsterr bot, Googlebot smartphone UA, GPTBot UA); include and exclude rules (URL contains or regex); ignore query parameters; speed (1 to 10 requests a second, polite default 2); respect robots.txt (on; off only for verified sites); custom headers and cookies for staging behind a password; schedule (weekly, daily on higher plans).

### 5.2 Pages (crawl explorer)

Every crawled URL in one table, the way Screaming Frog and the Ahrefs Page explorer work.

**Columns (pick and reorder, saved per person):** URL, template, status, indexable, reason, title, title length, description length, H1, canonical, meta robots, X-Robots-Tag, words, depth, links in (internal), links out, external links, response time, size, rendered differs, AI-readable, schema types, hreflang count, in sitemap, Google index status (Search Console), clicks and impressions (28 days), AI citations (30 days), backlinks (from Backlinks), last changed.

**Filters:** saved segments ("Product pages", "Blog"), quick filters (Errors, Not indexable, Orphans, Depth 4+, Slow, JS-dependent, Not in sitemap, In sitemap but not indexable), and a filter builder (column, operator, value, joined with and/or).

**Page drawer:** opens on click, with tabs:
- **Overview:** status chain (each redirect hop), indexability with the reason, title, description, H1s, canonical, robots, hreflang, schema list, Google index status and last crawl date from URL Inspection.
- **Issues:** every check this page fails.
- **Raw vs rendered:** word count, links and headings in the raw HTML and after JavaScript; a list of what only appears after rendering; a screenshot of the rendered page (mobile).
- **Links:** links in (with anchor and source), links out, external links, each with status.
- **Headers:** response headers for the final URL.
- **Speed:** CrUX field data for the URL when Google has it, else for the origin; PageSpeed lab score on demand.
- **As bots see it:** status, size and word count when fetched as Googlebot, GPTBot, ClaudeBot and PerplexityBot (section 5.6).
- Buttons: Open in On-page Audit, Inspect in Google (live), Recrawl this page.

### 5.3 Indexing (Search Console)

Needs the Search Console connection (section 8.1). Before that, the screen is a tool intro with "Connect Google Search Console" (one click; it reuses the Google sign-in we have for GA4).

**StatStrip:** Indexed (of inspected), Not indexed, Submitted in sitemaps, Pages with clicks (28 days), Last Google crawl (median).

**Cards:**
- **Index status by reason:** stacked bar of URL Inspection results (Submitted and indexed, Crawled currently not indexed, Discovered currently not indexed, Excluded by noindex, Duplicate without user-selected canonical, Google chose a different canonical, Blocked by robots.txt, Soft 404, Not found, Redirect, Server error), from the pages we've inspected. A note gives the count inspected.
- **Google's canonical vs yours:** pages where Google picked another canonical, with both URLs.
- **Mobile and rich results:** from URL Inspection (rich result types found, errors).
- **Sitemaps:** each sitemap from the Sitemaps API with submitted count, last read and errors, plus our own check of each URL in it (status, indexable).
- **Search performance by template:** clicks, impressions and CTR per template from Search Analytics (28 days), with the change from the prior 28 days.
- **Pages losing clicks:** biggest drops by page, with any technical change we saw on the page (status, title, canonical, noindex).

**Table:** every inspected URL with index status, Google's last crawl, Google canonical, mobile verdict, rich results, clicks and impressions, our crawl's indexability. Actions: Inspect again, Request recrawl (opens the Search Console page, since the API can't request indexing for normal pages), Fix.

**How we choose pages to inspect:** the URL Inspection API allows 2,000 calls a day per property. We spend up to 1,500 a day per property, in this order: pages with clicks in the last 28 days, pages AI answers cite, pages in sitemaps, then every other indexable page, oldest inspected first. A 5,000-page site gets every page inspected about every 4 days.

### 5.4 Speed (Core Web Vitals)

**StatStrip:** Core Web Vitals verdict for the origin (Good, Needs work, Poor; mobile and desktop), LCP, INP and CLS at the 75th percentile, TTFB.

**Cards:**
- **Trend:** LCP, INP and CLS weekly for about 6 months from the CrUX History API, with the good line drawn.
- **By template:** for each template, the share of pages that are good, from URL-level CrUX data where Google has it; templates without field data use PageSpeed lab data from 3 sample pages.
- **Distribution:** good, needs work and poor shares per metric (stacked bars, the way PageSpeed Insights shows them).
- **Slowest pages:** pages with the worst LCP or INP and their top fixes from Lighthouse (render-blocking files, image sizes, unused JavaScript, server response time).
- **Server speed:** response time from our crawl by template, with the slowest 20 URLs.

**Table:** URLs with field data (or lab data, marked), each metric with its verdict, and "Test now" for a fresh PageSpeed run.

### 5.5 Site structure

**Cards:**
- **Crawl map:** a radial or tree view of the site by folder and depth. Node size shows internal links in; color shows status or indexability. Clicking a node filters the Pages table. For more than 2,000 pages it groups by folder.
- **Depth:** pages per click depth, and the important pages (clicks, citations, backlinks) that sit 4 or more clicks deep.
- **Internal link score:** an internal PageRank (0 to 10) for each page, from the link graph. A table lists pages with high value (traffic, citations, backlinks) and low internal score: they need more links.
- **Orphan pages:** pages in sitemaps, Search Console or Analytics that no crawled page links to.
- **Redirects:** every redirect with hops, chains of 2+, loops, and internal links that point at a redirect (Fix: update the link).
- **Link suggestions:** for each weak page, 5 pages on the site that talk about the same topic and could link to it, with a suggested anchor. Matching uses our existing embeddings or keyword overlap. It feeds the existing internal-links Fix play.

### 5.6 AI access

The screen no other tool has.

**StatStrip:** AI-readable pages (share), Bots allowed (of 10), Blocked by firewall, JavaScript-dependent pages, llms.txt (found or missing), IndexNow (on or off).

**Bot matrix:** rows are bots, columns are what blocks or allows them.

| Bot | robots.txt | Firewall or CDN | Meta and headers | Can read text |
|---|---|---|---|---|
| Googlebot | Allowed | 200 | index | Yes |
| Google-Extended | Allowed | n/a (token only) | | |
| GPTBot (training) | Blocked | 403 | | No |
| OAI-SearchBot (ChatGPT search) | Allowed | 200 | | Partial: 40% of text needs JavaScript |
| ChatGPT-User | Allowed | 200 | | |
| ClaudeBot, Claude-SearchBot, Claude-User | | | | |
| PerplexityBot, Perplexity-User | | | | |
| Bingbot (feeds ChatGPT search and Copilot) | | | | |
| Applebot, Applebot-Extended | | | | |
| CCBot, Meta-ExternalAgent, Bytespider | | | | |

How each column is checked:
- **robots.txt:** our existing parser (`blockedBots`, `robotsTest.ts`), per bot and per sample URL, with the line that decides it.
- **Firewall or CDN:** we fetch the home page and 5 sample pages with each bot's user agent and compare the status, size and title with a normal fetch. A 403, 429, a challenge page ("Just a moment", "Attention required", a captcha) or a much smaller body means the firewall blocks the bot. Many sites block AI bots at the CDN without knowing it (Cloudflare has blocked known AI crawlers by default on new domains since July 2025). Bots that check their IP addresses can only be tested from their own IPs, so we say "likely blocked" and point to the fix in Cloudflare and other CDNs.
- **Meta and headers:** `noai`, `noimageai`, `X-Robots-Tag` per bot, `noindex`.
- **Can read text:** the share of the rendered page's main text that is already in the raw HTML. AI crawlers mostly don't run JavaScript (a Vercel and MERJ study found none of the major ones did), so text that only appears after rendering is invisible to them.

**Cards:**
- **JavaScript dependence by template:** raw words vs rendered words, links and headings, with the worst templates first, and screenshots side by side.
- **Pages AI cites:** pages from the brand's AI answers (the AI-cited data we already have), each with whether every AI bot can read it.
- **Competitor pages AI cites:** for the brand's prompts, the competitor pages AI cites, and how those pages are built: server-rendered, schema types, words, headings, FAQ blocks. A "what they do that you don't" list.
- **llms.txt:** found or missing, valid or not, the pages it lists vs the pages AI cites. Fix: write it from the brand's top pages (a play that writes the file through the CMS or gives it to copy).
- **IndexNow:** on or off. On means our WordPress plugin hosts the key file and pings Bing, Yandex, Naver and Seznam when a page changes. Bing feeds ChatGPT search, so this is the fastest way to get a fix seen by AI search. Off gives a Fix button.
- **Structured data for answers:** Organization, Product, FAQ, HowTo, Article and Review markup found per template, with errors.

### 5.7 Monitoring

Like Conductor's ContentKing, at a scale that fits our plans.

- **What we watch:** robots.txt, sitemaps, llms.txt, and up to N key pages per brand (by plan; chosen from pages with the most clicks, citations and backlinks, editable).
- **How often:** robots.txt and sitemaps hourly; key pages every 6 hours on Pro, every 24 hours on Starter.
- **What counts as a change:** status code, redirect target, noindex added or removed, canonical, title, meta description, H1, word count change over 30%, schema added or removed, hreflang, robots.txt rules for any bot, sitemap URL count change over 10%, response time 3× the usual.
- **Timeline:** every change with before and after, filterable by page and kind. Critical changes (noindex on a page with clicks, robots.txt blocking Googlebot or AI bots, home page not 200, sitemap gone) are red.
- **Alerts:** email and Slack within minutes for critical changes, a daily digest for the rest. One email per incident, never one per page.

### 5.8 Bot logs (phase 6)

For sites that can share logs. Before then, AI access shows what bots *can* do. Logs show what they *actually* do.

- **Ways in:** upload log files (Apache, Nginx, IIS, Cloudflare and Fastly formats); Cloudflare Logpush to an R2 bucket we read (check the price); a small Cloudflare Worker or WordPress plugin hook that sends bot hits only.
- **Verification:** each hit from a claimed bot is checked against the bot's published IP ranges (Google, Bing, OpenAI, Anthropic, Perplexity and Apple all publish them; check the current lists) or a reverse DNS lookup. Fake bots are counted on their own.
- **What it shows:** hits per bot per day, pages crawled per bot, status codes bots get, crawl frequency per template, important pages bots never visit, and wasted crawls (parameters, filters, redirects, 404s). For AI bots: which pages ChatGPT-User and Perplexity-User fetched live, which shows the pages being used in answers right now.

---

## 6. Crawler v2

### 6.1 Where it runs

Today the audit runs inside the web process when the worker calls `/api/worker`. Crawls of thousands of pages and Chromium rendering need their own process.

- **Fetcher:** a new loop in the worker container (`arrowsterr-worker`), next to PDF printing. It leases crawl work from the database, fetches pages with plain HTTP, parses them, and writes rows back through the database. It doesn't hold anything in memory between pages, so a restart resumes where it stopped.
- **Renderer:** a second loop in the same container using the Chromium that's already there (Playwright 1.56.1). It takes pages marked for rendering, loads them with a mobile viewport, waits for the network to go quiet (up to 10 s), and saves the rendered DOM's facts, a screenshot (WebP, 400 px wide, kept 30 days), console errors and failed requests.
- **Scale-out:** the worker image runs as many copies as we need. At Growth, a second VPS runs crawl workers only (section 13).

### 6.2 Data model

Page facts move out of the `site_audits.result` JSON into tables, so the Pages screen can filter and sort 50,000 rows quickly.

```
crawls            id, brand_id, workspace_id, root, settings jsonb, status (queued, running, rendering, scoring, done, partial, failed),
                  started_at, finished_at, pages_found, pages_done, pages_rendered, score, area_scores jsonb, summary text,
                  partial_reason, previous_full_id
crawl_urls        crawl_id, url_hash, url, depth, found_from, status (queued, done, skipped, error), lease_until, tries      -- the queue
crawl_pages       crawl_id, url_hash, url, final_url, status, redirect_chain jsonb, ms, bytes, content_type, template_id,
                  title, description, h1 text[], canonical, meta_robots, x_robots, indexable bool, indexable_reason,
                  words, raw_words, rendered_words, links_in, links_out, ext_links, depth, in_sitemap bool, hreflang jsonb,
                  schema jsonb, og jsonb, images, images_no_alt, lang, viewport bool, mixed_content int, hash_main_text,
                  issues text[], internal_rank real, gsc jsonb, cwv jsonb, ai jsonb, changed_fields text[]
crawl_links       crawl_id, from_hash, to_hash, to_url, anchor, rel, kind (a, img, canonical, hreflang, redirect, script, css),
                  status (filled when checked), in_nav bool
crawl_issues      crawl_id, issue_id, severity, area, count, pages_sample text[]   -- the summary per issue for fast screens
crawl_templates   crawl_id, template_id, pattern, name, pages, sample_urls text[]
monitor_pages     brand_id, url, last_hash, last_facts jsonb, checked_at, every_minutes
monitor_events    brand_id, url, kind, before jsonb, after jsonb, severity, seen_at, alerted_at
gsc_properties    brand_id, site_url, kind (domain, url-prefix), token_id, verified_at
gsc_inspections   brand_id, url_hash, url, inspected_at, verdict, coverage_state, indexing_state, robots_state, page_fetch_state,
                  google_canonical, user_canonical, last_crawl_time, crawled_as, mobile_verdict, rich_results jsonb
gsc_page_stats    brand_id, url_hash, day, clicks, impressions, ctr, position        -- 16 months kept
cwv_origin        brand_id, form_factor, week, lcp_p75, inp_p75, cls_p75, ttfb_p75, fcp_p75, good_share jsonb
cwv_urls          brand_id, url_hash, form_factor, fetched_at, metrics jsonb, source (crux, lab)
bot_hits          brand_id, day, bot, verified bool, url_hash, status, hits                -- phase 6, rolled up per day
```

Keep the last 2 full crawls' `crawl_pages` and `crawl_links` per site, plus `crawl_issues` and the scores for every crawl (for history). Older page rows are deleted by the daily job. `site_audits` stays for old crawls and for Zippie until the new tables replace it.

### 6.3 How a crawl runs

1. **Start:** read settings and plan limits; fetch robots.txt (for our UA and every bot), llms.txt, every sitemap (index included, gzip included, up to 50,000 URLs each); seed the queue with start URLs and sitemap URLs (depth unknown, marked `found_from = sitemap`).
2. **Fetch loop:** lease 20 URLs at a time per crawl. Per host, at most N requests in flight (default 2 a second, from settings and `Crawl-delay`). Each fetch: no automatic redirects (we follow them ourselves to record each hop, up to 10), 20 s timeout, body up to 5 MB, decompress, detect charset. Store headers we need. HTML pages get parsed (cheerio, the existing `readPage` grown to every field above). Links go into `crawl_links`; new internal URLs inside the rules go into the queue with depth + 1.
3. **Retries:** timeouts, connection resets, 429 and 5xx retry twice with growing waits (5 s, then 30 s). A 429 also halves the crawl speed for that host. After retries, the page keeps its error as a finding.
4. **Stop rules:** plan page limit; 3 hours; URL spaces that never end (the same path with more than 50 parameter combinations, calendars, repeating path parts) get capped and flagged as an issue.
5. **Render pass:** templates are found (6.4). Pages are marked for rendering: all pages on plans that include it, or 3 per template plus every page with fewer than 100 raw words on lower plans. The renderer saves rendered facts next to raw ones.
6. **Link checks:** every unique external link and every internal link target not yet fetched gets a HEAD request (GET when HEAD isn't allowed), up to 2,000 per crawl, with the same retry rules.
7. **Graph pass:** depth by shortest path from start URLs, links in, orphans (sitemap and Search Console URLs never linked), internal PageRank (20 rounds, damping 0.85, nav links counted once per page).
8. **Enrich:** join Search Console stats, URL Inspection results, CrUX data, AI citations and backlinks per page.
9. **Score:** run every check (section 7), write `crawl_issues`, area scores and the health score. Partial crawls get no score (the existing rule).
10. **Summary:** one Claude call with the top issues, their counts, their change and page values, written as three sentences. If the call fails, the screen shows the list without the summary.
11. **Notify:** drop alert as today, plus "crawl done" for crawls someone started.

### 6.4 Templates

Pages that share a layout should be fixed together, so most charts and tables group by template.

- **URL patterns first:** replace path parts that look like ids, dates, slugs with many siblings or numbers with `*`, then group (`/blog/*`, `/products/*/reviews`).
- **Then the page's shape:** for groups over 500 pages or under 3, compare a fingerprint of the DOM (tag path counts of the top 3 levels, class names of main blocks) to split or merge.
- **Names:** "Blog post", "Product", "Category" when schema types or URL words make it clear; else the pattern. People can rename and merge templates; the names are saved per site.

### 6.5 Politeness and identity

- User agent `ArrowsterrBot/2.0 (+https://arrowsterr.com/bot)` with a page that explains the bot and how to slow or block it.
- robots.txt is respected for our own UA by default. Sites can be crawled ignoring robots.txt only after site ownership is verified (Search Console connected, CMS connected, or a DNS TXT or file check).
- Crawls of the same host from two workspaces never run at once; the second waits.
- Fetches as other bots (Googlebot, GPTBot) are limited to the samples in AI access, never full crawls, and say so in a header (`X-Arrowsterr-Check: bot-access`).

---

## 7. Checks

Each check has an id, area, severity (Error, Warning, Notice), the rule, the data it needs, a fix (and a play when we can make the change) and the phase it ships in. Severity weights stay 15, 7 and 2. A check counts only on pages where it applies (an indexability check skips noindex pages that are meant to be hidden; a "meant to be hidden" page is one the site keeps out of its sitemaps and doesn't link from navigation).

Data sources: **C** crawl (raw HTML and headers), **R** render, **G** Search Console, **V** CrUX and PageSpeed, **L** logs, **A** AI answers we track.

### 7.1 Crawlability

| id | Sev | Rule | Data | Fix / play | Phase |
|---|---|---|---|---|---|
| `robots_missing` | Notice | robots.txt returns 404 | C | Write a robots.txt (play) | 1 |
| `robots_error` | Error | robots.txt returns 5xx or times out (Google then stops crawling) | C | Server fix | 1 |
| `robots_blocks_important` | Error | robots.txt disallows a page that's in a sitemap, has clicks or is linked from navigation | C, G | Change the rule (play for WordPress) | 1 |
| `robots_blocks_resources` | Warning | robots.txt blocks CSS or JS that pages need to render | C, R | Allow the files | 3 |
| `robots_no_sitemap` | Notice | robots.txt doesn't list a sitemap | C | Add the line (play) | 1 |
| `server_error` | Error | Page returns 5xx | C | | 1 |
| `not_found` | Error | Internal link target returns 404 or 410 | C | Fix links (play) or redirect | 1 |
| `broken_external` | Warning | External link returns 4xx or 5xx | C | Update or remove the link | 1 |
| `timeout` | Error | Page didn't answer in 20 s after retries | C | | 1 |
| `redirect_chain` | Warning | 2 or more hops before the final page | C | Point the first URL straight at the final one (redirect play) | 1 |
| `redirect_loop` | Error | Redirects return to an earlier URL | C | | 1 |
| `redirect_to_error` | Error | Redirect ends at 4xx or 5xx | C | | 1 |
| `link_to_redirect` | Notice | Internal link points at a URL that redirects | C | Update the link (play) | 1 |
| `temporary_redirect` | Notice | 302 or 307 used for a move that's been in place for 2+ crawls | C | Make it 301 | 2 |
| `meta_refresh` | Warning | Page redirects with meta refresh or JavaScript | C, R | Use a server redirect | 1 |
| `orphan` | Warning | In a sitemap, Search Console or Analytics, but no crawled page links to it | C, G | Add internal links (play) | 3 |
| `deep_page` | Notice | 4 or more clicks from the home page; Warning when the page has clicks or citations | C | Link from closer pages | 1 |
| `infinite_space` | Warning | URL pattern with over 50 parameter combinations or repeating path parts | C | Block in robots.txt or canonicalize | 2 |
| `nofollow_internal` | Notice | Internal link with rel=nofollow | C | Remove nofollow | 1 |
| `only_js_links` | Warning | Links that only exist after rendering, or `onclick` without `href` | R | Use real `<a href>` links | 3 |
| `slow_server` | Warning | Response time over 1 s (Notice over 600 ms) | C | | 1 |
| `big_html` | Notice | HTML over 2 MB (Google reads the first 15 MB, AI crawlers often less; check) | C | | 2 |
| `firewall_blocks_bots` | Error | Bot UA gets 403, 429 or a challenge page where a normal fetch gets 200 | C | CDN settings guide | 4 |

### 7.2 Indexability

| id | Sev | Rule | Data | Fix / play | Phase |
|---|---|---|---|---|---|
| `noindex_important` | Error | noindex (meta or header) on a page in a sitemap, with clicks, or linked from navigation | C, G | Remove noindex (play) | 1 |
| `noindex_in_sitemap` | Warning | Sitemap lists a noindex page | C | Remove from the sitemap | 1 |
| `canonical_missing` | Notice | Indexable page has no canonical | C | Add a self canonical (play) | 1 |
| `canonical_elsewhere` | Notice | Canonical points to another URL (fine for duplicates; listed so people can check) | C | | 1 |
| `canonical_to_error` | Error | Canonical points to a 3xx, 4xx, 5xx or noindex page | C | Fix the canonical (play) | 1 |
| `canonical_relative` | Notice | Canonical is a relative URL | C | | 1 |
| `canonical_multiple` | Warning | More than one canonical (HTML and header disagree, or two tags) | C | | 1 |
| `canonical_js_changed` | Warning | Rendered canonical differs from raw | C, R | | 3 |
| `google_other_canonical` | Warning | Google chose a different canonical than ours | G | | 2 |
| `duplicate_content` | Warning | Two or more indexable pages with the same main-text hash, no canonical between them | C | Canonical or redirect | 2 |
| `near_duplicate` | Notice | Main text over 90% similar (simhash) between indexable pages | C | | 2 |
| `soft_404` | Warning | 200 page that reads like an error (short text with "not found", "no results") or Google says soft 404 | C, G | Return 404 or add content | 2 |
| `thin` | Notice | Indexable page under 200 words of main text | C | | 1 |
| `not_indexed_valuable` | Error | Google: "Crawled, currently not indexed" or "Discovered, currently not indexed" on a page in the sitemap | G | Improve the page and its internal links; request indexing | 2 |
| `indexed_should_not` | Warning | Google has indexed a URL with parameters, a staging host or a noindex page | G | | 2 |
| `http_and_https` | Error | HTTP version returns 200 instead of redirecting | C | | 1 |
| `www_and_bare` | Error | Both www and non-www return 200 | C | | 1 |
| `trailing_slash_dupes` | Warning | `/page` and `/page/` both 200 without a canonical | C | | 1 |
| `case_dupes` | Notice | URLs differing only by case both 200 | C | | 2 |
| `parameter_dupes` | Warning | Same page under tracking or sort parameters, indexable | C | Canonical (play) | 2 |
| `pagination_canonical` | Warning | Page 2+ of a list canonicalized to page 1 (hides those items) | C | | 2 |

### 7.3 Rendering

| id | Sev | Rule | Data | Phase |
|---|---|---|---|---|
| `js_main_content` | Warning | Over 30% of the rendered main text is missing from raw HTML (Error over 70%) | C, R | 3 |
| `js_title_meta` | Warning | Title, description or H1 only after rendering, or different after rendering | C, R | 3 |
| `js_schema_only` | Notice | Structured data only after rendering | C, R | 3 |
| `js_links_only` | Warning | Over 20% of internal links only after rendering | C, R | 3 |
| `render_errors` | Notice | JavaScript errors in the console on load | R | 3 |
| `render_blocked_requests` | Warning | Requests the page needs fail or are blocked by robots.txt | R | 3 |
| `render_timeout` | Notice | Page not settled in 10 s | R | 3 |
| `empty_shell` | Error | Raw HTML has under 50 words and a single root div | C | 1 |
| `lazy_content_hidden` | Notice | Text that appears only after scroll or click (tabs, accordions are fine; infinite scroll isn't) | R | 4 |

### 7.4 Links and structure

| id | Sev | Rule | Data | Phase |
|---|---|---|---|---|
| `weak_internal` | Warning | Page in the top 20% by value with internal rank in the bottom 20% | C, G, A | 3 |
| `few_links_in` | Notice | Indexable page with 1 internal link in | C | 1 |
| `many_links_out` | Notice | Over 300 links on one page | C | 1 |
| `empty_anchor` | Notice | Internal link without text or alt | C | 1 |
| `generic_anchor` | Notice | Internal anchors like "click here", "read more" over 20% of a page's links in | C | 2 |
| `image_link_no_alt` | Notice | Linked image without alt | C | 1 |
| `external_nofollow_all` | Notice | Every external link is nofollow (a plugin setting gone wrong) | C | 2 |
| `link_to_http` | Notice | Internal link to http:// | C | 1 |

### 7.5 Content basics (on-page, kept from today and grown)

`missing_title` (Error), `duplicate_title` (Warning), `title_long` (over 60 characters or 580 px, Notice), `title_short` (under 20, Notice), `missing_description` (Warning), `duplicate_description` (Notice), `description_long` (over 160, Notice), `missing_h1` (Warning), `multiple_h1` (Notice), `h1_equals_title` (Notice, off by default), `heading_skips` (Notice: H2 to H4), `missing_alt` (Warning), `big_images` (over 200 KB, Notice), `no_share_image` (Notice), `lang_missing` (Notice), `viewport_missing` (Warning), `text_hidden_mobile` (Warning, phase 4: words in the mobile render much lower than desktop). Plays already exist for titles, descriptions and alt text.

### 7.6 Speed

| id | Sev | Rule | Data | Phase |
|---|---|---|---|---|
| `cwv_fail_origin` | Error | Origin fails Core Web Vitals on mobile (any metric poor at p75) | V | 2 |
| `lcp_poor` | Warning | URL or template LCP over 4 s (Notice 2.5 to 4 s) | V | 2 |
| `inp_poor` | Warning | INP over 500 ms (Notice 200 to 500 ms) | V | 2 |
| `cls_poor` | Warning | CLS over 0.25 (Notice 0.1 to 0.25) | V | 2 |
| `ttfb_slow` | Notice | TTFB over 800 ms in the field | V | 2 |
| `render_blocking` | Notice | Lighthouse finds render-blocking resources saving over 500 ms | V | 2 |
| `unoptimized_images` | Notice | Lighthouse: images that could save over 100 KB | V | 2 |
| `no_compression` | Warning | HTML, CSS or JS served without gzip or brotli | C | 1 |
| `no_cache_headers` | Notice | Static files without cache headers | C | 2 |

### 7.7 Structured data

| id | Sev | Rule | Data | Phase |
|---|---|---|---|---|
| `schema_invalid_json` | Error | JSON-LD that doesn't parse | C | 1 |
| `schema_missing_required` | Warning | Missing fields Google requires for that type's rich result (Product: name plus offers, review or aggregateRating; Article: headline, image, datePublished; and so on) | C | 2 |
| `schema_mismatch` | Warning | Markup disagrees with the page (price, availability, rating count, headline) | C | 3 |
| `schema_none_template` | Notice | A template with no structured data where a type fits (Product pages without Product) | C | 1 |
| `org_missing` | Notice | Home page without Organization (or LocalBusiness) with logo and sameAs | C | 1 |
| `breadcrumb_missing` | Notice | Pages 2+ deep without BreadcrumbList | C | 2 |
| `rich_result_errors` | Warning | URL Inspection reports rich result errors | G | 2 |

There is no public API for Google's Rich Results Test, so required fields come from Google's documentation, kept in `src/lib/schemaRules.ts` with a test for each type (check the list against Google's docs each quarter).

### 7.8 International

| id | Sev | Rule | Data | Phase |
|---|---|---|---|---|
| `hreflang_no_return` | Error | Page A lists B, B doesn't list A | C | 2 |
| `hreflang_bad_code` | Error | Invalid language or region code (`en-UK`, `jp`) | C | 2 |
| `hreflang_to_error` | Error | hreflang target is 3xx, 4xx, 5xx, noindex or canonicalized elsewhere | C | 2 |
| `hreflang_no_self` | Warning | Page doesn't list itself | C | 2 |
| `hreflang_no_xdefault` | Notice | No x-default in a set | C | 2 |
| `hreflang_canonical_conflict` | Warning | hreflang points to a URL whose canonical differs | C | 2 |
| `lang_mismatch` | Notice | `html lang` disagrees with hreflang or the detected text language | C | 2 |

### 7.9 Security

`mixed_content` (Error: http assets on https pages), `cert_expiring` (Warning under 21 days, Error when expired), `no_hsts` (Notice), `http_live` (covered by `http_and_https`), `unsafe_cross_origin_links` (Notice, off by default), `insecure_form` (Warning: form posts to http).

### 7.10 Sitemaps

| id | Sev | Rule | Data | Phase |
|---|---|---|---|---|
| `sitemap_missing` | Warning | No sitemap in robots.txt or at /sitemap.xml | C | 1 |
| `sitemap_error_urls` | Warning | Sitemap URLs that redirect, 4xx, 5xx or are noindex or canonicalized elsewhere | C | 1 |
| `sitemap_missing_pages` | Notice | Indexable pages found by crawling that no sitemap lists | C | 1 |
| `sitemap_too_big` | Error | Over 50,000 URLs or 50 MB uncompressed in one file | C | 1 |
| `sitemap_bad_xml` | Error | Doesn't parse | C | 1 |
| `sitemap_lastmod_wrong` | Notice | Every URL has the same lastmod, or lastmod in the future | C | 2 |
| `sitemap_not_submitted` | Notice | Not submitted in Search Console | G | 2 |
| `sitemap_google_errors` | Warning | Search Console reports errors for the sitemap | G | 2 |

### 7.11 AI access

| id | Sev | Rule | Data | Phase |
|---|---|---|---|---|
| `ai_bots_blocked` | Error | robots.txt blocks a search or user bot (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User); Notice for training-only bots (GPTBot, ClaudeBot, Google-Extended, CCBot), since blocking training can be a choice | C | 1 (exists, split by kind) |
| `ai_firewall_block` | Error | Bot UA blocked or challenged by the firewall or CDN | C | 4 |
| `ai_js_dependent` | Error | Pages AI cites, or pages with clicks, where over 50% of text needs JavaScript | C, R, A | 4 |
| `ai_cited_page_broken` | Error | A page AI answers cite now returns an error, a redirect or noindex | C, A | 4 |
| `bing_blocked` | Error | Bingbot blocked (Bing feeds ChatGPT search and Copilot) | C | 4 |
| `no_indexnow` | Notice | No IndexNow key found (and the site has a CMS we can add it to) | C | 4 |
| `no_llms_txt` | Notice | No llms.txt (kept low: Google says its AI features don't need it, and most AI crawlers don't read it yet) | C | 1 (exists) |
| `llms_txt_broken_links` | Notice | llms.txt lists pages that error or redirect | C | 4 |
| `noai_meta` | Notice | `noai` or `noimageai` meta present (listed so it's a choice, not an accident) | C | 4 |
| `answer_ready` | Notice | Pages with clicks or citations that lack a direct answer near the top, FAQ or HowTo markup where questions exist (reuses the free AI Answer-Ready Checker's `pageFacts`) | C | 4 |

### 7.12 Logs (phase 6)

`bot_never_visits_important` (Warning), `bot_wastes_crawl` (Warning: over 30% of Googlebot hits on parameters, redirects or errors), `bot_errors_spike` (Error: 5xx to Googlebot over 5% on a day), `fake_bots` (Notice), `ai_user_fetches` (info card: pages fetched live by ChatGPT-User and Perplexity-User).

**Count:** about 140 checks at the end of phase 6, against 17 today.

---

## 8. Google and other connections

### 8.1 Google Search Console

- **Sign-in:** add `https://www.googleapis.com/auth/webmasters.readonly` to the Google sign-in we have for GA4 (`src/lib/google.ts`), asked only when someone connects Search Console (incremental consent). Tokens are encrypted the same way. Customers never paste keys.
- **Property match:** list the person's properties (`sites.list`), pick the domain property for the brand's domain, else the best URL-prefix match. Show the match to confirm.
- **Search Analytics:** a nightly job pulls page-level clicks, impressions, CTR and position for the last 3 days (Google's data settles in about 2 days) and backfills 16 months on first connect, by page and by page plus query (top 1,000 queries per page). Limits: 1,200 queries a minute per site; large sites page through results 25,000 rows at a time (check the daily row limit).
- **URL Inspection:** 2,000 a day and 600 a minute per property, shared with any other tool the customer uses. We default to 1,500 a day (setting), in the order in 5.3. Each result fills `gsc_inspections`.
- **Sitemaps:** `sitemaps.list` daily for submitted counts, last read and errors. Submitting a sitemap needs the write scope (`webmasters`), so it's a separate "Allow Arrowsterr to submit sitemaps" button, off by default.
- **What the API can't do:** there's no API for the Page indexing report itself, so our index counts come from inspected pages, labeled "of pages inspected". The Indexing API only works for job postings and livestreams, so normal pages can't be pushed to Google; "Request indexing" opens Search Console's URL Inspection page for that URL.

### 8.2 Page value

Used to rank issues and pages everywhere:

```
value = 0.45 × norm(clicks 28d) + 0.20 × norm(impressions 28d) + 0.20 × norm(AI citations 30d)
      + 0.10 × norm(referring domains to the page) + 0.05 × norm(internal rank)
```

`norm` is the page's percentile on its own site. Without Search Console, the weights spread over what's left. Pure function in `src/lib/techValue.ts`, tested.

### 8.3 Chrome UX Report (CrUX) and PageSpeed Insights

- **CrUX API** (free with an API key, check the quota in the Cloud console; sources disagree on whether the default is 150 a minute or a day): origin data daily, URL data weekly for the top 200 pages by value and 3 pages per template.
- **CrUX History API:** origin and top pages weekly, about 25 weeks of history per call.
- **PageSpeed Insights API** (free, about 25,000 calls a day per project, check): lab runs for 3 pages per template per crawl and "Test now" in the screen. Mobile first.
- Both use one Google Cloud project key (`GOOGLE_API_KEY`), so customers set nothing up.

### 8.4 Bing Webmaster Tools and IndexNow

- **IndexNow:** the WordPress plugin generates and hosts the key file and pings `api.indexnow.org` when a post is published, updated or fixed by a play. For other CMSs we host nothing and show the steps. After every Fix, we ping IndexNow for the changed URLs.
- **Bing Webmaster Tools API (phase 5, optional):** crawl stats, index counts and keyword data from Bing, with an API key the customer pastes under Settings, Apps, Developers (a fallback, since Bing has no OAuth for this; check).

### 8.5 Data we already have

- **AI citations** (runs and sources, per brand), for AI access, page value and `ai_cited_page_broken`.
- **Backlinks** (`bl:rd:` and overview pages), for page value and to flag broken pages with backlinks (they also appear in Backlinks, Broken).
- **GA4** (when connected), for orphan detection (pages with visits but no links in) and page value when Search Console is missing.

---

## 9. Fixes

The Fix pattern stays: a change set for exactly the pages an issue lists, opened in a side panel to approve, apply and undo, then a recrawl of those pages.

| Fix | How | CMS | Phase |
|---|---|---|---|
| Titles, descriptions, alt text, structured data | Existing plays | All connected | exists |
| Remove noindex | Change the SEO plugin field or post meta | WordPress (Yoast, Rank Math, AIOSEO, SEOPress), Webflow, Shopify | 1 |
| Set canonical | Same | Same | 1 |
| Redirects (chains, 404s with backlinks) | Write redirects through Redirection or Rank Math, or Shopify URL redirects, Webflow 301s | WordPress, Shopify, Webflow | 2 |
| Update internal links that point at redirects or 404s | Edit the link in the post body | WordPress, Webflow | 2 |
| Add internal links to weak pages | Existing internal-links play, fed by link suggestions | All connected | 3 |
| robots.txt and llms.txt | Plugin writes the file; others get a file to copy | WordPress (plugin) | 4 |
| IndexNow | Plugin turns it on | WordPress | 4 |
| Image compression | Plugin hook or a list to export | WordPress (phase 5) | 5 |

After any fix: recrawl the changed pages within 5 minutes, ping IndexNow, and queue URL Inspection for them the next day, so the issue row shows "Fixed, Google saw it on Nov 12".

---

## 10. Plan limits

Crawling stays free within limits. Tasks cover extra.

| | Free | Starter | Pro | Agency | Enterprise |
|---|---|---|---|---|---|
| Pages per crawl | 100 | 2,000 | 10,000 | 50,000 | 500,000 (custom) |
| Scheduled crawls | Monthly | Weekly | Weekly, or daily for 1 site | Daily | Daily |
| JavaScript rendering | Off | Sample (3 per template) | Sample, or all up to 2,000 pages | All up to 20,000 pages | All |
| Search Console and Indexing | 1 property | Yes | Yes | Yes | Yes |
| URL Inspection a day per property | 100 | 500 | 1,500 | 1,500 | 1,500 |
| Monitoring key pages | none | 20, daily | 100, every 6 hours | 500, every 6 hours | 5,000, hourly |
| Bot logs | none | none | 1 site | All sites | All sites |
| Extra pages | | 1 task per 50 pages over the limit | same | same | contract |

The Organic Research toolset (`seo` track) opens these screens, the same as today's Site Audit.

---

## 11. Reliability

A false failure costs more than a missing check. These rules are part of each phase's definition of done.

1. **Partial crawls get no score** and no alert (kept). New partial reasons: robots.txt 5xx, the firewall challenged our bot on the home page, over half the pages timed out, the crawl hit the 3-hour cap before 50% of found pages.
2. **Firewall detection before findings:** when our own UA gets challenge pages, the crawl stops early and says "Your firewall blocked our crawler", with the allow-list steps. It never reports hundreds of fake 403s as broken pages.
3. **Errors retry first:** timeouts, resets, 429 and 5xx retry twice with growing waits before they count. A page that fails on the first try and works on the retry is fine.
4. **Checks never guess:** a check that lacks its data shows "Not checked" (speed without CrUX data, indexing without Search Console, rendering when the page wasn't rendered). Unknown never counts as failed.
5. **Raw vs rendered is compared on main text only:** navigation, footer and cookie banners are stripped (readability-style main-content detection) before counting, so a cookie banner never turns a page "JavaScript-dependent".
6. **Duplicate checks normalize URLs** the same way everywhere (one `normUrl` with tests): lowercase host, no default port, no fragment, sorted query, tracking parameters dropped (utm_*, gclid, fbclid, msclkid), trailing slash kept as is.
7. **Bot-access checks need two strikes:** a block counts only when two fetches a minute apart both fail for the bot and both succeed for a normal browser UA.
8. **Monitoring alerts need confirmation:** a change counts after a second fetch 2 minutes later agrees. One alert per incident, closed when the page recovers.
9. **Leases, not locks:** queue rows are leased for 2 minutes. A dead worker's rows come back. A crawl with no progress for 15 minutes is resumed by another worker; after 3 resumes it's marked failed and keeps what it read.
10. **Tests for every check** in `tests/techChecks.test.ts` with HTML fixtures, including flaky ones: a page that times out once, a 429 then 200, a challenge page, a JavaScript-only shell, hreflang sets with one bad return link, and canonical loops. A check doesn't ship without its fixture tests.
11. **Crawler tests** against a local test server (`tests/crawlServer.ts`) that serves a 300-page site with redirects, loops, an infinite calendar, slow pages, robots rules and sitemaps. The crawl must find exactly the expected pages, depths and issues.

---

## 12. Phases

Estimates are for one engineer who knows the codebase. Each phase ships behind the `seo` track and is usable on its own.

### Phase 1: Crawler v2 and Site Audit v2 (5 weeks) — built November 2026

Shipped: the crawler as a chain of jobs in the web worker (the Chromium renderer stays for phase 3), crawl_queue and crawl_pages (templates are a column, not a table yet), about 70 checks, area scores, the rebuilt Site Audit with Overview, Issues and Pages tabs, crawl settings, and plan page limits (Agency 20,000 and Enterprise 50,000 for now). Not yet: Fix for noindex and canonicals (they need new CMS plays), crawl-to-crawl page comparison, and the separate Pages screen in the sidebar (Pages is a Site Audit tab). See `docs/site-audit.md`.

- Tables from 6.2 (crawls, crawl_urls, crawl_pages, crawl_links, crawl_issues, crawl_templates) in `supabase/0NN_crawler.sql`.
- Fetcher loop in the worker container; queue with leases; per-host speed; retries; redirect hops; sitemap index and gzip; robots.txt per bot; link checks.
- Templates by URL pattern.
- Checks marked phase 1 in section 7 (about 70).
- Health score plus area scores; partial rules.
- Site Audit hub (5.1) without page value and summary, crawl settings, compare crawls.
- Pages screen (5.2) with columns, filters, segments and the page drawer (Overview, Issues, Links, Headers).
- Fixes: remove noindex, set canonical.
- Migration: new crawls write to the new tables; `site_audits` keeps old crawls; Zippie's `start_site_audit` and `get_site_audit` read the new tables.
- **Done when:** a 10,000-page test site crawls in under 30 minutes on one worker; the crawler test site gives the exact expected results; old Site Audit tests still pass.

### Phase 2: Google connections (3 weeks) — built November 2026

Shipped: Search Console sign-in (its own connection, read only), property match, the daily sync (days, pages, sitemaps, URL Inspection within 1,500 a day), the Indexing screen, the Chrome UX Report sync (origin with history, top pages), the Speed screen with PageSpeed lab tests, 9 Google checks in Site Audit and "What to fix first" ranked by search clicks. Not yet: the Claude summary above the issue list, redirect fixes, and the full page value formula (clicks only for now). See `docs/indexing-speed.md`.

- Search Console sign-in, property match, Search Analytics nightly sync and backfill, URL Inspection scheduler, Sitemaps.
- Indexing screen (5.3).
- CrUX, CrUX History and PageSpeed connections; Speed screen (5.4).
- Page value (8.2) and "What to fix first" ranking; Claude summary.
- Checks marked phase 2.
- Fixes: redirects, links to redirects and 404s.
- **Done when:** a connected test property shows index status for 1,500 pages a day without hitting quota errors; speed screen matches PageSpeed Insights for the same URL.

### Phase 3: Rendering and structure (3 weeks)

- Renderer loop with Chromium; sample and full modes by plan; screenshots.
- Raw vs rendered in the page drawer; rendering checks.
- Graph pass: depth, orphans, internal rank; Site structure screen (5.5) with crawl map and link suggestions.
- DOM fingerprint for templates.
- **Done when:** a JavaScript-only test page is flagged; a server-rendered page with a cookie banner isn't; internal rank matches a reference PageRank on the test site within 1%.

### Phase 4: AI access (2.5 weeks)

- Bot matrix with robots.txt, firewall, meta and readable-text columns.
- Competitor pages AI cites and "what they do that you don't".
- llms.txt checks and writer play; IndexNow in the WordPress plugin and the post-fix ping.
- AI access screen (5.6); AI checks; `ai_cited_page_broken` also on the AI Visibility pages that list citations.
- **Done when:** a test site behind a challenge page for GPTBot is flagged "likely blocked by firewall" and a site that allows everything isn't.

### Phase 5: Monitoring (2 weeks)

- `monitor_pages` and `monitor_events`; scheduler; change detection with confirmation; timeline screen (5.7); email and Slack alerts; daily digest.
- Bing Webmaster Tools (optional), image fixes.
- **Done when:** a test page that gains a noindex alerts within 15 minutes (on the 6-hour plan, at the next check plus confirmation), once.

### Phase 6: Bot logs (3 weeks)

- Upload and parse logs; Cloudflare Logpush reader; bot verification by IP ranges and reverse DNS; daily rollups; Bot logs screen (5.8); log checks.
- **Done when:** a sample Nginx log with fake Googlebot hits counts them as fake; real hits match IP ranges.

**Total:** about 18.5 weeks. Phases 1 and 2 give the biggest jump (Semrush and Ahrefs level, plus Google's own data). Phases 3 and 4 make us lead on AI.

### What Zippie gets

New MCP tools and skills, following `docs/skills.md` rules: `get_site_health` (exists, extended with areas and top fixes), `get_page_tech` (one URL's facts, issues, index status and speed), `get_indexing` (index status by reason), `get_ai_access` (bot matrix and JavaScript dependence), `start_crawl`. A "Technical fix plan" skill reads the audit and writes a prioritized plan; it never changes the site without a confirm card.

---

## 13. Running cost

Assumptions (check against real use after phase 1):
- About 2 sites per team, average 2,000 pages a site, crawled weekly: 4 crawls × 2 sites × 2,000 = **16,000 pages per team a month**.
- JavaScript rendering on about 10% of pages: **1,600 renders per team a month**.
- One Claude summary per crawl: 8 per team a month, about 4,000 tokens in and 600 out each.
- Search Console, CrUX, PageSpeed, URL Inspection and IndexNow are free within Google's and IndexNow's limits.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Pages fetched a month | 800,000 | 8,000,000 |
| Pages rendered a month | 80,000 | 800,000 |
| Crawl and render compute | Fits a bigger VPS plan: upgrade the current one by one size (about +$10, check) | A second VPS for crawl workers, 8 vCPU and 32 GB (about $25, check) plus one size up on the main one (about +$10, check) |
| Database storage (last 2 crawls of pages and links, about 18 MB per 2,000-page crawl, plus Search Console rows) | About 4 GB, inside the VPS disk: $0 | About 45 GB, inside the bigger disk: $0; backups grow (about +$5, check) |
| Screenshots (WebP, 30 days, about 25 KB each) | 2 GB on the VPS: $0 | 20 GB on the VPS: $0 |
| Claude summaries (Sonnet, about $0.021 per crawl at $3 and $15 per million tokens, check) | 400 crawls: about $8 | 4,000 crawls: about $84 |
| Google APIs (Search Console, CrUX, PageSpeed) | $0 | $0 |
| IndexNow, Bing Webmaster | $0 | $0 |
| Alert emails (inside Resend's current plan, check) | $0 | about $20 more on the next Resend tier (check) |
| Bot logs (phase 6): Cloudflare R2 for Logpush, about 10 sites at Beta and 100 at Growth (check) | about $3 | about $15 |
| **Monthly total added** | **about $21** | **about $160** |

**Compared with buying the crawl:** DataForSEO's On-Page API lists $0.00015 a page and $0.0015 a page with JavaScript (check; some pages show $0.000125 and $0.00125). At Growth, 8,000,000 pages and 800,000 renders would cost about $1,200 + $1,200 = **$2,400 a month**, plus browser-rendered speed data at $0.0051 a page. Our own crawler costs about $40 of servers. We keep DataForSEO for what it's best at (backlinks, keywords, SERPs).

**Tasks:** crawls inside the plan's page limit take no tasks, as today. Pages over the limit take 1 task per 50 pages (about $0.10 of plan value per 5,000 pages, against about $0.01 of server cost).

---

## 14. Open questions

1. Should the Free plan get Search Console? It drives sign-ups, but URL Inspection quota is per customer, so it costs us nothing. Recommended: yes, 1 property, 100 inspections a day.
2. Do we show competitor technical audits? Crawling competitors is allowed within robots.txt and polite speed. It could be a Compare tab later (their speed, AI access and structure next to ours).
3. Which CMSs get redirect fixes first? WordPress covers most customers (check the connection counts); Shopify and Webflow next.
4. Log access: is a Cloudflare app worth it (one click for Cloudflare customers) before phase 6? It would also confirm the firewall check for AI bots.

---

## Sources

- [Technical SEO Checklist 2026: 34 Critical Fixes (ALM Corp)](https://almcorp.com/blog/technical-seo-checklist/)
- [Technical SEO Audit Checklist 2026: 200+ Items (Digital Applied)](https://www.digitalapplied.com/blog/technical-seo-audit-checklist-200-items)
- [Technical SEO Checklist 2026 (Seomatic)](https://seomatic.ai/resources/technical-seo-checklist)
- [Technical SEO Checklist (Mud)](https://ournameismud.co.uk/articles/technical-seo-checklist)
- [2026 Technical SEO Checklist for Crawling and Indexing (Crawl Compass)](https://crawlcompass.com/blog/technical-seo-checklist)
- [Technical SEO Checklist 2026: What Really Matters (NoGood)](https://nogood.io/blog/technical-seo-checklist/)
- [Sitebulb vs Screaming Frog vs Ahrefs vs Semrush (Net Partners)](https://netpartners.marketing/seo-audit-tools-2026-ahrefs-semrush-screaming-frog-sitebulb-comparison/)
- [Best SEO Audit Tools 2026 (Hybrid Ranking)](https://hybridranking.com/blog/best-seo-audit-tools-2026)
- [Best SEO Audit Tools Backed by 1,200+ Website Tests (One Little Web)](https://onelittleweb.com/top-tools/best-seo-audit-tools-2/)
- [Search Console API usage limits (Google)](https://developers.google.com/webmaster-tools/limits?hl=nl)
- [Welcoming the new Search Console URL Inspection API (Google)](https://developers.google.com/search/blog/2022/01/url-inspection-api?hl=da)
- [CrUX History API (Chrome for Developers)](https://developer.chrome.com/docs/crux/history-api)
- [PageSpeed Insights API rate limits (Unlighthouse)](https://unlighthouse.dev/learn-lighthouse/pagespeed-insights-api/rate-limits)
- [DataForSEO On-Page API pricing](https://dataforseo.com/pricing/on-page/onpage-api)
- [The cost of On-Page API parameters (DataForSEO)](https://dataforseo.com/help-center/cost-of-onpage-api-parameters)
- [Technical SEO for AI Search (Omnius)](https://www.omnius.so/blog/technical-seo-for-ai-search)
- [Technical SEO for AI crawlers: robots.txt, IndexNow and schema (Fuel Online)](https://fuelonline.com/seo/technical-seo-for-ai-crawlers-the-complete-robots-txt/)
- [Technical SEO for AI crawlability (ZipTie)](https://ziptie.ai/blog/technical-seo-for-ai-crawlability/)
- [AI Crawler Optimization: the 2026 playbook (Quillly)](https://quillly.com/blogs/ai-crawler-optimization-2026)
- [Botify vs Lumar comparison (Prerender)](https://prerender.io/?p=4322)
- [Conductor vs Botify (Conductor)](https://www.conductor.com/compare/botify-vs-conductor/)
- [ContentKing alternatives (Search Atlas)](https://searchatlas.com/contentking-alternatives)
- [JetOctopus vs Lumar (G2)](https://www.g2.com/compare/jetoctopus-vs-lumar-formerly-deepcrawl)
