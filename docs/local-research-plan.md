# Local Research: improvement plan

November 2026. How to make Local Research (Organic Research, Local Research, `/local-research`, see `docs/local-research.md`) the tool a local business or an agency checks every week. Prices marked "check" couldn't be confirmed on the vendor's own page.

---

## 1. Summary

Local Research today does one thing well: a 7 by 7 Google Maps grid for up to 5 keywords around one business, with share of voice, change since last scan, head to head against a competitor, a short listing check and review counts.

What holds it back:

- **One business per brand.** Chains, franchises and agencies with many locations can't use it.
- **One grid shape.** Always 7 by 7 around the pin. Service-area businesses (plumbers, cleaners) have no storefront to center on, and big metros need more points.
- **Thin profile data.** We read the homepage and the scan's rank lists. We never read the Google Business Profile itself: hours, photos, posts, attributes, secondary categories, Q&A.
- **Reviews are two numbers.** Count and rating. No review text, response rate, speed, themes or replies.
- **No AI view.** Arrowsterr's whole point is AI search, yet Local Research never checks which businesses ChatGPT, Gemini, AI Overviews or AI Mode name for "best dentist near me" at each point.
- **No alerts.** A rank drop, a new competitor in the top 3 or a Google edit to the listing shows up only when someone opens the screen.
- **No owner data.** Without a Google Business Profile connection there are no calls, direction requests or the searches people really used.

The plan adds these in 6 phases over about 12 weeks. Running cost goes from about $5 to about $16 a month at Beta and from about $51 to about $155 at Growth (section 9).

---

## 2. What Local Research does today

| Area | Today |
|---|---|
| Setup | Find the business by name and city, pick it. Saved on `brands.profile.location`. One per brand. |
| Keywords | Up to 5. Weekly scan on or off. Scan now. |
| Grid | 7 × 7, 0.5, 1 or 2 miles apart, centered on the business. DataForSEO Google Maps, depth 20. |
| Numbers | Average rank (out of top 20 counts as 21), share of voice, rank bands, top 3 coverage. |
| Map | Ranks, change since last scan, head to head with one competitor. Click a point for its top 5. |
| History | Average rank and top 3 share per keyword, up to 12 scans. |
| Businesses | Every business in the scan with rating, reviews and top 3 points. |
| Insights | Worked out in code, no AI: rank at the address, best and weakest side, reviews against the leader. |
| Listing check | Name, phone and address on the homepage, LocalBusiness schema, main category against the top 3. |
| Reviews | Count and rating against the leaders, trend once there are two scans. |
| AI | "Track in AI answers" adds city prompts to AI Visibility. Nothing per grid point. |
| Zippie | `get_local_research`, skills "Local audit" and "Review response plan". |

---

## 3. What other tools do

