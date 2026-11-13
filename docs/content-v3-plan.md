# Content v3: the plan

From a gap to a lead: **Opportunities** finds what to write, grouped into clusters. **Research** sends an AI agent out to study one topic. **Drafts** turns the research into an article. **Review** is where teammates edit together and comment. **Publish** puts it live. **Conversion** adds forms, so readers become sign-ups.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page.

The algorithms, jobs and tables behind it are in `docs/content-v3-backend.md`.

---

## 1. The sidebar

| Group | Page | Is today | Address |
|---|---|---|---|
| **Plan & Create** | Opportunities | The Editorial Calendar's plan ("Build my plan") | `/opportunities` |
| | Research | New: Content Research, plus Keyword Research, Domain Research and Competitive Analysis as tabs | `/research`, `/research/keywords`, `/research/domains`, `/research/competitors` |
| | Drafts | Drafts | `/drafts` |
| | Review | New | `/review` |
| **Publish** | Calendar | The Editorial Calendar's dates, plus every scheduled, published and failed post | `/calendar` |
| | Sites | Settings › Brand › Publishing sites | `/publish/sites` |
| | Refresh | New | `/publish/refresh` |
| **Conversion** | Forms | New | `/forms` |
| **Monitor** | AI Visibility (Prompts, Competitors, Sources), AI Shopping | As now | As now |
| **Reports** | Reports | As now | As now |

Old addresses keep working: `/editorial-calendar` opens Calendar, `/keywords`, `/domain-research` and `/competitive-analysis` open their Research tabs, and the old Content Plan names open Opportunities.

The Queue page from the last proposal folds into Calendar: one page lists every post by date with its state, so there is no second list to keep in step.

---

## 2. What we have today (November 2026)

- **"Build my plan"** (`/api/research/agentic`, job `plan`, `runAgent` in `src/lib/agent.ts`):
  1. reads the sitemap and the site's ranking keywords (DataForSEO);
  2. finds competitors (Claude with web search) and their keywords;
  3. writes keywords stage by stage, BOFU first, with 5 to 8 themes;
  4. checks volume and the top 10 results for each keyword.

  `groupBySerp` joins keywords that share 3 or more top-10 links into one page. Results go to `keyword_runs`, then to `calendar_items` rows (planned, writing, review, published). One refresh every 30 days on paid plans.
- **Article research** (job `article_research`): a fixed pipeline. It pulls the top 10 with People Also Ask and the AI Overview, reads each page in Chromium on the Fly worker, asks up to 4 AI engines and reads the pages they cite. It saves to `article_runs`, `article_pages` and `article_ai_answers`.
- **Outline and draft:** `writer_brief` turns the research into an outline with one Claude call, and `writer_draft` writes, checks and adds images and modules. The text lives in `docs` (Tiptap JSON) with `doc_versions`.
- **Publishing:** WordPress, Webflow, Framer, Shopify, HubSpot, Ghost, Wix and webhooks, now or scheduled.
- **Not there:** clusters above the page level, an agent that decides what to read, person-to-person comments, mentions, live co-editing, a review flow, forms and stored leads. The tracking script counts form submits and CTA clicks in Umami, but keeps no lead.

---

## 3. Opportunities

The content plan becomes Opportunities. One click ("Find opportunities") runs the research and returns a ranked list, grouped into clusters.

### 3.1 Where opportunities come from

| Source | Built on | New work |
|---|---|---|
| Keywords to win | `runAgent` as today | None |
| Pages to update | `runAgent`'s update check | None |
| AI answers that name competitors and not you | AI Visibility prompts and answers | A reader that turns each such prompt into a topic, with the competitor pages AI cited |
| Pages AI cites for competitors | AI Visibility Sources | Topics from those pages' titles and headings |
| Pages losing traffic | Google Search Console (phase 7) | Search Console sign-in |

Every opportunity is one row in `calendar_items` with no date (an idea), so the plan, the calendar and drafts keep one table.

### 3.2 Clusters

Today, keywords that share 3 or more top-10 links are one page. Clusters add the level above:

1. **Pages** (as today): keywords sharing 3 or more of the same top-10 links are one page.
2. **Clusters:** pages whose top 10 share at least 1 link are linked, and each connected group is a cluster. A cluster over 12 pages splits at the weakest links (the fewest shared links) until each part is 12 or under. A page with no shared link joins the cluster of its theme with the closest keywords, or stands alone.
3. **Pillar:** in each cluster, the page linked to the most other pages; on a tie, the higher monthly volume. The pillar is the broad guide and every other page links to it.
4. **Name:** Claude Haiku names each cluster in 2 to 4 words, and every word must come from the cluster's keywords (checked in code). Otherwise the pillar's keyword is the name.

