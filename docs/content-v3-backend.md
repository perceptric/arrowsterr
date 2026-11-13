# Content v3: the backend

How each part of Content v3 works under the screens: the algorithms, the jobs, the tables and the checks that keep it right. The product plan is `docs/content-v3-plan.md`. This doc is the build guide for it.

Everything runs on what we have: the jobs queue (`src/lib/jobs.ts`), the worker, the Postgres database on the VPS, DataForSEO, the AI engines in `src/lib/engines.ts`, the Chromium page reader on the Fly worker and the result cache (`src/lib/cache.ts`). One new service joins: the collab server for live editing.

---

## 1. The flow in one picture

```
Find opportunities ─► opp_find ─► content_clusters + calendar_items (ideas)
                                        │  Research / Research cluster / Import
                                        ▼
                                  research_run (agent, resumable)
                                        │  Send to Drafts
                                        ▼
                         draft_from_research ─► writer_brief ─► writer_draft ─► docs
                                        │  Send to review
                                        ▼
                         doc_reviews, doc_threads, live editing (arrowsterr-collab)
                                        │  Approved (pins a version)
                                        ▼
                         cms_publish / wp_publish on the date ─► published URL
                                        │  weekly
                                        ▼
                         refresh_check ─► Refresh rows ─► research_run (refresh mode)

Forms (beside all of this): tracking script ─► /api/forms/submit ─► form_submissions ─► form_send jobs
```

Every arrow is a job on the queue, so a crash or a deploy picks up where it stopped.

---

## 2. Opportunities

### 2.1 Inputs

| Input | Where it comes from | Fresh for |
|---|---|---|
| Keywords with stage, theme, volume, difficulty | `runAgent` (`src/lib/agent.ts`), as today | The run |
| Top 10 links for each keyword | DataForSEO, already fetched by `runAgent` | 7 days in `keyword_cache` |
| Where the site ranks now | DataForSEO ranked keywords for the site | 7 days |
| AI answers that name competitors | `answers` and the brand-name matcher (`src/lib/brandNames.ts`) | Last 30 days |
| Pages AI cites for competitors | AI Visibility Sources | Last 30 days |
| Published pages and their clicks | `gsc_pages` when Search Console is connected | Last 56 days |

### 2.2 Step 1: topics from AI answers

For each tracked prompt in the last 30 days:

1. Count the runs where any competitor is named and the runs where the brand is named.
2. It is a gap when a competitor is named in 2 or more runs and the brand in none.
3. Turn the prompt into a search keyword: Claude Haiku writes 3 short search phrases from the prompt, and DataForSEO returns their volume. Keep the phrase with the most volume. If no phrase has 50 searches a month or more, the row stays with no volume and is marked AI only.
4. Drop it when it matches a keyword already in the plan: the same top 10 links (3 or more shared), or 60% of the same words after removing stop words.

The reason text is built in code from the data, with no AI: "ChatGPT names Northpeak and Velora". The engine with the most competitor mentions goes first.

### 2.3 Step 2: clean the links

Before any grouping, each top-10 link is cleaned so the same page always matches:

- lowercase host, drop `www.`, the query string, the `#` part and a trailing slash;
- drop the brand's own domain;
- drop any link that shows in more than 40% of this run's keyword results. Wikipedia, Amazon, Reddit and YouTube show up for almost everything, so they would join topics that have nothing to do with each other. The 40% rule finds them from the data with no fixed list.

### 2.4 Step 3: pages

`groupBySerp` stays as it is: keywords that share 3 or more cleaned top-10 links become one page. The page's main keyword is the one with the most volume.

### 2.5 Step 4: clusters

1. Each page gets a link set: every cleaned link in its keywords' top 10.
2. For every pair of pages, the edge weight is the number of links they share. Pairs with 0 have no edge.
3. Sort the edges by weight, highest first. Ties go to the pair whose keywords come first in A to Z order, so the result never changes between runs.
4. Walk the sorted edges and join the two pages' groups (union-find), but only when the joined group would be 12 pages or fewer.
5. This is Kruskal's method with a size cap. The strongest links join first, so every cluster holds the pages that belong together most, and no cluster passes 12.
6. A page with no edges joins the cluster in the same theme whose keywords share the most words with it (at least 30%), if that cluster has room. Otherwise it stands alone as a one-page cluster.
7. Update rows (pages the site already has) go through the same steps. Any that end up alone go into one cluster named "Pages to update".

