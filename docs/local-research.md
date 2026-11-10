# Local Research

Local Research (Organic Research, Local Research, at `/local-research`) shows where a business ranks in Google Maps from 49 points around it, who holds the map pack, how reviews compare over time, and whether the website agrees with the Google listing. It is step 6 of the new tools plan.

## What it shows

- **Setup:** search the business by name and city (one Google Maps request, 1 task), then pick it. Its Google ids, address, phone, category and position are saved on `brands.profile.location`.
- **Keywords:** up to 5, as chips. The first is the main category.
  - Grid spacing: 0.5, 1 or 2 miles.
  - Weekly scan on or off.
  - **Scan now.**
  - **Track in AI answers:** adds "best {category} in {city}"-style prompts under a Local topic in AI Visibility. It goes through the same add-prompts tool as Zippie, so plan limits apply.
- **Three numbers:**
  - Average rank, with the change since the last scan. A point where the business isn't in the top 20 counts as 21, so gaps pull the average down instead of hiding.
  - Share of points in the top 3.
  - Points in the top 20, and how many points didn't load.
- **The grid:** 7 by 7 circles on a plain street pattern, colored by rank: top 3, 4 to 10, 11 to 20, not in the top 20. A dashed "?" marks a point that didn't answer. The business pin sits in the middle. Click a point to see its map pack.
- **Listing check:**
  - Name, phone and street address on the homepage. Phone numbers match across formats.
  - LocalBusiness schema.
  - The main category against the category the rivals holding the top 3 use most.
- **Local rivals:** the business, then up to 8 rivals by share of top 3 points, with rating, reviews and category.
- **Reviews over time:** review counts for the business and the two strongest rivals, from each scan.

## How a scan runs

- One DataForSEO Google Maps task per grid point (`location_coordinate` "lat,lng,zoom", zoom 15, 14 or 13 by spacing, depth 20). All 49 go in one request.
- **Scan now** uses the priority queue (about a minute). **Weekly scans** use the standard queue (usually minutes, up to 45).
- The `local_fetch` job collects ready points, waits with growing gaps, and finishes when all are in.
- After 3 hours, points still missing count as failed.
- The listing check reads the homepage once per scan.

## Reliability

- **The business is matched by Google's ids** (cid, then place id). A result with a different cid is a different business, whatever its name. Without ids, the website and name must both match.
- **A business listed twice at one point counts once,** at its best rank. That holds for the business and for rivals.
- **Failed points are left out of every number** and shown as "?". A scan where no point answered fails and hands its tasks back.
- **Refunds:** a failed post hands the tasks back exactly once, through the metered route for Scan now and the weekly queue for weekly scans. No duplicate scans within 15 minutes for the same keyword.
- **Weekly scans** only run on plans with Organic Research, and stop for the month when tasks run out.
- Tests: `tests/local.test.ts`.

Request and response fields follow DataForSEO's docs: `cid`, `place_id`, `rating.value`, `rating.votes_count`, `category`, `additional_categories`, `latitude` and `longitude`. They couldn't be called from the build sandbox (no DataForSEO login there), so check the first real scan.

## Data

- `supabase/066_local.sql` adds `local_scans`: tasks, raw points and the summed-up result per scan. Viewers may read.
- `/api/local` takes `find`, `set`, `clear`, `settings`, `scan` and `prompts`.
- Zippie reads it with `get_local_research`. Two skills use it: "Local audit" and "Review response plan."

## Running cost

DataForSEO Google Maps, per point (100 results; depth 20 bills as one):
- Standard queue: $0.0006.
- Priority queue: $0.0012.
- Live: $0.002.

Checked on the vendor's pricing page, November 2026.

- **Weekly scan:** 49 × $0.0006, about $0.03, charged as 6 tasks.
- **Scan now:** 49 × $0.0012, about $0.06, charged as 12 tasks.
- **Finding the business:** one live request, $0.002, charged as 1 task.
- **The listing check** is a plain page load.

Assume 20% of teams track a local business (10 at Beta, 100 at Growth), each with 3 keywords scanned weekly plus 2 scans now a month: about $0.50 a business a month.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Google Maps grid scans (DataForSEO) | ~$5 | ~$50 |
| Finding businesses (DataForSEO, live) | ~$0 | ~$1 |
| Listing checks and collecting results (worker) | $0 | $0 |
| **Monthly total added** | **~$5** | **~$51** |

## Example data

Before the first result, the screen is the title, the tool's search bar (`src/components/SearchBar.tsx`) and what the tool shows (`src/components/ToolIntros.tsx`), the same as Keyword Research. There is no example report. This adds $0 a month at Beta and at Growth.
