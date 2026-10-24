# RiseLocale

Planned October 2026. RiseLocale is local SEO and AI search for local businesses and the agencies that serve them. It runs on Arrowsterr's stack (Next.js, Supabase, the jobs worker, DataForSEO, `engines.ts`) under its own brand and domain. The brand (tokens, components, rules) is `docs/riselocale/brand.md` and `docs/riselocale/brand.css`. The goal is to beat LocalRank.so on every feature it sells, then win on the ones it doesn't have.

## 1. The core object: a Location

Everything hangs off one record per place of business.

| Field | Notes |
|---|---|
| Name, address, phone (NAP), website | The source of truth for citations and audits |
| Primary and extra Google categories | Used for rank grids, audits and competitor lookups |
| Hours, services, attributes, photos | Synced with Google Business Profile (GBP) |
| Service area | A drawn shape on the map for businesses with no storefront |
| GBP link, Apple Business Connect link, Bing Places link | Filled in when connected |
| Competitors | Picked from the businesses that show up most in its grids |

A workspace holds many Locations. Agencies group Locations by client.

## 2. Features

### 2.1 Local Rank Tracker (geo-grid)
Matches LocalRank, then goes further.
- Grid scans from 3×3 up to 21×21 pins, by miles or km, centered on the business or anywhere on the map.
- Service-area scans: pins fill the drawn shape, so a plumber covering five suburbs sees all of them.
- Three separate ranks per pin: Maps, the Local Pack and plain organic. LocalRank's reviews call this out as rare. We show it on every pin.
- One-time and recurring scans (daily, weekly, monthly), with a credit cost shown before running.
- Heatmap with average rank, share of top 3 pins and a Share of Local Voice score.
- Competitor view: tap any pin to see who ranks above you there, with their rating, review count and category.
- Change over time: slide between two scans, or play the grid as a timeline.
- Alerts when average rank drops more than 2 spots or a top 3 pin is lost.
- Keyword groups and location groups, so agencies can segment campaigns.
- White-label PDF reports, scheduled emails and public share links (reuse `reports.ts`, `shareSnapshot.ts`).
- Free tool: one 5×5 scan with no sign-up. This is the main hook on the site.

Data: DataForSEO Google Maps and Local Finder SERP tasks with exact GPS coordinates per pin.

### 2.2 AI Recommendation Monitor
Matches LocalRank's monitor using the engines Arrowsterr already tracks.
- ChatGPT, Claude, Gemini, Perplexity, Google AI Overview and AI Mode.
- Local prompts with the city attached ("best dentist in chicago downtown"), plus prompts we suggest from the business's category and area.
- Visibility score per scan and per engine (1/1, 0/1), with history and a re-run button.
- The exact answer, where the business placed in it and which competitors were named.
- Cited sources: the directories, listicles and review sites the AI read. This feeds 2.5 and 2.6, so each gap becomes a task.
- Scan history per Location, with daily tracking on paid plans.
- Free tool: the AI Visibility Audit (one prompt, every engine).

### 2.3 Google Business Profile Autopilot
- Connect with Google sign-in. All accounts and locations load in one list.
- Profile audit score: missing categories, services, attributes, hours, photos, description length, posting rate and review reply rate. Each gap has a fix button.
- Posts: AI drafts in the business's voice, a calendar, scheduling and bulk posting to many locations.
- Review replies: AI drafts every reply. Owners approve, or turn on auto-reply for 4 and 5 star reviews.
- Insights: calls, direction requests, website clicks and searches, by location and over time.
- Watchdog: alerts when Google or a user edits the profile, when a duplicate listing shows up, or when a profile is suspended.
- Multi-location dashboard with bulk edits for hours, holidays and attributes.

### 2.4 Review Engine
LocalRank sells "farm 5 star reviews". We sell a version that keeps customers safe. Google bans review gating, and the FTC rule from August 2024 fines businesses for fake or filtered reviews.
- Review requests by SMS and email to every customer, with a short link straight to the Google review form.
- Import customers by CSV, Zapier, or from tools like Square, Jobber and Housecall Pro.
- Follow-up reminders and a QR code card for the front desk.
- Review velocity tracking against competitors.
- Themes from review text (what people praise and what they complain about).
- A review widget for the business's website, with LocalBusiness schema.

