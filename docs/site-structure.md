# Rendering and Site structure

Phase 3 of the Technical SEO plan (`docs/technical-seo-plan.md`). The crawler renders pages with Chromium, Site Audit compares raw HTML with what the browser saw, every page gets an internal link score, and a new screen, Site structure (Technical SEO, at `/site-structure`), shows how the pages link together.

## Rendering

- **When:** after the crawl has fetched every page, it queues the pages to render (`crawl_pages.render_state`) and waits. The worker's render loop (`scripts/worker.mjs`, `renders`) leases one page at a time from `/api/crawl/render-next`, renders it and posts the result to `/api/crawl/render-done`. The crawl checks back every 30 seconds and then finishes.
- **How many, by plan** (`RENDER_LIMIT` in `src/lib/tech/limits.ts`): Free none. Trial and Foundation render samples: 3 pages per template plus every page with under 100 words of raw text (at most 100). Scale and Thrive render up to 2,000 pages, Agency 20,000, Enterprise 50,000. The first page of each template also gets a phone screenshot (at most 40).
- **The browser:** a phone screen (412 by 915) with a phone Googlebot-style user agent that names ArrowsterrBot. Media and fonts are blocked, and images too unless a screenshot is wanted. Only public addresses load. It waits for the page to load (15 s) and then for the network to go quiet (10 s); a page still busy after that is marked "timed out" and read as it is.
- **Saved:** the rendered facts (`crawl_pages.rendered`): words, title, description, canonical, robots, H1s, headings, structured data, internal links, links only after JavaScript, JavaScript errors, failed requests, and the site's scripts and styles. Screenshots are JPEG, under 400 KB.
- **Checks** (`src/lib/tech/checks.ts`): most text only after JavaScript (high), robots changed by JavaScript (high), part of the text only after JavaScript, canonical changed, title or description changed, links only after JavaScript, failed requests, robots.txt blocks scripts or styles (medium), structured data only after JavaScript, JavaScript errors, page still loading (low). They only run on pages that rendered with a 2xx status.

## Reliability

- **A missed render never breaks a crawl.** A lease that goes 3 minutes without an answer goes back in the queue. If no render starts within 6 minutes, or none finishes for 10 minutes, the crawl marks the rest "skipped" and finishes with what it has. Pages that weren't rendered get no rendering checks.
- **Without the job queue there is no worker,** so the crawl skips rendering.
- **Shell pages are not flagged** for missing raw text when the rendered page is small too.
- **Leases are atomic:** a row is claimed only while it is still "queued", so two renderers never take the same page.
- Tested end to end: the worker rendered a JavaScript-only test page (flagged), server-rendered pages (not flagged) and pages with console errors and a failed fetch, inside a full crawl of a 44-page test site.

## Internal link score

PageRank over the site's own links (damping 0.85, 20 rounds; pages with no links out share their score evenly), on a log scale from 0 to 10: the home page is about 10 and a page with one weak link is near 0 (`LinkTally.rank` in `src/lib/tech/summary.ts`). Saved as `crawl_pages.internal_rank`.

## Site structure screen

- **Numbers:** pages crawled, average click depth, pages 4 or more clicks deep, orphans, redirect chains, links to redirects.
- **Crawl map:** every page as a dot (up to 1,500), its folder as the angle and its click depth as the ring, colored by link score. Pages not linked from home sit outside the rings.
- **Pages by click depth:** with Search Console connected, the pages that earn clicks are marked at each depth.
- **Folders:** pages, average depth, link score, links in and clicks per top folder.
- **Pages to fix:** pages that earn search clicks but sit 4+ deep, score under 3 or have 2 or fewer links in; orphans; lowest link score; redirect chains and links to redirects.
- **Suggest links:** pages that share at least 2 topic words with the page (from titles and H1s), strongest first, minus pages that already link there, with the anchor text and the HTML to copy (`suggestLinks` in `src/lib/tech/structure.ts`).

## Data

`supabase/069_render.sql` adds to `crawl_pages`: `render_state`, `render_lease`, `render_shot`, `rendered`, `rendered_words`, `shot`, `internal_rank`. `/api/tech` gains `structure` and `suggest` (viewers may read).

## Running cost

Rendering runs on the existing worker. It uses no paid API and no Claude tokens.

Assumptions: about 2 sites per team crawled weekly; most teams on sample plans (about 150 renders a crawl), some on full plans. About 200,000 renders a month at Beta and 2,000,000 at Growth, at about 3 seconds of CPU each. Screenshots and rendered facts for the last 2 crawls add about 5 MB a site.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Render CPU on the worker (fits the current VPS at Beta; about 3 more cores at Growth, check) | ~$5 | ~$20 |
| Storage for rendered facts and screenshots (0.5 GB Beta, 5 GB Growth, inside the VPS disk) | $0 | $0 |
| Bigger backups (check) | $0 | ~$2 |
| **Monthly total added** | **~$5** | **~$22** |

Set `RENDERERS` on the worker to run more browsers at once (default 2, at most 6). Each takes about 300 MB of memory.
