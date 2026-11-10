# Arrowsterr brand (v10)

> **v10, 10 November 2026: the clear look.** A full reset. Earlier versions (v5 to v9) stacked one look on top of another, and the app ended up with six stylesheets fighting each other. v10 replaces all of them with one system: Geist type, cool neutral greys, white cards with soft shadows and 16px corners, rounded buttons, pill switches and dot tags, and Signal Blue `#0943B0` as the one accent. It is modeled on a reference page shared on 10 November 2026 (a clean SaaS pricing page), with its orange accent swapped for Signal Blue. The old guide is kept at `docs/archive/brand-v9.md` for history only. Where anything else in the repo disagrees with this file, this file wins.

The visual reference with live components is the **Arrowsterr Brand v10** artifact. This file is the source of truth; the artifact shows it.

---

## Contents

1. [What changed](#what-changed)
2. [Design principles](#design-principles)
3. [Personality](#personality)
4. [Voice and copy](#voice-and-copy)
5. [Logo](#logo)
6. [Color](#color)
7. [Typography](#typography)
8. [Spacing and layout](#spacing-and-layout)
9. [Shape: radius, borders, elevation](#shape-radius-borders-elevation)
10. [Backgrounds and atmosphere](#backgrounds-and-atmosphere)
11. [Icons and logos of other products](#icons-and-logos-of-other-products)
12. [Motion](#motion)
13. [Components](#components)
14. [Patterns](#patterns)
15. [Data visualization](#data-visualization)
16. [Accessibility](#accessibility)
17. [Token reference](#token-reference)
18. [Moving the app to v10](#moving-the-app-to-v10)
19. [Running cost](#running-cost)

---

## What changed

| Area | v9 (keys and strips) | v10 (the clear look) |
|---|---|---|
| Type | Inter 13px UI, Funnel Display headlines, Geist Mono numbers | Geist for everything, Geist Mono only for code and ids |
| Neutrals | Warm greys, several near-duplicates | One cool grey ramp with a slight blue bias |
| Accent | Signal Blue plus gold Spark plus Sky | Signal Blue, with a soft tint and a ring; gold only for one win per view |
| Buttons | Square keys with a dark ring and top highlight | 10px corners, flat Signal Blue fill, no ring, no highlight |
| Switches | Grey tray with white key | Pill tray with a white raised pill |
| Tags | Square 6px tags | Pills with a leading dot |
| Cards | 16px, hairline frame | 16px, 1px border plus a soft shadow, lift on hover |
| Numbers | Stat strip with a tinted lead cell | Stat row: big tabular number over a muted label, no boxes |
| Atmosphere | Flight grid lines | Dot grid and one soft blue glow, marketing and first screens only |
| Stylesheets | `brand.css`, `brand-v2.css`, `brand-v5.css`, `brew-ui.css`, `strong-ui.css`, `omni-ui.css`, `calm-ui.css`, `keyed-ui.css` | One file: `src/app/brand-v10.css` |

---

## Design principles

These eight rules decide every case this guide does not cover.

1. **Clarity first.** If a reader has to work out what something means, it is wrong. Labels say what a number is. Units sit next to the number.
2. **Numbers lead.** A screen opens with its key numbers in a stat row, then the detail. Every number shows its change when there is a previous value.
3. **One accent.** Signal Blue marks the one primary action, the selected thing, your own brand in charts and focus. If two things on a screen are blue and only one is the point, make the other grey.
4. **Quiet neutrals do the work.** About 80% of any screen is white and grey, 15% is ink text and 5% is blue.
5. **Soft depth, never heavy.** Cards float a little: 1px border, a soft shadow, a 2px lift on hover. Nothing has a dark frame or a hard drop shadow.
6. **Round, never bubbly.** 10px buttons, 16px cards, 24px feature panels, full pills for switches and tags. Never mix corner sizes inside one component.
7. **Show the product.** Illustrations are small, real-looking pieces of the UI (skeleton bars, a tiny chart, a ranked list), never stock art or abstract blobs.
8. **Explain once.** A tool explains itself on its first screen. Working screens hold labels, buttons and real errors only.

---

## Personality

Arrowsterr is **the Navigator**: the friend in the passenger seat with the map open, who knows the shortcut and tells you which exit to take. Calm about the problem. Glad about the win. Always pointing somewhere.

The name holds both halves: an **arrow** for direction and a **star** for arriving. The mark shows two chevrons climbing and a sparkle above them.

### Four traits

| Trait | It sounds like | It never sounds like |
|---|---|---|
| **Pointed** | "Add these 5 prompts. They cover 60% of what buyers ask." | "There are many ways to approach AI search." |
| **Plain-spoken** | "ChatGPT names you in 38% of answers." | "Leverage generative engine optimisation synergies." |
| **Proof-first** | "Up 6.1 points since you fixed the pricing page." | "Massive gains in visibility!" |
| **Bright** | "New citation. Perplexity now quotes your docs." | Confetti, exclamation marks, hype |

### How the traits show in the design

- **Pointed:** every view has one clear next step, the single Signal Blue button. Links end in a right arrow (→).
- **Plain-spoken:** cool greys, plenty of white, no decoration that carries no meaning.
- **Proof-first:** stat rows, tabular numbers, deltas, tables and real charts before adjectives.
- **Bright:** the Spark (gold `#F5B70A`) marks one win per view at most: a citation won, a rank gained.

### Zippie

Zippie is the mascot: a small navy character with a gold spark. Zippie appears on empty states, onboarding and the 404 page. Zippie never appears in working screens, charts or next to errors, and never talks in the UI.

---

## Voice and copy

Write like the Navigator talks: short, direct and about the reader's next move.

### Rules

- **9th-grade words.** "Use" over "leverage", "show" over "surface", "check" over "audit" when both work.
- **Short sentences.** One idea each, 8 to 14 words.
- **Say "you".** Use "we" only for what Arrowsterr does ("We check every prompt daily").
- **Verbs first** on buttons: "Run check", "Add prompts", "Start free", "Book a demo".
- **Numbers over adjectives.** "Named in 38% of answers" beats "great visibility".
- **Say "competitor".** Never "rival".
- **No em dashes.** Use a full stop or a comma.
- **Skip the contrast trick.** Avoid "not X, Y" and "X, not Y". Say the positive thing.
- **Avoid lists of three in prose.** Two or four items read as real; three reads as a slogan.
- **No emoji, no exclamation marks** in the product. One per email at most.
- **Sentence case** everywhere. Product names keep their case: ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews.

### Copy by spot

| Spot | Write | Avoid |
|---|---|---|
| Eyebrow | Pricing | PRICING PLANS!! |
| Page headline | See where AI sends your buyers | Revolutionize your AI presence |
| Primary button | Run check | Submit |
| Secondary button | Compare plans | Click here |
| Empty state | No prompts yet. Add the questions your buyers ask. | Nothing to see here! |
| Success toast | Check done. 25 prompts on 5 models. | Success! Your check has completed successfully. |
| Error | Gemini timed out on 3 prompts. We retry in 1 hour. | An error occurred. |
| Win | New citation. Perplexity now quotes your pricing page. | Amazing news! |
| Delete | Delete Acme and its 214 answers? | Are you sure? |
| Not included (table) | — (an em dash glyph as a table value only) | No / ✗ / N/A |

### Numbers in copy

- Digits for every number: "3 prompts", "5 models".
- Percent with no space: "38%". Changes in a percent use points: "+6.1 pts".
- Ranks with a hash: "#1", "#3".
- Money with the symbol, no decimals when whole: "$99/mo".
- Big counts abbreviated with a plus when they are floors: "100M+", "12,000+".
- Thousands get commas: "3,960".

---

## Logo

The mark is the **Climb and Spark**: an outer chevron in Signal Blue `#0943B0`, an inner chevron in Sky `#4F7FE0` and a four-point sparkle in Signal Blue above. The wordmark sets "Arrowsterr" in ink `#171717`, Geist 600, letter-spacing −0.02em.

### Files

| File | Use it on |
|---|---|
| `public/brand/arrowsterr-logo-color.svg` | White and light grey grounds. The default. |
| `public/brand/arrowsterr-logo-white.svg` | Signal Blue, navy and dark photos. |
| `public/brand/arrowsterr-mark-color.svg` | App icon, favicon, avatar, small spaces on light grounds. |
| `public/brand/arrowsterr-mark-white.svg` | The same spots on dark grounds. |

### Sizes

| Place | Height |
|---|---|
| App sidebar and site nav | 24px (full logo) |
| Footer | 24px |
| Email header | 28px |
| Deck cover | 40px |
| Favicon / app icon | Mark only, 16 to 512px |

Clear space on every side equals the height of the sparkle. Smallest size: 16px tall for both the logo and the mark.

### Never

- Recolour, reorder or outline the chevrons. Never fill the sparkle with gold.
- Stretch, tilt, add a shadow or place it on a busy photo.
- Type "Arrowsterr" in a font as a logo.
- Use the chevrons alone as a logo.

---

## Color

### Brand

| Token | Hex | Use |
|---|---|---|
| `--signal` | `#0943B0` | Primary buttons, links, selected items, focus, your brand in charts |
| `--signal-strong` | `#072F80` | Hover and pressed on primary, eyebrow text, links on tinted grounds |
| `--signal-soft` | `#EEF3FD` | Tinted backgrounds: selected rows, active nav item, icon chips, the glow |
| `--signal-tint` | `rgb(9 67 176 / 0.045)` | A whole highlighted column or recommended card wash |
| `--signal-ring` | `rgb(9 67 176 / 0.15)` | The 4px ring around a recommended card or a focused input |
| `--sky` | `#4F7FE0` | Inner logo chevron and the second series in a two-series chart. Never text. |
| `--spark` | `#F5B70A` | One win per view. Never a button, never text on white. |

### Neutrals

A cool grey ramp, biased slightly toward blue so it sits well next to Signal Blue.

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#171717` | Headlines, numbers, primary text |
| `--ink-2` | `#3F4250` | Body text, table values |
| `--muted` | `#5E6270` | Secondary text, labels, captions, axis labels |
| `--faint` | `#8B8F9C` | Placeholders, disabled text, decorative only (fails 4.5:1) |
| `--border-strong` | `#D5D8E0` | Input borders, hover borders |
| `--border` | `#E7E9EE` | Card and table borders, dividers |
| `--soft` | `#F6F7F9` | Section bands, allowance panels, table section rows, segmented tray |
| `--canvas` | `#FBFBFC` | The app shell behind cards |
| `--card` | `#FFFFFF` | Cards, inputs, popovers, the page panel |

### Status

| Token | Hex | Soft fill | Use |
|---|---|---|---|
| `--success` | `#15803D` | `#EAF6EE` | Up deltas, included checks, passed, live |
| `--warning` | `#B45309` | `#FDF3E2` | Needs attention, partial |
| `--danger` | `#B91C1C` | `#FCECEC` | Down deltas, failed, destructive buttons |
| `--info` | `#0943B0` | `#EEF3FD` | Same as Signal Blue |

Status colors mean status only. A green button or a red heading is never allowed.

### Data colors

| Token | Hex | Use |
|---|---|---|
| `--data-you` | `#0943B0` | Your brand, always |
| `--data-1` | `#1F2937` | First competitor |
| `--data-2` | `#6B7280` | Second competitor |
| `--data-3` | `#A3A8B3` | Third competitor |
| `--data-rest` | `#E5E7EB` | Everyone else |
| `--rank-top3` | `#15803D` | Rank 1 to 3 (map dots, rank badges) |
| `--rank-top10` | `#B45309` | Rank 4 to 10 |
| `--rank-top20` | `#C2410C` | Rank 11 to 20 |
| `--rank-out` | `#B91C1C` | Not in the top 20 |

The rank colors are dark enough to carry white numbers at 12px bold (all pass 5:1 on white text).

### How much of each

| Share of a screen | Colors |
|---|---|
| ~80% | `--card`, `--canvas`, `--soft`, `--border` |
| ~15% | `--ink`, `--ink-2`, `--muted` |
| ~5% | `--signal` and its tints |
| Rare | Status colors, only where a state needs it |
| Once at most | `--spark` |

### Contrast (measured, WCAG 2.1)

| Text | Ground | Ratio | Passes |
|---|---|---|---|
| `#171717` ink | `#FFFFFF` | 17.9:1 | AAA |
| `#3F4250` ink-2 | `#FFFFFF` | 10.0:1 | AAA |
| `#5E6270` muted | `#FFFFFF` | 6.1:1 | AA |
| `#5E6270` muted | `#F6F7F9` soft | 5.7:1 | AA |
| `#8B8F9C` faint | `#FFFFFF` | 3.2:1 | Large text only |
| `#0943B0` signal | `#FFFFFF` | 8.6:1 | AAA |
| `#FFFFFF` | `#0943B0` signal | 8.6:1 | AAA |
| `#0943B0` signal | `#EEF3FD` soft | 7.7:1 | AAA |
| `#072F80` signal-strong | `#EEF3FD` soft | 10.9:1 | AAA |
| `#15803D` success | `#EAF6EE` | 4.5:1 | AA |
| `#B45309` warning | `#FDF3E2` | 4.6:1 | AA |
| `#B91C1C` danger | `#FCECEC` | 5.7:1 | AA |
| `#4F7FE0` sky | `#FFFFFF` | 3.9:1 | Never use for text |

### Dark theme

| Token | Light | Dark |
|---|---|---|
| `--canvas` | `#FBFBFC` | `#0E1015` |
| `--card` | `#FFFFFF` | `#151821` |
| `--soft` | `#F6F7F9` | `#1B1F29` |
| `--border` | `#E7E9EE` | `#262B37` |
| `--border-strong` | `#D5D8E0` | `#343A48` |
| `--ink` | `#171717` | `#EDEEF2` |
| `--ink-2` | `#3F4250` | `#C9CCD5` |
| `--muted` | `#5E6270` | `#A3A7B3` |
| `--faint` | `#8B8F9C` | `#6B7080` |
| `--signal` | `#0943B0` | `#5B87EA` (text and borders) |
| `--signal-fill` | `#0943B0` | `#3D6FE0` (button fill, white text 4.6:1) |
| `--signal-strong` | `#072F80` | `#7EA2F2` |
| `--signal-soft` | `#EEF3FD` | `rgb(91 135 234 / 0.14)` |

Dark is a palette swap only: same layout, same radii, shadows drop to near zero and borders carry the edges.

---

## Typography

### Families

| Role | Family | Fallback |
|---|---|---|
| Everything (UI, body, headlines, numbers) | **Geist** 400, 500, 600 | `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` |
| Code, API keys, ids, URLs in tables | **Geist Mono** 400, 500 | `ui-monospace, SFMono-Regular, Menlo, monospace` |

Both are free on Google Fonts (SIL Open Font License). Load them with `next/font/google`. One family keeps the look calm; headlines get their character from weight 600 and tight letter-spacing.

### Type scale

All sizes in px. Letter-spacing in em. Line height as a number.

| Token | Size | Line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display-xl` | clamp(36, 4.5vw, 60) | 1.08 | 600 | −0.045 | Website hero only. `text-wrap: balance`, max 22ch |
| `display` | 36 (30 on phones) | 1.15 | 600 | −0.035 | Website section titles |
| `h1` | 28 | 1.2 | 600 | −0.03 | App page title |
| `h2` | 22 | 1.3 | 600 | −0.025 | Card group titles, first-screen headline in the app |
| `h3` | 18 | 1.35 | 600 | −0.02 | Card titles on the website, dialog titles |
| `h4` | 15 | 1.4 | 600 | −0.01 | Card titles in the app |
| `price` | 44 | 1 | 600 | −0.05 | Plan prices |
| `stat` | 24 | 1.2 | 600 | −0.025 | Stat row numbers (tabular) |
| `stat-lg` | 32 | 1.1 | 600 | −0.03 | The lead number on a tile |
| `body-lg` | 18 | 1.75 | 400 | 0 | Website lead paragraphs, max 760px wide |
| `body` | 16 | 1.6 | 400 | 0 | Website body |
| `ui` | 14 | 1.45 | 400 / 500 | 0 | App default: body, buttons, inputs, table cells |
| `small` | 13 | 1.5 | 400 / 500 | 0 | Secondary text, allowance rows, plan subtitles |
| `caption` | 12 | 1.35 | 400 / 500 | 0 | Axis labels, helper meta, badge text |
| `micro` | 11 | 1.45 | 600 | +0.08 uppercase | Popover headings, table group labels. Use rarely |
| `eyebrow` | 14 | 1.4 | 600 | 0 | Section kicker above a headline, in `--signal-strong` |
| `eyebrow-caps` | 12 | 1.35 | 600 | +0.12 uppercase | Kicker on feature cards (Starter, Growth) |

### Rules

- Every number that can sit in a column uses `font-variant-numeric: tabular-nums`.
- Headlines use `text-wrap: balance`; long words use `overflow-wrap: anywhere`.
- Body text never wider than 65 characters (`max-width: 760px` at 18px, `680px` at 16px).
- Headings are one colour: `--ink`. No two-tone headlines, no gradient text.
- Weights: 400 for reading, 500 for UI emphasis and buttons, 600 for headings and numbers. Never 700 or bolder.
- Muted text is `--muted`, never a lighter opacity of ink.
- Never all caps for more than 3 words, and never for buttons.

---

## Spacing and layout

### Spacing scale (4px grid)

| Token | px | Typical use |
|---|---|---|
| `space-0.5` | 2 | Icon to text nudge |
| `space-1` | 4 | Tight gaps inside badges |
| `space-1.5` | 6 | Dot to label |
| `space-2` | 8 | Icon to label, chip gaps |
| `space-2.5` | 10 | List row gaps |
| `space-3` | 12 | Button group gaps, small card padding |
| `space-4` | 16 | Default gap, inner padding of panels |
| `space-5` | 20 | Card grid gap, phone side gutter |
| `space-6` | 24 | Card padding |
| `space-8` | 32 | Desktop side gutter, gap between stat columns |
| `space-10` | 40 | Gap between a header block and its content |
| `space-12` | 48 | Gap between major blocks inside a section |
| `space-16` | 64 | Section padding on phones |
| `space-24` | 96 | Section padding on desktop |

### Website layout

- Container: `max-width: 1280px`, side padding 20px (phone) / 32px (desktop).
- Section rhythm: `padding-block: 64px` on phones, `96px` from 1024px. Sections are split by a 1px `--border` line or a change to `--soft` background.
- Section header: eyebrow, then headline 12px below, then lead 16px below. On wide screens the header may split into two columns: title left, a short paragraph right aligned to its bottom (`grid-template-columns: 1fr 420px; align-items: end; gap: 64px`).
- Card grids: 1 column on phones, 2 from 768px, 3 or 4 from 1280px, gap 20px.

### App layout

| Part | Size |
|---|---|
| Sidebar | 248px wide, `--canvas` background, collapses to 64px icons below 1024px |
| Page panel | White `--card`, 16px radius, 1px border, sits 8px inside the canvas on desktop |
| Page header bar | 56px tall: breadcrumb left, brand switcher, actions right |
| Content | `max-width: 1240px`, padding 32px desktop / 16px phone |
| Gap between blocks | 16px between cards in a row, 24px between rows |

### Breakpoints

| Name | Min width |
|---|---|
| `sm` | 640px |
| `md` | 768px |
| `lg` | 1024px |
| `xl` | 1280px |

Every screen must work at 400px wide with no sideways page scroll. Tables scroll inside their own card.

---

## Shape: radius, borders, elevation

### Radius

| Token | px | Use |
|---|---|---|
| `radius-xs` | 4 | Skeleton bars, chart bar ends |
| `radius-sm` | 6 | Checkboxes, small inline chips, map rank badges |
| `radius-md` | 10 | **Buttons**, inputs, selects, menu rows |
| `radius-lg` | 12 | Panels inside a card (allowance list, notes), popovers, tooltips |
| `radius-xl` | 16 | **Cards**, dialogs, the app page panel |
| `radius-2xl` | 24 | Feature panels on the website (the upgrade-path strip) |
| `radius-full` | 9999 | Segmented switches, badges and tags, avatars, logo chips, toggle switches |

A card inside a card takes the next size down (16 outside, 12 inside).

### Borders

- 1px solid `--border` on every card, table and panel.
- Inside a soft panel, row dividers use `--border` at 60% opacity.
- Dashed 1px borders mean "custom" or "optional": a custom-plan chip, a drop zone, a point with no answer.
- Hover on an interactive card: border becomes `rgb(23 23 23 / 0.2)`.
- Never a 2px or darker frame. The only 2px line is the Signal Blue bar across the top of a highlighted table column.

### Elevation

| Token | Value | Use |
|---|---|---|
| `shadow-xs` | `0 1px 2px rgb(16 24 40 / 0.04)` | Resting cards, tables, inputs |
| `shadow-sm` | `0 1px 2px rgb(16 24 40 / 0.05), 0 1px 3px rgb(16 24 40 / 0.06)` | Selected pill in a segmented switch |
| `shadow-md` | `0 4px 12px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.04)` | Recommended card, sticky bars |
| `shadow-lg` | `0 18px 36px -18px rgb(16 24 40 / 0.22), 0 1px 2px rgb(16 24 40 / 0.04)` | Card on hover, popovers, mock UI cards in illustrations |
| `shadow-xl` | `0 24px 48px -12px rgb(16 24 40 / 0.18)` | Dialogs |
| `ring-signal` | `0 0 0 4px rgb(9 67 176 / 0.15)` | Recommended card, focused input |

Hover lift on interactive cards: `transform: translateY(-2px)` with `shadow-lg`, 200ms ease-out.

---

## Backgrounds and atmosphere

Atmosphere is for the website, the first screen of a tool and empty states. Working screens stay flat white and grey.

| Device | Recipe |
|---|---|
| **Top glow** | `radial-gradient(circle at 72% 8%, var(--signal-soft), transparent 48%)`, 440px tall, masked to fade out at the bottom. One per page, at the top. |
| **Dot grid** | `radial-gradient(var(--border) 1px, transparent 1px)` at `22px 22px`, masked with an ellipse so it fades at the edges, 70% opacity. Behind plan cards and illustrations. |
| **Soft blobs** | 560 to 620px circles of `--signal` at 4.5% to 7% opacity, `blur(150px)`, one top-right and one bottom-left. Only behind a full pricing or feature band. |
| **Top hairline** | 1px line across the top of a band: `linear-gradient(to right, transparent, rgb(9 67 176 / 0.35), transparent)`. |
| **Section wash** | `linear-gradient(to bottom, rgb(9 67 176 / 0.05), transparent)` over the first 560px of a highlighted band. |

Never more than two devices at once. Never a gradient on a button, a heading or a card fill.

---

## Icons and logos of other products

### Icons

- Line icons, 1.5px stroke, round caps and joins, `currentColor`. Lucide is the reference set.
- Sizes: 12px inside badges and checks, 16px in buttons and rows, 20px in empty states.
- An icon in a button sits 8px from its label. Icon-only buttons are 36px square with a tooltip.
- **Check:** a 20px circle in `--success` at 10% with a 12px check in `--success` means "included".
- **Not included:** an em dash in `--muted` at 70%.
- **Arrow:** a right arrow (→ or a 16px arrow icon) ends every link that moves forward; a down arrow means "jump to this section".
- **Plus/minus:** FAQ rows open with a plus that turns 45° into an ×.

### Logos of AI platforms and other tools

- Always show the logo (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews, Copilot, Grok) with its name as the label or tooltip.
- In a row of several, each logo sits in a 24px white circle with a 1px card-coloured border, overlapping by 4px (`-space-x-1`).
- In a list, each logo sits in a 24px circle with a 1px `--border` and `--canvas` fill, 8px from its name.
- Brand colours of other products stay as they are inside their logos and nowhere else.

---

## Motion

| Token | Duration | Use |
|---|---|---|
| `fast` | 120ms | Colour and border changes on hover |
| `base` | 180ms | Tooltips, popovers, pill switch, tab change |
| `move` | 200ms | Card lift, button press |
| `slow` | 500ms | Illustration hover moves, chart draw |

Easing: `cubic-bezier(0.2, 0.8, 0.2, 1)` for entering and moving, `ease-in` for leaving. Animate `transform`, `opacity`, `background-color`, `border-color` and `box-shadow` only.

- Hover on cards: lift 2px. Hover on illustration pieces: move 4px in a different direction each.
- Tooltips: fade in and rise 4px.
- Numbers never count up. Charts may draw once on first view.
- Everything stops under `prefers-reduced-motion: reduce`.

---

## Components

Each component lists its anatomy, sizes, states and rules. Class names are the v10 names in `src/app/brand-v10.css`; React components live in `src/components/ui.tsx`.

### Button

| Variant | Fill | Text | Border | Hover |
|---|---|---|---|---|
| **Primary** | `--signal` | white, 500 | none | `--signal-strong` |
| **Secondary** | `--card` | `--ink`, 500 | 1px `--border` | fill `--soft` |
| **Ghost** | transparent | `--ink-2` | none | fill `--soft` |
| **Link** | none | `--signal`, 500 | none | underline 1px, 3px offset |
| **Danger** | `--danger` | white | none | 10% darker |

| Size | Height | Padding | Text |
|---|---|---|---|
| `sm` | 32px | 0 12px | 13px |
| `md` (default) | 40px | 0 16px | 14px |
| `lg` | 44px | 0 20px | 14px, 600 |

- Radius 10px on every size. No shadow, no ring, no gradient.
- Focus: `outline: 2px solid var(--signal); outline-offset: 2px`.
- Disabled: 50% opacity, no hover.
- Loading: the label stays, a 14px spinner replaces the icon.
- One primary button per view. Secondary actions are secondary or ghost.
- Full-width buttons only inside cards and on phones.
- A primary button may end with a right arrow icon when it moves forward ("Choose a plan →").

### Segmented switch

A pill tray for switching a view (Monthly / Annual, Ranks / Change / Head to head).

- Tray: `--soft`, 1px `--border`, `radius-full`, 4px padding, 2px gap.
- Item: 36px tall, 16px side padding, 14px 500, `--muted`.
- Selected item: `--card` fill, `--ink` text, `shadow-sm`, `radius-full`.
- A small status pill may sit inside an item ("Save about 15%" in success soft).
- Never used for page tabs. Page sections use Tabs.

### Tabs

- Text tabs with a 2px underline in `--signal` on the selected tab, 14px 500.
- Unselected `--muted`, hover `--ink`.
- 40px tall, 20px gap, a 1px `--border` line under the whole row.

### Input, select and textarea

- 40px tall (inputs, selects), 10px radius, 1px `--border-strong`, `--card` fill, 14px text, 12px side padding.
- Placeholder `--faint`. Label above in 13px 500 `--ink`, 6px gap. Help text below in 12px `--muted`.
- Focus: border `--signal`, plus `ring-signal`.
- Error: border `--danger`, message below in 12px `--danger`.
- Search bars on tool screens: 48px tall inside a card, with the action button at 48px on the right.
- Never the browser's own `<select>`, `alert`, `confirm` or `prompt`. Use the app's `Select` and dialogs.

### Checkbox, radio and toggle

- Checkbox 16px, `radius-sm`, checked fill `--signal` with a white check.
- Toggle 36 × 20px, `radius-full`, off `--border-strong`, on `--signal`, white 16px knob.

### Badge (dot badge)

Small pill that names a state or a highlight.

- 24px tall (20px small), `radius-full`, 10px side padding, 12px 600.
- Leading 6px dot in `currentColor`.
- Tones: signal (`--signal` on 10% signal), success, warning, danger, neutral (`--ink-2` on `--soft`).
- "Recommended" on a plan card is a signal badge.
- "Custom plan" uses a 1px dashed signal border at 60% with no fill.

### Tag (label chip)

For filters and categories. 28px, `radius-full`, 1px `--border`, `--card`, 13px 500. Selected: `--signal-soft` fill, `--signal-strong` text, border `--signal` at 30%.

### Card

The base surface.

- `--card`, 1px `--border`, `radius-xl` (16px), `shadow-xs`, padding 24px (20px on phones).
- Card header: title (h4 in the app, h3 on the site) left, actions right, 16px below to content.
- Interactive card: hover lifts 2px, `shadow-lg`, border to 20% ink, 200ms.
- **Highlighted card** (the recommended plan, your brand's tile): border `--signal` at 60%, `shadow-md`, `ring-signal`, and a top wash `linear-gradient(to bottom, var(--signal-tint), transparent)` 144px tall.
- Never nest more than one level. A panel inside a card uses `--soft` fill and `radius-lg` with no shadow.

### Plan card

Anatomy top to bottom: muted kicker (13px 500), plan name (24px 600 −0.03em) with optional badge on the right, one-line description (14px muted), price block (44px number, "/ month" muted, old price struck through in muted 80%), a note line (13px muted), the full-width button, a divider, a "What you can do" list with check circles, and an allowance panel (`--soft`, `radius-lg`) of label / value rows.

### Stat row

How a screen shows its key numbers. No boxes around each number.

- Each stat: number on top (24px 600 tabular, −0.025em), label below (14px `--muted`), 4px gap.
- Columns: 2 on phones, 3 at 640px, 5 at 1024px. Gap 24px across, 20px down.
- A delta badge may sit right of the number.
- An interactive stat (opens a popover) shows a dotted underline on its label.

### Tile (stat tile with a visual)

For dashboards: a card with a 12px muted label at the top and one visual with its number below (ring, donut, stacked bar, small matrix). All tiles in a row share one height.

### Allowance list

A `--soft` panel, `radius-lg`, 16px padding, title 13px 600, then `<dl>` rows: 36px min height, label in 70% ink, value right-aligned 500 tabular. Rows split by 60% `--border` lines. A footer link in `--signal` 12px 500 ("Compare all features ↓").

### Table

- Lives inside a card with `overflow: clip` and the card's radius.
- Header row: 12px 500 `--muted`, 16px vertical padding, sticky at the top on long tables with `--card` background.
- Section rows: `--soft` at 50% fill, 12px 500 70% ink, 8px vertical padding.
- Body rows: 14px vertical padding, 20px side padding, 1px `--border` at 60% between rows, hover fill `--soft` at 40%.
- First column: labels in 75% ink, 400. Values: 500 tabular.
- A term with a definition has a dashed underline (`decoration-dashed`, 30% muted) and a tooltip.
- **Highlighted column** (your plan, your brand): every cell gets `--signal-tint`; the header gets a 2px `--signal` bar across its top.
- Check circle for included, an em dash for not included, "Custom" in text.

### Tooltip and popover

- `--card`, 1px `--border`, `radius-lg`, `shadow-lg`, 12px 14px padding, 13px text.
- Optional heading: `micro` style (11px 600 uppercase, +0.08em, `--muted`).
- Opens on hover and on focus, 180ms fade and rise, from a floating layer so nothing clips it.

### FAQ (accordion)

- A list of `<details>` rows split by 1px `--border` lines, with one line above the first row.
- Question: 16px 500, 44px min height, plus icon on the right in `--muted`.
- Answer: 14px `--muted`, max 760px, 12px below the question.
- Open state turns the plus 45°.

### Callout

- `--soft` fill, `radius-lg`, 16px padding, 14px `--ink-2`.
- Tones swap the fill for the status soft colour and add a 16px status icon on the left.
- Never used for help text in a working screen.

### Dialog

- `--card`, `radius-xl`, `shadow-xl`, max 480px (small) or 640px, 24px padding.
- Title h3, body 14px `--ink-2`, buttons right-aligned: secondary then primary (danger for deletes).
- Backdrop `rgb(14 16 21 / 0.4)`.

### Toast

- Bottom right, 360px max, `--card`, `radius-lg`, `shadow-lg`, 14px text, optional action link in `--signal`. 5s, pausable on hover.

### Skeleton and loading

- Skeleton bars: `--ink` at 7% to 14%, 6px tall, `radius-full`, widths 40px to 80px.
- Loading a section: skeleton rows in the shape of the content. Never a lone spinner for a whole page, never the word "Loading…".

### Navigation

**Website nav:** 64px, white, logo left, menu triggers (14px 500 with a 12px chevron) center-left, "Pricing" as a plain link, actions right: "Log in" plain link, "Book a demo" plain link, primary button "Start free". Dropdowns are 640px flyout cards (`radius-xl`, `shadow-lg`) with rows of name, one-line description and a right arrow that slides 2px on hover.

**App sidebar:** `--canvas`, 248px. Workspace switcher at the top. Group labels 12px 500 `--muted`, 24px above each group. Items 36px, 14px, 16px icons, `radius-md`; hover `--soft`; selected `--signal-soft` fill with `--signal-strong` text and icon. Usage meter and Settings at the bottom.

**App page header:** 56px, breadcrumb (`--muted` / `--ink` 500 for the current page), brand switcher as a secondary button, page actions on the right.

### Empty state and first screen

- First screen of a tool: eyebrow, h2 headline, one lead line (16px `--muted`, max 640px), the tool's search bar or main button, then a grid of feature cards. Each card has a 160px illustration area (`--soft` with the dot grid, a small mock of the real UI) and a title plus one sentence.
- Empty state inside a working screen: a 20px icon in a 40px `--signal-soft` circle, a 15px 600 title, one 14px `--muted` line, one button.

### Illustration cards (mock UI)

Small, honest pieces of the product used on the website and first screens.

- A white card (`radius-lg`, 1px `--border`, `shadow-lg`) 240 to 260px wide.
- Contents drawn with skeleton bars, a brand chip (24 to 28px Signal Blue square, `radius-md`, with a white 10px square inside), real-looking numbers (10px 500 tabular) and one accent element in `--signal`.
- One or two floating chips (a notification, "MCP", "API" in Geist Mono 10px) overlap the card edge and move on hover.
- Sit on the dot grid with a 224px soft blue glow behind (`blur-3xl`, 15% signal).

---

## Patterns

### Page header (website)

Eyebrow (14px 600 `--signal-strong`), `display-xl` headline, `body-lg` lead in `--muted`, then a primary button. Below, a stat row with a 14px 600 title and a 14px muted subtitle above it.

### Pricing band

`--soft` at 70% background, the dot grid and two soft blobs, a top hairline. Header split left (eyebrow, display, lead) and right (billing switch). A summary strip card split into 3 cells by dividers (included note, platform logos, a region count). Then 4 plan cards in a row with the recommended card highlighted, then the comparison table.

### Upgrade path strip

One card, `radius-2xl`, 3 columns split by 1px dividers. Each column: a 240px illustration area on `--soft` at 55% with the dot grid and glow, then the caps eyebrow, an h3, a 14px muted paragraph and a "Best for" line above a divider.

### Dashboard screen (app)

Page title, then a row of equal tiles, then the main card (often list plus chart or map), then a row of equal cards whose bottoms align. Detail panels open from the right or as a floating card that closes with ×.

---

## Data visualization

- **You are always Signal Blue.** Competitors are dark to light grey in rank order (`--data-1` to `--data-3`), everyone else `--data-rest`.
- **Lines:** 2px, round joins, one area fill under the main line (`--signal` 18% to 0% top to bottom), an emphasized endpoint (3.5px white dot with a 2px signal stroke and an 8px 18% halo).
- **Grid:** dashed 2 4 lines in `--border`, 3 or 4 of them. No vertical grid lines.
- **Axis labels:** 11 to 12px `--muted`, tabular.
- **Bars:** `radius-xs` ends, 2px gaps in stacked bars, track `--soft`.
- **Donuts:** 9px ring on a 76px box, your share first from 12 o'clock, center label 13px 600 tabular.
- **Rank maps:** 30px dots with white 11.5px 600 numbers in the rank colors, a 2px white border and `shadow-sm`; a 3px ink ring on the selected dot; dashed white dot with "?" for no answer.
- **Deltas:** a badge with an up or down arrow: success soft for good, danger soft for bad. Lower-is-better metrics (rank) flip the colors.
- Every chart has a legend or direct labels. Never colour alone: pair it with a number, a label or a position.

---

## Accessibility

- Text meets 4.5:1 (body) and 3:1 (18px+ or 14px 600+) against its ground. The contrast table above lists the safe pairs.
- `--faint` and `--sky` never carry text that has to be read.
- Every interactive element has a visible focus: 2px `--signal` outline, 2px offset.
- Touch targets at least 40 × 40px (44px for the main CTA).
- Icon-only buttons have an `aria-label` and a tooltip.
- Charts have a text alternative: a summary line or a table.
- Motion stops under `prefers-reduced-motion`.
- Text never truncates with an ellipsis. It wraps.

---

## Token reference

The full set, as CSS custom properties in `src/app/brand-v10.css`.

```css
:root {
  /* Brand */
  --signal: #0943B0;
  --signal-fill: #0943B0;
  --signal-strong: #072F80;
  --signal-soft: #EEF3FD;
  --signal-tint: rgb(9 67 176 / 0.045);
  --signal-ring: rgb(9 67 176 / 0.15);
  --sky: #4F7FE0;
  --spark: #F5B70A;

  /* Neutrals */
  --ink: #171717;
  --ink-2: #3F4250;
  --muted: #5E6270;
  --faint: #8B8F9C;
  --border-strong: #D5D8E0;
  --border: #E7E9EE;
  --soft: #F6F7F9;
  --canvas: #FBFBFC;
  --card: #FFFFFF;

  /* Status */
  --success: #15803D;  --success-soft: #EAF6EE;
  --warning: #B45309;  --warning-soft: #FDF3E2;
  --danger:  #B91C1C;  --danger-soft:  #FCECEC;

  /* Data */
  --data-you: #0943B0;
  --data-1: #1F2937;
  --data-2: #6B7280;
  --data-3: #A3A8B3;
  --data-rest: #E5E7EB;
  --rank-top3: #15803D;
  --rank-top10: #B45309;
  --rank-top20: #C2410C;
  --rank-out: #B91C1C;

  /* Type */
  --font-sans: "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Radius */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  --radius-full: 9999px;

  /* Elevation */
  --shadow-xs: 0 1px 2px rgb(16 24 40 / 0.04);
  --shadow-sm: 0 1px 2px rgb(16 24 40 / 0.05), 0 1px 3px rgb(16 24 40 / 0.06);
  --shadow-md: 0 4px 12px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.04);
  --shadow-lg: 0 18px 36px -18px rgb(16 24 40 / 0.22), 0 1px 2px rgb(16 24 40 / 0.04);
  --shadow-xl: 0 24px 48px -12px rgb(16 24 40 / 0.18);
  --ring-signal: 0 0 0 4px rgb(9 67 176 / 0.15);

  /* Motion */
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms;
  --dur-base: 180ms;
  --dur-move: 200ms;
  --dur-slow: 500ms;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --canvas: #0E1015; --card: #151821; --soft: #1B1F29;
    --border: #262B37; --border-strong: #343A48;
    --ink: #EDEEF2; --ink-2: #C9CCD5; --muted: #A3A7B3; --faint: #6B7080;
    --signal: #5B87EA; --signal-fill: #3D6FE0; --signal-strong: #7EA2F2;
    --signal-soft: rgb(91 135 234 / 0.14);
    --shadow-xs: none; --shadow-sm: none;
    color-scheme: dark;
  }
}
```

### Tailwind mapping

| Tailwind | Token |
|---|---|
| `bg-signal`, `text-signal`, `border-signal` | `--signal` |
| `bg-signal-soft` | `--signal-soft` |
| `text-ink`, `text-ink-2`, `text-muted`, `text-faint` | neutrals |
| `bg-soft`, `bg-canvas`, `bg-card` | surfaces |
| `border-line`, `border-line-strong` | `--border`, `--border-strong` |
| `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full` | 10, 12, 16, 24, pill |
| `shadow-xs` to `shadow-xl`, `shadow-ring` | elevation |

Never write a hex value in a component. Use a token.

---

## Moving the app to v10

The app keeps its class names; the look changes underneath.

1. **One stylesheet.** Add `src/app/brand-v10.css` with the tokens above and the component classes (`aw-btn`, `aw-frame`, `aw-input`, `aw-status`, `aw-table`, `aw-chip`, `aw-tabs`). Load it last in `globals.css`, then delete the eight older layers one at a time, checking screens after each.
2. **Fonts.** Swap Inter and Funnel Display for Geist in `layout.tsx` via `next/font/google`. Keep Geist Mono.
3. **Shared parts.** Update `Card`, `Seg`, `StatStrip` (becomes a stat row), `Delta`, `Tag` and `Select` in `src/components/ui.tsx` to match the Components section.
4. **Screens.** Check the 10 busiest screens at 1440px and 400px in light and dark: Prompts, Competitors, Keyword Research, Local Research, Backlinks, Site Audit, Content Map, Editorial Calendar, Reports, Settings.
5. **Emails, PDF and website.** Update `src/lib/emailKit.ts`, `src/lib/pdf/design.ts` and `public/brand/arrowsterr-brand.css` to the same tokens.
6. **Tests.** Extend `tests/ui-rules.test.ts` (or add one) to fail on raw hex values in components, on `<select>`, and on more than one `aw-btn--primary` per screen file where practical.

---

## Running cost

v10 adds nothing to the monthly bill. Geist and Geist Mono are free (SIL Open Font License) and served from the app's own domain by `next/font`; the stylesheet is a static file. Beta (50 teams): $0. Growth (500 teams): $0.