### 2.6 Step 5: pillar, name and link plan

- **Pillar:** the page with the highest sum of edge weights inside its cluster. Ties go to more volume, then A to Z.
- **Name:** Claude Haiku names the cluster in 2 to 4 words from its keywords. Code checks that every word (lowercased, with a trailing "s" removed) appears in the cluster's keywords. If the check fails, the pillar's keyword is the name. Names are cached by a hash of the sorted keywords, so a cluster that didn't change costs nothing to name again.
- **Link plan:** every page links to its pillar, and the pillar links to every page. Stored on the cluster as a list of `[from item, to item]`.

### 2.7 Step 6: score

```
stage weight = 3 for Buy (BOFU), 2 for Compare (MOFU), 1 for Learn (TOFU)
value        = monthly volume × stage weight
               AI-only rows use the brand's median volume as their volume
chance       = 1 − difficulty / 100
               × 1.5 when the site ranks 4 to 10 for the keyword
               × 1.25 when it ranks 11 to 20
               capped at 0.95
AI bonus     = 1.5 when AI answers name a competitor and leave out the brand, else 1
update bonus = 1.2 for Update rows (fixing a page is faster than writing one)
score        = value × chance × AI bonus × update bonus
```

- A cluster's score is the sum of its pages' scores.
- **Chance column:** High, Medium or Low by the brand's own thirds (the 33rd and 66th percentile of its scores). With fewer than 6 rows, fixed cut points are used: High at 0.6 chance or more, Low under 0.3.
- **Your rank column:** the site's position for the keyword, or "Missing" when it isn't in the top 100.

### 2.8 Keeping clusters steady between runs

A new run must not scramble what people already did.

- Rows keep their state (In research, On calendar, Dismissed) because `calendar_items` is unique on site and keyword. A refresh updates numbers and leaves states alone.
- A new cluster takes an old cluster's id, name and order when 50% or more of its keywords match (Jaccard). Each old cluster can be taken once, best match first.
- Dismissed rows stay dismissed and don't come back in later runs unless their score doubles.

### 2.9 Job and limits

- Job `opp_find`, keyed by site so only one runs at a time. It runs `runAgent` and then steps 1 to 6.
- Steps 1 and 3 to 6 are pure functions in `src/lib/clusters.ts`, tested on recorded keyword sets.
- The 30-day refresh rule on paid plans stays.

---

## 3. Research agent

### 3.1 The job

- Job `research_run`, one per topic, keyed by the research id.
- Up to 2 run at once per workspace. "Research cluster" queues the pillar first, then the other pages by score.
- The run is resumable: its whole state (the messages so far, the step log, the pages asked for) is saved on `content_research` after every step. When the job has to wait for something, it saves and calls `retry` with a wait. When it runs again, it carries on from the saved state.

### 3.2 The steps

**Fixed start (code, no model choice):**

1. `search_google`: the top 10, People Also Ask and the AI Overview (`readSerp`, as today).
2. `ask_ai`: the topic as a question (`asQuestion`) on 4 engines (`pickEngines`), with their cited links. Runs at the same time as step 1.
3. Queue page reads for the top 10 links and up to 10 cited links on the Fly reader (`article_pages`, as today). The job waits until 5 pages are read or 10 minutes pass, checking every 30 seconds.

**Agent loop (Claude Sonnet, up to 16 steps counting the fixed start):**

| Tool | Input | Returns to the model |
|---|---|---|
| `read_page` | a URL | Headings, the first 6,000 characters of text and any tables. The full text is kept in `article_pages` for the quote check |
| `search_web` | a query | Claude's web search results with links |
| `site_pages` | a topic | Up to 10 of the brand's own pages from the sitemap, best title match first |
| `cluster` | none | The cluster's pillar and other pages, with their status |
| `finish` | the research doc | Ends the loop |

- `read_page` on a link not read yet asks the Fly reader and pauses the run (save, `retry` in 30 seconds). The next run hands the page back to the model as the tool result.
- The system prompt, the tool list and the conversation so far use prompt caching, so each step pays full price only for what is new.
- **Stops:** `finish`, 16 steps, 150,000 input tokens or 30 minutes. On any stop other than `finish`, the model gets one last turn that may only call `finish`.
- **Fails:** fewer than 5 pages read after 2 rounds of waiting, as today. The row shows one line and Retry.

### 3.3 Building the doc

The model writes part of the doc. Code builds or checks every part before it is saved.

