# One app, one screen system (plan)

Arrowsterr keeps its four sidebar groups, and every screen moves onto one small set of page types and shared parts,
so the app looks and works the same everywhere. Same approach as Claritia's `docs/unify-plan.md`.

Planned with the UI/UX Pro Max skill (navigation, tables, empty states, loading, focus, labels and confirm rules) and
an audit of every screen on 25 Oct. The look stays as it is: Twenty's design system in `src/app/twenty-ui.css`
(`docs/ui-twenty.md`), with the logo and copy rules from `docs/brand.md`. The skill's palette and font picks are not
used; only its structure and accessibility rules are.

| Part | Work | Time |
|---|---|---|
| 1 | Addresses for every tab, one h1 per screen, Settings regrouped | 1 day |
| 2 | Shared parts: one of each, copies deleted | 3 days |
| 3 | Every screen moved onto the page types, group by group | 5 days |
| 4 | Rule breaks fixed: browser pop-ups, emoji, glyph icons, raw hex, help text | 1.5 days |
| 5 | Dead screens removed | 0.5 day |
| 6 | Tests, screens check, screenshots, docs | 1.5 days |

About 2.5 weeks. Running cost: $0 added at Beta (50 teams) and at Growth (500 teams). Nothing new is paid for: no
new service, no AI calls, no new fonts.

---

## Part 1. Navigation

### 1.1 The sidebar stays

```
AI Visibility       Prompts · Competitors · Sources
Organic Research    Keyword Research · Domain Research · Competitive Analysis
Content             Editorial Calendar · Library · Brand
Reports             Reports
Settings
```

It already follows the skill's rule of at most 4 items in a group. Two fixes:
- The "Pro" lock chip on a group header goes from 10px to the 12px tag size.
- The trial link's "→" glyph becomes the arrow icon.

### 1.2 Every tab gets its own address

Today 9 screens keep their inner tabs in memory or localStorage, so back, refresh and shared links lose the view
(skill: deep linking, predictable back). After:

| Screen | Tabs | Addresses |
|---|---|---|
| Brand | Tone of voice · Brand Kit · Guidelines | `/brand/voice`, `/brand/kit`, `/brand/guidelines` |
| Reports | Downloads · Schedules · Links | `/reports`, `/reports/schedules`, `/reports/links` |
| Sources | Domains · URLs, and the site kind filter | `/sources`, `/sources/urls` (the page id is passed in; today both render the same), `?kind=` |
| Editorial Calendar | Calendar · List | `/editorial-calendar`, `/editorial-calendar/list` |
| Library | the filter and Edit/HTML | `?filter=`, `?doc=&view=html` |
| Competitive Analysis | Venn region tabs | `?region=` |
| Competitors | the tile picker | `?metric=` |
| Zippie | Chat · Knowledge · Skills · Project | `/zippie`, `/zippie/knowledge`, `/zippie/skills`, `/zippie/project/:id` |
| Keyword and Domain Research | already in the address | no change |

Old addresses keep working. `/traffic` and `/visitors` already forward to Prompts.

### 1.3 One h1 per screen

Today most screens have two h1s: TopBar's 13px breadcrumb and the page's 20px title. The breadcrumb becomes a
`nav` with an `aria-label`, and the page title is the only h1. Headings go h1, h2, h3 in order (skill: heading
hierarchy).

### 1.4 Settings regrouped

The Workspace group has 8 tabs. It splits so no group passes 4:

```
Account       Profile · Password and security · Notifications
Brand         Publishing sites · Google Analytics · Slack and alerts
Workspace     General · Members · Identity and access · Data retention
Tools         AI · Brand Kit · Slack, API and MCP · Plans and billing
Jobs          Imports and exports · Background actions
```

The header says "General" on the General tab (today it says "Workspace"), and the extra "Settings" h1 goes.

---

## Part 2. The screen system

### 2.1 Five page types

Every screen is one of these. Each type has one layout and one set of parts.

| Type | Used by | Layout |
|---|---|---|
| **List** | Prompts, Editorial Calendar (list view), Library, Reports, Members, Zippie knowledge and skills | Header (title, count, tabs, one primary button) · `FilterBar` · `Sheet` · bulk bar when rows are picked · a row opens a side panel or a record |
| **Report** | Competitors, Sources, Keyword Research, Domain Research, Competitive Analysis | Header (title, the period, topic and model pickers, Share, PDF) · `StatCards` · one chart · one table |
| **Record** | Keyword deep dive, a prompt, a competitor, a report | Back crumb ("Keyword Research / crm for dentists") · tabs · main column and a right rail |
| **Editor** | Draft, Doc, Brief, Brand Kit | `EditorFrame`: back crumb, name you can rename, save state, Undo and Redo, the one primary action on the right |
| **Settings** | Settings, Brand voice and guidelines | Section list on the left, one panel at a time, max width 3xl |

