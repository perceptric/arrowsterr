# Local Research

Local Research (Organic Research, Local Research, at `/local-research`) shows where a business ranks in Google Maps from 49 points around it, who holds the map pack, how reviews compare over time, and whether the website agrees with the Google listing. It is step 6 of the new tools plan.

## Locations and grids (phase 1 of `docs/local-research-plan.md`)

- **Many locations per brand,** each with its own business, keywords, grid, schedule and history (`local_locations`). A location has a short name, like "Mueller". With more than one, the screen opens on **All locations**: every location's keywords with their latest average rank and the change since the scan before, average rank, top 3 share, rating, reviews and the last scan. Click one to open it. Change business and Remove location (which deletes its scans; the button asks twice) are on each location.
- **Plan limits:** Free 1 location and 3 keywords; Trial and Starter 1 and 5; Pro (and Thrive, Legacy) 3 and 15; Agency 25 and 30; Enterprise 100 and 50 (`localLimits`).
- **Grids:** 3 × 3, 5 × 5, 7 × 7 (default), 9 × 9 or 13 × 13; square or round (a round grid drops the corners, 37 points on a 7 × 7); 0.25, 0.5, 1, 2, 3 or 5 miles apart. Point numbers stay those of the full square, so a round grid lines up with a square one.
- **Moving the centre:** Move centre, then click the map. Service-area businesses (no storefront) centre the grid on the area they serve; the business pin stays where Google has it. Centre on the business puts it back.
- **Each scan keeps the grid it used** (size, shape, spacing, centre on `local_scans`), so a later change never redraws an old scan, and Change only compares scans drawn on the same grid. The Change view can compare the latest scan with any earlier one on that grid.
- **Schedules:** weekly, every 2 weeks, monthly or off, per location.
- **Suggested keywords:** the categories of the businesses that hold the most top 3 spots, the business's own categories, and "{main keyword} near me", leaving out keywords already tracked.
- **Tasks follow the points:** a scan takes 6 tasks per 49 points on the standard queue (scheduled scans) and 12 per 49 on the priority queue (Scan now), at least 1. A 13 × 13 grid scheduled is 21 tasks; a 3 × 3 is 2.

## Profile (phase 2 of `docs/local-research-plan.md`)

- **The Profile tab** on each location reads the Google profile of the business and of the 3 businesses that hold the most top 3 spots in its latest scans: categories, hours, photos, description, attributes, posts in the last 30 days, questions and how many have no answer, booking link, rating and reviews, and whether it's claimed.
- **You against the top 3:** one table, your column first, gaps in red. "Gaps only" hides the rest.
- **Fix first:** the gaps in order. A gap needs 2 of the 3 leaders to have the thing you don't (an unclaimed profile always comes first).
- **Profile score, of 100:** claimed 10, categories 10, hours 10, description 10, photos 15, attributes 5, posts 10, questions answered 5, booking link 5, website 10, phone 5, rating 5. A part Google didn't return counts as met, so a missing read never lowers the score.
- **Changed on Google:** when the business's name, categories, phone, website, address or hours read differently from the last read, a second read runs a day later. The change shows (before and now) only when the two newest reads agree, so one odd read never shows.
- **When it runs:** weekly for every location with scheduled scans, and on Read now (editors). Details land in about a minute; posts come from DataForSEO's queue a little later and are collected for up to about 45 minutes. Posts that never arrive stay unknown and are never counted as zero.
- Each read costs 5 plan tasks. Tests: `tests/localProfile.test.ts`.

## Reviews (phase 3 of `docs/local-research-plan.md`)

- **The Reviews tab** pulls the Google reviews of the business and of the 3 businesses that hold the most top 3 spots: the newest 200 each the first time, then the newest 50 each week (and on Read now, editors).
- **Saved by Google's review id** (`local_reviews`), so a pull never doubles a review. An edited review is updated and its themes read again. A review missing from a pull is marked removed and stays in history, but only when the pull covered its date (or returned every review the business has).
- **Numbers:** new reviews in 90 days and their rating, the share answered and the median reply time over 12 months, each against the leaders, and reviews per month for 6 months.
- **What people say:** Haiku tags each review with up to 5 themes from a fixed list of 14 (wait time, billing, staff and so on), each praise or complaint, with a quote copied from the review. Code keeps a theme only when the quote is really in the review. Shares are shown when a side has 5 read reviews or more. Up to 100 unread reviews per business are read per pull.
- **Keywords in reviews:** "'emergency' appears in 62 of Bright Smile's reviews and 12 of yours", for the words of the tracked keywords.
- **Reviews to answer:** the business's reviews from the last 12 months with no reply, 1 to 3 stars first, then oldest first. **Draft reply** has Sonnet write a short reply in the brand's voice (Brand page, Tone of voice); the person edits it, copies it and posts it on Google. Arrowsterr never posts. Drafts never offer money, never confirm someone is a customer or patient beyond what they wrote, and only reply to the business's own reviews.
- **Ask for reviews:** Google's write-a-review link from the place id, with Copy link and a QR code to download (the `qrcode` package, in the browser).
- A pull costs 3 plan tasks; a draft reply costs 1. Tests: `tests/localReviews.test.ts`.