| Part | Written by | Checked by code |
|---|---|---|
| Search intent | Model | One sentence, 25 words or fewer |
| What top pages cover | Model names 6 to 10 subtopics, each with 2 to 5 key phrases | Code marks a page as covering a subtopic when any key phrase is in its headings or text. The model never fills the ticks |
| What AI answers say | Model writes one line per engine | Brands named and pages cited come from the `ask_ai` results in code |
| Angles to win | Model | Each angle must point to a subtopic with 1 or fewer ticks, or to a question no top page answers |
| Facts and numbers | Model gives claim, quote and URL | The quote check below |
| Questions | Code | People Also Ask plus questions in the AI answers, with repeats removed |
| Outline | Model | One H1, 4 to 10 H2s and an FAQ built from the Questions part |
| Internal links | Code | The pillar, the cluster's pages and the top 5 site pages by title match. The model only picks the anchor text |

**The quote check:**

1. Clean both the quote and the stored text of the page at that URL: lowercase, curly quotes and dashes made straight, runs of spaces made one, soft hyphens removed.
2. Keep the fact only when the cleaned quote is in the cleaned page text, and is 20 to 300 characters long.
3. If fewer than 2 facts pass, the model gets one more turn with the list of failed quotes to fix them. Then only passing facts are kept.

### 3.4 Live steps on the screen

- Each step adds a line to `content_research.steps`: time, tool, a short label ("Read 6 pages") and detail.
- The page asks `GET /api/research/:id` every 2 seconds while a run is open. The stack has no realtime service, and this is cheap at these numbers.
- Progress for the sheet's bar is the share of the 6 stages done: search, AI, reading, web, site pages, writing.

### 3.5 Caching

Repeated tool calls with the same input read from `keyword_cache`: `search_google` for 7 days, `ask_ai` for 3 days, `read_page` for 14 days. A second research on a close topic costs much less.

---

## 4. Drafts

### 4.1 From research to draft

- Job `draft_from_research` maps the doc onto the `writer_brief` input: outline, facts with their URLs, angles, questions and the link plan. Then `writer_draft` runs as today.
- **After the draft, code checks it:**
  - every outside link must be one of the doc's sources or the brand's own site; others are removed;
  - every number in the text ("50 percent", "300 to 500 miles") must match a number in the doc's facts; others get a comment pinned to the text, "Check this number", from Arrowsterr;
  - the pillar link is present in every page of a cluster, added at the end of the first section if the writer left it out.
- **Meta:** meta title up to 60 characters, description 120 to 155, slug from the keyword. Built by the writer, checked in code, and editable in the sheet.

### 4.2 States

One function, `moveDraft(doc, to, user)`, is the only way to change a draft's state. The API, the sheet's status picker and every job call it.

| From | Can go to |
|---|---|
| Writing | Draft (when the writer job finishes) |
| Draft | In review, Approved (only when approval is off) |
| In review | Changes requested, Approved (by the review rule), Draft (writer pulls it back) |
| Changes requested | In review |
| Approved | Scheduled, Published, In review (new edits sent for approval) |
| Scheduled | Published, Approved (unscheduled), Failed |
| Failed | Scheduled (Retry) |

The state lives on `docs.status` and is copied to the calendar item.

### 4.3 Editing cells in the sheet

- `PATCH /api/drafts/:id` takes only the fields the sheet edits (meta title, description, slug, writer) and the row's `updated_at`.
- If the row changed since the sheet loaded it, the save is refused and the cell shows the new value with one short line. Nobody's edit is written over.
- Bulk actions send one request for all picked rows. A batch that fails is split so one bad row never stops the rest.

---

## 5. Review

### 5.1 Reviews and approval

- `doc_reviews`: doc, reviewer, round, state (waiting, approved, changes), due date, decided at.
- Sending to review starts a new round. Answers from older rounds no longer count.
- **Approved** when every reviewer in the round has approved. **Changes requested** as soon as one reviewer asks for changes.
- **Approval pins a version:** approving saves the `doc_versions` id that was approved. Publishing sends that version. Edits made after approval show a "Changed since approval" line and need a new round before they can go out.
- **One gate:** `canPublish(doc)` checks the workspace switch and the pinned version. The publish API, the schedule API, `cms_publish` and `wp_publish` all call it, and the jobs call it again at publish time.

### 5.2 Comments

