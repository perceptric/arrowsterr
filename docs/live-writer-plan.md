# Live Writer: the plan

Write draft opens a sidebar, and you watch the agent write. You see it read the top pages, build the outline, write each section word by word, fix its own lines, check its facts and drop in the images. You can steer it while it works. When it finishes, the article is already in front of you and ready to publish.

Written November 2026. Prices marked "check" couldn't be confirmed on the vendor's own page. Builds on `docs/agentic-writing.md`, `docs/drafts-plan.md` and `docs/content-v3-backend.md`. Nothing in the pipeline is thrown away: the same steps run, and now you can see them and talk to them.

---

## 1. Summary

- **One sidebar for the whole draft.** Every Write draft button (Calendar, Drafts grid, Keyword Deep Dive, bulk) opens the Live Writer on the right. The draft streams into it as it's written.
- **You see the work.** A feed shows each step as it happens: pages read, AI engines asked, facts found, sections written, lines fixed, claims checked, images made.
- **You can steer.** Type into the sidebar at any time ("shorter intro", "add a pricing table", "skip Hubspot"). The agent reads it before its next step. Pause, Stop, Rewrite this section and Lock this section are one click each.
- **The agent makes real choices.** Inside each section it can look up a fact, read a page, find an internal link or ask you a question. It no longer fills a fixed template blind.
- **Closing the sidebar never stops the work.** A small dock in the corner shows every draft in progress. Click one to open it again, and the stream picks up where you are.

**How long:** about 6 weeks for one engineer (section 11).

**What it costs to run:** about **$45 more a month at Beta (50 teams)** and **$450 more at Growth (500 teams)** (section 12).

---

## 2. What we have today

From the code (November 2026):

- **Write draft** posts `{action: "draft"}` to `/api/agentic-writer`. `startDraft` (`src/lib/writerServer.ts:251`) queues a `writer_draft` job. The outline job chains into the draft on its own (`chainDraft`).
- **The draft runs as a job** in the web process (`/api/worker`, 900 s lease). Each turn stops starting paid calls after 90 s (`BUDGET_MS`) and requeues itself. Every step saves before the next, so a killed job starts where it stopped.
- **Nothing streams.** Every writer call goes through `askJson` (`src/lib/claude.ts:38`), a plain `messages.create` with JSON output. A section appears all at once, minutes after it was written.
- **Progress is polling** with `usePoll` every 4 to 5 seconds. There is no realtime service.
- **The labels drift.** `DraftProgress` (`src/components/writer/parts.tsx:69`) knows sections, check, modules and save, but not style or images, so during those steps nothing is marked. `ContentGrid.tsx:34` has its own `STEP` map that shows style and images as "Writing". `getDraft` (`src/lib/writerLibrary.ts:86`) doesn't select `styled` or `images`.
- **The agent tools exist but nobody can reach them.** `/api/writer/agent` (write, table, widget, stats, links, faq, meta, rewrite, alt) and `/api/writer/assist` have no callers in the app. Their only screen was `src/components/research/Writer.tsx`, which isn't mounted.
- **Streaming is already done well in one place.** Ask Arrowsterr streams NDJSON over a `TransformStream` with `client.messages.stream` (`src/lib/ask.ts:353`, `src/app/api/ask/route.ts:125`). The Live Writer uses the same pattern.

---

## 3. The experience

### 3.1 Opening it

- Click **Write draft** anywhere. The sidebar slides in from the right at 760 px wide (full screen on phones). The page behind it stays usable.
- The first line shows within one second: "Starting your draft on *best crm for startups*". The button you clicked turns into the live tag.
- **Bulk:** pick 6 rows and Write drafts. The sidebar opens on the first one, with a strip of tabs at the top for the other five. Each tab has its own progress ring.
- A draft that is already running opens straight to where it is.

### 3.2 The layout

