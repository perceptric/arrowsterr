# Site Audit

The Site Audit screen (Technical SEO, Site Audit, at `/site-audit`) shows a brand's latest crawl: a health score from 0 to 100, the change since the last full crawl, and every issue with the pages it hits. It is step 1 of the new tools plan (Local Research, Content Map, Backlinks, Link Building, Site Audit, On-page Audit).

The crawler already existed for Zippie (`src/lib/audit.ts`). This adds the screen, history per brand, a weekly crawl, an email when the score drops, and Fix buttons that prepare changes in the brand's CMS.

## What it shows

- **Score:** a half dial, the change since the last full crawl, and the scores of the last 8 full crawls.
- **Facts:** when it crawled, pages read (of pages found), broken links, AI crawlers blocked by robots.txt.
- **Fixed since the last crawl:** issues that were there before and are gone now.
- **Issues:** grouped by High, Medium and Low priority. Each row has a bar for the share of pages it hits, its change since the last crawl (New, more or fewer), and a page count. Opening a row shows why it matters and every page it hits, or every broken link with the page it was found on.
- **Fix:** meta descriptions and titles, alt text and structured data. Fix starts a change set (`plays.ts`) for exactly the pages the issue lists, in the brand's own connected site, and opens it in a side panel to approve, apply and undo. A brand without a connected site gets a Connect website button.

## Reliability

A false "healthy" costs more than no score, so:

- **Partial crawls get no score** (`partialReason` in `src/lib/siteAudit.ts`). A crawl is partial when the homepage didn't load, or when more than half of the pages didn't answer at all. Pages that answer with an error (404, 500) still count: they are findings.
- **A crawl that stops early keeps what it read,** marked partial with the reason, and no score. Before, it was lost.
- **The change arrow and the alert only compare full crawls.** Partial and failed crawls are skipped.
- **A crawl stuck for 45 minutes** (the worker died) is closed as failed, so the next one can start.
- **Fix finds CMS pages by address** with or without www, a trailing slash or different case (`matchesPages`). Before, a crawled `acme.com/post` never matched the CMS's `www.acme.com/post/`, so the play changed nothing.
- Tests: `tests/siteAudit.test.ts`.

## Weekly crawl and alert

- Each brand crawls again a week after its last crawl, on the daily job (`queueWeeklyAudits`). Brands start weekly crawls after their first crawl, so nothing runs for a brand nobody audited.
- Editors turn it off with the Weekly crawl switch (`brands.audit_weekly`).
- Only workspaces with Organic Research open and not read-only are crawled.
- When a full crawl's score is 5 or more points under the last full crawl, people with alerts on get one email per crawl (`auditDropEmail`), listing the new issues first.

## Data

`supabase/061_site_audits.sql`:
- `site_audits.brand_id`, with crawls made before it matched to the brand with the same domain.
- `brands.audit_weekly`, on by default.

Reading crawls needs no route: the page reads `site_audits` as the signed-in person, and viewers may read. `/api/site-audit` takes `start`, `weekly` and `fix` from editors. Zippie's `start_site_audit` now saves the crawl to the brand with that domain, so it shows on the screen too.

## Running cost

Crawls are plain page loads from the worker (up to 200 pages and 120 link checks each). They use no paid API and no Claude tokens. Fix runs the existing plays, which already count against the plan's tasks.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Weekly crawls, about 2 brands per team (plain page loads) | $0 | $0 |
| Worker time for crawls (fits the current Fly worker at Beta, a share of a second 2 GB machine at Growth, check) | $0 | ~$12 |
| Alert emails (inside Resend's current plan, check) | $0 | $0 |
| Fixes (existing plays, Claude, already in the plan's tasks) | $0 extra | $0 extra |
| **Monthly total added** | **$0** | **~$12** |

## Example data

Before the first real result, the screen shows example data from `src/lib/demo.ts`, tagged "Example data". Tabs, filters, panels and the map all work. The buttons that fetch real data stay live. Buttons that would change real records are off. It runs in the browser, so it adds $0 a month at Beta and at Growth.
