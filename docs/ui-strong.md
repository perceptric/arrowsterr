# Strong UI plan

Match Notra's in-app look exactly. Every value below comes from Notra's live stylesheet (`demo.usenotra.com/assets/globals-*.css`, read 28 October 2026), compared with our `src/app/twenty-ui.css` and `src/app/brew-ui.css`.

## Notra's real values

| Part | Notra | Arrowsterr now |
|---|---|---|
| Font | Inter Variable | Geist |
| UI text | 14px (`text-sm`), weight 400 | 14px Geist, 13px in tables |
| Main text | `#171717` | `#262626` |
| Gray text | `#62626A` | `#6B6B6B`, and `#8A8986` |
| Headings | weight 600 (`font-semibold`), tracking -0.025em | system font, weight 500 |
| Page title | 24px, 30px on wide screens, weight 600 | 14px label in the top bar |
| Big numbers | 30px (`text-3xl`), weight 600 | 28px system font, weight 500 |
| Sidebar text | 14px, weight 500, `oklch(14.5% 0 0)` (near black) | 14px, `#525252` |
| Sidebar fill | `oklch(98.5% 0 0)`, picked item `oklch(97% 0 0)` | `#FCFCFC` |
| Borders | `#E5E5E5` | `#E7E7E7` |
| Shell | `#F3F3F2`, border `#E7E7E5`, 2px padding | none |
| Cards in the shell | white, border `#E5E5E5`, 14px radius, shadow `0 1px 2px #17171C0F, 0 2px 8px -2px #17171C0F` | white, hairline, no shadow |
| Table cells | 14px, 10px top and bottom, 8px sides | 13px, 32px rows |
| Table header | 12px (`text-xs`), weight 500, gray | 13px, weight 500, gray |
| Row line | `#EFEFEE`, no column lines | row and column lines |
| Tabs | 32px track (`h-8`), picked tab weight 500 | 40px text tabs with an underline |
| Radius | 8px base, 14px table cards | 12px |
| Smoothing | `antialiased` | `antialiased` |

## Why ours feels weak

1. **Geist is narrow.** At the same 14px, Inter is wider and taller, so each word carries more ink. This is the biggest single cause.
2. **Pale ink.** `#262626` and `#6B6B6B` against their `#171717` and `#62626A`. The sidebar is gray in ours and near black in theirs.
3. **Weight 500 headings in the system font.** They use Inter at 600. Nothing is heavier than 600 in their app.
4. **No page title.** They open with a 30px title at weight 600.
5. **Flat white.** They set white cards in a light gray shell with a soft shadow.

What stays the same: 14px is still the base size, and nothing goes to 700.

## The plan

One new file, `src/app/strong-ui.css`, loaded last in `globals.css`, plus one small component. Class names stay the same.

### Phase 1. Font and ink

- `layout.tsx`: load Inter as the variable font (drop the `weight` list).
- Tokens on `:root, [data-theme="light"]`:
  - `--font-sans: var(--font-inter), "Inter", ui-sans-serif, system-ui, sans-serif`
  - `--font-display: var(--font-sans)`
  - `--text-primary: #171717`
  - `--text-secondary: #62626A`
  - `--text-tertiary: #8A8A93`
  - `--text-sidebar: #0A0A0A`
  - `--border-medium: #E5E5E5`
  - `--border-light: #EFEFEE`
  - `--bg-secondary: #FAFAFA`
- `:root .aw { font-size: 14px; line-height: 20px; }`
- Dark: `--text-primary: #FAFAFA`, `--text-secondary: oklch(72% .006 270)`, `--bg-primary: oklch(17% .006 270)`, `--border-medium: oklch(27.5% .006 270)`.

### Phase 2. Type scale

