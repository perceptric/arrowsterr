# Draft and Write: build plan

How we build what the Live Writer demo shows, step by step, on top of the writer we already run. `docs/draft-and-write-plan.md` says what the product does. This file says how we get there, in what order, and how we prove each step works. Written November 2026.

Demo: https://claude.ai/artifact/BhD5pSWsuQbcfJbHAUGWKw

---

## 1. Where we start

Most of the engine exists. The work is a new outline with cards, a visual planner, two interactive templates, a live view and stricter passes.

| Piece | Today | Change |
|---|---|---|
| Research | `article_research` reads Google's top 10, AI-cited pages and example pages (`articleResearch.ts`) | Add frozen **fact notes**: one fact per note with its exact quote |
| Outline | `writer_brief` job writes `WriterBrief`: H2s with points, images, modules, examples, checks (`writerBrief.ts`) | Add brief lines, shape and a **card for each section** |
| Review step | Generate goes straight to the draft (`chainDraft`) | Stop at the outline. **Write** starts the draft |
| Images | Worker renders `featured`, `screenshot`, `chart`, `steps`, `comparison`, `checklist`, `anatomy` from specs (`imageTemplates.ts`, `writerImages.ts`) | Kinds picked by rules from the cards. Built when Write starts, beside the text |
| Interactive | Claude writes free HTML modules from 13 kinds, checked and run in a sandbox (`writerModules.ts`, `moduleCatalog.ts`) | New articles use two fixed templates filled from a spec: **picker** and **calculator** |
| Passes | Lint, style review, style fix, claim check (cut only), title count (`writerStyle.ts`, `houseRules.ts`) | Claim ledger, ported house lint, voice check, fact audit, copyedit, proof with Ship or Hold |
| Progress | `DraftProgress` list of steps, polled | Live view: sections appear in the editor as they land, visuals fill in |
| Publish | Publish panel for every CMS, modules publish through the `data-aw-module` contract (`wpModules.ts`) | Publish stays off on Hold or an open Detail needed |

---

## 2. Data

One migration, `supabase/084_draft_write.sql`. The brief is already JSON, so most new fields live inside it.

**On the brief (`writer_briefs.brief` JSON):**

```ts
type FactNote = { id: string; source: number; quote: string; fact: string; numbers: string[] };

type Shape = { usual: string; others: string[]; picked: string; why: string };

type VisualPlan = {
  kind: "flowchart" | "chart" | "table" | "picker" | "calculator" | "screenshot" | "anatomy";
  rule: string;   // which rule fired, e.g. "steps>=3"
  why: string;    // the line shown on the card
  spec?: unknown; // filled when Write starts
  on: boolean;    // the person can turn it off
};

type SectionCard = {
  key: string;
  h2: string;
  job: string;
  points: string[];
  facts: string[];          // FactNote ids
  visual: VisualPlan | null;
  words: number;
  links: { url: string; anchor: string }[];
  keyword?: string;         // where the keyword goes, if here
  gaps: string[];           // Detail needed
};

// WriterBrief gains:
notes?: FactNote[]; job?: string; pov?: string; shape?: Shape; leadingWord?: string; cards?: SectionCard[];
```

Older briefs have no cards. `cardsFrom(brief)` builds plain cards from `outline`, `images` and `modules`, so old drafts open and rewrite as before.

**New columns on `writer_drafts`:** `ledger jsonb`, `voice jsonb`, `copyedit jsonb`, `proof jsonb` (with `verdict` Ship or Hold and the reasons), `visuals jsonb` (spec and status for each planned visual).

---

## 3. Build order

Seven phases, about 8 weeks for one engineer. Each phase ships on its own and leaves the writer working.

### Phase 0. Recorded topics (0.5 week)

Every later step is tested offline on real research.

1. `scripts/writer-record.mjs` records the research for 20 keywords across 5 kinds of site (SaaS, store, agency, local, publisher) into `tests/fixtures/writer/<slug>.json.gz`. The topics and their made-up brands are in `tests/fixtures/writer/topics.mjs`. It runs the app's own research steps: Google's top 10 with People Also Ask and the AI Overview, ChatGPT, Gemini and AI Mode asked the keyword as a question, and every page read in Chromium with the worker's own reader (a test keeps the two copies the same). About $0.02 a topic (check).
2. `tests/writerFixtures.ts` turns a recorded topic into the same research pack and brand the writer gets in the app (`toPack` in `writerBrief.ts`, now shared with `loadResearch`).
3. `src/lib/writerScore.ts` measures each article: words, house rule findings left, money, percent and large numbers the research doesn't have, links that are neither sources nor the brand's pages, images planned and modules built.
4. `scripts/writer-baseline.mjs` runs today's writer (`runBrief`, `runDraft`, same prompts, schemas and limits as `writerServer.ts`) on the 20 topics and saves each article with its score in `tests/fixtures/writer/baseline/`, plus `summary.json`. It needs `ANTHROPIC_API_KEY`, about $16 for all 20 (check). `--fake` checks the wiring for free.

