# RiseLocale brand

October 2026. The tokens and components live in `docs/riselocale/brand.css`. Link it once and use the `rl-` classes. The same system is published as the RiseLocale design system artifact, with live previews of every component.

## What we took from mintlify.com

Pulled from mintlify.com's live stylesheets on October 24, 2026. We kept the structure and changed the identity.

| Mintlify | RiseLocale |
|---|---|
| Brand green `#18e299` / `#0c8c5e` | RiseLocale Cobalt `#3358ff` / `#6b86ff`. Green is taken by the rank heatmap. |
| Warm grays (`#faf8f5`, `#ebe9e6`) | Cool grays leaning toward cobalt (`#f7f8fa`, `#eceef2`) |
| Text as ink at 80%, 60% and 50% alpha | Ink at 80% and 62% (62% passes 4.5:1 on white and on cards) |
| Hairline borders at 4% to 8% alpha, structure lines `#f1f0ee` | Same pattern: `border-sub` at 8%, `border-line` solid. Added `border-control` at 3:1 for inputs. |
| ABC Arizona Flare serif hero, Inter body, Paper Mono numbers | Newsreader hero, Geist body, Geist Mono numbers (all on Google Fonts) |
| 24 / 12 / 4 column grid, 1088px max, 32px margin, 16px gap, 1px rails | The same grid and rails |
| 2px by 24px brand marker on the left rail at each section | The same marker in cobalt |
| Two-tone section headings, 36/40 at -0.72px | The same, with `text-tertiary` for the second line |
| Ink primary button, 4px radius, 0.97 press, arrow that draws in on hover | The same |
| 2px tags, brand-tint tag for live mono numbers, rolling digits | The same, plus the rank colors |
| Easing `.23,1,.32,1`, `.22,1,.36,1`, `.77,0,.175,1`; 100 / 150 / 200 / 500 / 700ms | The same |
| Flat cards, shadows only on floating things | The same |

RiseLocale helps local businesses and the agencies behind them get found on Google Maps and inside AI answers. The look is calm and exact: white ground, hairline rails, one ink button, one cobalt mark. Color carries data (the rank heatmap), so the brand itself stays quiet.

## Voice

- Write short, plain sentences at a 9th grade level. Say what the tool does and what the owner gets: "See where you rank on every street."
- Use the customer's words: "rank", "pin", "listing", "reviews", "show up in ChatGPT". Avoid jargon such as "SERP features" or "entity signals" in marketing copy.
- Lead with real numbers and units: "25 pins", "1 mile apart", "4 of 6 AIs", "Avg rank 8.4 to 4.4".
- Sentence case everywhere, including buttons and headings. No exclamation marks. No emoji.
- Buttons say the action: "Run a free scan", "Connect Google", "Add a business". Never "Click here" or "Learn more" alone.
- Never promise results Google controls. Say "track", "improve", "build". Do not say "guaranteed #1".

## Color

- `bg-main` is the ground of every page and section. `bg-raised` sets off cards, tiles and the map under a geo-grid.
- Text is `text-main` for headings and labels, `text-soft` for quotes and long text, `text-sub` for secondary lines, dates and captions. `text-tertiary` is only for the gray second line of a two-tone heading and footer column titles.
- `bg-invert` is the primary button. Use one per view. Every other button is `rl-btn--secondary`.
- `brand-base` (RiseLocale Cobalt) is a mark, used sparingly: the section marker, the business's own pin, the brand button on product screens and the focus ring. Brand as text is `brand`. A live number sits in a `brand-8` tag with `brand` text.
- The rank scale belongs to data only: `rank-top` (1 to 3), `rank-mid` (4 to 10), `rank-low` (11 to 20), `rank-out` (21 or lower), `rank-none` (not found). The number on a pin is always `on-rank`. Never use a rank color for decoration, buttons or brand moments.
- Status text uses `success`, `warning` or `danger`, always with the word ("Completed", "Processing", "Failed"). `signal` is only the live dot in a Status chip.
- Structure lines are `border-line`. Hairlines around chips, cards and secondary buttons are `border-sub`. Inputs use `border-control`, which meets 3:1.
- No gradients and no glows. Cards stay flat. Only floating things (menus, popovers, the pin detail card) take `shadow-float`.

## Type