### 2.5 Local Citations Builder
- NAP audit first: scan the top directories, find wrong or duplicate listings and score consistency.
- Submissions through the data aggregators (Data Axle, Foursquare, Localeze) plus a vetted list of top directories by country and by industry.
- Ongoing sync to the top sites through a listings partner, so a change to hours updates everywhere.
- Status per site (submitted, live, needs fix), proof links and bulk edit or delete.
- Apple Business Connect and Bing Places, connected directly.
- We count only live, indexed listings. No "550+" count padded with sites Google ignores.

### 2.6 LLM Citation Builder
LocalRank places businesses on a network of micro-blogs it controls. Google's 2024 spam updates target that pattern (scaled content and site reputation abuse), and AI engines are starting to filter it too. We build mentions on real sites.
- Find the roundups and lists the AI engines already cite for each prompt (from 2.2).
- Outreach to those publishers with AI-drafted pitches, tracked to reply and placement (reuse Arrowsterr outreach).
- "Best X in City" and comparison pages for the business's own site, written by the Arrowsterr writer with real facts and reviews.
- Local PR: chamber of commerce, sponsorships, local news and "best of" awards.
- Each placement is tracked: live link, linked or unlinked mention, and whether AI answers start naming the business.

### 2.7 Lead Finder (for agencies)
- Search businesses by category, city and radius, from Google Maps data.
- Filters: rating, review count, has website, claimed GBP, ad spend signals.
- Contact data: phone, website, owner name and email where found, with verified status.
- Opportunity score: weak grid rank, few reviews, an unclaimed or thin profile or zero AI mentions. Agencies sell to the worst scores first.
- One-click prospect audit: a white-label report with a grid scan, AI visibility and a GBP score, ready to email.
- Export to CSV, HubSpot, or Omniscient.

### 2.8 Local pages and on-site
- Service and area page builder that writes unique pages from real data (services, reviews, photos, local details).
- LocalBusiness and Service schema generator (reuse `schemaGen.ts`).
- On-page checks for NAP on the site, map embed, page speed and mobile.