Each cluster gets an internal link plan: every page links to its pillar, and the pillar links to every page. Drafts read it (section 5).

### 3.3 Ranking

```
value     = monthly volume × stage weight (BOFU 3, MOFU 2, TOFU 1)
chance    = 1 − difficulty/100, raised for pages you already rank 4 to 20 for
AI bonus  = 1.5 when AI answers name a competitor and not you, else 1
score     = value × chance × AI bonus
```

Clusters rank by the sum of their pages' scores. The list shows the score as High, Medium or Low, in thirds of the brand's own range.

### 3.4 The screen

- Opportunities is the Content Plan: the same list, columns, Write button, wording and Build my plan as before (`EditorialCalendar.tsx`, mode "plan"). Calendar is the same component with the month and week.
- The plan's new data shows as columns in that list: **Cluster** (with a Pillar tag), **Chance**, **Score** and **Why** ("ChatGPT names Northpeak and not you", "You rank 8"). No group rows: sort or filter by Cluster.
- **Refresh plan** runs it again. The 30-day refresh rule stays.

### 3.5 Data

- `content_clusters`: id, workspace, brand, site, name, pillar item, theme, score, run.
- `calendar_items` gets `cluster_id`, `cluster_role` (pillar or page), `score`, `reason`, `sources` (where it came from) and `dismissed_at`.

---

## 4. Research: Content Research

Import from Opportunities (one page or a whole cluster) or type a topic. An AI agent goes out, studies the topic, and returns a research doc for Drafts.

### 4.1 The agent

Claude Sonnet runs a loop with these tools, up to 16 steps per topic:

| Tool | Does | Built on |
|---|---|---|
| `search_google` | Top 10, People Also Ask, AI Overview | DataForSEO, as today |
| `ask_ai` | The question on ChatGPT, Gemini, AI Mode and Perplexity, with their cited links | `engines.ts`, as today |
| `read_page` | A page's headings, text and tables | The Chromium reader on the Fly worker, as today |
| `search_web` | A web search for facts, numbers, studies and examples | Claude's web search tool |
| `site_pages` | The brand's own pages on the topic, for internal links | The sitemap, as today |
| `cluster` | The cluster's other pages and its pillar | Section 3.2 |

It always starts with `search_google` and `ask_ai`, reads at least 5 pages, and stops when it has what the research doc needs or reaches 16 steps. The research pipeline that exists today becomes its first two steps, so nothing built is thrown away.

### 4.2 The research doc

| Part | What it holds |
|---|---|
| Search intent | What the searcher wants, in one line |
| What top pages cover | A table of the subtopics each top page covers, so gaps show |
| What AI answers say | Each engine's answer in short, which brands it names, which pages it cites |
| Angles to win | What the top pages and AI answers miss |
| Facts and numbers | Each with its page and the exact quote |
| Questions | People Also Ask and the questions AI answers raise |
| Outline | H1, sections and FAQ, ready for Drafts |
| Internal links | The pillar, the cluster's pages and the brand's own pages to link |

**No fact without its quote:** a fact is kept only when its quote appears, word for word, in the text of a page the agent read. Anything else is dropped before the doc is saved.

### 4.3 The screen

- The run shows each step as it happens ("Read 6 pages", "Asked ChatGPT"), with Otto-style status lines.
- The finished doc is one page with the parts above, editable. **Send to Drafts** makes the draft.
- A cluster sent here runs one research per page, pillar first, 2 at a time.

### 4.4 Data

`content_research`: id, workspace, brand, item, topic, status, steps (the step log), doc (jsonb, the parts above), sources, cost, created by, times. The existing `article_runs`, `article_pages` and `article_ai_answers` stay as the agent's raw material.

---

## 5. Drafts

- **From research:** Send to Drafts turns the research doc's outline into the `writer_brief` and runs the draft as today (`chainDraft`). The facts, internal links and questions go in with it, so the writer cites real sources and links the cluster.
- **States:** Draft, In review, Changes requested, Approved, Scheduled, Published. They live on the doc (a new `docs.status`) and on its calendar item.
- **Form block:** `/form` in the editor drops in one of the brand's forms (section 8). It publishes as an embed on every site we publish to.
- **Scores (phase 7):** an SEO score against the top pages from the research, and an AI score for how easily AI answers can quote it, each with fixes you apply in one click.