- Three families: `display` (Newsreader) for the hero and closing headline only, `sans` (Geist) for everything else, and `mono` (Geist Mono) for numbers that change: ranks, scores, dates and counters.
- `display-xl` is the hero headline, one per page, dropping to `display-md` under 1024px.
- Section headings are `h2` (`h2-sm` on phones), written as two sentences: the claim in `text-main`, then a second line in `text-tertiary`. Example: "Every pin, every engine." then "Rankings and AI answers for each place you serve."
- `body-lg` is the hero subline in `text-sub`, with the two or three key words in `text-main` at 500.
- `label` sets buttons and links. `caption` sets chip and tag text. `stat` and `mono-sm` always use tabular figures.
- Keep running text near 65 characters wide. Headings use `text-wrap: balance`.

## Layout

- Pages sit on a 24-column grid (12 at 768px, 4 below) at most `grid-max-width` wide, with `grid-margin` outside and `grid-gap` between columns.
- Each band sits between 1px rails in `border-line` (`rl-rails`). A full-width rule in `border-line` (`rl-rule`) separates bands. Give each section `space-40` below on desktop and `space-30` on phones.
- Every section opens with a Section header: the 2px by 24px cobalt marker on the left rail, the two-tone heading and one action on the right.
- The header is `header-height` tall, sticky, with a `border-line` rule under it.
- Spacing comes from the 4px scale: `space-1` to `space-40`. Gaps between siblings use `gap`, never margins.

## Shape

- `radius-xs` for tags and the signal chip, `radius-sm` for buttons and inputs, `radius-md` for logo and testimonial tiles, `radius-lg` for feature cards, image cards and the product frame. `radius-full` is only for map pins and the live dot.
- Borders mark objects. Do not stack a border, a fill and a shadow on the same card.

## Motion

- Three speeds: `--dur-press` (100ms) for presses and color, `--dur-hover` (150ms) for hover, `--dur-move` (200ms) for things that slide. `--dur-reveal` (500ms) is for image zoom on story cards, `--dur-count` (700ms) for rolling digits.
- Curves: `--ease-out-strong` for interaction, `--ease-out-soft` for counters and reveals, `--ease-in-out-strong` for the nav highlight that slides between items.
- Buttons press to `scale(0.97)`. The arrow in a button starts at half opacity; on hover its line draws in and it moves 2px right.
- Live numbers roll digit by digit. The Status dot pings once a second.
- Animate transform and opacity only. Turn all of it off under `prefers-reduced-motion`.

## Iconography

- Line icons on a 16px or 20px box, 1.5px stroke, round caps and joins, drawn in `currentColor`. Inside a Stat they sit in `text-tertiary`.
- Search engines and AI assistants show as their own logos with the name as the label (Google, ChatGPT, Claude, Gemini, Perplexity). This system has no logo files yet, so set those names in plain type until the logos are added.
- RiseLocale has no logo mark yet. Set the name "RiseLocale" in `sans` at 600, in `text-main`, until a mark is designed.

## Components

Every component is plain HTML with `rl-` classes from `components/bundle.css`. Use Button, Tag, Signal chip, Status, Section header, Stat, Card, Input, Geo-grid and Scan row. The same CSS ships as one file at `docs/riselocale/brand.css` in the Arrowsterr repo.

## Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg-main` | `#ffffff` | `#08090c` | Page ground, header and every section band. |
| `bg-raised` | `#f7f8fa` | `#111318` | Cards, logo tiles, testimonial tiles and the map ground under a geo-grid. |
| `bg-soft` | `rgba(10,11,15,0.03)` | `rgba(255,255,255,0.05)` | Hover fill on secondary buttons, rows and nav items. Neutral tags. |
| `bg-invert` | `#0a0b0f` | `#ffffff` | The primary button. One per view. |
| `bg-invert-hover` | `#23252b` | `#e4e6eb` | Primary button on hover. |
| `text-main` | `#0a0b0f` | `#ffffff` | Headings, labels, button text on bg-main and bg-raised. |
| `text-soft` | `rgba(10,11,15,0.8)` | `rgba(255,255,255,0.72)` | Quotes and long reading text on bg-main and bg-raised. |
| `text-sub` | `rgba(10,11,15,0.62)` | `rgba(255,255,255,0.62)` | Secondary lines, dates, captions on bg-main and bg-raised (5.5:1 light, 7.5:1 dark). |
| `text-tertiary` | `#686f7f` | `#8b91a0` | The gray second line of a two-tone heading, on bg-main. Footer column titles. |
| `text-invert` | `#ffffff` | `#08090c` | Text on bg-invert. |
| `border-line` | `#eceef2` | `#1c1e24` | Structure: section rails, the header rule, rules between bands. Never around a control. |
| `border-sub` | `rgba(10,11,15,0.08)` | `rgba(255,255,255,0.08)` | Hairline around secondary buttons, chips and cards. |
| `border-control` | `#8c92a0` | `#5f6573` | Input and checkbox borders. Meets 3:1 on bg-main in both themes. |
| `brand-base` | `#3358ff` | `#6b86ff` | RiseLocale Cobalt. Fills: the brand button, the section marker, the business pin on a geo-grid, the focus ring. |
| `brand-base-hover` | `#2443e0` | `#8ea2ff` | Brand button on hover. |
| `on-brand` | `#ffffff` | `#08090c` | Text and icons on brand-base (5.3:1 light, 6.1:1 dark). |
| `brand` | `#2443e0` | `#8ea2ff` | Brand as text: links, live numbers inside brand tags, hover on footer links. |
| `brand-8` | `rgba(51,88,255,0.08)` | `rgba(107,134,255,0.12)` | Ground of a brand tag (live numbers, scores). |
| `brand-20` | `rgba(51,88,255,0.2)` | `rgba(107,134,255,0.28)` | Focus halo on inputs. Selected row ground. |
| `brand-tint` | `#e6ebff` | `#24307a` | Solid brand tint for large blocks on covers and decks. |
| `focus` | `{brand-base}` | `{brand-base}` | 2px focus outline, 2px offset, on every interactive element. |
| `rank-top` | `#3fcf75` | `#3fcf75` | Geo-grid pin ranked 1 to 3. Number in on-rank. |
| `rank-mid` | `#ffc233` | `#ffc233` | Geo-grid pin ranked 4 to 10. Number in on-rank. |
| `rank-low` | `#ff8f4d` | `#ff8f4d` | Geo-grid pin ranked 11 to 20. Number in on-rank. |
| `rank-out` | `#ff6b6b` | `#ff6b6b` | Geo-grid pin ranked 21 or lower. Number in on-rank. |
| `rank-none` | `#c9ced8` | `#3a3f4b` | Pin where the business does not show. Label is a dash. |
| `on-rank` | `#0a0b0f` | `#0a0b0f` | The rank number on every rank fill (7:1 or better). |
| `success` | `#0f7a3d` | `#4ade80` | Text for Completed, Published, Connected. Always with the word. |
| `warning` | `#9a5b00` | `#fbbf24` | Text for Processing, Needs fix. Always with the word. |
| `danger` | `#c4231f` | `#ff7a75` | Text for Failed, Suspended and real errors. Always with the word. |
| `signal` | `#16a34a` | `#22c55e` | The live dot in a Status chip. A mark beside a word, never text. |

## Type styles

| Style | Family | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `display-xl` | display | 50px / 52px | 400 | -2px | The hero headline. One per page. |
| `display-md` | display | 40px / 44px | 400 | -0.8px | Hero headline on phones. The closing call to action. |
| `h2` | sans | 36px / 40px | 500 | -0.72px | Section heading. Second sentence goes on its own line in text-tertiary. |
| `h2-sm` | sans | 28px / 32px | 500 | -0.72px | Section heading under 1024px. |
| `h3` | sans | 24px / 28px | 500 | -0.24px | Card title on large cards. Story headlines. |
| `title` | sans | 16px / 24px | 500 | 0 | Feature card title, table row title, dialog title. |
| `body-lg` | sans | 18px / 24px | 400 | 0 | Hero subline, in text-sub with key words in text-main 500. |
| `body` | sans | 16px / 24px | 400 | 0 | Running text. |
| `body-sm` | sans | 14px / 20px | 400 | 0 | Table cells, card text, testimonials. |
| `label` | sans | 14px / 16px | 500 | 0 | Buttons, nav items, footer links. |
| `caption` | sans | 12px / 16px | 500 | 0.24px | Chip labels, tag text, small meta. |
| `stat` | mono | 36px / 40px | 400 | -0.72px | Proof numbers in a Stat row. Tabular figures. |
| `mono-sm` | mono | 12px / 16px | 500 | 0.24px | Live numbers in brand tags, scan dates, engine scores, pin numbers. |

## Running cost

$0 a month. Fonts load from Google Fonts for free, and the CSS ships inside the app.