- A comment is a thread pinned to text by a Tiptap mark (`comment`, with the thread id), so it moves with the text as people edit.
- The quote is saved when the thread starts. If the marked text is deleted, the thread moves to "Text removed" in the rail with its quote, so nothing is lost.
- `doc_threads`: id, doc, quote, created by, resolved by and at. `doc_comments`: id, thread, author, body, mentions, times.
- **Mentions:** the editor stores `@` mentions as user ids. The server checks each one is in the workspace, then sends an in-app notice (`src/lib/notify.ts`) and an email. Emails to one person are grouped every 5 minutes, so a busy review sends one email instead of ten.

### 5.3 Editing together

- **Server:** Hocuspocus (MIT) in a new Docker project on the VPS, `arrowsterr-collab`, behind the same proxy at `/collab`.
- **Sign-in:** `onAuthenticate` checks the person's sign-in token with the auth server and their role on the doc's workspace. Editors and up can write. Viewers join read-only.
- **Loading:** from `doc_ydocs` (the Yjs state). If there's no row yet, the server builds one from `docs.content`.
- **Saving:** the Yjs state is saved to `doc_ydocs` 2 seconds after the last change, and at least every 10 seconds while people type. When the last person leaves, the server also writes `docs.content` (Tiptap JSON) and the word count, and adds a `doc_versions` row.
- **AI edits:** writer actions (rewrite a paragraph, add a table, fix a number) go through the collab server as a server-side client. Their changes merge with what people are typing at that moment, so nothing jumps or gets lost.
- **Cells outside the text:** meta fields live in columns and go through the `PATCH` in section 4.3.
- **When the server is down:** the editor opens read-only with one line and Retry. The sheet still works.

---

## 6. Publish and Calendar

- The calendar is `calendar_items` with a date. The sheet and the month view read the same rows.
- **Changing a date in a cell** moves the publish job: the job is keyed by doc and site, so the new time replaces the old one.
- **Publishing** uses `cms_publish` and `wp_publish` as today, with `canPublish` checked first.
- **Retries:** a failed publish tries again after 1, 5, 15 and 60 minutes. After 4 tries the post is Failed with Retry, and the failure shows in one short line.
- **Sites** is the existing integrations list, moved out of Settings.

---

## 7. Refresh

### 7.1 The weekly check

Job `refresh_check`, once a week per site, looks at every published page that has a URL.

| Signal | Rule | Data |
|---|---|---|
| Google drop | Over the last 28 days against the 28 before: position worse by 3 or more and clicks down 20% or more, with 50 or more clicks before | `gsc_pages` |
| Google drop, without Search Console | The page's main keyword fell 3 or more spots and stayed there for 2 checks | Rank checks (`src/lib/rankChecks.ts`) |
| AI drop | Citations of the URL in the brand's AI answers fell by half over 4 weeks against the 4 before, with 2 or more before | `answers` and their cited links |
| Old year | The title or H1 names a year before this one | The page |
| Old page | Not updated in 12 months and the page is Buy stage | `docs.updated_at` |

- **Noise guard:** a signal must show 2 weeks in a row before the page appears, except the old year rule, which shows at once.
- **Order:** by lost clicks (clicks before minus clicks now), plus 100 for each AI drop, so the pages costing the most come first.

### 7.2 Update

**Update** starts a `research_run` in refresh mode: the live page is read first and kept as a source, and the doc adds a part listing what changed in the top results since the page was written. Send to Drafts opens a new version of the same doc, so the URL and history stay.

---

## 8. Forms

### 8.1 Showing forms

- The tracking script (`/t/script.js`) already loads on every page of the site. It asks `GET /api/forms/config?site=…` once per page view. The answer is small, cached for 5 minutes, and sent with an ETag.
- **Rules run in the browser:**
  - path match with `*` (like `/blog/*`);
  - trigger: inline, after a delay, at a scroll depth, or when the mouse leaves toward the top;
  - how often: a closed form stays hidden for 14 days, and a person who signed up never sees that form again, both kept in localStorage;
  - at most one popup or slide-in per page view, the highest form in the list first.
- **Inline forms** come from the Form block: the published article holds `<div data-aw-form="…">` plus a plain HTML `<form>` that posts to `/api/forms/submit`. When the script loads, it swaps in the full form. When scripts are blocked, the plain form still works and returns the reader to the page.
- **Look:** the form draws inside a shadow DOM with the Brand Kit's colors, font and corners, so the site's own CSS can't break it.