### 2.2 One of each shared part

The audit found these doing the same job in several ways. Each becomes one part in `src/components/ui/`, and the
copies are deleted.

| Part | Today | After |
|---|---|---|
| Side panel | 5 (SidePanel, Prompts' own panel, PromptsDoc overlay, KeywordOverview full screen, Zippie widget) | `SidePanel`: right side, inset 8px, X to close, Escape, focus kept inside, a `button` backdrop |
| Modal | 2 plus 21 `confirm()` and 6 `prompt()` | `Modal`, plus `askConfirm` and `askText` built on it |
| Tabs | 7 (Seg, ViewSwitch, inline `aw-seg`, inline `aw-tabs`, radio buttons, two tile tablists, two side navs) | `Tabs` with addresses for pages; `Segmented` only to switch a view in place |
| Toggle | native checkboxes in 4 styles, two with a hard-coded blue; chips used as toggles | `Toggle` (switch) and `Checkbox`; chips only as removable filters |
| Icon button | 6 classes (24px and 32px) | `IconButton`: 32px, label required, tooltip |
| Stat tile | 5, numbers at 20, 22, 24 and 28px | `StatCards`: one size (20px mono, today's twenty-ui value), label, number, `aw-delta` |
| Copy button | 3 named, 8 inline | `CopyButton` |
| Dropdown and menu | Pickers, 2 `useMenu` menus, Zippie menu, Writer menu, a native `<select>` | `Dropdown` and `Menu` from Pickers |
| Table | `Sheet`, `aw-table` in 6 variants, ContentGrid's own table | `Sheet` for every list; `aw-table` (one variant) only for small read-only tables inside a card |
| Filter bar | each list has its own | `FilterBar` |
| Empty state | ToolIntro, Empty, 55 raw `aw-callout`s, PlanIntro, Glimpse | `ToolIntro` before the first record; `Empty` for "No matches" with a way out; `aw-callout` only for real notices |
| Loading | `Thinking`, "Loading..." 14 times, "Loading…" 3 times | the header always shows; the body shows `Skeleton` in its own layout; `Thinking` only for work over 2 seconds |
| Tag | 9 (`aw-status`, `aw-chip`, `aw-badge`, `aw-tag`, `tw-tag`, `aw-label`, StageTag, StateTag, `.pill`) | `Tag` (state, 20px, Twenty step 3 fill and step 11 text), `Chip` (filter), `Delta` (change) |
| Save state | the same line copied in 3 settings files | `SaveState` ("Saved" or "Not saved. Retrying…") |
| Dates | 7 helpers (`ago`, `when`, `fmtDate`) | `formatDate` and `ago` in `src/lib/dates.ts`, en-US, the workspace's time zone |

### 2.3 One way to do each thing

- **Words.**
  - **Delete** for anything people make. **Remove** only for taking a person out of the workspace.
    **Disconnect** for connections.
  - **Cancel** in dialogs, **Close** on panels. **Save** (never Done or Apply). **Export CSV** everywhere.
  - Publishing: one word for sending a piece to the site (decision 1).
  - The brand delete says "Delete {brand}" and confirms the same words (today it says "Remove" and confirms
    "Stop tracking").
- **Saving.** Every editor and settings panel saves by itself and shows `SaveState`.
- **The primary button** sits in the header, top right, and shows on the first screen too. One per screen.
- **First screens.** `ToolIntro` on every list before its first record, with the same button as the header.
- **Tables** (skill: bulk actions, table handling):
  - 32px rows (Twenty), numbers right-aligned in mono, sortable headers (`SortTh` today on 3 screens).
  - A checkbox column and a bulk bar with Delete on every list where people make things: Prompts, Library, Reports
    links and schedules, Members, Zippie knowledge.
  - `aw-table-wrap` scrolls sideways instead of clipping, and no fixed `min-w` forces it.
  - Clickable rows are links or buttons the keyboard can reach. Today 8 `<tr>`, a `<div>` and an `<li>` use `onClick`
    alone.
- **Widths.** Lists and reports use the full panel; records max 6xl; settings max 3xl.
- **Numbers.** Every `toLocaleString()` without a locale becomes en-US (9 places).

### 2.4 Accessibility (UI/UX skill, priority 1)

- **Focus:** the global ring moves to a 2px offset, as `docs/brand.md` asks (1px today). The editor keeps its own.
- **Labels:** every icon button keeps a label. Today all 51 have one, and `IconButton` makes it required.
- **Keyboard:** every action can be reached by keyboard: rows, calendar cells, backdrops.
- **Text size:** nothing under 11px. The 9px and 10px text in 12 places goes to 11px; sidebar group labels and the
  TaskBar stay at 11px.
- **Colour:** text contrast at least 4.5:1. Green and red always come with a word or a chevron.
- **Motion:** the reduced-motion switch stays as it is.

---

## Part 3. Moving the screens

Group by group, so the app works at the end of each day.

1. **AI Visibility.**
   - Prompts on List, with its own panel replaced by `SidePanel`, keyboard rows and a bulk bar.
   - Competitors and Sources on Report, with `StatCards`, `Tabs` with addresses and keyboard rows.
2. **Organic Research.** Keyword Research, Domain Research and Competitive Analysis on Report. KeywordOverview's
   full-screen region becomes `SidePanel`. Keyword deep dive on Record.
3. **Content.**
   - Editorial Calendar on List with Calendar and List tabs.
   - Library on List, with ContentGrid's table moved to `Sheet` and its bulk Generate in the bulk bar.
   - Draft, Doc and Brief on `EditorFrame`.
   - Brand on Settings with addresses.
4. **Reports.** Downloads, Schedules and Links as tabs with addresses; links and schedules get bulk delete.
5. **Settings and Zippie.** The regrouped Settings (1.4); `SaveState` everywhere; Zippie's views get addresses
   and its menus, `<select>` and pop-ups move to the shared parts.

---

## Part 4. Rule breaks

| Rule | Today | Fix |
|---|---|---|
| No browser pop-ups | 21 `confirm()`, 6 `prompt()` | `askConfirm`, `askText` |
| No browser dropdowns | 1 `<select>` (ZippiePage:1364) | `Dropdown` |
| No emoji | 👑 👉 ✎ ⌨ 🔗 🌐 ▶▼ in 9 places | icons |
| Icons, not glyphs | → ✓ ↗ • ▾ × ← ↑ ↓ ❝ ↘ ▸ ✕ in about 130 places | the icon set, with sort arrows from `SortTh` |
| Tokens, not hex | 159 raw hex in TSX (52 of them in DinoGame), 238 in the older CSS files | tokens in TSX; the older CSS is folded into `twenty-ui.css` where it still applies, and dropped where twenty-ui already wins. DinoGame keeps its own colours. |
| Minimal copy | "Cost $x.xxx" and "Free, saved results" on 4 research screens; a tasks note on Billing; info tips on 4 screens | the cost lines and the tasks note go; the tips move into each tool's first screen |

`tests/brandCheck.test.ts` fails on any new `confirm(`, `prompt(`, `alert(`, `<select`, emoji, raw hex in TSX, or a
second side panel or modal part.

---

## Part 5. Dead screens

Nothing imports these, or they're only used by other dead code. They go, and the parts still used move to their
own files:

- `TrafficPage.tsx` (can't be reached; `Ga4Connect` moves to `Ga4Connect.tsx` for Brand settings and Content
  Intelligence).
- `content/ContentPage.tsx`, `research/AiBar.tsx`, `research/ContentIntel.tsx`, `research/SitePages.tsx`,
  `content/ResearchPanel.tsx` and `research/ContentResults.tsx`.
- From files still in use, only the unused screens go: `ContentPiece` (keep `STATUSES` and `WriterAccess`),
  `DocsEditor` (keep `SLASH` and `SlashMenu`), `Writer`/`DocEditor` (keep `brandTables`, `draftText` and `Toolbar`),
  and the `AgenticResearch` screen (keep `PlanProgress` and `planRows`). Then `SerpView`, `BriefView` and
  `CommentRail` go once nothing uses them.

Many of the pop-ups in Part 4 sit in this code, so removing it first makes Part 4 smaller.

---

## Part 6. Tests and checks

- `tests/nav.test.ts`: every sidebar item and tab address, every old address forwarding, Settings groups of 4 or
  fewer.
- `tests/brandCheck.test.ts` (Part 4).
- `scripts/screens-check.ts` (Playwright, the browser is already installed):
  - walks every screen from an empty workspace and from one with sample data;
  - checks one h1 per screen, a header that stays while loading, keyboard focus on each primary button, and no page
    errors;
  - saves screenshots of each screen for you to review before merge.
- Lint, typecheck, the unit tests and `next build` before every push.

---

## Decisions for you

1. **Publishing word.** Pick one for sending a piece to a site. "Publish" is used on 4 screens and "Sync to CMS" on 3.
   Recommended: "Publish", with "Publish as draft" where it only saves a draft on the site.
2. **Settings › Brand Kit** is the workspace's own kit, and Content › Brand › Brand Kit is each brand's. Keep both,
   or show the workspace kit only for agencies. Recommended: keep both, renamed "Your Brand Kit" in Settings.
3. **Dead screens** (Part 5). Recommended: delete them; they stay in git history.
