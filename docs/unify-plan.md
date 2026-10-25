# Peak UI and UX (plan, v2)

Every screen answers its one question with its biggest block, shows the proof next to each number, puts its main
job one click away, and behaves the same way everywhere. Planned with the skills in `.claude/skills/`: taste-skill's
app-screen rules (`references/app-screens.md`, built from 23 studied product screens), UI/UX Pro Max (navigation,
tables, states, accessibility), and a review of every screen's code on 25 Oct.

**The CSS stays exactly as it is.** No new CSS, no new tokens, no colour changes. Every change is in the JSX: which
existing classes are used (`aw-stats`, `aw-stat__delta--up/--down/--flat`, `aw-td-num`, `aw-status`, `aw-skel`,
`tw-snack`, `tw-modal`, `tw-side-panel`, `aw-toggle`, `Seg`, `Sheet`, `ToolIntro`, `Empty`), the order of blocks,
the words, the data shown and how things behave.

| Part | Work | Time |
|---|---|---|
| 1 | Eight fixes that change every screen | 4 days |
| 2 | Screen by screen | 6 days |
| 3 | The writing flow: 8 clicks to 4 | 2 days |
| 4 | How it feels: undo, instant changes, keyboard, back keeps your place | 3 days |
| 5 | Addresses for every tab, Settings regrouped, dead screens removed | 1.5 days |
| 6 | Checks: screenshots scored before and after, accessibility scan, rule tests | 1.5 days |

About 3.5 weeks. Running cost: $0 added at Beta (50 teams) and at Growth (500 teams). No new service, no AI calls,
no new fonts; page timings go to PostHog inside its free tier.

---

## Part 1. Eight fixes that change every screen

1. **One title and one freshness stamp.**
   - The shell's breadcrumb stops being an h1 (`App.tsx:1338`), so each screen has one h1: its own title.
   - "Updates daily" becomes "Checked 2 h ago · next check daily", from the newest run (`App.tsx:1466`). The
     repeated "Last checked" column on Prompts goes.
   - "Download PDF" shows only where a PDF exists (today `window.print()` stands in on Reports).
2. **Every change says what it's measured against.** One `Delta` (`ui.tsx:44`) for the whole app:
   - the window in words once per strip ("vs prior 30 days");
   - colour means good or bad for you, never up or down: a rival's gain is grey, a better position is green;
   - no change is a grey "no change", and growth from nothing is "new", never a green "+100%".
   - It uses the existing `aw-stat__delta--up/--down/--flat` classes.
3. **The answer number leads.** On each screen the one figure that answers its question is the largest; the
   others step down to the existing 24px size. Prompts: Visibility. Keyword Research: Volume and KD, with the idea
   counts dropped from 32px brand blue to ink.
4. **Numbers line up.** Every numeric column gets `aw-td-num` (right-aligned tabular figures) and its header
   `text-right`. Today every table left-aligns its numbers.
5. **Marks only for exceptions.** A row carries one status mark at most, and only when it needs attention. Prompts
   loses six "#3" pills per row for plain numbers, with "Not named" when a model misses you and "–" when there's no
   data (today a miss and missing data look the same). Links show a tag only when revoked or expired; schedules only
   when paused.
6. **States that keep the screen.**
   - Loading shows the real layout with `aw-skel` bars at each value's size; the header and labels show at once.
     Today `Thinking` clears the screen in 38 places.
   - An error sits inside the block that failed, with what failed, when the data was last good, and Retry. Today
     errors are bare red text, and three of them tell people to run SQL files.
   - An empty section keeps its frame and header with one sentence and its first action. Today `Empty` replaces
     whole pages on Prompts, Competitors and Sources.
   - Zero prints as 0; missing prints as "–".
7. **One set of words.**

| Today | After |
|---|---|
| Content Plan, Editorial Calendar, calendar | Editorial Calendar |
| Brief, Generate brief, Generate Brief | Outline, Write outline |
| Generate Draft, View Draft | Write draft, Open draft |
| Sync to CMS, Sync, Publish | Publish (its panel already offers "Save as a draft") |
| Distill | Learn the voice |
| Delete, Remove, Stop tracking | Delete for anything people make; Remove for a person; Disconnect for a connection |
| Cancel, Close, Done, Apply | Cancel in dialogs, Close on panels, Save |
| Difficulty, KD | KD % |