### 8.2 Taking a submission

`POST /api/forms/submit`, in this order:

1. **Check the site:** CORS allows only the site's own domains.
2. **Check the fields** against the form: email format, required fields, length limits.
3. **Spam checks:**
   - the hidden field is filled, or the form was sent less than 2 seconds after it showed: saved as spam, and the visitor still sees the thank-you;
   - more than 5 a minute or 20 an hour from one visitor on one form: refused with a short message;
   - Cloudflare Turnstile is a switch per form for heavy spam (free tier, check).
4. **No doubles:** each form render gets a random id. The same id, or the same form and email within 10 minutes, updates the first row instead of adding a new one.
5. **Save** to `form_submissions`.
6. **Queue** one `form_send` job per destination, keyed by submission and destination, so a lead is never sent twice.
7. **Answer** the visitor with the thank-you message or the redirect.

Steps 1 to 5 take one database write. Everything slow happens after the visitor has their answer.

### 8.3 Sending leads on

| Destination | How |
|---|---|
| Email to teammates | The existing email sender, one email per lead |
| Slack | The Slack app already connected for alerts |
| Webhook | A new `form.submitted` event with a signature header, like our other webhooks |
| HubSpot | Create or update the contact by email (one more scope on our HubSpot app) |
| Shopify | Create a customer with email consent (one more scope, check) |

- A failed send tries again after 1, 5 and 30 minutes, then 2, 6 and 24 hours. After that it shows on the submission as Failed, with Retry, in one short line.
- CSV export reads straight from the table.

### 8.4 Where leads came from

- The script keeps a first-party visitor id and the first visit's referrer, landing page and UTM tags in localStorage. They go with every submission.
- **AI source:** `aiSourceOf(referrer)` (`src/lib/aiSources.ts`), plus `utm_source` values AI tools add (for example `chatgpt.com`).
- **Views:** a "Form view" event goes to Umami with the form id and page. A nightly job reads the counts into `form_daily` (form, day, page, source, views, submissions), and the Forms sheet reads from there.
- **Privacy:** IP addresses are kept only as a salted hash for the rate limit. Settings › Data retention deletes old submissions.

---

## 9. Tables

One migration per phase, starting at `082`.

| Table or change | Columns |
|---|---|
| `content_clusters` | id, workspace, site, name, pillar item, theme, score, link plan, run, created and updated |
| `calendar_items` adds | cluster id, cluster role (pillar or page), kind (new or update), score, chance, reason, reason engine, your rank, sources, dismissed at. Status gains the new states |
| `content_research` | id, workspace, site, item, topic, mode (new or refresh), status, stage, steps, messages, doc, sources, tokens in and out, searches, cost, created by, times |
| `docs` adds | status, meta title, description, slug, approved version id |
| `doc_reviews` | doc, reviewer, round, state, due, decided at |
| `doc_threads`, `doc_comments` | Section 5.2 |
| `doc_ydocs` | doc id, state (bytea), updated at |
| `refresh_signals` | site, URL, item, week, signal, before, after, lost clicks |
| `forms` | id, workspace, site, name, kind, fields, look, after submit, rules, destinations, Turnstile on, live |
| `form_submissions` | id, form, site, render id, email, fields, consent, page, landing page, referrer, UTM tags, AI source, visitor id, IP hash, spam, created at |
| `form_sends` | submission, destination, state, attempts, last error, sent at |
| `form_daily` | form, day, page, source, views, submissions |

Every table has row-level security by workspace role, like the rest of the schema. Submissions are written only by the server.

---

## 10. Jobs

| Job | Started by | Key | At once | Retries |
|---|---|---|---|---|
| `opp_find` | Find opportunities, the 30-day refresh | site | 1 per site | 3 |
| `research_run` | Research, Research cluster, Import, Update | research id | 2 per workspace | Resumes after waits; 3 for errors |
| `draft_from_research` | Send to Drafts | research id | as `writer_draft` | 3 |
| `refresh_check` | Weekly | site + week | 4 overall | 3 |
| `form_send` | Each submission | submission + destination | 10 overall | 6, growing waits |
| `form_daily` | Nightly | day | 1 | 3 |
| `review_digest` | Every 5 minutes when mentions are waiting | person + 5-minute slot | 1 | 3 |

Hiccups (timeouts, 429, 5xx, network) retry on their own with growing waits, as the queue does today.

---

## 11. Tests that must pass before each phase ships