```
┌───────────────────────────────────────────────────────────┐
│ best crm for startups          ● Writing 4 of 9   ⏸  ✕   │  header: keyword, step, Pause, Close
│ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░  Research ✓ Outline ✓ Write ● Check  │  stage bar
├───────────────────────────────────────────────────────────┤
│ ▸ Activity (42)                                    [hide] │  feed, collapsible
│   ✓ Read hubspot.com/crm (2,140 words)                    │
│   ✓ Found: "Free for up to 1,000,000 contacts" (hubspot)  │
│   ● Writing "4. Pipedrive" ...                            │
├───────────────────────────────────────────────────────────┤
│  # 9 Best CRMs for Startups in 2026                       │  the article, live
│  ...                                                      │
│  ## 4. Pipedrive                                          │
│  Pipedrive is a sales CRM that helps small teams track▍   │  streaming cursor
│                                                           │
│  [image: screenshot of pipedrive.com, making...]          │  image placeholder
├───────────────────────────────────────────────────────────┤
│ Tell the writer something...                     [Send]   │  steer box
└───────────────────────────────────────────────────────────┘
```

- **Header:** the keyword, the current step in plain words, Pause, Stop (in the menu) and Close. Close only hides the sidebar.
- **Stage bar:** Research, Outline, Write, Review, Check, Images, Finish. Each fills as it goes. The labels come from one map in `src/lib/writeFlow.ts`, so every screen shows the same words.
- **Activity feed:** one line per event, newest at the bottom, with a time on hover. Lines link to what they mention: a page read opens that page, a fact jumps to where it's used, a fixed line jumps to the line. It folds to one line ("Activity (42)") so the article gets the room.
- **The article:** a read-only Tiptap view in the same styles as the editor. Text streams in at the cursor. Sections that are done can be edited (3.5).
- **Steer box:** always at the bottom. See 3.4.

### 3.3 What you watch, step by step

| Stage | What shows in the feed | What shows in the article |
|---|---|---|
| Research | "Searched Google: top 10, 6 questions, AI Overview". "Asked ChatGPT, Perplexity, Gemini". One line per page read with its site icon and word count. One line per fact found with its quote | A card listing the top 10 with ticks as each is read |
| Outline | "Planning 9 sections and an FAQ". "Featuring 8 tools: HubSpot, Pipedrive..." | The H1, the title options and the H2s appear one by one, then the meta description and slug |
| Write | "Writing 2. HubSpot". When the writer looks something up: "Checked pipedrive.com/pricing for the starter price" | Each section streams in word by word. The section being written has a soft highlight |
| Review | "Lint: 7 lines break house rules". "Rewrote 5 lines in 3 sections". "2 lines kept for you to look at" | Each fixed line shows the old text struck through, then the new text streams in beside it. After 3 seconds the strike fades and only the new line stays. Lines left for you get a yellow mark |
| Check | "Checked 31 claims: 29 backed, 2 cut". "Removed 1 link that didn't load" | A backed claim flashes green with its source chip. A cut claim shows struck through, then goes |
| Images | "Screenshot of hubspot.com: done". "Chart: CRM prices: done". "pipedrive.com blocked the bot: left a note" | A grey box with a shimmer sits where each image goes. It fades into the image when the worker finishes |
| Finish | "Ready. 2,840 words, 9 images, 29 sources" | The finish card (3.6) |

The feed never shows raw prompts or model output. Every line is written by code from a typed event (section 5.2), so it reads the same every time and never leaks the system prompt.

### 3.4 Steering

The steer box takes plain words. What happens depends on when you send it.

| You send | When | What happens |
|---|---|---|
| A note ("keep it shorter", "we don't sell to enterprises") | Any time | Saved as a steer. The writer reads every open steer before its next call. A note that applies to the whole piece goes into the prefix of every later section. The feed says "Got it: keep it shorter" when it's picked up |
| A note about a done section | After that section | The writer asks once: "Rewrite 3. Salesforce with this?" with Yes or Later. Yes queues that section's rewrite after the current one |
| "Add a pricing table" or another quick ask | Any time | Matched to one of the existing agent tasks (`writerAgent.ts`: table, faq, stats, links, widget, meta, rewrite). It runs after the current section, in its place in the article |
| A question ("why did you skip Zoho?") | Any time | A short answer in the feed from the outline's notes and the research. It doesn't change the draft |