8. **No pop-ups, no cost notes, no symbols for icons.**
   - The 21 `confirm()` and 6 `prompt()` calls and the one `<select>` move to the existing `Modal` and `Dropdown`.
   - "Cost $0.012" and "Free, saved results" go from the research screens; the saved date stays ("Saved Oct 3").
     The task bar in the sidebar already shows what's left.
   - Emoji (👑 👉 ✎ 🔗 🌐) and text symbols used as icons (→ ✓ ↗ ×) become the existing icon set.
   - The selection bar copied four times (Keyword Research, Domain Research, Competitive Analysis, Bulk) becomes one.

---

## Part 2. Screen by screen

Each screen's question, then what changes. File and line references are in the 25 Oct review.

**Prompts** · "Are AI answers naming us more or less, and on which prompts?"
- Visibility stays large; Sentiment and Position step down; the gauge ring goes (it repeats the number).
- A finding line under the title: "8 of 40 prompts aren't named by any model" or the biggest drop.
- The empty state keeps the table header with "Add topic" inside it.

**Competitors** · "Who does AI name instead of us, and where do they win?"
- A finding line under the title: "HubSpot is named in 41% of answers, you in 23%; it leads on 5 of 8 topics."
  Today the 600px quadrant fills the first screen and the answer sits below it.
- Rankings capped at 6 rows with "View all 14"; "new" instead of a green rise for rivals new this period.
- The rival panel: one mark ("Leads you · #2 of 14"), the window under its numbers, empty sources in words
  ("No sites cited in answers that name HubSpot."), Retry on the SEO error, a heading over the model breakdown.

**Sources** · "Which sites does AI cite, and are we among them?"
- The list moves above the site map, so its first rows show on the first screen.
- Group shares move into the tab labels ("Third-party 62% · 41"); the legend that repeats them goes.
- The total in the list header; the executive summary keeps its last result on error and shows "Made Oct 3".
- "Analyze SEO performance" stops being the primary button.

**Keyword Research** · "Is this keyword worth a page, and can we win it?"
- Top 10 on Google moves above Keyword ideas, so the proof shows on the first screen.
- "Write outline" in the keyword header (Part 3); after "Add to Editorial Calendar", a link to open it.
- Retry on the SERP error; the saved date on saved results.

**Domain Research** · "Where does this site get Google traffic, and which keywords should we chase?"
- "New · lost vs last month" with grey zeros; tab counts show the real total ("100 of 12.4K").
- The footnote says "by visits", which is how the table is sorted.

**Competitive Analysis** · "Which keywords does this rival win that we don't?"
- The Venn becomes a `Seg` in the table header ("Missing 1,234 · Weaker · Lead · Only"), so the table starts on
  the first screen.
- A first-run state ("Pick a rival above"); errors go to the error line, not the notice line.

**Keyword deep dive** · "What's the next step for this keyword?"
- Status shows once (the stepper); the top 5 results from Google show under the stats with "Read Oct 3"; a
  Saved stamp after each edit.

**Editorial Calendar** · "What do we publish next, and what's stuck?"
- Rows get secondary "Write outline" buttons; the screen keeps one primary.
- Search and counts on ("32 pieces · 6 unscheduled"); Auto-schedule shows only when something is unscheduled.
- Columns: Keyword, Volume, KD %, Status, Due, then the rest.

**Library** · "Which articles need writing or review next?"
- One status per row, with a tag only on Failed; filter counts ("Drafts 4"); the A, B, C column letters go.
- The first screen gets an "Open Editorial Calendar" button.

**Draft, Doc and Outline editors** · "Finish and publish this article."
- The title becomes the h1; one "Publish"; the outline comes first in the outline editor.
- Removing a section can be undone; each outline item shows its sources as [1] [2].

**Brand** · "What will the writer use, and is it complete?"
- Each section in the side list shows its state ("Not set", "Saved Oct 3").
- The learned voice comes first, with the sample pages folded under "Sources"; Brand Kit's tone links to Tone
  of voice instead of repeating it; a Saved stamp after saving.