The reliability rule: a wrong signal costs more than a missing one, so each part ships with a test on the hard case.

- **Clusters:** 3 recorded keyword sets. The same input gives the same clusters, pillars and order in 20 runs. No cluster has more than 12 pages. Every page is in exactly one cluster. Links that show in most results (Wikipedia, Reddit) never join clusters.
- **Steady ids:** a second run with 20% of keywords changed keeps every state and at least 80% of cluster ids.
- **Quote check:** curly quotes, no-break spaces, soft hyphens and line breaks all match. A quote changed by one word fails. 20 recorded research runs keep only facts found on their pages.
- **Agent resume:** killing the worker at each step and starting again ends with the same doc and no step run twice.
- **Approval gate:** with the switch on, each of the 4 publish paths refuses an unapproved draft, and a draft edited after approval publishes the approved version.
- **Live editing:** two editors and one AI edit on one draft for 10 minutes, with one editor offline for 2 minutes, end with the same text everywhere and every change kept.
- **Forms:** 1,000 submissions with every destination failing half the time end with 1,000 rows saved, every lead sent once to each destination, and none sent twice. Double clicks on Submit make one row.
- **Refresh:** a page that drops for one week and comes back never shows. A page that drops two weeks running shows the next Monday.

---

## 12. Running cost

**Assumptions:** 50 teams at Beta and 500 at Growth; 2 opportunity runs, 12 researches and 4 refresh updates a team a month; 30% of teams use forms with 20,000 page views each a month; Claude Sonnet 5.5 at $2 in and $10 out per million tokens and Haiku 5.5 at $0.10 and $0.50 (check).

| Line | Each | Beta (50 teams) | Growth (500 teams) |
|---|---|---|---|
| Opportunities: SERP data already fetched; Haiku names (cached) and gap phrases; DataForSEO volume for gap phrases | ~$0.02 a run | ~$2 | ~$20 |
| Research agent: ~120K tokens in and 8K out with caching, 5 web searches at $10 per 1,000 (check), SERP and 4 AI engines as today | ~$0.43 a research, ~$0.25 more than today's research | ~$150 more | ~$1,500 more |
| Refresh updates: run as research in refresh mode | Counted in the 12 researches | $0 | $0 |
| Refresh check: weekly, on data we already have | ~$0 | ~$0 | ~$0 |
| Draft checks: code only | $0 | $0 | $0 |
| Review: notices and grouped emails through the existing sender | ~$0 | ~$0 | ~$5 (check) |
| Live editing: Hocuspocus on the VPS | $0 | $0 | ~$20 for more VPS memory (check) |
| Forms: config and submissions on our server, views as Umami events, Turnstile free tier | ~$0 | ~$0 | ~$10 for more Umami events (check) |
| **Added a month** | | **~$152** | **~$1,555** |

Researches use plan tasks, as articles do today, so heavy use is paid for by the plan it runs on. This is about $10 a month lower at Beta and $100 lower at Growth than the product plan's estimate, because refresh updates now count as researches and the weekly check uses only data we already store.

---

## 13. Build order

The phases in `docs/content-v3-plan.md` stay. This doc adds what each phase builds underneath:

| Phase | Backend |
|---|---|
| 1. Opportunities | Sections 2, 9 (clusters, calendar item columns), the `opp_find` job, the cluster tests |
| 2. Research | Section 3, `content_research`, the quote check and resume tests |
| 3. Drafts | Section 4, `draft_from_research`, `moveDraft`, the sheet `PATCH` |
| 4. Review | Sections 5.1 and 5.2, `doc_reviews`, threads, mentions, `canPublish`, the gate test |
| 5. Live editing | Section 5.3, `arrowsterr-collab`, `doc_ydocs`, the merge test |
| 6. Forms | Section 8, the forms tables, `form_send`, `form_daily`, the 1,000-lead test |
| 7. Publish and Refresh | Sections 6 and 7, `refresh_check`, `refresh_signals` |

---

## Sources

- [Hocuspocus](https://tiptap.dev/docs/hocuspocus/introduction) and [Tiptap Collaboration](https://tiptap.dev/docs/editor/extensions/functionality/collaboration) (MIT, check)
- [Anthropic web search tool pricing](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool) (check)
- [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/) (free tier, check)
- [Kruskal's algorithm](https://en.wikipedia.org/wiki/Kruskal%27s_algorithm), used here with a size cap on each group
