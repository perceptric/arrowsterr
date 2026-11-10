# Site Audit

The Site Audit screen (Technical SEO, Site Audit, at `/site-audit`) shows a brand's latest crawl: a health score from 0 to 100, the change since the last full crawl, and every issue with the pages it hits. It is step 1 of the new tools plan (Local Research, Content Map, Backlinks, Link Building, Site Audit, On-page Audit).

The crawler already existed for Zippie (`src/lib/audit.ts`). This adds the screen, history per brand, a weekly crawl, an email when the score drops, and Fix buttons that prepare changes in the brand's CMS.

With Search Console and the Chrome UX Report connected (`docs/indexing-speed.md`), crawls add 9 Google checks and each issue carries the search clicks on its pages.

## What it shows

- **Score:** a half dial, the change since the last full crawl, and the scores of the last 8 full crawls.
- **Facts:** when it crawled, pages read (of pages found), broken links, AI crawlers blocked by robots.txt.
- **Fixed since the last crawl:** issues that were there before and are gone now.
- **Issues:** grouped by High, Medium and Low priority. Each row has a bar for the share of pages it hits, its change since the last crawl (New, more or fewer), and a page count. Opening a row shows why it matters and every page it hits, or every broken link with the page it was found on.
- **Fix:** meta descriptions and titles, alt text and structured data. Fix starts a change set (`plays.ts`) for exactly the pages the issue lists, in the brand's own connected site, and opens it in a side panel to approve, apply and undo. A brand without a connected site gets a Connect website button.

## Rendering and link score

After the fetch, the worker's Chromium renders pages the way Google does (phone, JavaScript on) and the crawl compares them with the raw HTML: the Rendering tab in a page's panel, Raw text and Link score columns in Pages, and 11 rendering checks (most text only after JavaScript, robots or canonical changed by JavaScript, links only after JavaScript, failed requests, JavaScript errors, robots.txt blocking scripts or styles, and more). Each page also gets a link score from 0 to 10 from the site's own links. See `docs/site-structure.md`.

## AI access

Each crawl also checks 16 search and AI crawlers against robots.txt, the firewall and robots meta tags, reads llms.txt and the brand's pages AI cites, and adds 10 AI checks. See `docs/ai-access.md`.

## Reliability

A false "healthy" costs more than no score, so:

- **Partial crawls get no score** (`partialReason` in `src/lib/siteAudit.ts`). A crawl is partial when the homepage didn't load, when more than half of the pages didn't answer at all, when robots.txt returns a server error, or when the crawl hit its 3-hour cap. Pages that answer with an error (404, 500) still count: they are findings.
- **A firewall that blocks our crawler stops the crawl** with "Your firewall blocked our crawler" instead of reporting every page as broken.
- **A crawl that stops early keeps what it read,** marked partial with the reason, and no score.
- **Unknown is never broken:** links to pages the crawl didn't fetch, and canonicals to pages it didn't fetch, are never counted as errors. Outbound links that answer 401, 403 or 429 are a site refusing bots, not a broken link.
- **Hiccups retry first:** a page that fails once and loads on the retry is fine, and its response time is the retry's.
- **The change arrow and the alert only compare full crawls.** Partial and failed crawls are skipped.
- **A crawl that goes quiet for 20 minutes** (no progress report, so the worker died) is closed as failed, so the next one can start. Long crawls report progress every few seconds, so they're never cut off for running long.
- **Fix finds CMS pages by address** with or without www, a trailing slash or different case (`matchesPages`). Before, a crawled `acme.com/post` never matched the CMS's `www.acme.com/post/`, so the play changed nothing.
- Tests: `tests/siteAudit.test.ts` and `tests/techChecks.test.ts` (URL cleaning, templates, page reading, every group of checks, link counting and depth, sitemaps, settings, the quiet-crawl rule). The crawler itself was run end to end against a local test site with a flaky page, a redirect chain, a robots.txt block, an orphan, duplicates, a noindex page in the sitemap and an endless calendar, and split across many short jobs with the same result.

## Weekly crawl and alert

- Each brand crawls again a week after its last crawl, on the daily job (`queueWeeklyAudits`). Brands start weekly crawls after their first crawl, so nothing runs for a brand nobody audited.
- Editors turn it off with the Weekly crawl switch (`brands.audit_weekly`).
- Only workspaces with Organic Research open and not read-only are crawled.
- When a full crawl's score is 5 or more points under the last full crawl, people with alerts on get one email per crawl (`auditDropEmail`), listing the new issues first.

## Data

`supabase/067_crawler.sql`: `crawl_queue` (server only), `crawl_pages` (viewers may read), `site_audits.crawl`, `settings` and `heartbeat_at`, `brands.audit_settings`. The two newest finished crawls per brand keep their page rows; older ones keep their summary.

`supabase/061_site_audits.sql`:
- `site_audits.brand_id`, with crawls made before it matched to the brand with the same domain.
- `brands.audit_weekly`, on by default.

Reading crawls needs no route: the page reads `site_audits` and `crawl_pages` as the signed-in person, and viewers may read. `/api/site-audit` takes `start`, `weekly`, `settings` and `fix` from editors. Zippie's `start_site_audit` now saves the crawl to the brand with that domain, so it shows on the screen too.

## Running cost

Crawls are plain page loads from the worker. They use no paid API and no Claude tokens. Fix runs the existing plays, which already count against the plan's tasks.

Assumptions: about 2 sites per team, 2,000 pages each on average, crawled weekly: about 16,000 page loads per team a month (800,000 at Beta, 8,000,000 at Growth). Page rows for the last 2 crawls are about 9 KB a page, about 4 GB at Beta and 40 GB at Growth.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Crawl compute on the VPS (one size up at Beta; a second VPS for workers at Growth, check) | ~$10 | ~$35 |
| Database storage for page rows (inside the VPS disk) | $0 | $0 |
| Bigger backups (check) | $0 | ~$5 |
| Alert emails (inside Resend's current plan, check) | $0 | $0 |
| Fixes (existing plays, Claude, already in the plan's tasks) | $0 extra | $0 extra |
| **Monthly total added** | **~$10** | **~$40** |

## Example data

Before the first result, the screen is the title, the tool's search bar (`src/components/SearchBar.tsx`) and what the tool shows (`src/components/ToolIntros.tsx`), the same as Keyword Research. There is no example report. This adds $0 a month at Beta and at Growth.
