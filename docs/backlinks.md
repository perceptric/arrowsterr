# Backlinks

The Backlinks screen (Links, Backlinks, at `/backlinks`) shows who links to any site, subdomain or page, which sites link to competitors but not to it, and up to 200 sites side by side. It is step 3 of the new tools plan, after Site Audit and On-page Audit. Step 4, Link Building, works the sites added here.

## Search

- **Any site or page.** The search bar has a Look at picker (Root domain, Subdomain, Exact URL) and a box to type in, like Domain Research. Typing guesses the picker: `blog.acme.com` is a subdomain, `acme.com/pricing` or `acme.com/blog` is an exact page. It starts on the brand's own domain.
- **Quick picks** under the bar: the brand and its profile competitors, one click each.
- **Click through.** A linking site's name, a gap site's name or a most-linked page runs Backlinks for it; the arrow opens the site itself. "Open in Domain Research" opens the same site there.
- **In the address bar,** like Domain Research: `/backlinks?q=ahrefs.com&view=links`, `/backlinks?q=acme.com/pricing&scope=url`. A search can be shared or bookmarked, and Back steps through searches.
- **A page** has no weekly history or page list, so its overview shows nofollow sites and broken backlinks in place of new and lost sites. Its link gap is its site's gap.
- **Snapshots** and week-on-week arrows are for the brand's own domain only.
- **CSV export** on anchors, most linked pages, links, the link gap and Compare.

## Compare

Up to 200 sites or pages, one per line (it starts with the brand and its competitors): authority, linking sites with a bar, backlinks, nofollow share and spam, biggest first, the brand's row marked You. One click on a row opens its overview. Four DataForSEO bulk requests (`bulk_ranks`, `bulk_backlinks`, `bulk_referring_domains`, `bulk_spam_score`). If spam fails, that column is empty and nothing is saved.

## What it shows

**Overview**
- **Five numbers:** linking sites and backlinks, each with the change since the snapshot a week or more ago; new and lost sites over the last 4 weeks; authority (0 to 100) with a spam level.
- **New and lost linking sites by week:** the last 12 weeks, new above the line in green, lost below in red.
- **Anchors:** same text in any case counted once, with each anchor's share of linking sites.
- **Most linked pages.**

**Links**
- One row per linking site, strongest first, 100 at a time.
- **Lists:** All, New (first seen in the last 30 days), Lost, Follow, Nofollow and Spam (spam score over 60).
- Each row shows authority, anchor, target page, follow or nofollow, spam, new or lost, and when it was first seen.

**Link gap**
- Up to 3 rivals, picked from the brand profile's competitors or typed in.
- Every site that links to at least one rival and not to the brand. Sites linking to more rivals come first, then sites the brand's AI answers cited in the last 30 days (tagged "AI cites it", with how often), then the strongest.
- **Only sites AI cites:** a filter for just those.
- **Add, or Add all:** puts sites on the brand's "Link building" outreach list (`outreach_targets`, `added_from` = `link_gap`), where Step 4's board will pick them up.

Zippie reads it with `get_backlinks`, and the built-in "Link gap outreach" skill drafts pitches from it.

## Costs and saved answers

- Every DataForSEO answer is kept 7 days in `keyword_cache`. Opening the page asks for saved answers only (`peek`), so nobody spends tasks by opening it. Viewers see saved answers. Editors load or refresh.
- Opening the page or following a shared link reads saved answers only. A search, a quick pick or a tab someone picks loads fresh answers for editors when none are saved.
- **Tasks:** overview 20, each page of 100 links 6, link gap 25, Compare 20 plus 1 for every 10 sites. At about $0.005 a task, each covers its DataForSEO cost. The route is metered, so a failed request hands its tasks back on its own.
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

DataForSEO Backlinks API: $0.024 a request plus $0.000036 a row, pay as you go, no monthly minimum listed (checked on the vendor's pricing page, November 2026).

- **Overview:** 4 requests and about 60 rows, about $0.10.
- **Page of links:** 1 request and 100 rows, about $0.028.
- **Link gap:** 1 request and up to 300 rows per rival, about $0.035 a rival, about $0.10 for 3.

- **Compare:** 4 requests and 1 row per site each, about $0.10 for 10 sites (the per-row price on bulk requests is "check").

Typical use per team a month, with saved answers covering repeat opens: 8 overviews (own site and competitors), 8 pages of links, 2 gaps and 2 comparisons of about 10 sites, about $1.45. Saved answers are shared across workspaces, so a competitor many teams look up is paid for once a week.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| DataForSEO Backlinks API | ~$73 | ~$725 |
| Snapshots and cache rows (inside the VPS database) | $0 | $0 |
| **Monthly total** | **~$73** | **~$725** |

Searching other sites and Compare add about $36 at Beta and $360 at Growth to the earlier ~$37 and ~$365. Tasks cover each request, so heavy use is paid for by the team's plan.

## Example data

Before the first result, the screen is the title, the tool's search bar (`src/components/SearchBar.tsx`) and what the tool shows (`src/components/ToolIntros.tsx`), the same as Keyword Research. There is no example report. This adds $0 a month at Beta and at Growth.
