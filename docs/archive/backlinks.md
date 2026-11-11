# Backlinks

The Backlinks screen (Technical SEO, Backlinks, at `/backlinks`) shows who links to any site, subdomain or page, which sites link to competitors but not to it, and up to 200 sites side by side. It is step 3 of the new tools plan, after Site Audit and On-page Audit.

## Search

- **Any site or page.** The search bar has a Look at picker (Root domain, Subdomain, Exact URL) and a box to type in, like Domain Research. Typing guesses the picker: `blog.acme.com` is a subdomain, `acme.com/pricing` or `acme.com/blog` is an exact page. It starts on the brand's own domain.
- **Quick picks** under the bar: the brand and its profile competitors, one click each.
- **Click through.** A linking site's name, a gap site's name or a most-linked page runs Backlinks for it; the arrow opens the site itself. "Open in Domain Research" opens the same site there.
- **In the address bar,** like Domain Research: `/backlinks?q=ahrefs.com&view=links`, `/backlinks?q=acme.com/pricing&scope=url`. A search can be shared or bookmarked, and Back steps through searches.
- **A page** has no weekly history or page list, so its overview shows nofollow sites and broken backlinks in place of new and lost sites. Its link gap is its site's gap.
- **Snapshots** and week-on-week arrows are for the brand's own domain only.
- **CSV export** on anchors, most linked pages, links, the link gap and Compare.

## Tabs

The screen is the search bar, the target's name and eleven tabs under it. The code is `src/components/BacklinksPage.tsx` (search, tabs, address bar) and one file per group of tabs in `src/components/backlinks/`.

**Overview** (one saved answer, 6 requests)
- **Six numbers:** linking sites (with a year's trend and the change since last week's snapshot), backlinks, authority (with its change over the year), follow share, referring IPs and subnets, spam level.
- **Growth:** linking sites, backlinks or authority by month for the last year (`timeseries_summary`).
- **New and lost linking sites by week:** the last 12 weeks.
- **Authority of linking sites:** the 1,000 strongest linking sites by authority band of 10.
- **Anchor mix:** anchors sorted into brand, URL, generic and keyword (`anchorGroup`), flagged when keyword anchors pass 30%.
- **Link attributes:** follow and nofollow backlinks, with UGC and sponsored counts.
- **Top-level domains, site types, where links sit on the page, link types:** from the summary's own lists (`internal_list_limit: 20`), so they cost nothing extra.
- **Top anchors and most linked pages,** each opening its full tab.

**Referring domains:** the 1,000 strongest linking sites, saved with the overview. Filters run in the browser at no cost: authority (any, 30+, 60+, 80+), follow only, new in 30 days, AI cites it, .edu and .gov, hide spam, and a search box.

**Backlinks:** one row per linking site, 100 a page, with the words before and after each anchor, the page title, follow, UGC, sponsored, spam, new or lost, and where the link sits. Lists: All, New, Lost, Follow, Nofollow, UGC, Sponsored, Spam, plus "In the article" and "Anchor contains".

**Anchors:** up to 100 anchors with their group, linking sites, share and backlinks, filtered by group.

**Linked pages:** up to 100 pages by linking sites. A page's name opens its own backlinks.

**Broken:** links to the target's pages that are gone (`is_broken`), grouped by dead page with its status, the strongest linking sites, and a live page to redirect it to (`suggestRedirect`: the most linked page that shares the most words with the dead address, or the home page). The redirects copy as `old new 301` lines.

**AI-cited links:** the sites the brand's AI answers cited in the last 30 days (up to 100), how often and by which models, their authority, whether each links to the target, and which of up to 3 profile competitors it links to. Priority 1 to 5 (`aiLinkRows`) is highest for a much-cited, strong site that links to competitors and not to the target.

**Link gap:** up to 10 competitors. KPIs for the gap, sites linking to 2 or more competitors and sites AI cites; filters for 2+ competitors, AI cites it and authority 60+.

**Compare:** up to 200 sites or pages side by side (four bulk requests), and a year of linking sites and authority for up to 5 of them: growth with the first month set to 100, linking sites, or authority.

**Network:** the 18 strongest linking sites around the target. "Find second-tier sites" reads the strongest sites linking to the top 8 (40 each, authority 40+) and shows the ones that don't link to the target yet, most connected first.

**Toxic links:** each linking site's risk (`riskOf`): its spam score, plus very low authority, a spam-prone ending and many links from a weak site. High (60+) and check (30 to 59) lists, and a disavow file in Google's format (`domain:` lines) that fills as sites are ticked, kept in the browser per brand and target, to copy or download.