Buttons:

- **Pause:** the writer finishes the sentence it's on, saves, and waits. The tag shows "Paused". Resume carries on. A paused draft that sits for 24 hours stays paused and sends no alerts.
- **Stop:** ends the draft. What was written stays as a draft you can edit. It still counts as the month's draft (the same rule as today).
- **Rewrite this section** (on hover over a done section): queues a rewrite with an optional note.
- **Lock this section** (on hover): the review, fix and check steps leave it alone. Any section you edit by hand locks itself.

**The writer can ask you.** When the outline names something the research can't back ("Is your free plan still 2 seats?"), the writer may ask one question in the feed with two to four answers to tap. It keeps writing other sections while it waits. If nobody answers in 10 minutes, it writes around the fact and lists it in Review notes, as today. At most 3 questions per draft.

### 3.5 Editing while it writes

- **One rule:** the writer owns the section it's writing. You own every section it has finished.
- A finished section turns editable as soon as its text lands. Edit it and it locks (3.4), so a later review pass never writes over you.
- The section being written can't be edited. Clicking it shows "Writing this now. You can edit it when it's done."
- Review and check edits only touch unlocked sections. When a pass reaches a section you're typing in, it skips that section and lists it under Review notes.
- Your edits save the way they do today (`saveDoc`, 1.2 s after you stop typing).
- This is the same "who owns what" rule the live editing in `docs/content-v3-backend.md` (5.3) needs, so the two fit together when that ships.

### 3.6 The finish card

When the draft is done, the stage bar turns green and a card sits on top of the article:

- **Numbers:** words, sections, images, sources, claims backed.
- **House rules:** how many lines pass the lint (the goal is all of them) and how many are left for you.
- **Review notes:** the facts the writer couldn't confirm, the lines it couldn't fix and the screenshots that need a person. Each one jumps to its place.
- **Buttons:** **Publish** (opens the existing `PublishPanel`), **Open full editor** (`/drafts/<id>`), and **Write next** when this was part of a bulk run.

### 3.7 The dock

- Closing the sidebar while a draft runs leaves a pill at the bottom right: "Writing *best crm...* · 4 of 9". More than one draft shows as "3 drafts writing".
- Click to open the list, then click one to open its sidebar.
- When a draft finishes while the sidebar is closed, the pill turns green for 10 seconds with "Ready: best crm for startups". An in-app notice is saved too, so you see it later if you left.
- The dock is mounted once in `App.tsx`, so it follows you to every screen.

---

## 4. Making the writer an agent

Today the draft is a fixed chain: one call per section, then the passes. That chain is why drafts are reliable, so it stays as the spine. What changes is that each section call becomes a short agent turn with tools, so the writer can go and get what it needs.

### 4.1 The spine stays

```
research → outline → for each section: [agent turn] → lint → review → fix → check → proofread → images → modules → save
```

Every step still saves before the next, still resumes after a kill, still pays once. The steps that code checks today (lint, `keepsFacts`, the claim check, the title count) keep their checks.

### 4.2 Tools inside a section

A section turn is Claude Sonnet with these tools. It may call up to 4 tools before it writes, then it writes the section as streamed text.