**Reports** · "Which reports are ready or sent, and to whom?"
- Schedules show "Next Nov 3 · last sent Oct 27"; links show last viewed under Views; Downloads show the total.
- Schedule rows keep History and Edit; Pause and Delete move into the edit dialog.

**Zippie** · "What should Zippie do next, and what's waiting for me?"
- A content starter ("Write an outline for my next Editorial Calendar keyword"); Retry on a failed reply.
- Threads with changes waiting for approval show a count in the chat list.

**Settings and Billing** · "How many tasks are left, and when do they reset?"
- Billing leads with "1,240 of 5,000 tasks left · resets Nov 1"; "Payment failed" gets "Update payment".
- "Buy" buttons become secondary; "Cancel plan" moves to its own last section as a danger button.

**Onboarding finish and the upgrade preview**
- Finish: "Checking now" until the check is done (today "All set" shows while it runs); "See results on Prompts".
- Upgrade preview: believable sample brands instead of "Rival A, B, C"; the price once.

---

## Part 3. The writing flow

Today: 8 clicks, a page switch and a hunt for the row (the calendar has no search).

```
Keyword Research → Analyze → Add to calendar → Editorial Calendar → find the row → Write outline → wait
→ open the outline sidebar → Write draft (at the bottom) → wait → Publish content → Publish
```

After: 4 clicks, no page switch.

```
Analyze → Write outline (adds it to the plan and starts) → the outline opens with Write draft on top → Publish
```

The same "Write outline" sits on Domain Research and Competitive Analysis rows, and the calendar gets search.

---

## Part 4. How it feels

- **Undo instead of "Are you sure?"** Deletes that can come back happen at once with a `tw-snack` snackbar:
  "Deleted 3 prompts. Undo." The app already has Ctrl+Z. A confirm dialog stays only for a brand, a workspace and
  billing.
- **Instant changes.** Toggles, renames, status changes and deletes change on screen at once and roll back with
  a message if the save fails.
- **Screens open filled.** Hovering a sidebar item starts loading its data. A refresh keeps the old numbers on
  screen and updates the stamp.
- **Back keeps your place.** Filters, sort and scroll come back when you return to a list.
- **Keyboard.** A ⌘K command bar in the existing `tw-modal`: go to any screen, brand, prompt, keyword or report,
  and run Add prompts, New report or Ask Zippie. Arrow keys move through table rows, Enter opens, Escape closes.
  Rows that open something are buttons or links (today 8 table rows, a calendar cell and a list item use `onClick`
  alone).
- **Long tables stay quick.** Keyword, page and bulk tables render only the rows in view.
- **Page timings.** Each screen's response time and layout shift go to PostHog, so a slow screen shows up.

Motion stays as the CSS has it today.

---

## Part 5. Navigation and clean-up

- **Every tab has its own address**, so back, refresh and shared links keep the view: Brand (`/brand/voice`,
  `/brand/kit`, `/brand/guidelines`), Reports (`/reports/schedules`, `/reports/links`), Sources (`/sources/urls`
  shows URLs; today both addresses show the same), Editorial Calendar (`/editorial-calendar/list`), Zippie
  (`/zippie/knowledge`, `/zippie/skills`), plus `?region=`, `?metric=` and `?filter=` where a tab filters a table.
- **Settings regrouped** so no group passes 4 tabs: Account, Brand, Workspace (General, Members, Identity and
  access, Data retention), Tools (AI, Brand Kit, Slack, API and MCP, Plans and billing), Jobs. The page title says
  "General", and the extra "Settings" h1 goes.
- **Dead screens removed** (nothing can reach them): `TrafficPage` (its Google Analytics connect moves to its own
  file), `ContentPage`, `AiBar`, `ContentIntel`, `SitePages`, `ResearchPanel`, `ContentResults`, and the unused
  screens inside `ContentPiece`, `DocsEditor`, `Writer` and `AgenticResearch`. Several pop-ups from Part 1 live
  in this code.

---

## Part 6. Checks

- **Scored screenshots before and after.** taste-skill's `inspect.mjs --app` opens each screen at 1440, 768 and
  390 wide, measures it and saves screenshots; its critique rubric scores them. Run before the work starts and
  after each part. It needs a signed-in test workspace (decision 2).
