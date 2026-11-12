# Empty screens: the plan

Every empty screen in Arrowsterr becomes one picture, a short title, one line and one button, like Drafts today. The pictures move to Arrowsterr's own style: the solid isometric blocks of the website's city (arrowsterr.com home page), in Signal Blue. The text-filled first screens (lead paragraphs, feature cards, sample tables, bullet lists) go away.

Written November 2026.

**Shipped (November 2026).** All four phases are in: the 21 pictures (`src/lib/isoArt.ts`), `EmptyScreen` and `EmptyNote` (`src/components/Drawing.tsx`) on every screen below, the 404 and error pages with Zippie, the rule in `docs/brand.md`, and `tests/emptyScreens.test.ts`. `ToolIntro`, `PlanIntro` and the unused Content page went away. Domain Research's title became "See how any site wins search" to stay at six words. Visitors opens Traffic, since the tracking code is set up there.

---

## 1. Summary

- **About 30 screens** change: 12 tool first screens, about 15 empty states inside working screens, 4 small empties in panels, and the 404 page (section 4).
- **One rule for all of them:**
  - A picture.
  - A title of six words or fewer.
  - One line of 90 characters or fewer.
  - One main button.
  - Search tools keep their search bar and three example chips under it.
- **A new set of about 20 pictures** in the website's isometric style (section 3).
- **How long:** about 1 week for one engineer (section 6).
- **What it costs to run:** $0 a month at Beta and at Growth. It's all front end.

---

## 2. What's there today

- **Drafts** uses `EmptyScreen` with `Drawing` (`src/components/Drawing.tsx`). That picture is a line-drawn tile copied from Omniscient: ink outlines, a white top, dotted sides.
- **Ten tools open on `ToolIntro`** (`src/components/ToolIntro.tsx`): a long lead paragraph, example chips and a grid of feature cards with sample charts.
  - The ten: Keyword Research, Domain Research, Traffic, Visitors, Reports, Report schedules, Shared links, Brand Kit, and two older screens.
- **The Editorial Calendar opens on `PlanIntro`:** a bullet list, a sample Content Plan table and a sample piece with tabs.
- **Locked tools open on `Glimpse`:** a feature list and a pitch.
- **Empty lists inside working screens are plain text lines or gray callouts.** Examples: "No prompts yet.", "Nothing has run yet. Checks, Content Plan builds, drafts and bulk analyses show up here.", "This brand has no website yet." (shown in red, as an error).

---

## 3. The pictures

**Style:** the website's city, small.
- Each picture is one object built from solid isometric blocks at the city's 30° angle, standing on a pale ground plate with a soft shadow.
- Three tones per block, like the city's buildings: top light, left mid, right dark.
- No outlines.
- The tool's part of the object is Signal Blue (#0943B0, the logo's blue). The rest is the city's pale blues and grays.
- Dark mode has its own set of tones.

**Sizes:**
- Full: 220 px wide, for a screen.
- Compact: 96 px, for a panel or a list.

**Motion:**
- The blocks drop in one after another, the way the city's districts build on the home page.
- Then the object floats gently.
- With reduced motion on, the picture is still.

**Zippie** appears only on Zippie's own empty screens and the 404 page, as `docs/brand.md` already says.

**The set** (`DrawingKind`):

| Picture | The object |
|---|---|
| drafts | A stack of pages, the top one Signal Blue with text bars |
| calendar | A calendar block with three date tiles raised |
| search | A magnifier leaning on a row of bar towers |
| globe | A globe on a plinth |
| gap | Two towers side by side, the blue one shorter with a gap marked |
| prompts | A speech bubble block with three answer lines |
| waiting | An hourglass block, sand running |
| sources | Two blocks joined by a chain link |
| traffic | Four bar towers rising left to right |
| visitors | A path of tiles with a pin at the end |
| reports | Two report sheets, the front one with a chart |
| clock | A clock tile on a plinth |
| link | A chain link lying on the plate |
| palette | Four color swatches standing in a row |
| lock | A padlock block |
| files | A folder with two sheets |
| gears | Two gears on the plate |
| plug | A plug and a socket block |
| flag | A flag on a small hill |
| chart | A small line chart panel |
| zippie | Zippie on the plate |

---

## 4. Every screen

### Tool first screens (before any data)