| Class | Size / line | Weight | Tracking |
|---|---|---|---|
| New `.aw-title` (page title) | 24 / 32, 30 / 36 at 640px wide and up | 600 | -0.025em |
| New `.aw-sub` (line under the title) | 15 / 22, `--text-secondary` | 400 | 0 |
| `.aw-display`, `.aw-hero`, `.aw-intro__title` | 30 / 36 | 600 | -0.025em |
| `.aw-h1`, `.aw-h2`, `.tw-modal__title` | 18 / 28 | 600 | -0.015em |
| `.aw-h3`, `.aw-frame__head` | 14 / 20 | 600 | 0 |
| `.aw-h4` | 14 / 20 | 500 | 0 |
| `.aw-text`, `.md`, `.aw-lede` | 14 / 20 | 400 | 0 |
| `.aw-small`, `.aw-label` | 13 / 18 | 500 | 0 |
| `.aw-micro`, `.aw-nav-section` | 12 / 16 | 500 | 0 |
| `.aw-stat__num` | 30 / 36, tabular numbers | 600 | -0.025em |
| `.aw-stat__lab` | 14 / 20, `--text-secondary` | 500 | 0 |

### Phase 3. Page title

- New `PageTitle` in `src/components/ui.tsx`: `h1.aw-title` and an optional `p.aw-sub`.
- Put it at the top of every tool screen.
- The top bar breadcrumb stays at 14px, weight 500, `--text-secondary`.

### Phase 4. Shell and cards

- New tokens: `--shell: #F3F3F2`, `--shell-border: #E7E7E5`, `--card-lift: 0 1px 2px #17171C0F, 0 2px 8px -2px #17171C0F`.
- `.aw-frame`, `.aw-table-wrap`, `.aw-stats`: `--shell` fill, 1px `--shell-border`, 16px radius, 2px padding.
- The white card inside: 1px `#E5E5E5`, 14px radius, `--card-lift`.
- `.aw-frame__head` sits on the shell, 14px weight 600, 8px 12px padding.

### Phase 5. Sidebar

- `.aw-nav-link`, `.aw-mod`: 32px tall, 14px, weight 500, `--text-sidebar`, 8px radius.
- Picked link: `background: oklch(97% 0 0)`, same weight.
- Icons 16px at full ink.

### Phase 6. Tabs

- `.aw-seg`: `#F5F5F5` track, 32px tall, 8px radius, 2px padding.
- Buttons 14px weight 500, `--text-secondary`. Picked: white, `--card-lift`, `--text-primary`.
- `.aw-tabs` (page tabs) keep the underline at 14px weight 500.

### Phase 7. Tables

- Cells 14px, 10px top and bottom, 8px sides, `--text-primary`.
- Header 12px, weight 500, `--text-secondary`, 32px tall.
- Row line `#EFEFEE`. No column lines.
- Row hover: `color-mix(in oklab, #F5F5F5 50%, #FFF)`.
- `.aw-sheet` keeps its grid.

### Phase 8. Tags and buttons

- Tags: 22px, 12px weight 500, tinted fill (`color-mix` of the state color at 10%) with dark text.
- Deltas: green `oklch(46% .109 155)` on 10% green, red `oklch(48% .18 25)` on 10% red.
- Buttons: 32px default, 36px large, 14px weight 500. Primary stays Signal Blue `#0943B0`.

### Phase 9. Check every screen

- Screenshot each tool screen at 1440 and 390 wide, light and dark, before and after.
- Look for text that wraps or tables that now scroll sideways.

## Order and size

| Phase | Work | Time |
|---|---|---|
| 1 | Font and ink | 0.5 day |
| 2 | Type scale | 0.5 day |
| 3 | Page title on every screen | 1 day |
| 4 | Shell and cards | 1 day |
| 5 | Sidebar | 0.25 day |
| 6 | Tabs | 0.25 day |
| 7 | Tables | 0.5 day |
| 8 | Tags and buttons | 0.25 day |
| 9 | Screen check | 1 day |

## Running cost

CSS, one component and a font file already served by `next/font`. No new servers, services or AI calls.

| Stage | Added per month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