To run the baseline on the VPS with the web app's key, without the key leaving the server: create a one-off Docker project with Hostinger's API (`POST /api/vps/v1/virtual-machines/2139771/docker`) whose service uses `node:22-bookworm-slim`, reads `env_file: /docker/arrowsterr-web/.env`, downloads the branch from `codeload.github.com` at a pinned commit and runs `sh scripts/writer-baseline-run.sh` (set `BASELINE_TOPICS` to run some topics). The results come back in the logs as `RESULT` lines (gzip and base64). Take the project down when it finishes.

Found while running the baseline: Sonnet 5.5 thinks on its own, and on a brief it spent all 12,000 reply tokens thinking and returned no text. Every JSON call now turns thinking off (`claudeRequest.ts`). Sonnet 5.5 takes that as `"between_tools"` and refuses `"disabled"`, and the API's error names the right one, so `claude.ts` learns it per model. A reply that runs out of tokens with no text now fails with that reason, so the job retries.

Found while recording: Google now sends most results as `google.com/goto` links that land on `www.google.com/goto` first, and the app followed only one step. Most top-10 pages fell back to Google's breadcrumb, and a breadcrumb cut short with "..." became a broken address. `fixSerpItems` now follows up to 3 steps and drops cut-off breadcrumb parts. That fixes article research, the rank tracker, keyword research and briefs.

**Done when** the 20 packs load in tests with no network and the baseline summary is saved. Done November 13, 2026.

