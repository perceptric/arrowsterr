# Social: the plan

Social in Arrowsterr has four parts: **Voice of Customer**, **Scheduler**, **Library** and **Analytics**. We build them by copying Capybaroar's code (`dev-perceptric/capybaroar`) into Arrowsterr and fitting it to Arrowsterr's brands, plans and screens. No backlinks.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page.

---

## 1. Summary

| Part | What it does | Where it comes from |
|---|---|---|
| Voice of Customer | What people say about the brand and its competitors on Reddit, YouTube and X, plus comments, mentions and messages on the brand's own channels, with sentiment and themes | New listening code, plus Capybaroar's Inbox |
| Scheduler | Write posts once, schedule them to every channel from one calendar, with best times, threads, approvals and bulk upload | Capybaroar's Calendar, Composer, Channels and publisher |
| Library | The brand's images, videos and PDFs, with alt text, plus saved posts to reuse | Capybaroar's Media, with saved posts added |
| Analytics | How each post and channel does, the best times to post, and reports | Capybaroar's Analytics and Reports |

**Order:** Scheduler first, since Library and Analytics both need channels and posts. Then Library, Analytics and Voice of Customer.

**How long:** about 8 weeks for one engineer (section 6).

**What it costs to run:** about **$95 a month at Beta (50 teams)** and **$973 a month at Growth (500 teams)** (section 7).

The Content group's Library of articles becomes **Drafts** (`docs/drafts-plan.md`), so "Library" in the sidebar means Social's Library.

---

## 2. What we copy from Capybaroar

Capybaroar is our own social scheduler, about 29,000 lines on the same stack (Next.js, Supabase-style API, Postgres).

**Copied as they are, with their tests:**
- Networks (`src/lib/providers/`): LinkedIn profile and page, Facebook, Instagram, Threads, TikTok, YouTube, X, Pinterest, Reddit, Bluesky, Mastodon, Telegram, Discord and Google Business Profile. WordPress stays on Arrowsterr's own CMS code.
- Pure rules: network limits and settings (`networks.ts`, `formatRules.ts`), threads (`thread.ts`), best times (`queue.ts`), OAuth rules (`oauth/rules.ts`), bulk CSV (`bulk.ts`, `csv.ts`), campaigns (`campaignRules.ts`), channel groups (`groupRules.ts`), report times (`reportTimes.ts`).

**Copied and fitted to Arrowsterr:**
- The publish loop (`publisher.ts`, `unpublisher.ts`, `posts.ts`, `composer.ts`) runs on Arrowsterr's jobs queue (`src/lib/jobs.ts`) as new job kinds.
- The data layer moves from Capybaroar's workspaces to Arrowsterr's brands. Every row carries `brand_id`.
- Screens are rebuilt with Arrowsterr's parts (`aw-*` classes, `Pop`, `EmptyScreen`, the app's own dialogs). Capybaroar's layout and flow stay.
- Zippie gets the social tools in place of Capybaroar's Agents, and the Arrowsterr MCP server gets them too.

**Left out:** Link in bio, Capybaroar's billing and credits (Arrowsterr's plans and tasks cover this), its teams (Arrowsterr has its own) and its REST API keys.

---

## 3. The parts

### 3.1 Scheduler

- **Channels:** connect each network with one click (OAuth). A brand can have many channels, put into groups.
- **Composer:** one post, with its own text and settings per network, a live preview per network, media from the Library, threads on X, Bluesky, Threads and Mastodon, first comment, and Zippie to write or shorten in the brand voice.
- **Calendar:** month, week and list views. Drag a post to move it. Draft, scheduled, published and failed states.
- **Queue and best times:** "Add to queue" picks the next good slot from the brand's own past posts.
- **Approvals:** a post can wait for a teammate's approval before it goes out.
- **Bulk:** upload a CSV of posts. Evergreen posts repeat on a schedule. RSS feeds turn new items into drafts.
- **From articles:** a published draft from Drafts turns into posts for each channel, ready to schedule.
- **Reliability:** each network's errors are mapped to a clear line. A retry starts from the part that failed, so a thread never posts twice. Tokens refresh before they run out, and a channel that needs reconnecting shows it.

### 3.2 Library

- Upload images, videos and PDFs, or import from a link. Alt text on each file, sent to every network that takes it.
- Image editing from Capybaroar (crop, resize per network).
- **Saved posts:** save any post to reuse it later, with its text and media.
- Files live in object storage, since video won't fit on the VPS disk at Growth.

### 3.3 Analytics

- Per post: views, reach, likes, comments, shares, saves and clicks, read from each network a few times after it goes out.
- Per channel: followers and totals over time, top posts, and posts by format (video, picture, text).
- Best times by weekday and hour, from the last 90 days.
- Reports: a PDF and share link, sent on a schedule, in Arrowsterr's report builder.
- Next to AI visibility: social engagement by week beside the brand's AI visibility.

### 3.4 Voice of Customer