## AI answers (phase 4 of `docs/local-research-plan.md`)

- **The AI answers tab** asks Google's AI Mode "best {keyword}" from every point of a 5 × 5 grid (smaller when the Maps grid is 3 × 3) laid over the same area as the Maps grid, so corners and centre line up. DataForSEO takes each point's coordinates. ChatGPT and Gemini are asked "best {keyword} in {city}" once each.
- **When it runs:** monthly for every keyword of a location with scheduled scans, and on Scan now (editors). Standard queue; the job collects answers for up to 2 hours, and an engine that never answers is left out.
- **Matching:** the businesses looked for are the location's business and every business its latest Maps scan for that keyword saw. A business counts as named when the answer links its Maps listing (its cid) or its own website, or else says its full name as whole words. Sites many businesses share (Facebook, Yelp, Wix and others) never count as a business's site, a site two businesses share proves neither, and one-word names under 8 letters are never matched by name. Businesses matched only by name carry a "By name" tag.
- **Numbers:** the share of answered points where AI Mode names the business, its average place in the answer, whether ChatGPT and Gemini name it and where, and how many businesses AI names more often. Points that failed are left out; a point where Google showed no AI answer counts as answered and names nobody. Shares are over the whole grid, never one point.
- **The AI map:** each point shows the business's place in the answer (green 1st to 3rd, orange 4th or later, red not named). A click shows who that answer names and the start of its text.
- **Next to Maps:** each AI point against the nearest Maps point: "At 6 points you're in the Maps top 3 but AI Mode doesn't name you."
- **Sites AI cites:** the sites the answers cite most, marked Your site or Competitor site, each linking to Backlinks.
- A scan takes 12 tasks on a 5 × 5 grid (about 2 per 5 points, plus 2). Tests: `tests/localAi.test.ts`.

## What it shows

- **Setup:** search the business by name and city (one Google Maps request, 1 task), then pick it. Its Google ids, address, phone, category and position are saved on `brands.profile.location`.
- **Keywords:** up to 5, as chips. The first is the main category.
  - Grid spacing: 0.5, 1 or 2 miles.
  - Weekly scan on or off.
  - **Scan now.**
  - **Track in AI answers:** adds "best {category} in {city}"-style prompts under a Local topic in AI Visibility. It goes through the same add-prompts tool as Zippie, so plan limits apply.
- **Four tiles of the same size** for the picked business (the business itself by default):
  - Average rank on a ring, full and green at #1. A point where it isn't in the top 20 counts as 21, so gaps pull the average down instead of hiding.
  - Share of voice as a donut against the three strongest competitors and everyone else: the share of the map pack spots (3 at each answered point) each holds. All businesses add up to 100%.
  - Rank distribution as one stacked bar: 1 to 3, 4 to 10, 11 to 20 and not in the top 20.
  - Top 3 coverage: the grid in small and the points in the map pack, with #1 spots.
