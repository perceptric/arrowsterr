# Visibility › Traffic: the rank tracker

Projects that track where a domain or one page ranks on Google for chosen keywords, every day.

## The sidebar

Visibility comes first and every group opens and closes as a tree, with its pages on a guide line:

- **Visibility:** Traffic, Prompts, Competitors, Sources, AI Shopping
- **Plan & Create:** Opportunities, Research, Drafts
- **Publish:** Calendar, Sites
- **Reports**

Traffic lives at `/traffic`. The old analytics page moved to `/analytics` and stays hidden as before.

## How it works

- **A project** is a domain (every page on it counts, subdomains too) or one page's address (only that page counts), in one country, on desktop or mobile.
- **Keywords** are pasted one per line, with an optional tag. Search volume is filled in from DataForSEO when they are added.
- **Checks** run once a day through DataForSEO's queue (cheaper than live calls). Each project starts at its own time between 01:00 and 21:00 UTC, so the checks spread out. Most days read the top 30 results; one day a week, spread by project, reads the top 100. A keyword outside the results read shows as 30+ or 100+.
- **Jobs:** `rank_check` posts the day's searches for a project; `rank_collect` reads the answers every 10 minutes while any are waiting. A search with no answer after 4 hours, or one DataForSEO refuses, is tried again, up to 3 times.
- **Numbers:** position, the move over 1 day and 7 days, best position, the ranking page, what else Google showed (AI Overview, People also ask), and the top 10 on the last check. Visibility is the share of clicks the project would get if every keyword ranked first, from a standard click curve.
- **Limits:** keywords tracked across the workspace, by plan: Free 10, Trial 50, Starter 100, Pro 300, Agency 1,000, Enterprise 5,000. Up to 500 keywords in one project.

The code: `src/lib/rankTrack.ts` (pure, tested in `tests/rankTrack.test.ts`), `src/lib/rankTrackServer.ts` (jobs), `src/app/api/rank/route.ts`, `src/components/TrafficProjects.tsx` and `supabase/083_rank_tracker.sql`.

## Running cost

DataForSEO's standard queue costs about $0.0006 for each page of 10 results (check). One keyword a month reads 26 days × 3 pages plus 4 weeks × 10 pages = 118 pages, about $0.07 (check). Volume lookups when keywords are added cost about $0.0001 each and are a rounding error.

| Stage | Keywords tracked (100 a team on average) | Added a month |
|---|---|---|
| Beta (50 teams) | 5,000 | about $354 (check) |
| Growth (500 teams) | 50,000 | about $3,540 (check) |

The plan limits cap the worst case: a Pro team at its full 300 keywords costs about $21 a month of its $179.
