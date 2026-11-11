# Social: the plan

How Arrowsterr adds social media, tied to what it already does: how AI answers talk about a brand. AI answers cite Reddit threads, YouTube videos and LinkedIn posts all the time, so social work here starts from those citations. No backlinks.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page.

---

## 1. Summary

**What we build:** a new **Social** group in the sidebar with five parts, shipped in five phases.

| Part | What it answers |
|---|---|
| Social sources AI cites | Which Reddit threads, YouTube videos, LinkedIn posts and forum pages do AI answers cite for my prompts, and am I mentioned in them? |
| Reddit openings | Which threads are people asking my prompts in right now, and what should I reply? |
| Social listening | Who mentions my brand and my competitors on Reddit, YouTube and X, and how do they feel about it? |
| Social posts | Turn a published article into LinkedIn and X posts in my brand voice. |
| Social analytics | How do my own posts and videos do, next to my AI visibility? |

**Rules carried over from the rest of the product:**
- Arrowsterr never posts anything on Reddit. It finds threads and drafts a reply; the person posts it themselves.
- Posting to LinkedIn and X happens only when a person clicks Post or schedules it.
- Every theme and sentiment comes with a quote that is really in the post ("Haiku picks, code proves", the same rule Reviews used).

**What it costs to run:** about **$77 a month at Beta (50 teams)** and **$770 a month at Growth (500 teams)**, plus Reddit's API fee if Reddit charges a minimum (section 9).

**How long:** about 10 weeks for one engineer, in five phases of two weeks each (section 8).

---

## 2. What Arrowsterr has today

- Every tracked prompt is asked daily across ChatGPT, Claude, Gemini, Perplexity, AI Overview and AI Mode. Each answer's cited links are saved (`runs.chats[].sources`).
- Sources (AI Visibility → Sources) lists the domains and pages AI cites. Reddit, YouTube and LinkedIn show up there today as plain domains, with no detail about the thread or video.
- Zippie drafts content in the brand voice (Brand → Tone of voice), and the Agentic Writer publishes articles to WordPress, Webflow, Shopify, HubSpot and Ghost.

---

## 3. What other tools do

- **Gauge Chat:** Reddit and YouTube citation insights inside its AI visibility tracker.
- **Profound, Peec AI, AthenaHQ:** list the sites AI cites, including Reddit, with no thread-level work.
- **Social listening tools (Brand24, Mention, Sprout):** mentions and sentiment across social, with no tie to AI answers.
- **Schedulers (Buffer, Metricool, Hootsuite):** posting and analytics, with no tie to AI answers.

The gap: no tool connects "AI cites this Reddit thread for your buyers' question" with "here's the thread, you're missing from it, here's a reply to post". That is the lead feature.

---

## 4. The parts

### 4.1 Social sources AI cites (phase 1)

- From the answers already saved, pick the cited links on social and forum sites: reddit.com, youtube.com, linkedin.com, x.com, quora.com, medium.com and the brand's industry forums (a short list kept in code).
- **Per link:** the thread or video title, its community (subreddit or channel), how many answers cited it and on which AI, the prompts it was cited for, and the date it was last cited.
- **Am I in it?** Read each new link once:
  - Reddit thread: the post and top comments (Reddit Data API).
  - YouTube video: title, description and subtitles (DataForSEO YouTube API).
  - Then code checks whether the brand and each competitor are named, and Haiku sums up how each is described, with a quote proved in the text.
- **On screen:** a table of cited social links, sorted by how often AI cites them, with columns You / Competitors named / Not named. Filters: platform, AI, topic. A row opens the thread or video, the quotes and the prompts.
- **Next to Sources:** AI Visibility → Sources gets a "Social" tab that opens this view.

### 4.2 Reddit openings (phase 2)