**The baseline** (`tests/fixtures/writer/baseline/summary.json`, today's writer with the thinking fix, Claude Sonnet 5.5):

| Measure | Result | What it means for the plan |
|---|---|---|
| Articles finished | 20 of 20 | |
| Words | 2,398 on average | |
| House rule findings left | 4.6 per article: 59 sentence length, 26 feeling adverbs, 5 paragraph length, 1 dash | Phase 5 (house lint port and fixes) |
| Money, percent and large numbers with no match in the research | 3 of 248 | The fact notes (Phase 1) tie each number to a quote |
| Links outside the sources and the brand's pages | 0 | |
| Images planned | 3.4 per article | Phase 2 plans visuals by rule |
| Interactive modules | 11 built of 15 planned: 4 dropped (3 loaded an outside file, 1 had broken script) | Phase 3 moves to fixed templates |
| Time | about 4 minutes an article | |
| Claude cost | $20.18 for 20, about **$1.01 an article** (check) | Higher than the ~$0.82 in `docs/agentic-writing.md` |

The scorer checks that a number appears somewhere in the research, which is loose. Phase 1's fact notes make it strict (the number has to be in the quote its note cites).

### Phase 1. Generate draft (1.5 weeks)

1. **Fact notes** (`articleNotes.ts`). One Sonnet call reads the picked source pages and returns facts with quotes. Code keeps a note only when its quote appears word for word in that page's text (after spaces and quote marks are evened out) and every number in the fact appears in the quote. The rest are dropped. The notes are saved on the brief and frozen: the writer reads only these.
2. **Brief and shape.** `BRIEF_SCHEMA` gains job, point of view, leading word and shape (the usual structure, two others, the pick and why). Prompt follows perceptric-writer steps 2 and 3.
3. **Cards.** The outline call returns a card per section. `cleanCards` checks it in code:
   - every fact id is a real note;
   - links come from the sitemap or the sources;
   - words split the target from the top pages' median;
   - the keyword lands in the H1, one H2 and the intro card;
   - a point that needs a fact with no note becomes a **Detail needed** gap.
4. **Stop for review.** `chainDraft` stops at the outline. A workspace switch, "Write without review", keeps today's one-click path for bulk runs.
5. **Outline screen** (`src/components/writer/OutlineView.tsx`), opened from the Drafts row:
   - the brief lines at the top, then the H1, slug and meta;
   - one row per section: editable heading, visual chip (click to turn off), words and the info button;
   - the info button opens the card on the floating layer, readable on hover, focus or tap;
   - the card can be edited: points, remove a fact, change or drop the visual;
   - the primary button is **Write**.

**Done when** every card on the 20 topics has a job, points and only real fact ids, and no note's quote is missing from its page.

**Status, November 14, 2026:** shipped. On the 20 recorded topics (`scripts/writer-notes.mjs`):
- 20 of 20 pass: every card has a job, points and only real fact ids.
- 0 of 715 notes have a quote missing from their page. Code dropped 33 notes the model sent whose quote or numbers didn't match.
- 36 notes and 9 cards an article on average, every card citing at least one note, and about 8 Detail needed gaps an article.
- Two fixes came from the run. The intro card went first in the schema and the brief reply got 20,000 tokens, after 4 long replies were cut off before the intro. A card with no points takes its outline part's points (1 topic).
- The H1 or an H2 misses a long keyword on 11 topics (the check wants every word of the keyword). That rule isn't part of done-when and is left for Phase 5.
- The notes call and the brief call don't share the prompt cache yet (0 cache reads). Fixing that saves about $0.05 an article.

### Phase 2. Visual planner (1.5 weeks)

1. **Rules** (`visualPlan.ts`, pure). Each card is read for one visual at most:

   | Rule | Visual |
   |---|---|
   | 3 to 7 points that are ordered steps (verbs first, or numbered in the research) | Flowchart |
   | 3 or more facts with numbers in the same unit | Chart |
   | 3 or more items sharing 3 or more attributes | Table |
   | The section asks the reader to choose between the article's own picks | Picker |
   | A fact with a range or rate the reader can apply to their own number | Calculator |
   | A named product or page with a URL | Screenshot |
   | The parts of one thing | Anatomy |

   Limits: about one per 300 words, at most 2 interactive, none in the intro (the featured image goes there), none without a rule.
2. **Pick and spec.** One Sonnet call picks among the candidates code found and fills a small spec for each. A visual the rules didn't propose is dropped.
3. **Spec checks** (`visualSpecs.ts`):
   - flowchart: 3 to 7 steps, short labels;
   - chart: every value points to a note and appears in its quote; the source line goes under the chart;
   - table: same columns on every row;
   - picker: every answer is one of the article's picks;
   - calculator: the formula is one of a fixed set (divide a range, multiply, percent) and its numbers come from one note.

   A failed spec is fixed once, then becomes a note in the draft.
4. **Templates.** Flowchart extends the `steps` template with arrows and a row or column layout. Chart extends `chart` with a line option. Table uses the `comparison` template plus a real table block for search engines.
5. **Built beside the text.** Specs need only the cards and notes, so image tasks are queued the moment Write is clicked and render on the worker while sections are written.

**Done when** on the 20 topics every planned visual has a rule and a reason, and no chart value lacks a note.

### Phase 3. Interactive templates (1 week)

1. `interactiveTemplates.ts`: picker and calculator built from the spec into one self-contained HTML block in the Brand Kit's colors and fonts. Each passes `validateModule` and publishes through the existing `data-aw-module` contract, so every CMS path works as today.
2. Keyboard and screen reader friendly. Each carries a plain text version (the answer table, the formula) for readers and crawlers without scripts.
3. Test on WordPress, Webflow, Framer, Shopify and HubSpot test sites. Webflow's embed size limit (check) sets the template's size budget.
4. Free HTML modules stay for older briefs. New briefs plan only template kinds.

**Done when** both templates work on all five test sites and pass the module checks.

**Status, November 14, 2026:** built (`src/lib/interactiveTemplates.ts`), ahead of Phase 2. Until the visual planner ships, the spec comes from the brief's planned module: briefs with fact notes plan only a picker or a calculator, and the draft asks Claude for that one spec (one retry with the reason), not for HTML.
- **Calculator:** multiply, divide or percent, and both numbers must be in one fact note's quote. 5 of 5 planned on the recorded topics were built (4 on the first try).
- **Picker:** every option is a featured pick or named in one of the article's headings (so "Kanban vs Scrum" works), and every answer points to one. 9 of 12 were built after the heading fix (0 of 13 before it). The checks now also drop a pick no answer reaches and keep a question's first 4 answers, which would have saved 2 of the 3 refused. The third named an option the article never offers, and that refusal is correct.
- **Plain version:** the formula with a worked example, or the list of picks with who each fits and the answers that lead to it. It sits inside the block and as article text right after it.
- **Size and height:** each block is under 6 KB (under 9 KB budget, so it fits Webflow's embed limit, check). Each carries its height on a 320px phone (`data-aw-h`), which publishing turns into the frame height for Webflow, Shopify, HubSpot and Framer, so nothing is cut off. WordPress's plugin resizes the frame itself.
- **Checked in a browser** through the same publish path at 320, 390 and 900px wide: typing, the slider, arrow keys, Space on answers and the All picks table all work, with no errors and no sideways scroll.
- **Still open:** the test on live WordPress, Webflow, Framer, Shopify and HubSpot test sites. None are set up yet.

### Phase 4. Write, live (1 week)

1. **Write** approves the outline and starts the draft in one click, with today's guard against double clicks and double charges.
2. **Live view** in the editor (`LiveDraft.tsx`). While the draft is generating, it asks `/api/writer/draft-live` every 1.5 seconds for the step, the sections written and each visual's status. New sections appear with a typing reveal in the browser. Each visual shows "Building the chart" until its image or module is ready. Text lands one section at a time, since each section is one call.
3. **Steps bar** from `draft.step`: Sections, Visuals, Claim check, AI-tell review, Fact audit, Proof. It replaces `DraftProgress`.
4. When the job ends, the editor opens for editing and the Ready card shows.

**Done when** a draft can be watched from Write to Ready with no page reload, and a reload halfway shows the same state.

### Phase 5. Write passes (1.5 weeks)

New order in `runDraft`, each step saved before the next:

1. Sections (as today, from cards and notes only).
2. **Claim ledger.** The check returns each claim as supported, unsupported or uncertain, with its note id and a fix: remove, qualify or cite. Code applies the fix and checks the ledger the way `validate_claim_ledger.py` does.
3. **House lint.** Port the checks in `perceptric-writer/scripts/lint.py` that `houseRules.ts` lacks, tested on the same cases.
4. **AI-tell review and fix** (as today, with the anti-ai-writing strict review added to the method text).
5. **Voice check.** One call names lines that could sit on any other blog and sections with no named thing. Fixed through the same fix path.
6. **Copyedit.** One call at the medium level returns line edits.
7. **Fact audit** (`factAudit.ts`). A port of `post_edit_audit.py`: numbers, dates, amounts, quotes, names, links, certainty words and word loss over 30%. It runs after steps 4, 5 and 6 and replaces `keepsFacts`. A BLOCK puts that section back.
8. **Proof.** Code checks: counts against items, dates against weekdays, percentages against their total, leftover markers, repeated paragraphs and open Detail needed. The verdict is Ship or Hold, with the reasons.
9. Wait for visuals, place them, save the doc.

**Done when** on the 20 topics no fact changes through the passes, the lint finds no FAIL and each proof verdict matches a hand check.

**Status, November 13, 2026** (shipped as Phase 2 of `docs/zippie-skills-plan.md`): steps 3, 4, 5, 6, 7 and 8 are in, with the voice check and the copyedit as one polish call. On the 20 topics: 0 facts changed, the proof gave 15 Ship and 5 Hold and all 5 Holds were real problems on a hand check, and the lint still finds 3.4 an article (mostly sentence length), so the lint goal is open. The claim ledger (step 2) is still today's cut-only check.

### Phase 6. Ready to publish and tracking (1 week)

1. Meta, schema (FAQ, and HowTo when there's a flowchart), alt text on every image, and the card's internal links in place.
2. **The gate** sits in the server's publish route, so the button, scheduling, bulk publish and the API all obey it. Hold or an open Detail needed keeps Publish off and lists what's left, each item a link to its line.

3. **Track rank in Traffic.** When the CMS reports the post live, its main keyword (and up to 2 secondary ones) joins the brand's Traffic project for that domain, tagged `Published`. A brand with no project for the domain gets one named "Published posts". The post's row in Drafts and the Calendar then shows its rank, read from `rank_checks` where the URL found is the post's URL.
4. **Track in AI answers.** The article's main question (the top People Also Ask question, or the H1 asked as a question) joins the brand's Prompts, with the cluster's name as its topic. The post's row shows whether AI answers cite it, read from the prompt's runs.
5. Both are switches on the Ready card, on by default (`autoTrack` in Settings > Brand). Both are safe to repeat: a second publish adds nothing (`unique (project_id, keyword)` for Traffic, same words for Prompts). When a plan's tracked keyword or prompt limit is full, that step is skipped with one line on the Ready card and a link to the page, and the post still publishes. Nothing already tracked is removed.
6. Content Opportunities marks the cluster's page as covered once the post is live.

**Done when** no path can publish a Hold draft, including a scheduled one, and publishing a post twice adds its keyword and its question once each.

---

## 4. Tests that prove it on flaky cases

- A quote that differs from its page by one word is dropped, and the point becomes Detail needed.
- A page read as blank or blocked gives no notes and the brief still finishes.
- A card with a fact id that isn't a note fails `cleanCards`.
- A chart value with no note drops the chart to a note in the draft.
- A picker answer that isn't one of the article's picks fails its spec.
- A job killed during the visuals restarts with no second image and no second charge.
- Two quick clicks on Write make one draft.
- A copyedit that changes "500 to 800 km" to "about 600 km" is put back by the fact audit.
- A rewrite that drops "likely" from a claim is put back.
- A scheduled publish of a Hold draft is refused.
- A reload in the middle of Write shows the same sections and visuals.
- Publishing the same post twice adds its keyword to Traffic once and its question to Prompts once.
- A full tracked keyword limit skips the Traffic step, and the post still publishes.

---

## 5. What could go wrong

| Risk | What we do |
|---|---|
| Pages built with scripts or PDFs give text that won't match quotes | Fact dropped, Detail needed shows where to look |
| The worker is slow on images | The 10-minute wait (`WAIT_MS`) ends it: the draft finishes with notes |
| A CMS strips scripts from posts | The template's plain text version still shows |
| Claude plans more visuals than the limits | Code cuts by rule strength |
| Old briefs and drafts | `cardsFrom` and the old module path keep them working |

---

## 6. How this fits with Drafts v4

`docs/drafts-v4-plan.md` phase 2 (pins and the brief) becomes Phase 1 here. Its other phases (Drafts list, editor scores, Improve, publish rules) stay and come after Phase 6, using the live view's editor.

---

## 7. Running cost

Claude Sonnet 5.5 at $2 in and $10 out per million tokens (check). 10 articles a team a month: 500 at Beta, 5,000 at Growth.

| Line | Tokens per article | Each |
|---|---|---|
| Fact notes, brief, shape and cards (measured on 20 topics: both calls ~$0.30, less today's brief ~$0.13, check) | 8K in, 45K cache write, 17K out | ~$0.17 |
| Visual pick and specs | 8K in, 3K out | ~$0.05 |
| Claim ledger (more than today's check) | +2K in, +1.5K out | ~$0.02 |
| Voice check | 10K in, 2K out | ~$0.04 |
| Copyedit | 10K in, 2K out | ~$0.04 |
| Picker and calculator spec (replaces a free HTML module build, ~6K out, check) | 3K in, 1K out a module | about -$0.03 an article |
| House lint, fact audit, proof, rules | code | $0 |
| Live view polling, templates | the VPS we have | $0 |
| **Added per article** | | **~$0.29** |

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Added a month | **~$145** | **~$1,450** |
| Of that, Phase 1 (shipped) | ~$85 | ~$850 |
| Of that, Phase 3 (shipped, check) | about -$15 | about -$150 |
| Writer total with today's measured ~$1.01 an article (Phase 0 baseline) | ~$650 | ~$6,500 |

This replaces the ~$95 and ~$950 in the plan, which left out the fact notes call.

**Tracking published posts** adds one keyword and one prompt per article. Each counts against the plan's own limits, which the plan prices already cover at full use (`docs/traffic-rank-tracker.md`, `docs/pricing-v5.md`). The new spend is on teams below their limits, and it grows each month as posts add up:

| Line | Each a month | Beta, first month (500 posts) | Growth, first month (5,000 posts) |
|---|---|---|---|
| Rank checks | ~$0.07 a keyword (check) | ~$35 | ~$350 |
| AI answer checks, 6 engines daily | ~$0.36 a prompt (check) | ~$180 | ~$1,800 |
| **Added in the first month** | | **~$215** | **~$2,150** |

Each later month adds about the same again until teams reach their limits, where it stops.

---

## 8. Demo to product

| In the demo | Ships in |
|---|---|
| Generate draft with Research, Brief, Shape, Outline, Visuals | Phase 1 and 2 |
| Brief lines above the outline | Phase 1 |
| Info button with the section card, Detail needed | Phase 1 |
| Visual chips you can turn off | Phase 2 |
| Write that fills the article live | Phase 4 |
| Featured image, flowchart, table, chart | Phase 2 |
| Shoe finder and calculator | Phase 3 |
| Claim check, AI-tell review, fact audit, proof | Phase 5 |
| Ready to publish, Publish and Send to review | Phase 6 |
| Rank in Traffic and AI answers for each live post | Phase 6 |