---

## 6. Review

Drafts go to a review queue, where teammates edit together and comment.

### 6.1 The flow

1. **Send to review** on a draft: pick reviewers from the workspace and a due date. Each reviewer gets an email and an in-app notice.
2. Reviewers edit the draft live with the writer and comment on any text, @mentioning teammates.
3. Each reviewer picks **Approve** or **Request changes**. Request changes moves the draft back with the open comments on top.
4. When every reviewer approves, the draft is Approved and can be scheduled or published.
5. Settings › Workspace has a switch: **Approval needed to publish**. When it's on, Publish and Schedule wait for approval.

Owners, admins and editors can edit and approve; viewers can comment.

### 6.2 The Review page

One list of drafts in review: title, writer, reviewers with each one's answer, due date, open comments, and state. Filters: Mine to review, Mine in review, All.

### 6.3 Comments

- Select text, then **Comment**. The comment is a thread pinned to that text, with replies, @mentions and **Resolve**.
- A thread stays pinned when the text around it is edited, since it's stored as a mark in the document.
- Mentions and replies send an email and an in-app notice. Resolved threads stay in a Resolved tab.
- Data: `doc_threads` (id, doc, anchor id, resolved by and at) and `doc_comments` (id, thread, author, body, mentions, times).

### 6.4 Editing together

- **How:** Tiptap's Collaboration and CollaborationCursor extensions (MIT) on Yjs, with a Hocuspocus server (MIT) as a new Docker project on the VPS, `arrowsterr-collab`.
- **Sign-in:** the server checks each person's sign-in token and their role on the workspace before it opens a doc.
- **Saving:** the shared document is saved to Postgres (`doc_ydocs`, one row per doc) every few seconds, and written back to `docs.content` with a new `doc_versions` row when everyone has left.
- **Presence:** names with colored cursors, and avatars of who's in the doc at the top.
- **Offline:** edits made offline merge when the person is back.
- **Fallback:** if the collab server is down, the editor opens read-only with a short line and a Retry, so no edit is lost or overwritten.

---

## 7. Publish

- **Calendar:** today's calendar views (list, month, week) for every item with a date, plus each post's state per site (Scheduled, Published with its link, Failed with Retry).
- **Sites:** the publishing sites, moved out of Settings.
- **Refresh:** published pages losing rank in Google (Search Console) or in AI answers (AI Visibility), each with **Update**, which runs Research again on the page and opens a new draft version. Weekly check.

---

## 8. Conversion: Forms

Forms turn readers into sign-ups.

### 8.1 Building a form

- **Fields:** email (always), name, company, phone, short text, long text, a choice list, and a consent checkbox with the privacy link.
- **Look:** the Brand Kit's colors, font and corners, so forms match the site.
- **After submit:** a thank-you message or a redirect, with an optional file download (a lead magnet).
- **Kinds:** inline (inside an article or page), plus two that open on their own: a popup (after a delay, at 50% scroll, or when leaving) and a slide-in bar.

### 8.2 Where forms show

- **In drafts:** the Form block (section 5), published with the article.
- **On any page of the site:** the tracking script already on the site loads forms by rules (pages that match a path, after a delay, at a scroll depth, on exit), one per page at most, never twice to someone who closed it.

### 8.3 Submissions

- **Saved first:** each submission is saved in Postgres before anything else runs (`form_submissions`: form, page, fields, consent, referrer, UTM tags, AI source, visitor ID, time).
- **AI source:** visits from ChatGPT, Perplexity, Gemini and others are tagged with `aiSources`, as on the Traffic page, so you can see leads from AI answers.
- **Spam:** a hidden field and a minimum time to fill. A per-visitor limit stops floods, and Cloudflare Turnstile can be added for heavy spam (free, check).
- **Sent on:** email to chosen teammates, Slack, webhooks (a new `form.submitted` event), HubSpot contacts (one more scope on the HubSpot app), and CSV export.
- **No lost leads:** each send-on runs as a job that retries with growing waits; a failure shows as one line with Retry on the form.
- **Retention:** Settings › Data retention deletes old submissions on its schedule.

### 8.4 Results

Per form: views, submissions and conversion rate, by page and by source (Google, AI answers, direct, other). Each draft shows the leads its page brought in. Later, Opportunities can rank by leads as well as traffic.