| Tool | Strong at | Notes |
|---|---|---|
| Local Falcon | Grids of any size and shape, Share of Local Voice, Share of AI Voice per grid point for ChatGPT, Gemini, AI Overviews and AI Mode, competitor and trend reports | The AI grid is its newest selling point ([Local Falcon AI Mode tracking](https://www.localfalcon.com/features/ai-mode-tracking), [SoLV](https://www.localfalcon.com/answers/?c=34)) |
| BrightLocal | Grid plus local pack and organic ranks, citation tracker with NAP checks, review monitoring, Google Business Profile audit | A full suite; reviewers say grids are less visual than Local Falcon ([GetApp](https://www.getapp.com/marketing-software/a/brightlocal/features), [Hackceleration](https://hackceleration.com/labs/best/local-rank-tracker)) |
| Whitespark | Citation finder and building, review tools | Strong on citations |
| Semrush Local, Moz Local | Listing sync to directories, review replies, heatmaps | Paid listing distribution |
| Google Business Profile API | Owner-only data: search keywords with impressions by month, calls, direction requests, website clicks, Maps and Search impressions | Needs the API turned on and quota granted by Google ([Performance API](https://developers.google.com/my-business/reference/performance/rest)) |

Where Arrowsterr can win: it already tracks AI answers for the brand. Putting the AI grid, the Maps grid and the brand's AI Visibility on one screen is something none of them do in one place.

---

## 4. Gaps and what to build

### 4.1 Many locations per brand

- A **Locations** list on the Local Research screen: add, rename, archive, delete. Each location has its own keywords, grid, schedule and history.
- A **Locations overview** for brands with more than one: a table of every location with average rank, top 3 share, change, rating and reviews per keyword, sorted worst first, and a map of all pins colored by average rank.
- Plan limits: Starter 1 location, Pro 3, Agency 25, Enterprise custom (check against `src/lib/plans.ts` before building).
- Data: a `local_locations` table (brand_id, Google ids, address, lat/lng, settings, archived_at). `brands.profile.location` moves into it once, by a migration.

### 4.2 Grid shapes and service areas

- **Size:** 3 × 3, 5 × 5, 7 × 7 (default), 9 × 9, 13 × 13. Bigger grids cost more tasks, shown before the scan.
- **Spacing:** 0.25 to 5 miles, or kilometres by the workspace's units.
- **Center:** the business pin by default. A **service-area business** (no storefront, address hidden on Google) picks a center on the map and a radius, and the grid covers the service area. Points outside the area listed in the profile are skipped and shown as grey.
- **Shape:** square (today) or circle (corners dropped, about 21% fewer points on a 7 × 7).
- **Zoom** keeps following spacing (`zoomFor`).

### 4.3 Keywords people use

- **Suggestions:** the main and secondary categories of the top 3 businesses, "{category} near me", the Search Console queries with the city or "near me", and (once connected, 4.7) the searches the Google profile shows. One click adds a suggestion.
- **More keywords:** 5 on Starter, 15 on Pro, 30 on Agency per location (check against plans).
- **Schedule:** weekly (today), every two weeks or monthly, and the day of the week.
- **Compare any two scans** of a keyword on the Change view, with a scan picker.

### 4.4 Profile audit against the top 3

Read the full Google profile for the business and the 5 businesses that hold the most top 3 spots. DataForSEO My Business Info, Business Updates (posts) and Questions and Answers ([Business Data API](https://docs.dataforseo.com/v3/business_data-overview/)).

- **Profile table:** you against the top 3, row by row:
  - primary and secondary categories
  - hours set, special hours
  - photos (count and newest), logo and cover
  - description length
  - attributes (women-owned, wheelchair access, online booking ...)
  - posts in the last 30 days
  - Q&A with and without an answer
  - website and booking links
  - review count, rating, reviews in the last 90 days
- **Gaps first:** "The top 3 all list 'Emergency dentist' as a second category. You don't." Each gap has a fix line. Missing categories link to the keyword suggestions.
- **Profile score** from 0 to 100, weighted toward the parts that move Maps ranks (categories, reviews, proximity can't change), with the change since last week.
- **Changes Google made:** the name, category, hours, phone, website and address are saved every week. A change between two reads is shown as "Changed on Google" with before and after, and alerts (4.8). Google often applies "suggested edits" from the public; owners rarely notice.

### 4.5 Reviews

DataForSEO Google Reviews for the business and the top 3 ([Google Reviews](https://dataforseo.com/apis/business-data-api)).

- **First pull:** up to the newest 200 reviews per business. Then weekly, newest first, stopping at the first review already saved (by review id).
- **Numbers:** reviews per month (velocity) against the top 3, rating over time, share with an owner reply, median reply time, unanswered reviews.
- **Themes:** what people praise and complain about, per business, with counts. Haiku picks up to 5 themes per review with a quote copied from the review; code keeps a theme only when the quote is really in the review (the same "Haiku picks, code proves" rule as Perception, `docs/perception.md`). "Patients mention 'wait time' in 18% of your reviews and 4% of the leader's."
- **Unanswered reviews** list, 1 to 3 stars first, then oldest first, with a **Draft reply** button: Sonnet writes a short reply in the brand voice (`brandVoice.ts`) that the person edits and copies. Arrowsterr never posts it.
- **Review link and QR code** from the place id (`https://search.google.com/local/writereview?placeid=...`), free, for asking customers.
- Words in reviews that match the keywords: "'emergency' appears in 12 of the leader's reviews and 1 of yours."

### 4.6 AI answers on the grid (Share of AI Voice)

The part that fits Arrowsterr best.

- For each keyword, ask the AI engines "best {keyword}" from a grid of points: AI Mode and AI Overview through DataForSEO with the point's coordinates, ChatGPT and Gemini through DataForSEO with the city (they don't take coordinates; one read per city).
- **Default grid:** 5 × 5 (25 points) for AI Mode, monthly. Bigger on request.
- **Numbers:** Share of AI Voice (the share of answers that name the business), the average position in the answer, which businesses AI names instead, and the sources AI cites for them (review sites, directories, the competitor's own pages).
- **On the map:** a fourth view, "AI answers": each point shows whether AI Mode named the business (and at what place in the list).
- **Next to the Maps rank:** "You're #2 on Maps here but AI Mode names 3 others first." The cited sources link to Backlinks and to the brand's AI Visibility Sources page.
- Answers are read with the existing engine code (`src/lib/engines.ts`, `src/lib/dataforseo.ts`), and named businesses are matched by name and website with the same rules as AI Visibility.

### 4.7 Google Business Profile connection

The owner signs in with Google (one click, read-only scope first), and picks the location. Uses the Business Profile Performance API.

- **Searches that found the business** each month, with impressions. They feed the keyword suggestions (4.3) and show which tracked keywords people use.
- **Calls, direction requests, website clicks, bookings** per day, with Maps and Search impressions by device.
- **Rank against results:** the average Maps rank for a keyword next to the calls and direction requests that month.
- Google grants API access per project after a request (quota starts at 0). Apply early: it can take weeks (check).
- Later, with the owner's OK and a separate write scope: reply to reviews and publish posts from Arrowsterr. Not in this plan.

### 4.8 Alerts and the weekly email

- **Rank drop:** the average rank for a keyword is 2 or more worse than the scan before, or top 3 share falls by 15 points.
- **New competitor in the top 3** at 5 or more points.
- **Profile changed on Google** (4.4).
- **New 1 or 2 star review** (4.5), with a Draft reply link.
- **Rating fell** below a level the person sets.
- One email per business per day at most; a weekly digest otherwise. Slack and the Zippie notifications once those exist for the rest of the app.

### 4.9 Reports and sharing

- The Reports SEO block gains a Local section per location: the map image, average rank, top 3 share and change for each keyword, reviews and rating.
- **Download PDF** on the Local Research screen (the same report engine as other tools).
- **Share link** (read-only, expiring, the same `report_links` rules) for agencies sending one location to a client.
- CSV export for scans, businesses and reviews.

### 4.10 Look and copy

- Bring the screen to brand v10 (`docs/brand.md`): the stat row at the top, one primary button (Scan now), the map views as a pill switch, the three bottom cards in one row with equal heights.
- The point popover shows the top 10 with a "you" row even when the business is 14th.
- A clear "not in the top 20" count in red next to the average rank, so a good average from few points can't mislead.

---

## 5. Screens

1. **Locations overview** (more than one location): a table and a pin map; click a row to open the location.
2. **Location: Rankings** (today's screen, reworked): keyword chips, grid settings, the four tiles, the map with Ranks, Change, Head to head and AI answers views, all keywords, rank over time, businesses.
3. **Location: Profile:** the profile table against the top 3, gaps first, profile score, changes Google made, listing check (today's homepage check moves here).
4. **Location: Reviews:** velocity, rating, reply rate, themes, unanswered reviews with Draft reply, review link and QR.
5. **Location: AI answers:** Share of AI Voice by engine, the AI grid, businesses AI names, sources AI cites.
6. **Location: Performance** (with the Google connection): searches with impressions, calls, directions, clicks, the Maps rank alongside.
7. **Location: Settings:** keywords, grid, schedule, alerts, the Google connection.

Tabs have addresses (`/local-research/{location}/reviews`) so they can be shared and the Back button works.

---

## 6. Data and APIs

| Need | Source | Notes |
|---|---|---|
| Maps grid | DataForSEO Google Maps (today) | Standard queue for scheduled scans, priority for Scan now |
| Profile details | DataForSEO My Business Info | Weekly for you and the top 5 |
| Posts | DataForSEO Business Updates | Weekly |
| Q&A | DataForSEO Questions and Answers | Weekly |
| Reviews | DataForSEO Google Reviews | First pull 200, then new only |
| AI answers | DataForSEO AI Mode and AI Overview with coordinates; ChatGPT and Gemini by city | Existing engine code |
| Owner data | Google Business Profile Performance API | OAuth, read-only; needs Google's quota approval |
| Review themes | Claude Haiku | Quotes checked in code |
| Reply drafts | Claude Sonnet | On click only |

New tables: `local_locations`, `local_profiles` (one row per business per week), `local_reviews` (review id, business, rating, text, date, reply, themes), `local_ai_scans`, `gbp_connections`, `gbp_daily`, `gbp_keywords`. Scans stay in `local_scans` with a `location_id`.

---

## 7. Reliability

The same rules as the rest of the product: a wrong signal costs more than a missing one.

- **Grid points that fail** stay out of every number (today's rule), on every grid size.
- **Profile changes count only when two weekly reads agree.** One odd read (a result from a different listing, a temporary closure label) never alerts.
- **Businesses are matched by Google's ids** (cid, then place id), never by name alone (today's rule), for profiles, reviews and AI answers alike. AI answers that name a business without a link are matched by name and city, and shown as "matched by name".
- **Reviews are saved by review id,** so a weekly pull never doubles one. A review that disappears is marked removed, never deleted from history.
- **Themes need a quote** that is really in the review. No quote, no theme.
- **AI answers vary from run to run.** Share of AI Voice is shown over all points and runs together, never from one point. A single-point change never alerts.
- **Rank drop alerts re-scan the points that dropped** once in the standard queue before sending. If the second read disagrees, no alert.
- **Tests** for each new pure function in `tests/local.test.ts` with fixtures: a listing that changes back, a review edited by its author, a service area with points outside it, an AI answer that names a business twice.

---

## 8. Phases

**Phase 1 built, November 2026:** many locations per brand with an all-locations table, grids from 3 × 3 to 13 × 13, square or round, 0.25 to 5 miles apart, a centre moved by clicking the map, keyword suggestions, weekly, every 2 weeks or monthly scans, comparing the latest scan with any earlier one on the same grid, and plan limits. Not yet: the pin map of all locations, and skipping points outside a service area (needs the profile data of phase 2). See `docs/local-research.md`.

**Phase 2 built, November 2026:** the Profile tab on each location. It reads the Google profile of the business and of the 3 businesses with the most top 3 spots every week (and on Read now), shows them side by side with the gaps in red, lists what to fix first, gives a profile score of 100, and shows "Changed on Google" for name, categories, phone, website, address and hours only once two reads a day apart agree. See `docs/local-research.md`.

**Phase 3 built, November 2026:** the Reviews tab on each location. Reviews of the business and its 3 leaders are pulled weekly (and on Read now), saved by review id, with removed ones marked. It shows reviews per month, rating and answered share against the leaders, median reply time, themes with quotes (Haiku picks, code proves), keyword words in reviews, the reviews to answer with Draft reply, and the review link with a QR code. See `docs/local-research.md`.

**Phase 4 built, November 2026:** the AI answers tab on each location. Google's AI Mode is asked "best {keyword}" from a 5 × 5 grid over the same area as the Maps grid, and ChatGPT and Gemini once for the city, monthly and on Scan now. It shows the share of points where AI Mode names the business, its average place in the answer, ChatGPT and Gemini, the AI map, the businesses AI names (matched by Maps link, website, then name, marked "By name"), the sites AI cites, and where AI Mode and the Maps top 3 disagree. See `docs/local-research.md`.


| Phase | Weeks | What ships | Done when |
|---|---|---|---|
| 1. Locations and grids | 2 | Many locations (4.1), grid sizes, shapes and service areas (4.2), keyword suggestions, schedules and any two scans (4.3), the v10 pass (4.10) | A 3-location brand sees all three on the overview; a service-area business scans a circle around a center it picked |
| 2. Profile audit | 2 | Profile table against the top 3, gaps, profile score, Google changes (4.4) | A test listing whose category changed on Google shows "Changed on Google" after the second read, and one odd read doesn't |
| 3. Reviews | 2 | Pulls, velocity, reply rate, themes with quotes, unanswered list, Draft reply, review link and QR (4.5) | Themes on 200 test reviews all carry quotes found in their review |
| 4. AI answers on the grid | 2 | Share of AI Voice, the AI map view, businesses and sources AI names (4.6) | A test business named in AI Mode at known points shows on exactly those points |
| 5. Google profile connection | 2 | OAuth, searches with impressions, calls, directions, clicks (4.7) | A connected test profile shows the same monthly numbers as the Business Profile dashboard |
| 6. Alerts and reports | 2 | Alerts and weekly email (4.8), Reports block, PDF, share link, CSV (4.9) | A real rank drop on a test keyword sends one email; a one-scan blip sends none |

Phase 5 depends on Google granting API access. Apply in week 1 so it doesn't hold the rest up; phases 1 to 4 and 6 don't need it.

---

## 9. Running cost

Assumptions (check against real use after phase 1):
- 20% of teams track local businesses (10 at Beta, 100 at Growth), with 1.5 locations each on average (15 and 150 locations).
- Each location: 3 keywords on a 7 × 7 grid weekly plus 2 Scan nows a month (today's assumption, about $0.50 a location a month).
- Profile, posts and Q&A for the business and 5 competitors weekly.
- Reviews for the business and 3 competitors: a first pull of 200 each, then new ones weekly.
- AI answers: 5 × 5 AI Mode grid plus one ChatGPT and one Gemini read per keyword, monthly.

Per location a month:

| Line | Cost | Source |
|---|---|---|
| Maps grid scans (today) | ~$0.50 | DataForSEO, checked November 2026 |
| Profile, posts and Q&A, 6 businesses weekly | ~$0.08 | DataForSEO Business Data (check) |
| Reviews, 4 businesses (first pull spread over the first month, then weekly) | ~$0.10 | DataForSEO Google Reviews, about $0.00075 per 10 reviews (check) |
| Review themes (Haiku, about 20K tokens in, 2K out) | ~$0.03 | Claude (check) |
| Reply drafts (Sonnet, about 10 a month on click) | ~$0.05 | Claude (check) |
| AI answers (75 AI Mode reads plus 6 ChatGPT and Gemini reads) | ~$0.30 | DataForSEO AI Mode (check) |
| Google profile connection | $0 | Google, free within quota |
| Alerts and weekly email | $0 | Inside Resend's current plan (check) |
| **Total per location** | **~$1.06** | |

| Line | Beta (15 locations) | Growth (150 locations) |
|---|---|---|
| Maps grid scans (today) | ~$7.50 | ~$75 |
| Profile, posts and Q&A | ~$1.20 | ~$12 |
| Reviews | ~$1.50 | ~$15 |
| Review themes and reply drafts | ~$1.20 | ~$12 |
| AI answers on the grid | ~$4.50 | ~$45 |
| Google profile connection, alerts, emails | $0 | $0 |
| **Monthly total** | **~$16** | **~$159** |
| Today's Local Research (for comparison) | ~$5 | ~$51 |
| **Added by this plan** | **~$11** | **~$108** |

Bigger grids, more keywords and more Scan nows are charged as plan tasks, as today (1 task per about 8 points on the standard queue), so heavy use pays for itself.

---

## 10. Open questions

1. **Location limits per plan.** The numbers in 4.1 and 4.3 are a starting point. Agencies may need a "locations" add-on.
2. **Citations.** BrightLocal and Whitespark check NAP on Yelp, Apple Maps, Bing and dozens of directories. A first version could check the 5 that matter most (Apple Maps, Bing Places, Yelp, Facebook, the top industry directory) by search. Worth a phase 7?
3. **Writing back to Google.** Replying to reviews and publishing posts through the API would save time, but a wrong post on a client's profile is costly. Keep it to drafts until there's demand?
4. **AI answers cadence.** Monthly keeps cost low; weekly matches the Maps grid. Weekly as a Pro option?
5. **Keyword limits** for agencies with many locations: per location or a shared pool?

---

## Sources

- [Local Falcon: Share of Local Voice](https://www.localfalcon.com/answers/?c=34)
- [Local Falcon: AI Mode tracking](https://www.localfalcon.com/features/ai-mode-tracking)
- [Local Falcon: how local AI visibility tracking works](https://www.localfalcon.com/blog/how-local-falcons-local-ai-visibility-tracking-works)
- [BrightLocal features (GetApp)](https://www.getapp.com/marketing-software/a/brightlocal/features)
- [Best local rank tracker 2026 (Hackceleration)](https://hackceleration.com/labs/best/local-rank-tracker)
- [DataForSEO Business Data API overview](https://docs.dataforseo.com/v3/business_data-overview/)
- [DataForSEO Questions and Answers update](https://dataforseo.com/update/questions-and-answers-business-data-api)
- [DataForSEO Google My Business API](https://dataforseo.com/apis/business-data-api/google-my-business)
- [Google Business Profile Performance API](https://developers.google.com/my-business/reference/performance/rest)