| Screen | Picture | Title | Line | Button |
|---|---|---|---|---|
| Keyword Research | search | Find what your buyers search | Type a keyword to see its volume, difficulty and ideas. | Search bar and 3 examples |
| Domain Research | globe | See how any site wins search | Type a domain to see its keywords, pages and rivals. | Search bar and 3 examples |
| Competitive Analysis | gap | Find the keywords rivals win | Add up to 3 rivals to compare their keywords with yours. | The rivals form |
| Editorial Calendar | calendar | Plan 12 weeks of content | Arrowsterr picks the keywords that bring buyers and gives each a date. | Build my plan |
| Drafts | drafts | Write drafts that get cited | Add keywords from the Editorial Calendar to write them here. | Open the Editorial Calendar |
| Traffic | traffic | See every visit from AI | Connect Google Analytics to count visits from AI answers and search. | Connect Google Analytics |
| Visitors | visitors | Meet every visitor | Add the tracking tag to follow each visitor's path to buying. | Get the tracking tag |
| Reports | reports | Your reports land here | Download a PDF from any page and it shows up here. | New report |
| Report schedules | clock | Send reports on a schedule | Pick a brand, its pages and who gets them. | New schedule |
| Shared links | link | Links you share land here | Click Share on Prompts or Competitors to make one. | None |
| Brand Kit | palette | Give reports your brand's look | Arrowsterr reads your site's colors, fonts and logo. | Learn from my site |
| Locked tool | lock | Add Organic Research with Pro | One plan change opens it for every brand. | Upgrade, with See plans beside it |

### Empty states inside working screens

| Screen | Picture | Title | Line | Button |
|---|---|---|---|---|
| Prompts, no prompts | prompts | Add the questions buyers ask | Arrowsterr asks 6 AIs every day and tracks how they answer. | Add prompts |
| Prompts, Competitors and Sources, first check running | waiting | Your first check is running | Results show up here when it finishes. | None |
| Sources, nothing in a group | sources (compact) | No sites cited here yet | Try a longer date range. | None |
| Zippie, no chats | zippie | Ask Zippie anything | Zippie knows your prompts, rankings and drafts. | New chat |
| Zippie, no knowledge | files | Add what Zippie should know | Upload a brand guide or a product doc. | Upload |
| Background actions | gears | Nothing has run yet | Checks, plan builds and drafts show up here. | None |
| Settings › Publishing sites | plug | Connect your site | Publish drafts to WordPress, Webflow, Framer and more. | Connect a site |
| Publish panel, no site | plug (compact) | Connect a site first | Drafts publish to this brand's own sites. | Connect a site |
| Brand guidelines, no files | files (compact) | No files yet | Add a style guide or brand book. | Upload |
| No brands (app and Settings) | flag | Add your first brand | Track how AI answers talk about it. Viewers see: Ask an editor or admin to add one. | Add brand (editors) |
| Drafts, brand has no website | globe | Add this brand's website | Drafts need it to write in the brand's voice. | Open settings |
| Research, not set up | search | Research isn't set up yet | An editor opens it once to set it up. | None |
| 404 | zippie | This page isn't here | The link may be old. | Go to Prompts |

### Small empties in panels

These use the compact picture and one line, with no title.

| Place | Picture | Line | Button |
|---|---|---|---|
| Calendar day panel | calendar | Nothing planned this day. | Add content |
| Content results | chart | No published pages yet. | None |
| Article research panel | search | No research for this article yet. | None |
| Trend chart, no results | chart | No results in this period yet. | None |

---

## 5. Build

1. **The art kit**, in `src/lib/isoArt.ts`. It's pure, so tests can cover it.
   - It's a TypeScript copy of the website's iso builder (`pages/home/iso.php` in arrowsterr-site): `box`, `flat`, `cylinder` and `shade`, at the same angle and tones.
   - Each picture is a short list of blocks.
   - `Drawing.tsx` draws them with the drop-in and float motion, in full and compact sizes.
2. **The screens:**
   - `EmptyScreen` gets a `compact` size and an optional `search` slot for the search tools.
   - Every screen in section 4 moves to `EmptyScreen`.
   - Removed: `ToolIntro` with its sample visuals, `PlanIntro` with its sample plan and sample piece, and Glimpse's feature list.
3. **The rules:**
   - `docs/brand.md`, "Empty state and first screen", becomes the rule in section 1. The feature-card first screen comes out.
   - A test in `tests/` fails if `ToolIntro` comes back, or if an `EmptyScreen` title is over six words or its line is over 90 characters.
   - A second test checks that every picture fits its frame and has no broken numbers.

---

## 6. Phases

| Phase | Days | What ships | Done when |
|---|---|---|---|
| 1. The pictures | 2 | Art kit, 21 pictures, light and dark, a demo page to review them | You approve the set |
| 2. Tool first screens | 2 | The 12 screens in the first table | Each tool opens on its picture, title, line and button, with no feature cards |
| 3. Empty states | 1.5 | The working-screen and panel empties, and the 404 | No gray callout or plain "No ... yet" line is left in `src/components` |
| 4. Rules | 0.5 | brand.md, the tests, removing ToolIntro and PlanIntro | Tests pass and the build passes |

---

## 7. Running cost

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Pictures, screens and tests (front end only, no new services) | $0 | $0 |
| **Monthly total** | **$0** | **$0** |