| Tool | Does | Built on | Limit |
|---|---|---|---|
| `find_fact` | Searches the research's stored page text for a fact, returns matches with their quotes | `article_pages` text, plain search in code | free, 6 a section |
| `read_page` | Reads one page the research didn't read (the example's pricing page, a study) | The Chromium reader on the worker (`/api/research/render-next`), or a cache hit | 2 a section, 8 a draft |
| `search_web` | Web search for a fact or a number | Claude's web search tool | 1 a section, 5 a draft |
| `site_pages` | The brand's own pages on a topic, for internal links | The sitemap, as today | free |
| `ask_user` | One question with 2 to 4 answers (3.4) | The steer table | 3 a draft |
| `note` | A short line for the feed ("Using the 2026 pricing page") | The event log | 2 a section |

- A fact from `read_page` or `search_web` joins the research's sources, so the claim check and the quote check (`docs/content-v3-backend.md` 3.3) cover it like any other.
- When `read_page` needs the worker, the turn saves and waits the same way the research agent does: `retry` in 15 seconds, the page comes back as the tool result.
- The tool list, the brand, the house rules, the outline and the research are one cached prefix, so tools add little on top of today's cost.
- **Stops:** 4 tool calls, or 60 seconds of tools, then the writer must write. A section never waits on a tool forever.

### 4.3 Steers in the prompt

Before each section turn, the job reads open steers (`writer_steers`, section 6):

- Whole-piece notes join the cached prefix as "Notes from the editor". The cache breaks once per new note, then holds again.
- Section notes join that section's turn only.
- Each steer gets `used_at` when a call has read it, and the feed line "Got it" comes from that.

### 4.4 Thinking out loud, safely

- The feed lines come from typed events written by code: tool calls, step changes, counts. The `note` tool lets the writer add a short line in its own words, at most 120 characters, checked for dashes and banned words by the house rules lint before it shows.
- We don't stream Claude's thinking. It's long, it's unformatted and it can repeat the prompt.

---

## 5. How the stream works

### 5.1 Where the text comes from

- Section calls move from `askJson` to `client.messages.stream` with plain text out in a small Markdown subset (H2, H3, paragraphs, lists, tables, links, bold). A new `streamSection` in `src/lib/claude.ts` gives back deltas as they arrive and the full text at the end.
- The full text is parsed into ProseMirror JSON with the converter we already have (`docHtml.ts`, via `Markdown`), then saved to `writer_drafts.sections[n]` as today. JSON output stays for the outline, review findings, checks and image specs, which are short and need their shape.
- The review fix calls stream too, so a rewritten line types itself in.
- Tool calls inside a section turn don't stream. Their events show as feed lines.

### 5.2 The event log

Every step writes events to one table, `writer_events` (section 6). An event has a sequence number per draft, a kind and a small payload.

| Kind | Payload |
|---|---|
| `stage` | stage name, step, `n` of `total` |
| `feed` | the line, an icon, an optional link (URL or section and offset) |
| `outline` | the outline part that just landed (H1, an H2, the meta) |
| `text` | section index, the text added since the last `text` event |
| `section_done` | section index, its final ProseMirror JSON |
| `fix` | section index, line id, old text, new text |
| `claim` | section index, the claim's text, backed or cut, the source URL |
| `image` | image number, status, URL when done |
| `question` | question id, the question, the answers |
| `finish` | the finish card's numbers |
| `error` | one line for the person, and whether it will retry |

- **Text is batched:** deltas are joined in memory and written as one `text` event every 250 ms, or every 200 characters, whichever comes first. A 3,000-word draft writes about 400 text events.
- **The snapshot never depends on the log.** `writer_drafts` stays the source of truth. A viewer who opens late gets the snapshot (sections done so far) plus the events after it, so the log can be trimmed without losing anything.
- **Trimmed after:** a finished draft's `text` events are deleted after 24 hours. Feed lines are kept 90 days, so the Activity tab still works on old drafts.

### 5.3 Getting events to the browser

