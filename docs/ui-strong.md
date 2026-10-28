# Strong UI plan

Why Notra's app reads strong and ours reads light, and the exact changes that fix it.
Source: Notra's live stylesheet (`demo.usenotra.com/assets/globals-*.css`, read 28 October 2026) and our `src/app/twenty-ui.css` and `src/app/brew-ui.css`.

## What Notra does

| Part | Notra | Arrowsterr now |
|---|---|---|
| Body font | Inter Variable, 16px base | Geist, 14px base (13px in tables) |
| Main text | `#171717` | `#262626` |
| Gray text | `#62626A` | `#6B6B6B`, and `#8A8986` for the lighter level |
| Headings | Inter, weight 600 to 700, tight tracking | System font at weight 500 |
| Page title | Big title on the page (about 30 to 36px, bold) with a gray line under it | 14px breadcrumb in the top bar, no title on the page |
| Big numbers | About 40px, bold | 28px, weight 500 |
| Sidebar | Near-black text (`oklch(14.5% 0 0)`), about 15px | `#525252` at 14px |
| Page | Gray shell (`#F3F3F2`, border `#E7E7E5`) holding white cards with a soft lift shadow | White cards on `#FCFCFC`, hairline only |
| Table rows | White card, row line `#EFEFEE`, no column lines | Column and row hairlines, 32px rows, 13px text |
| Tabs | Bordered switch, the picked one is a white raised chip | Text tabs with a 1px underline |
| Smoothing | `antialiased` | `antialiased` (same) |

## Why ours feels weak

1. **Text is small.** 13 to 14px Geist next to their 16px Inter. Geist is also narrow, so each word holds less ink.
2. **Weights are low.** Every heading and number is 500. Notra uses 600 and 700. The system font at 500 looks thin on Mac.
3. **Grays are pale.** Our second and third grays (`#6B6B6B`, `#8A8986`) sit next to white with little contrast. The sidebar is gray too, so half the screen is gray text.
4. **No page title.** The page name lives in a 14px top bar. Notra opens every screen with one big bold word. That word sets the weight of the whole page.
5. **Flat white.** White cards on a near-white page with hairlines. Notra puts white cards inside a gray shell, so the cards pop and the text on them looks darker.
6. **Inter loads without bold.** `layout.tsx` loads Inter at 400, 500 and 600 only.

## The plan

Everything below lands in one new file, `src/app/strong-ui.css`, loaded last in `globals.css`, plus one small component. Class names stay the same.

### Phase 1. Fonts and ink (biggest win, one afternoon)

- `layout.tsx`: load Inter as the variable font (drop the `weight` list) so 400 to 700 all work.
- Tokens on `:root, [data-theme="light"]`:
  - `--font-sans: var(--font-inter), "Inter", ui-sans-serif, system-ui, sans-serif`
  - `--font-display: var(--font-sans)`
  - `--text-primary: #171717`
  - `--text-strong: #0A0A0A`
  - `--text-secondary: #62626A`
  - `--text-tertiary: #7C7C84`
  - `--text-light: #A1A1AA`
  - `--text-sidebar: #171717`
- `:root .aw { font-size: 15px; line-height: 22px; font-feature-settings: "cv11", "ss01"; }`
- Dark mode: `--text-primary: #FAFAFA`, `--text-secondary: #A1A1AA`, `--text-sidebar: #FAFAFA`.

### Phase 2. Type scale and weights

| Class | Size / line | Weight | Tracking |
|---|---|---|---|
| `.aw-display`, `.aw-hero`, `.aw-intro__title` | 32 / 38 | 700 | -0.025em |
| New `.aw-title` (page title) | 30 / 36 | 700 | -0.025em |
| New `.aw-sub` (line under the title) | 17 / 26 | 400, `--text-secondary` | 0 |
| `.aw-h1`, `.aw-h2`, `.tw-modal__title` | 20 / 28 | 600 | -0.02em |
| `.aw-h3` | 17 / 24 | 600 | -0.01em |
| `.aw-h4`, `.aw-frame__head` | 15 / 22 | 600 | -0.01em |
| `.aw-text`, `.md`, `.aw-lede` | 15 / 22 | 400 | 0 |
| `.aw-small`, `.aw-label` | 14 / 20 | 500 | 0 |
| `.aw-micro`, `.aw-nav-section` | 12 / 16 | 500 | 0 |
| `.aw-stat__num` | 40 / 44 | 700, tabular numbers | -0.03em |
| `.aw-stat__lab` | 14 / 20 | 500, `--text-secondary` | 0 |