### 8.5 Data

`forms` (id, workspace, brand, name, kind, fields, look, after, rules, active) and `form_submissions`. Form views count through the tracking script as a Umami event.

### 8.6 One thing to decide

Claritia, our marketing platform, also turns visitors into leads. Arrowsterr forms can stay simple and send leads on to Claritia or Omniscient, or both can share one forms service later. This plan builds forms inside Arrowsterr, with a webhook any tool can read.

---

## 9. Reliability

- **Research:** no fact without a quote found on a page the agent read. A research run that reads fewer than 5 pages fails with one line and Retry, as today.
- **Clusters:** pure functions on SERP data, with tests on recorded keyword sets: the same input always gives the same clusters.
- **Editing together:** Yjs merges every edit; nothing is saved over someone else's text. The server checks role on every connection. If it's down, editing stops and nothing is lost.
- **Comments:** pinned as marks, so they move with the text.
- **Forms:** a submission is saved before any send-on; every send-on retries; duplicates (same form, email and minute) are dropped.
- **Approval:** with the switch on, no path publishes an unapproved draft. The server checks it on every publish and schedule.

---

## 10. Phases

| Phase | Weeks | Ships | Done when |
|---|---|---|---|
| 1. Sidebar and Opportunities | 1.5 | The new sidebar and addresses; clusters, pillars, names and ranking; AI-answer gaps as a source | On 3 real brands' plans, every page is in one cluster, each cluster has one pillar, and the same input gives the same clusters |
| 2. Content Research | 2 | The agent, the research doc, the live steps, Send to Drafts | On 20 topics, every fact's quote is found on its page, and each doc has every part |
| 3. Drafts from research | 1 | Research to outline to draft, the draft states, the Form block's place | A draft from research cites only the doc's sources and links its pillar |
| 4. Review | 1.5 | Send to review, the Review page, comments, mentions, Approve and Request changes, the approval switch, notices | With the switch on, no unapproved draft publishes; comments stay pinned through edits |
| 5. Editing together | 1.5 | The collab server, live cursors, presence, saving, the read-only fallback | Two people editing one draft for 10 minutes, one going offline and back, end with the same text and nothing lost |
| 6. Forms | 2.5 | The builder, inline, popup and slide-in, the script rules, submissions, spam checks, send-ons, results | 1,000 test submissions with the send-ons failing half the time end with every submission saved and every send-on delivered |
| 7. Publish and scores | 1.5 | Calendar with post states, Sites, Refresh, Search Console, SEO and AI scores | A page losing rank shows in Refresh within a week |

About 11.5 weeks for one engineer. Each phase ships on its own.

---

## 11. Running cost

**Assumptions:** 50 teams at Beta and 500 at Growth; 12 researches a team a month; 30% of teams use forms, with 20,000 page views each a month; Claude Sonnet 5.5 at $2 in and $10 out per million tokens, Haiku 5.5 at $0.10 and $0.50.

| Line | Each | Beta (50 teams) | Growth (500 teams) |
|---|---|---|---|
| Opportunities: SERP data already fetched for the plan; Haiku cluster names | ~$0.002 a run | ~$0 | ~$1 |
| AI-answer gaps: read from AI Visibility, no new calls | $0 | $0 | $0 |
| Research agent: about 120K tokens in and 8K out with caching, 5 web searches at $10 per 1,000 (check), SERP and 4 AI engines as today | ~$0.43 a research, ~$0.25 more than today's research and outline | ~$150 more | ~$1,500 more |
| Review: comments and notices through the existing email sender | ~$0 | ~$0 | ~$5 (check) |
| Editing together: Hocuspocus on the VPS | $0 | $0 | ~$20 for more VPS memory (check) |
| Forms: config and submissions on our server, views as Umami events | ~$0 | ~$0 | ~$10 for more Umami events (check) |
| Refresh and scores: weekly checks on data we have, Haiku for the AI score | | ~$12 | ~$120 |
| **Added a month** | | **~$162** | **~$1,656** |

Research runs take plan tasks, as articles do today, so heavy use is paid for by the plan it runs on.

---

## Sources

- [Tiptap Collaboration extension](https://tiptap.dev/docs/editor/extensions/functionality/collaboration) and [Hocuspocus](https://tiptap.dev/docs/hocuspocus/introduction) (MIT, check)
- [Anthropic web search tool pricing](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool) (check)
- [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) (free tier, check)