## Costs and saved answers

- Every DataForSEO answer is kept 7 days in `keyword_cache`. Opening the page asks for saved answers only (`peek`), so nobody spends tasks by opening it. Viewers see saved answers. Editors load or refresh.
- Opening the page or following a shared link reads saved answers only. A search, a quick pick or a tab someone picks loads fresh answers for editors when none are saved.
- **Tasks:** overview 40, linking sites on their own 15, each page of 100 links 6, broken links 10, AI-cited links 25, link gap 1 plus 8 per competitor, Compare 20 plus 1 for every 10 sites, each site's year of history 6, each site read for the network 6.
- Overviews saved before the profile and history were added (key `bl:ov:`) aren't reused; the first open after this change loads a fresh one (`bl:ov3:`). At about $0.005 a task, each covers its DataForSEO cost. The route is metered, so a failed request hands its tasks back on its own.
- **Snapshots:** each fresh overview saves the day's numbers to `backlink_snapshots` for the week-on-week arrows.

## Reliability

- **No false gaps.** The gap asks DataForSEO once per rival, with that rival as the only target and the brand in `exclude_targets`. A site that links to the brand never shows as a gap, and nothing depends on `intersection_mode` behaviour, which DataForSEO's docs don't spell out.
- **Partial overviews aren't kept.** The summary must answer. If the weekly chart, anchors or pages fail, the page shows what came back and nothing is saved, so the next open tries again instead of showing gaps for a week.
- **A site with no links** shows one plain line instead of empty charts.
- **The brand, its subdomains and the rivals** are never listed in their own gap.
- Tests: `tests/backlinks.test.ts` (targets from typed text, scope guesses, pasted lists, bulk answers joined by target).

These DataForSEO response shapes come from the docs and couldn't be called from the build sandbox (no DataForSEO login there). Check the first live load on a real brand: `summary`, `timeseries_new_lost_summary`, `anchors`, `domain_pages_summary`, `backlinks` and `domain_intersection`, all with `rank_scale: one_hundred`.

## Data

- `supabase/063_backlinks.sql`: `backlink_snapshots`.
- `/api/backlinks`: `overview`, `links` and `gap` (each with `target` and `scope`, the brand's domain when left out), `peers`, `bulk` and `add`. A plain domain keeps its old cache key; a subdomain or page has its own.
- Parsing and gap rules: `src/lib/backlinks.ts` (pure). Calls: `src/lib/backlinksServer.ts`.

## Running cost

DataForSEO Backlinks API: $0.024 a request plus $0.000036 a row, pay as you go, no monthly minimum listed (checked on the vendor's pricing page, November 2026). The per-row price on bulk requests, the `in` filter on `referring_domains` and the `referring_links_countries` list are "check": they come from the docs and couldn't be called from the build sandbox.

- **Overview:** 6 requests and about 1,250 rows (1,000 of them linking sites), about $0.19.
- **Page of links:** 1 request and 100 rows, about $0.028.
- **Broken links:** 1 request and up to 500 rows, up to $0.04.
- **AI-cited links:** 5 requests and up to 400 rows, about $0.13.
- **Link gap:** about $0.035 a competitor, about $0.11 for 3.
- **Compare:** 4 requests, about $0.10 for 10 sites, plus about $0.025 a site for its year of history (up to 5).
- **Network:** about $0.026 for each of 8 sites, about $0.21.

Typical use per team a month, with saved answers covering repeat opens: 8 overviews (own site and competitors), 8 pages of links, 2 broken-link checks, 2 AI-cited checks, 2 gaps of 3 competitors, 2 comparisons with history and 1 network, about $2.90. Saved answers are shared across workspaces, so a competitor many teams look up is paid for once a week.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| DataForSEO Backlinks API | ~$145 | ~$1,450 |
| Snapshots and cache rows (inside the VPS database) | $0 | $0 |
| **Monthly total** | **~$145** | **~$1,450** |

This change adds about $72 at Beta and $725 at Growth to the earlier ~$73 and ~$725. Tasks cover each request, so heavy use is paid for by the team's plan.

## Example data

Before the first result, the screen is the title, the tool's search bar (`src/components/SearchBar.tsx`) and what the tool shows (`src/components/ToolIntros.tsx`), the same as Keyword Research. There is no example report. This adds $0 a month at Beta and at Growth.
