# Backlinks

The Backlinks screen (Links, Backlinks, at `/backlinks`) shows who links to a brand's site and which sites link to its rivals but not to it. It is step 3 of the new tools plan, after Site Audit and On-page Audit. Step 4, Link Building, works the sites added here.

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
- **Tasks:** overview 20, each page of 100 links 6, link gap 25. At about $0.005 a task, each covers its DataForSEO cost. The route is metered, so a failed request hands its tasks back on its own.
- **Snapshots:** each fresh overview saves the day's numbers to `backlink_snapshots` for the week-on-week arrows.

## Reliability

- **No false gaps.** The gap asks DataForSEO once per rival, with that rival as the only target and the brand in `exclude_targets`. A site that links to the brand never shows as a gap, and nothing depends on `intersection_mode` behaviour, which DataForSEO's docs don't spell out.
- **Partial overviews aren't kept.** The summary must answer. If the weekly chart, anchors or pages fail, the page shows what came back and nothing is saved, so the next open tries again instead of showing gaps for a week.
- **A site with no links** shows one plain line instead of empty charts.
- **The brand, its subdomains and the rivals** are never listed in their own gap.
- Tests: `tests/backlinks.test.ts`.

These DataForSEO response shapes come from the docs and couldn't be called from the build sandbox (no DataForSEO login there). Check the first live load on a real brand: `summary`, `timeseries_new_lost_summary`, `anchors`, `domain_pages_summary`, `backlinks` and `domain_intersection`, all with `rank_scale: one_hundred`.

## Data

- `supabase/063_backlinks.sql`: `backlink_snapshots`.
- `/api/backlinks`: `overview`, `links`, `gap` and `add`.
- Parsing and gap rules: `src/lib/backlinks.ts` (pure). Calls: `src/lib/backlinksServer.ts`.

## Running cost

DataForSEO Backlinks API: $0.024 a request plus $0.000036 a row, pay as you go, no monthly minimum listed (checked on the vendor's pricing page, November 2026).

- **Overview:** 4 requests and about 60 rows, about $0.10.
- **Page of links:** 1 request and 100 rows, about $0.028.
- **Link gap:** 1 request and up to 300 rows per rival, about $0.035 a rival, about $0.10 for 3.

Typical use per team a month, with saved answers covering repeat opens: 4 overviews, 4 pages of links, 2 gaps, about $0.73.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| DataForSEO Backlinks API | ~$37 | ~$365 |
| Snapshots and cache rows (inside Supabase Pro) | $0 | $0 |
| **Monthly total added** | **~$37** | **~$365** |