### Phase 3. Page head

- New `PageTitle` in `src/components/ui.tsx`: an `h1.aw-title` and an optional `p.aw-sub`.
- Put it at the top of every tool screen (Visibility, Prompts, Competitors, Sources, Traffic, Visitors, Content, Research, Reports, Settings).
- The top bar keeps the breadcrumb at 14px, weight 500, `--text-secondary`.
- The `.aw-sub` line is one plain sentence and only on screens where the page name alone isn't clear.

### Phase 4. Shell and cards

- Page background `--bg-primary: #FFFFFF`, sidebar `--bg-secondary: #FAFAFA`.
- New tokens: `--shell: #F3F3F2`, `--shell-border: #E7E7E5`, `--card-lift: 0 1px 2px rgba(23,23,28,.06), 0 2px 8px -2px rgba(23,23,28,.06)`.
- `.aw-frame`, `.aw-table-wrap`, `.aw-stats`: gray shell, 1px `--shell-border`, 12px radius, 4px padding.
- The white card inside (`.aw-frame__body`, `.aw-table`, `.aw-stat`): white, 1px `#E5E5E5`, 10px radius, `--card-lift`.
- `.aw-frame__head` sits on the gray shell, 15px weight 600.

### Phase 5. Sidebar

- `.aw-nav-link`, `.aw-mod`: 36px tall, 15px, weight 500, `--text-sidebar`, icons 18px at full ink.
- Picked link: `background: #EFEFEF`, weight 600.
- `.aw-nav-section`: 12px, weight 500, `--text-tertiary`.
- Workspace switch: 15px weight 600.

### Phase 6. Tabs and switches

- `.aw-seg`: gray track `#F3F3F2`, 1px `--shell-border`, 10px radius, 3px padding.
- `.aw-seg button`: 32px, 14px weight 500, `--text-secondary`.
- Picked: white, `--card-lift`, `--text-primary`, weight 600.
- `.aw-tabs` (page tabs) keep the underline, at 15px weight 500, picked weight 600 with a 2px line.

### Phase 7. Tables

- 15px cells, 44px rows, `--text-primary`. First column weight 500.
- Header: 13px weight 500, `--text-secondary`, white.
- Row line `#EFEFEE`. Drop the column lines (`border-right: 0`).
- Numbers: `font-variant-numeric: tabular-nums`, weight 500.
- `.aw-sheet` (the spreadsheet) keeps its grid.

### Phase 8. Tags, deltas and buttons

- Tags (`.aw-chip`, `.aw-status`): 24px, 13px weight 500, tinted fill with dark text (green `#ECF8F0` with `#1D7A43`, red `#FFF1F0` with `#B4232C`).
- New `.aw-delta`: an up or down arrow plus the number, green or red tint, 13px weight 600.
- Buttons: 36px, 14px weight 600. Primary stays Signal Blue `#0943B0` with the two-stop fill.

### Phase 9. Check every screen

- Screenshot each tool screen at 1440 and 390 wide, light and dark, before and after.
- Look for text that wraps, tables that now scroll sideways, and buttons that overflow at 15px.
- Tighten any wide table back to 14px with `.aw-table--dense`.

## Order and size

| Phase | Work | Time |
|---|---|---|
| 1 | Fonts and ink | 0.5 day |
| 2 | Type scale | 0.5 day |
| 3 | Page title on every screen | 1 day |
| 4 | Shell and cards | 1 day |
| 5 | Sidebar | 0.25 day |
| 6 | Tabs | 0.25 day |
| 7 | Tables | 0.5 day |
| 8 | Tags and buttons | 0.25 day |
| 9 | Screen check and fixes | 1 day |

Phases 1 and 2 alone close most of the gap.

## Running cost

CSS, one component and a font file already served by `next/font`. No new servers, services or AI calls.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |

The Inter variable font adds about 50 KB on first load, cached after that.