- **Route:** `GET /api/writer/live?draft=<id>&after=<seq>` returns NDJSON, the same shape as Ask Arrowsterr's stream. The browser reads it with the `postLines` helper we already have (`src/components/research/shared.tsx:170`), changed to read a GET.
- **Fast path:** the draft job runs inside the web process (`/api/worker`). Each event is also put on an in-process event bus (a small `EventEmitter` keyed by draft id in `src/lib/liveBus.ts`). The live route listens to the bus, so tokens reach the browser within about 100 ms.
- **Safe path:** the route also reads `writer_events` after `after` every 700 ms. That covers a second web process, a restart, or a job running somewhere else. Events are sent in order by sequence number, and the browser drops any number it has already seen, so the two paths never show a line twice.
- **Reconnect:** the route closes itself after 4 minutes (under the proxy's limits) and the browser opens it again with the last `seq`. A dropped connection does the same after 1, 2, then 5 seconds.
- **Auth:** the route checks the person can read the draft's workspace (`has_role(viewer)`), the same as the Drafts list.
- **Fallback:** if streaming fails twice in a row, the sidebar falls back to `usePoll` every 2 seconds on the same route with `after`, so the screen keeps moving.
- **No new services.** No Supabase realtime, no websockets, nothing new on the VPS.

### 5.4 Steers and controls going in

- `POST /api/writer/live` with `{draft, action}`: `steer` (text), `answer` (question id, answer), `pause`, `resume`, `stop`, `rewrite` (section, note), `lock` and `unlock` (section).
- Each writes a row to `writer_steers` or a field on `writer_drafts`. The job reads them between calls.
- **Pause and Stop during a stream:** the job checks `writer_drafts.control` every 2 seconds while a stream runs. On pause or stop, it ends the stream with the `AbortController`, keeps the text up to the last full sentence and saves. The part already paid for is never asked for again.

### 5.5 The job turn

- The 90-second turn budget stays. A section that's still streaming at 90 seconds finishes (a section takes about 20 to 40 seconds), then the turn ends.
- The draft job keeps its lease and its `kind:id:version` key. Nothing about retries changes.
- While someone watches, the draft is requeued 1 second after each turn, as today. While nobody watches, it's the same: watching never slows or speeds the draft.

---

## 6. Data

One migration, `084_live_writer.sql`, safe to run twice.

| Table or change | Columns |
|---|---|
| `writer_events` | id bigserial, draft_id, workspace_id, seq int, kind text, payload jsonb, created_at. Unique on (draft_id, seq). Index on (draft_id, seq). Viewers of the workspace may read. Only the server writes |
| `writer_steers` | id, draft_id, workspace_id, kind (`note`, `section_note`, `quick_ask`, `answer`), section int, text, question_id, created_by, created_at, used_at, result. Editors may add |
| `writer_questions` | id, draft_id, workspace_id, question, answers jsonb, answer, asked_at, answered_at, answered_by |
| `writer_drafts` adds | `control` (`run`, `pause`, `stop`), `locked` int[] (section numbers), `seq` int (last event), `tools_used` jsonb (counts against the limits in 4.2) |

- `seq` comes from `writer_drafts.seq`, bumped in the same update that saves the step, so two turns can never write the same number.
- The daily job trims `text` events of drafts finished over 24 hours ago.

---

## 7. Screens and code

| Change | Where |
|---|---|
| `LiveWriter` sidebar: header, stage bar, feed, live article, steer box, finish card | new `src/components/writer/LiveWriter.tsx` |
| `LiveDock` pill and list | new `src/components/writer/LiveDock.tsx`, mounted once in `App.tsx` |
| `useLive(draftId)`: reads the stream, keeps the snapshot plus events, reconnects | new `src/components/writer/useLive.ts` |
| Live article view: Tiptap read-only with a streaming cursor, fix strike-and-type, claim flashes, image shimmer | new `src/components/writer/LiveArticle.tsx`, using the nodes in `writerNodes.ts` |
| Write draft opens the sidebar | `WriteButton.tsx` (`useWriteActions.act`) |
| One label map for every screen | `src/lib/writeFlow.ts`. `DraftProgress` and the `STEP` map in `ContentGrid.tsx:34` read from it. Style and images get their own labels |
| `getDraft` selects `styled` and `images` | `src/lib/writerLibrary.ts:86` |
| Stream helper | `streamSection` in `src/lib/claude.ts` |
| Event bus | new `src/lib/liveBus.ts` |
| Event writer: batching, `seq`, the bus | new `src/lib/writerEvents.ts` |
| Section agent turn with tools | `runDraft` in `src/lib/writerBrief.ts` (the section loop at l.476) |
| Steers and controls read between calls | `runDraft`, `drive` |
| Live route | new `src/app/api/writer/live/route.ts` |
| Quick asks reach the agent tasks again | `/api/writer/agent` gets its first real caller |
| Remove the dead Writer screen | delete `src/components/research/Writer.tsx` once `brandTables` and `draftText` move to `src/lib/writer.ts` |

**After the draft:** the full editor (`/drafts/<id>`) gets the same steer box as a side rail, so "add a pricing table" and "rewrite this paragraph" keep working once the draft is done. It runs the agent tasks on the open doc and streams the result in where the cursor is.

---

## 8. Plan limits

Nothing about the draft count changes: Write draft counts as one of the month's drafts (`draftsPerBrand`), as today.

| | Trial | Pro | Agency | Enterprise |
|---|---|---|---|---|
| Live Writer | Yes | Yes | Yes | Yes |
| Drafts writing at once per workspace | 1 | 3 | 6 | 10 |
| Web searches by the writer, per draft | 2 | 5 | 5 | 5 |
| Steer rewrites of a section, per draft | 2 | 10 | 10 | 10 |
| Quick asks after the draft | as today (`TASK_COST.agent` and friends) | same | same | same |

A draft over the "at once" limit waits in line and says "Starts when one of your 3 drafts finishes".

---

## 9. Reliability

Watching must never make a draft worse or slower. These are part of each phase's definition of done.

1. **The stream is a view.** If the live route dies, the draft keeps writing. If the browser closes, the draft keeps writing. Every number on the finish card comes from `writer_drafts`, never from the events.
2. **No line twice, no line lost.** Events carry a sequence number per draft. The browser keeps the last one and ignores anything at or below it. A reconnect asks for everything after it.
3. **A killed job shows no ghost text.** Text that streamed but wasn't saved (the job died mid-section) is cleared on the screen when the next `section_done` for that section arrives, or when the stage moves on. The section is written again once and paid once more, as today.
4. **Pause and stop are honored within 2 seconds,** and never cut a sentence in half.
5. **A steer is read once.** `used_at` is set in the same update that saves the call's result.
6. **Your edits win.** A locked section is never changed by a pass. A test runs the full review on a draft with two locked sections and checks they come out byte for byte the same.
7. **Tools can't stall a section.** Every tool has a time limit. A `read_page` the worker can't serve in 60 seconds returns "couldn't read" and the writer moves on.
8. **No new facts without sources.** A fact from `search_web` needs its quote on a page we read, the same check as research. Otherwise it's dropped before the section is saved.
9. **Fixes keep facts.** `keepsFacts` stays: a fix that adds, drops or changes a number or a link is thrown away.
10. **Double clicks make one draft.** The existing guards stay (unique `item_id`, the take function, the job key).

**Tests** (`tests/liveWriter.test.ts`):

- The event writer batches 1,000 deltas into the right number of `text` events, in order, with no gaps in `seq`.
- Two live routes on one draft (bus and table) deliver each event once.
- A reconnect with `after=120` gets exactly 121 onward.
- A job killed mid-stream, restarted: the screen ends with the same text as a clean run, and the cost ledger shows the section once more and nothing else.
- Pause during a stream stops within 2 seconds at a sentence end, and Resume finishes with no repeated sentence.
- A steer sent during section 3 shows in section 4's prompt and nowhere before.
- A locked section survives lint, review, fix and check unchanged.
- `ask_user` with no answer for 10 minutes ends with the fact in Review notes and the draft done.
- `writeState` and the label map give the same words in the Calendar, the Drafts grid, the Deep Dive and the sidebar for every step, including style and images.

---

## 10. Analytics

Events to PostHog (`src/lib/analytics.ts`), so we learn if people really watch:

- `live_open` (from where), `live_close` (stage at close), `live_reopen` (from the dock)
- `live_steer` (kind), `live_question_answered`, `live_pause`, `live_stop`, `live_lock`
- `live_finish_publish` (seconds from finish to Publish)

**What good looks like after 4 weeks:** more drafts published within a day of finishing (today's number from `ready_at` to the first publish, check), and fewer drafts reopened for a full rewrite.

---

## 11. Phases

| Phase | Weeks | What ships | Done when |
|---|---|---|---|
| 1. Fix the labels | 0.5 | One label map; `DraftProgress` and `ContentGrid` read it; `getDraft` selects style and images | Every screen shows the same step words for every step |
| 2. Stream and sidebar | 2 | `writer_events`, the event writer, the bus, the live route, `streamSection`, the sidebar with feed and live article, the dock | A draft streams word by word into the sidebar, survives closing and reopening, and survives a worker restart with no repeated text |
| 3. Watch the passes | 1 | `fix`, `claim` and `image` events with their animations; the finish card | You can watch a line get fixed and a claim get backed, and every image fades in |
| 4. Steer | 1.5 | `writer_steers`, `writer_questions`, Pause, Stop, Rewrite, Lock, quick asks, editing done sections | A note sent during section 3 changes section 4. A locked section survives every pass |
| 5. Agent turns | 1 | Tools in the section turn, the limits, the `note` tool | A listicle section looks up a price it didn't have and cites it, and the claim check backs it |
| 6. After the draft | 0.5 | The steer rail in the full editor; delete `Writer.tsx` | "Add a pricing table" works on a finished draft |

About 6.5 weeks, with phase 1 shippable on day 3.

---

## 12. Running cost

Assumptions: 500 drafts a month at Beta and 5,000 at Growth (from `docs/agentic-writing.md`); Claude Sonnet 5.5 at $2 in and $10 out per million tokens (check); web search at $10 per 1,000 (check).

| Line | Per draft | Beta (500 drafts) | Growth (5,000 drafts) |
|---|---|---|---|
| Streaming instead of one call | same tokens | $0 | $0 |
| Section tool turns: about 9 sections, 1 to 2 tool calls each, mostly cached prefix | ~$0.04 | ~$20 | ~$200 |
| Web searches by the writer: about 2 per draft | ~$0.02 | ~$10 | ~$100 |
| Extra pages read on the worker | $0 | $0 | $0 |
| Steers and rewrites: about 1 section rewrite per draft | ~$0.03 | ~$15 | ~$150 |
| Event rows: about 500 per draft, `text` rows trimmed after a day | ~$0 | $0 (VPS disk) | $0 (VPS disk) |
| Open live connections: about 20 at once at Beta, 200 at Growth, on the web process | $0 | $0 | ~$0 (check memory at Growth) |
| **Added a month** | **~$0.09** | **~$45** | **~$450** |

The draft itself stays about $0.82 (from `docs/agentic-writing.md`), so a draft costs about $0.91 with the Live Writer.

---

## Sources

- [Liveblocks: building an AI copilot inside a Tiptap editor](https://liveblocks.io/blog/building-an-ai-copilot-inside-your-tiptap-text-editor)
- [Delight Chat: watch AI drafted replies appear as they're written](https://www.delightchat.io/changelog/watch-ai-drafted-replies-appear-as-they-re-written)
- [Collaborative document editing with multiple users and AI agents (arXiv)](https://arxiv.org/html/2509.11826v1)
- [Anthropic web search tool pricing](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool) (check)