- **Inbox:** comments, replies, mentions and messages on the brand's connected channels, from Capybaroar's Inbox. Reply from Arrowsterr, with Zippie drafting in the brand voice. A person sends every reply.
- **Listening:** mentions of the brand and up to 3 competitors on Reddit, YouTube and X (X is opt-in), read daily.
- **Sentiment and themes:** what people praise and complain about, with counts. Every theme carries a quote that is really in the post, and code checks it.
- **Cited by AI:** Reddit threads, YouTube videos and LinkedIn posts that AI answers cite for the brand's prompts, taken from the answers Arrowsterr already saves, with whether the brand is named in them.
- **Alerts:** a mention with high reach or a run of negative mentions goes into the alert email.
- Arrowsterr never replies on Reddit for anyone. It drafts the reply, and the person posts it.

---

## 4. Data

New tables, one migration per phase:
- `social_channels`: connected accounts, tokens encrypted the way Google Analytics tokens are.
- `social_posts`, `social_targets`: a post and its copy for each channel, with state and the network's post id.
- `social_media`: Library files and alt text. `social_saved`: saved posts.
- `social_metrics`: stats per post per reading. `social_channel_stats`: daily channel totals.
- `social_inbox`: comments, mentions and messages. `social_mentions`: listening results with sentiment and quote.

---

## 5. Network apps

Each network needs Arrowsterr's own app, approved by the network, before customers can connect:
- Meta (Facebook, Instagram, Threads): app review, often 2 to 6 weeks.
- TikTok: content posting audit.
- LinkedIn: Community Management API for company pages.
- X: developer account on pay-per-use.
- YouTube: Google verification and a quota increase (an upload costs 1,600 of the 10,000 daily units).
- Pinterest: standard access.

Apply in week 1 so the reviews finish while we build. Capybaroar's `docs/tiktok/app-review.md` has the answers we gave TikTok.

---

## 6. Phases

| Phase | Weeks | What ships | Done when |
|---|---|---|---|
| 1. Scheduler | 3 | Channels, Composer, Calendar, queue, approvals, bulk, posts from articles | A test post scheduled to LinkedIn, X and Bluesky goes out once each at its time, and a thread whose third part fails posts only parts 3 and up on retry |
| 2. Library | 1 | Media, alt text, saved posts, object storage | A video uploaded to the Library posts to YouTube and TikTok |
| 3. Analytics | 1.5 | Post and channel stats, best times, reports | A test post's likes match the network's own numbers within a day |
| 4. Voice of Customer | 2.5 | Inbox, listening, themes, Cited by AI, alerts | A test mention on Reddit shows within a day with the right sentiment and its quote, and a comment on a connected channel shows in the Inbox |

---

## 7. Running cost

**Assumptions:**
- 1.3 brands per team: 65 brands at Beta, 650 at Growth.
- 40% of teams connect X. Each of those posts about 30 times a month on X, with stats read 4 times per post and about 200 inbox reads.
- Zippie writes about 40 posts a team a month with Sonnet at $3 / $15 per million tokens in / out (check).
- About 2 GB of media per team in object storage at $0.015 a GB a month (Cloudflare R2, check).
- Half the brands use listening (about $0.35 a brand a month on Reddit and YouTube). 30% of those add X listening at 500 reads.
- X: $0.01 a post written and $0.005 a post read (check).

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| X posting, stats and inbox (X API) | ~$38 | ~$380 |
| Zippie post drafts and replies (Claude) | ~$20 | ~$200 |
| Library storage (object storage, check) | ~$2 | ~$15 |
| Listening, Reddit and YouTube (Claude) | ~$11 | ~$114 |
| Listening, X (X API) | ~$24 | ~$244 |
| Other networks' APIs (LinkedIn, Meta, TikTok, YouTube, Pinterest, Bluesky, Mastodon) | $0 | $0 |
| Servers: publishing and stats on the existing worker; a larger VPS at Growth for video uploads (check) | $0 | ~$20 |
| **Monthly total** | **~$95** | **~$973** |
| Reddit Data API, if Reddit charges a commercial minimum ($12,000 a year is reported, check) | +$1,000 | +$1,000 |

Plan tasks cover the paid parts the way they cover keyword research today, so heavy use pays for itself.

---

## 8. Open questions

- **Network apps:** build Arrowsterr's own apps (consent screens say Arrowsterr) or add Arrowsterr's sign-in address to Capybaroar's approved apps (faster, but the consent screens say Capybaroar)?
- **Plans:** which plans get Social, and how many channels and scheduled posts each.
- **Reddit's price** for listening (section 7).
- **X listening:** keep it at about $2.50 a brand a month, or use X for posting only?

---

## Sources

- [Capybaroar](https://github.com/dev-perceptric/capybaroar) (`docs/gap-plan.md` for its network costs)
- [Reddit API pricing, 2026 (Octolens)](https://octolens.com/blog/reddit-api-pricing)
- [X API pay per use (Gigazine)](https://gigazine.net/gsc_news/en/20260209-x-api-pay-per-use)
- [LinkedIn API access in 2026 (Phyllo)](https://www.getphyllo.com/post/linkedin-api-access-in-2026-partner-program-approval-timeline-alternatives)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