- **Finding threads:** for the brand's top 20 prompts, a weekly Google search `site:reddit.com {prompt}` (DataForSEO, standard queue), plus the threads AI already cites from 4.1.
- **Ranking:** each thread gets a score from how often AI cites that thread or subreddit, how recent it is, its upvotes and comments, and whether the brand is already in it. Haiku says in one line why it fits, with a quote from the thread.
- **Draft reply:** on click, Sonnet writes a short, helpful reply in the brand voice. It answers the question first, names the brand only where it really fits, and says the poster works there when they do (Reddit's rules). The person edits, copies and posts it themselves. Arrowsterr never posts.
- **Status:** each opening can be marked Replied, Skipped or Watching. A replied thread is read again weekly to show whether the reply is still up and whether AI starts citing the thread with the brand in it.

### 4.3 Social listening (phase 3)

- **Mentions** of the brand and up to 3 competitors (names and domains), daily:
  - Reddit: search across Reddit (Data API).
  - YouTube: video search (YouTube Data API).
  - X: recent search, opt-in, Pro and up, with a monthly cap (pay per use).
  - LinkedIn has no public search API for posts, so LinkedIn mentions come only from 4.1 (posts AI cites).
- **Per mention:** platform, author, date, link, reach (upvotes, views, likes), and sentiment with a quote.
- **Themes:** what people praise and complain about, with counts and quotes, against competitors.
- **Alerts:** a mention with high reach, or a run of negative mentions, goes into the existing alert email.

### 4.4 Social posts (phase 4)

- From any published article (Agentic Writer or a URL), Sonnet drafts a LinkedIn post, an X thread and a short X post in the brand voice, with the article link.
- **Posting:**
  - LinkedIn (personal profile and company page) and X: connect with one click (OAuth), then Post now or Schedule. Nothing posts without a click.
  - Copy works everywhere with no connection.
- A calendar of scheduled posts sits in the Editorial Calendar, next to articles.

### 4.5 Social analytics (phase 5)

- Connected LinkedIn page, X account and YouTube channel: followers, impressions, engagement and clicks per post and per week.
- **Next to AI visibility:** a weekly line of social engagement against the brand's AI visibility and against how often AI cites the brand's own social posts and videos (from 4.1).

---

## 5. Screens

1. **Social → Cited by AI** (4.1): the table of social links AI cites, with You / Competitors / Not named.
2. **Social → Openings** (4.2): Reddit threads to reply in, with Draft reply and status.
3. **Social → Mentions** (4.3): the mention feed, sentiment and themes against competitors.
4. **Social → Posts** (4.4): drafts, scheduled and posted, plus the Connect buttons.
5. **Social → Analytics** (4.5): connected accounts' numbers next to AI visibility.

Each screen follows the app's rules: one primary button, the app's own dialogs, a first screen that explains itself before there's data.

---

## 6. Data and APIs

| Need | Source | Notes |
|---|---|---|
| Social links AI cites | Arrowsterr's saved answers | Free; already collected daily |
| Reddit threads and comments, Reddit search | Reddit Data API | Commercial use needs Reddit's approval (2 to 4 weeks reported); about $0.24 per 1,000 calls, possibly with a minimum (check) |
| Reddit threads for a prompt | DataForSEO Google SERP, standard queue | $0.0006 a search |
| YouTube video details, search | YouTube Data API | Free, 10,000 units a day per project; a search is 100 units, so Growth needs a free quota increase (Google audit) (check) |
| YouTube subtitles | DataForSEO YouTube API | Per task (check) |
| X search and posting | X API pay per use | $0.005 a post read, $0.01 a post written (check) |
| LinkedIn posting and page stats | LinkedIn Community Management API | Free; company pages need LinkedIn's approval (check) |
| Summaries, themes, sentiment | Claude Haiku | Quotes checked in code |
| Reply and post drafts | Claude Sonnet | On click only |

**New tables:** `social_links` (one row per cited social URL per brand, with mentions found), `social_openings` (Reddit threads, score, status), `social_mentions` (listening), `social_accounts` (OAuth connections, encrypted like Google Analytics tokens), `social_posts` (drafts, scheduled, posted, stats).

---

## 7. Reliability

- **Never post for the person on Reddit.** No Reddit login is ever stored.
- **A mention counts only when the name is really in the text,** matched by brand name and domain with the same rules as AI Visibility. Common-word brand names need the domain or a second word to count.
- **Themes and sentiment need a quote** that is really in the post. No quote, no theme.
- **A thread or video that's deleted** is marked removed and kept in history.
- **API limits:** each source has its own daily budget per workspace. When a budget runs out the job waits for tomorrow and the screen says so; it never fails silently.
- **Tests** for each pure function: link parsing per platform, mention matching (including a common-word brand), opening score, quote checks, and the X read cap.

---

## 8. Phases

| Phase | Weeks | What ships | Done when |
|---|---|---|---|
| 1. Cited by AI | 2 | 4.1, the Sources → Social tab | A test brand's cited Reddit thread shows with the right title, the AI that cited it, and "You: not named" when the brand isn't in it |
| 2. Reddit openings | 2 | 4.2, Draft reply, status | Openings for a test prompt list real threads, and every "why it fits" line carries a quote from its thread |
| 3. Listening | 2 | 4.3, alerts | A test mention posted on Reddit shows within a day, with the right sentiment and quote |
| 4. Posts | 2 | 4.4, LinkedIn and X connect, schedule | A scheduled LinkedIn post goes out at its time, once |
| 5. Analytics | 2 | 4.5 | A connected LinkedIn page's weekly impressions match LinkedIn's own page |

Apply for Reddit commercial access and LinkedIn's Community Management API in week 1, so approval doesn't hold up phases 2 to 4. Phase 1 needs only Reddit (to read threads); YouTube works from day one.

---

## 9. Running cost

**Assumptions:**
- 1.3 brands per team: 65 brands at Beta, 650 at Growth.
- Use:
  - Cited by AI: every brand.
  - Openings and Listening: half the brands.
  - X listening: 30% of those, capped at 500 post reads a brand a month.
  - Posts: 40% of brands.
  - Analytics: 30% of brands.
- Claude Haiku at $1 / $5 and Sonnet at $3 / $15 per million tokens in / out (check).

**Per brand a month:**

| Line | Cost | How |
|---|---|---|
| Cited by AI | ~$0.02 | About 40 new social links a month: Reddit reads, YouTube subtitles, a Haiku summary each |
| Reddit openings | ~$0.70 | 80 Google searches, about 120 thread reads, Haiku ranking; about 10 Sonnet reply drafts |
| Listening, Reddit and YouTube | ~$0.35 | Daily searches for the brand and 3 competitors; Haiku sentiment on about 300 mentions |
| Listening, X (opt-in) | ~$2.50 | 500 post reads at $0.005 |
| Posts | ~$0.42 | 8 articles turned into posts by Sonnet; about 20 X posts at $0.01 |
| Analytics | ~$0.30 | X reads for the brand's own posts; LinkedIn and YouTube stats are free |

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Cited by AI (DataForSEO, Reddit, Claude) | ~$1 | ~$13 |
| Reddit openings (DataForSEO, Reddit, Claude) | ~$23 | ~$228 |
| Listening, Reddit and YouTube (Claude) | ~$11 | ~$114 |
| Listening, X (X API) | ~$24 | ~$244 |
| Posts (Claude, X API) | ~$11 | ~$109 |
| Analytics (X API) | ~$6 | ~$59 |
| YouTube Data API, LinkedIn API | $0 | $0 |
| Servers (jobs on the existing worker) | $0 | $0 |
| **Monthly total** | **~$77** | **~$767** |
| Reddit Data API minimum, if Reddit applies one ($12,000 a year is reported, check) | +$1,000 | +$1,000 |

Plan tasks cover the paid parts the way they cover keyword research today: a Reddit openings refresh, an X listening month and each draft take tasks, so heavy use pays for itself.

---

## 10. Open questions

- **Reddit's price:** does a commercial plan carry a minimum? If it does, phase 1 can read cited threads through Reddit's public pages under a small free quota, and phases 2 and 3 wait for the paid plan.
- **X listening:** keep it, at about $2.50 a brand a month, or leave X to the posting side only?
- **LinkedIn company pages:** posting needs LinkedIn's approval; until then, LinkedIn posts are copy only.
- **Plans:** which plans get Social, and how many listening keywords each.

---

## Sources

- [Reddit API pricing, 2026 (Octolens)](https://octolens.com/blog/reddit-api-pricing)
- [Reddit API comparison 2026 (API Serpent)](https://apiserpent.com/blog/reddit-api-comparison-2026)
- [X API pay per use (Gigazine)](https://gigazine.net/gsc_news/en/20260209-x-api-pay-per-use)
- [X API pricing 2026 (Postproxy)](https://www.postproxy.dev/blog/x-api-pricing-2026/)
- [LinkedIn API access in 2026 (Phyllo)](https://www.getphyllo.com/post/linkedin-api-access-in-2026-partner-program-approval-timeline-alternatives)
- [LinkedIn company page posting (Upload-Post)](https://www.upload-post.com/how-to/post-to-linkedin-company-page-api/)
- [DataForSEO pricing](https://dataforseo.com/pricing)
- [Gauge](https://www.withgauge.com/)