- **The map:** the 7 by 7 grid on a real street map (MapLibre with OpenFreeMap's free tiles, attribution shown). Each dot is coloured by the picked business's rank: green 1 to 3, amber 4 to 10, orange 11 to 20, red not in the top 20, a dashed "?" for a point that didn't answer. A pin marks the business. Click a dot to see the top 5 there. If the map can't load (no WebGL, tiles blocked), the drawn grid shows instead.
- **Map views:** a switch above the map.
  - Ranks: the picked business's rank at each point.
  - Change: how each point moved since the scan before (arrows and spots gained or lost, In and Out for the top 20), with a count of points better and worse (`rankMoves`). Shown when there are two scans.
  - Head to head: when a competitor is picked, which of the two ranks higher at each point, with the counts (`headToHead`).
- **All keywords:** every keyword's latest average rank, the change since its last scan, top 3 share and a trend line, plus the strongest keyword and the one that needs the most work. Click one to open it (`keywordTable`).
- **Rank over time:** average rank (#1 at the top) and top 3 share for the open keyword, scan by scan, up to 12 scans.
- **Businesses:** every business in the scan, sortable by average rank, reviews or rating, with address, rating, reviews and top 3 points. Click one to see its ranks on the map. The ranks come from the scan's saved Google Maps results (`businesses` in `src/lib/local.ts`), so older scans work too.
- **What this scan says:** one headline and short findings worked out from the scan (`localInsights` in `src/lib/local.ts`): the rank at the business's own address, its best spot and where, how far out it stays in the top 10, its strongest and weakest side, the change since the last scan, reviews and rating against the leader, and how many listing checks need a fix. No AI call.
- **Listing check:**
  - Name, phone and street address on the homepage. Phone numbers match across formats, and only a number as long as Google's counts as a different phone, so dates and zip codes in the page text don't.
  - LocalBusiness schema.
  - The main category against the category the competitors holding the top 3 use most.
  - Problems first, with a count of what to fix.
- **Three cards of the same height below the map:**
  - What this scan says, with average rank on each side of the business (north, east, south, west) as a small compass.
  - Listing check, with a ring of checks passed.
  - Reviews against the leaders: bars, the trend once there are two scans, the reviews needed to match the leader and the rating against the leaders' average.

## How a scan runs

- One DataForSEO Google Maps task per grid point (`location_coordinate` "lat,lng,zoom", zoom 15, 14 or 13 by spacing, depth 20). All 49 go in one request.
- **Scan now** uses the priority queue (about a minute). **Weekly scans** use the standard queue (usually minutes, up to 45).
- The `local_fetch` job collects ready points, waits with growing gaps, and finishes when all are in.
- After 3 hours, points still missing count as failed.
- The listing check reads the homepage once per scan.

## Reliability

- **The business is matched by Google's ids** (cid, then place id). A result with a different cid is a different business, whatever its name. Without ids, the website and name must both match.
- **A business listed twice at one point counts once,** at its best rank. That holds for the business and for competitors.
- **Failed points are left out of every number** and shown as "?". A scan where no point answered fails and hands its tasks back.
- **Refunds:** a failed post hands the tasks back exactly once, through the metered route for Scan now and the weekly queue for weekly scans. No duplicate scans within 15 minutes for the same keyword.
- **Weekly scans** only run on plans with Organic Research, and stop for the month when tasks run out.
- Tests: `tests/local.test.ts`.

Request and response fields follow DataForSEO's docs: `cid`, `place_id`, `rating.value`, `rating.votes_count`, `category`, `additional_categories`, `latitude` and `longitude`. They couldn't be called from the build sandbox (no DataForSEO login there), so check the first real scan.

## Data

- `supabase/066_local.sql` adds `local_scans`: tasks, raw points and the summed-up result per scan. Viewers may read.
- `supabase/071_local_locations.sql` adds `local_locations` (viewers may read), and `location_id`, `size`, `shape`, `center_lat` and `center_lng` on `local_scans`. It copies each brand's one location from `brands.profile.location` and points its scans at it.
- `supabase/072_local_profiles.sql` adds `local_profiles`: one row per business per read (`you` marks the location's own business, `confirm` marks a confirm read). Viewers may read. The `local_profile` job reads and collects posts (`src/lib/localProfileServer.ts`).
- `supabase/073_local_reviews.sql` adds `local_reviews` (one row per review, unique on location, business and review id; viewers may read), and `reviews_at` and `reviews_from` on `local_locations` (when reviews were last pulled, and from which businesses). The `local_reviews` job posts the pulls, collects them and reads themes (`src/lib/localReviewsServer.ts`).
- `supabase/074_local_ai_scans.sql` adds `local_ai_scans`: one row per keyword per AI grid, with the businesses looked for, each answer as saved (who it names, the sites it cites, the start of its text) and the summary. Viewers may read. The `local_ai` job collects the answers (`src/lib/localAiServer.ts`).
- `/api/local` takes `limits`, `find`, `set` (a new location, or a new business for one), `remove`, `settings`, `scan`, `prompts`, `profile` (Read now on Profile), `reviews` (Read now on Reviews), `reply` (a draft reply) and `aiscan` (Scan now on AI answers), each with a `locationId`.
- Zippie reads it with `get_local_research`. Two skills use it: "Local audit" and "Review response plan."

## Running cost

The map tiles come from OpenFreeMap's public instance: free with no limit on map views, attribution required (openfreemap.org, checked November 2026). MapLibre is open source. They add $0 at Beta (50 teams) and $0 at Growth (500 teams).

DataForSEO Google Maps, per point (100 results; depth 20 bills as one):
- Standard queue: $0.0006.
- Priority queue: $0.0012.
- Live: $0.002.

Checked on the vendor's pricing page, November 2026.

- **Weekly scan:** 49 × $0.0006, about $0.03, charged as 6 tasks.
- **Scan now:** 49 × $0.0012, about $0.06, charged as 12 tasks.
- **Finding the business:** one live request, $0.002, charged as 1 task.
- **The listing check** is a plain page load.

Assume 20% of teams track a local business (10 at Beta, 100 at Growth), each with 3 keywords scanned weekly plus 2 scans now a month: about $0.50 a location a month on a 7 × 7 grid. Phase 1 lets teams track more locations (assume 1.5 each: 15 at Beta, 150 at Growth) and bigger grids; DataForSEO's price per point doesn't change, and bigger grids take more plan tasks, so they pay their way.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Google Maps grid scans (DataForSEO, 1.5 locations per team) | ~$7.50 | ~$75 |
| Finding businesses (DataForSEO, live) | ~$0 | ~$1 |
| Listing checks and collecting results (worker) | $0 | $0 |
| **Monthly total** | **~$7.50** | **~$76** |
| Added by phase 1 (more locations) | ~$2.50 | ~$25 |

**Phase 2, profile reads.** Each read is 4 businesses (yours and the top 3), each with one live profile read, one live questions read and one posts task on the standard queue, plus a confirm read of your business when its listing changed. About $0.08 a location a month (DataForSEO Business Data prices, check). Charged as 5 tasks per read.

| Line | Beta (15 locations) | Growth (150 locations) |
|---|---|---|
| Profile, questions and posts (DataForSEO Business Data, check) | ~$1.20 | ~$12 |
| Collecting posts (worker) | $0 | $0 |
| **Added by phase 2** | **~$1.20** | **~$12** |
| **Local Research monthly total** | **~$8.70** | **~$88** |

**Phase 3, reviews.** DataForSEO Google Reviews on the standard queue, about $0.00075 per 10 reviews (check). The first pull is 200 reviews for each of 4 businesses (about $0.06 once per location), then 50 each a week (about $0.06 a location a month). Themes: Haiku reads about 20 new reviews per business a week after the first pull, 20 to a call (about 2.5K tokens in, 1.5K out), about $0.04 a location a month at $1 and $5 per million tokens (check); the first pull reads up to 400 reviews once, about $0.20 a location. Draft replies: Sonnet on click, about 1.5K tokens in and 200 out, about $0.008 each at $3 and $15 per million (check); assume 10 a location a month.

| Line | Beta (15 locations) | Growth (150 locations) |
|---|---|---|
| Review pulls (DataForSEO Google Reviews, check) | ~$0.90 | ~$9 |
| Themes (Claude Haiku, check) | ~$0.60 | ~$6 |
| Draft replies (Claude Sonnet, check) | ~$1.20 | ~$12 |
| First pulls, spread over new locations | ~$0.40 | ~$4 |
| QR codes and review links | $0 | $0 |
| **Added by phase 3** | **~$3.10** | **~$31** |
| **Local Research monthly total** | **~$11.80** | **~$119** |

**Phase 4, AI answers.** DataForSEO Google AI Mode on the standard queue, $0.0024 per answer (vendor pricing page, November 2026). ChatGPT and Gemini through DataForSEO's LLM scraper, about $0.003 each (check). Each location: 3 keywords a month, each 25 AI Mode answers plus 2 city answers, about $0.20, plus about 1 Scan now a month (about $0.07). About $0.27 a location a month. No Claude calls: matching is code.

| Line | Beta (15 locations) | Growth (150 locations) |
|---|---|---|
| AI Mode on the grid (DataForSEO) | ~$3.60 | ~$36 |
| ChatGPT and Gemini for the city (DataForSEO, check) | ~$0.40 | ~$4 |
| Collecting and matching (worker) | $0 | $0 |
| **Added by phase 4** | **~$4.00** | **~$40** |
| **Local Research monthly total** | **~$15.80** | **~$159** |

## Example data

Before the first result, the screen is the title, the tool's search bar (`src/components/SearchBar.tsx`) and what the tool shows (`src/components/ToolIntros.tsx`), the same as Keyword Research. There is no example report. This adds $0 a month at Beta and at Growth.