### 2.9 Agency layer
- White-label app on the agency's own domain, with their logo and colors.
- Client portal: clients see their reports and approve posts and replies.
- Roles, seats, client groups and bulk actions everywhere.
- Weekly email digest and Slack alerts.
- API and MCP server (reuse Arrowsterr's `mcp`), so agencies can pull data into their own tools.

### 2.10 The Local Agent
One AI agent that reads every signal for a Location and makes a weekly plan: "Add the category Emergency Plumber", "Reply to 3 reviews", "Get listed on these 2 sites ChatGPT cites", "Post about your winter special". Each item has a do-it button. This is the feature that turns a set of tools into a product people keep.

## 3. Build order

| Phase | Weeks | Ships |
|---|---|---|
| 0. Setup | 1–2 | Brand, domain, the Location model, workspace on Arrowsterr's stack, apply for Google Business Profile API access (Google approves by hand and can take weeks, so start day one) |
| 1. Hooks | 3–8 | Local Rank Tracker, AI Recommendation Monitor, the two free tools, share links and reports |
| 2. GBP and reviews | 9–14 | GBP connect, audit, posts, review replies, insights, watchdog, Review Engine with SMS and email |
| 3. Citations | 15–20 | NAP audit, aggregator and directory submissions, listings sync, Apple and Bing |
| 4. Agencies | 21–26 | Lead Finder, prospect audit, white label, client portal, LLM Citation Builder |
| 5. Moat | 27–32 | Local Agent, local pages, schema, API and MCP |

## 4. Reliability

- A grid pin that moves more than 5 spots since the last scan is checked again before we save it. A wrong rank shown to a client costs more than a slow one.
- Maps, Local Pack and organic ranks are stored apart and never mixed.
- AI scans that fail or time out show as failed. They never count as "not mentioned".
- GBP writes (posts, replies, edits) go through the jobs queue with retries, and every change is logged with an undo where Google allows it.
- AI calls go through the step cache, so a re-shown answer never calls the model again.
- Tests cover each of these on a flaky case before launch.

## 5. Pricing

Priced under LocalRank at every tier, with more included. Yearly billing takes 15% off.

| | Free | Starter | Pro | Scale | Enterprise |
|---|---|---|---|---|---|
| Monthly | $0 | $49 | $199 | $399 | from $1,200 |
| Locations | 1 | 1 | 10 | 25 | Unlimited |
| Grid credits (1 pin = 1 credit) | 1 free scan a week | 10,000 | 60,000 | 200,000 | 400,000 |
| AI prompts tracked daily | 5 weekly | 20 | 100 | 200 | 1,000 |
| GBP Autopilot | Audit only | Yes | Yes | Yes | Yes |
| Review requests a month | – | 100 | 1,000 | 5,000 | Custom |
| Citations | NAP audit | Aggregators + top sites, 1 location | 10 locations | 25 locations | Unlimited |
| Lead unlocks a month | 50 | 500 | 5,000 | 10,000 | 25,000 |
| LLM Citation outreach | – | – | Yes | Yes + 5 managed placements | Unlimited |
| White label and client portal | – | – | Reports | Full | Full |
| Extra locations | – | – | $10 each a month | $10 each a month | Included |

Guarantee: 90 days. If the average grid rank doesn't improve, the customer gets their money back.

## 6. Running cost a month

Unit costs. Arrowsterr's are measured (`docs/pricing-v4.md`). The rest come from vendor pages we haven't confirmed yet.

| Unit | Our cost | Source |
|---|---|---|
| One AI prompt tracked daily for a month (6 engines) | ~$0.27 | measured in Arrowsterr |
| One grid pin (Maps SERP task, standard queue) | ~$0.0006 | DataForSEO (check) |
| One business record for Lead Finder | ~$0.0005 | DataForSEO Business Data (check) |
| One email found and verified | ~$0.004 | Hunter or similar (check) |
| One SMS review request (US) | ~$0.0083 | Twilio (check) |
| One review reply or post draft (Haiku) | ~$0.002 | estimate from `meter.ts` prices |
| Listings sync, one location a month | ~$3.00 | white-label listings partner (check) |
| Aggregator submission, one location a year | ~$5–$15 | Data Axle, Foursquare, Localeze resellers (check) |
| Google Business Profile API | $0 | Google |
| Stripe | 2.9% + $0.30 a charge | Stripe |

Typical cost per team (prompts full, credits and unlocks 40% used, about half the included locations synced):

| Plan | Price | Typical cost | Margin |
|---|---|---|---|
| Starter | $49 | ~$14 | ~71% |
| Pro | $199 | ~$76 | ~62% |
| Scale | $399 | ~$197 | ~51% |

Monthly totals, with a mix of 50% Starter, 40% Pro and 10% Scale, plus 10 free users per paying team:

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Paying teams, typical use | ~$2,855 | ~$28,550 |
| Free users (~$0.40 each) | ~$200 | ~$2,000 |
| Claude tokens for the Local Agent and writer | ~$150 | ~$1,500 |
| Servers: Render web, Fly worker, Supabase Pro (check) | ~$60 | ~$200 |
| **Total cost** | **~$3,265** | **~$32,250** |
| Revenue (monthly billing) | ~$7,200 | ~$72,000 |
| **Gross margin** | **~55%** | **~55%** |

AI prompts and listings sync drive cost the most. Scale has the thinnest margin, so its levers are fewer daily prompts or Gemini and AI Mode weekly. Extra locations at $10 each a month cover their own sync.

## 7. What to reuse from Arrowsterr

| Need | Reuse |
|---|---|
| AI answers from 6 engines | `src/lib/engines.ts`, `src/lib/dataforseo.ts`, `src/lib/visibility.ts` |
| Rank and SERP checks | `src/lib/rankChecks.ts`, `src/lib/dataforseo.ts` |
| Reports, share links, scheduled emails | `src/lib/reports*.ts`, `src/lib/shareSnapshot.ts`, `src/lib/schedules.ts` |
| Listicles and local pages | `src/lib/listicle.ts`, `src/lib/writer*.ts` |
| Schema | `src/lib/schemaGen.ts` |
| Background work | `src/lib/jobs.ts`, `src/lib/worker` |
| Billing and limits | `src/lib/plans.ts`, `src/lib/entitlements.ts`, `src/lib/stripe.ts`, `src/lib/meter.ts` |
| Free tools | `src/lib/freeTools.ts`, `src/lib/freeLimits.ts` |

New code: the Location model, the grid scanner and heatmap, the GBP client, the Review Engine, the citations pipeline, Lead Finder and the Local Agent.