- **Accessibility.** An axe scan on every screen in the same run; a serious finding fails it. Keyboard focus is
  checked on each primary button.
- **Rule tests.** `tests/uiRules.test.ts` fails on a new `confirm(`, `prompt(`, `alert(`, `<select`, emoji,
  `Thinking` used as a page loader, or a numeric column without `aw-td-num`. `tests/nav.test.ts` checks every tab
  address and every old address.
- Lint, typecheck, the unit tests and `next build` before every push.

---

## Decisions for you

1. **Words.** The table in Part 1.7. Recommended as written: Editorial Calendar, Outline, Write, Publish.
2. **A test workspace for screenshots.** The checks in Part 6 need a sign-in. Recommended: a "UI check" workspace
   in production with the five sample brands and their data, used only by the screenshot run, its password kept
   as a GitHub secret.
3. **Cost notes.** Recommended: remove them from working screens and keep the task bar, as Part 1.8 says. The
   other choice is a task count on each paid button ("Analyze · 10 tasks").
4. **Dead screens.** Recommended: delete them; they stay in git history.
5. **Order.** Recommended: Part 1, then Part 3 (the writing flow), then Part 2 group by group, then Parts 4 to 6.

---

## What's built

Parts 4 and 6, as they stand in the code:

- **Command bar** (`src/components/CommandBar.tsx`, ranking in `src/lib/commands.ts`): ⌘K or Ctrl+K anywhere opens
  it in the `tw-modal`. It finds every sidebar screen, settings tab and brand, the brand's prompts and the Editorial
  Calendar's keywords already loaded, and runs Add prompts, New report, Ask Zippie and Add a brand. "?" outside text
  boxes lists the shortcuts.
- **Undo instead of confirm:** Editorial Calendar deletes (any size) and custom columns, Brand guidelines files and
  Reports PDFs delete at once with Undo in the snackbar. Stored files wait 10 seconds before they go. A confirm stays
  for a brand, a workspace, members, billing, revoking a link or key, disconnecting, schedules, and Zippie's chats,
  projects and knowledge.
- **Instant changes:** prompt and topic edits, Editorial Calendar edits and columns, Library status and meta,
  schedule pause, Zippie skill toggles and chat names change on screen first and go back with "Couldn't save." when
  the save fails.
- **Back keeps your place** (`src/lib/scrollKeep.ts`): each history entry remembers its scroll. Sheets with an `id`
  keep sort, filters and page for the browser tab.
- **Screens open filled:** hovering a sidebar item loads Reports' downloads, the Editorial Calendar and the Library
  into the stash those screens read. Brand and Settings keep their data in local state, so they load on open.
- **Long tables:** paged Sheets show at most one page (100 by default). A Sheet without pages shows its first 200
  rows past 300, with Show all.
- **Page timings** (`src/components/WebVitals.tsx`): INP, LCP and CLS per screen to PostHog as `web_vital`, from 1
  browser tab session in 10 (docs/analytics.md).
- **Rule tests** (`tests/uiRules.test.ts`): fail on `confirm(`, `prompt(`, `alert(`, `<select`, emoji, the text
  symbols → ✓ ✕ × ▾ ▸ ▶ ↗ as an element's whole text, and new `.css` files. `Thinking` as a page loader and numeric
  columns without `aw-td-num` aren't checked yet.
- **UI check** (`scripts/ui-check.mjs`, `npm run ui-check`): signs in, opens every sidebar screen and settings tab at
  1440, 768 and 390 wide, saves `.ui-check/<width>/<screen>.png`, and fails on a screen without exactly one h1, a
  page error in the console, or a serious or critical axe finding (`axe-core` is a dev dependency). It prints the
  taste-skill inspector command for each screen
  (`node .claude/skills/taste-skill/scripts/inspect.mjs <url> --app --out .taste-skill/<name>`).

  Run it against a running app with its Supabase settings: `APP_URL=http://localhost:3000 UI_CHECK_EMAIL=... UI_CHECK_PASSWORD=... npm run ui-check`.
  It needs a test workspace login (decision 2), which isn't created yet. Without one it checks the sign-in screen
  and stops there.
