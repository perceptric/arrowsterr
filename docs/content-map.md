# Content Map

The Content Map (Content, Content Map, at `/content-map`) shows a brand's topics as bubbles grouped around pillars: what it covers, what its rivals win and it doesn't, what's under way, and where two of its own pages compete. It is step 5 of the new tools plan.

## What it shows

- **Five numbers:** topics, covered, missing, pages competing and in progress.
- **The map:** one ring of topics around each pillar, bubble size by searches.
  - **Colors:** green covered, blue in progress, red dashed missing, amber two pages competing.
  - **Star:** AI answers name the brand for that topic.
  - **Lines** run from each pillar's main page: solid when that page links to the topic's page, dashed when it doesn't, dotted when it wasn't checked.
- **Filters:** All, Missing, Competing, Named by AI, Link missing.
- **Topic panel:** searches, the brand's visits or whether AI names it, the brand's page (both pages when they compete), which rivals rank, the keywords, and **Add to Content Plan** for topics without a page.
- **Pillar panel:** its main page, the missing topics by searches, and **Add internal links**. This prepares a change set on the main page in the brand's CMS (the existing links play), reviewed and applied in a side panel.

## How it's built

All rules are in `src/lib/contentMap.ts` (pure, tested in `tests/contentMap.test.ts`). Builds run on the worker (`src/lib/contentMapServer.ts`, job kind `content_map`).

1. **What the brand ranks for:** DataForSEO Labs ranked keywords, 300 rows. Keywords group by the page that ranks top 20 for them: one page, one topic, named by its keyword with the most searches.
2. **Competing pages:** two pages whose main keywords mean the same thing (at least 60% of their meaningful words shared) become one amber topic with both pages.
3. **Missing topics:** up to 2 rivals from the brand profile, 200 rows each. A rival page ranking top 10 for keywords with 30 or more searches, where the brand doesn't rank top 20, is a missing topic. When it matches a brand topic, the rival is noted on that topic instead.
4. **Content Plan:** a planned topic is marked planned. Brief or writing turns missing into in progress. Published with a URL counts as covered. Plan pieces with no match become topics of their own.
5. **Room:** the 60 biggest topics, half for what the brand has and half for what it lacks, so neither crowds out the other.
6. **Pillars:** one Claude call groups topics into 3 to 8 pillars. Its answer is used only if it puts every topic in exactly one pillar. Otherwise topics join the word they share with the most other topics, and the rest go to Other.
7. **AI:** a topic is named by AI when a prompt of the last 30 days, using at least 75% of its words, had the brand in its answer.
8. **Links:** each pillar's main page is its covered topic with the most visits. That page is read, and each other topic page in the pillar is marked linked or not, with or without www or a trailing slash. A main page that doesn't load leaves its topics unchecked: a page that didn't load says nothing about its links.

## Reliability

- **A failed build hands its 40 tasks back.** The charge is saved on the build.
- **No duplicate builds:** starting again within 20 minutes opens the build already running.
- **Unchecked is never "not linked."** Only a page that loaded can say a link is missing.
- **Nothing is cut from the drawing.** Every bubble stays inside the drawing (tested), and a pillar with more than 21 topics gets a tighter outer ring instead of dropping any.

## Data

- `supabase/065_content_map.sql` adds `content_maps`: one row per build with its result. Viewers may read.
- `/api/content-map` takes `start`, `plan` and `links` from editors.
- Zippie reads the map with `get_content_map`, and the built-in "Fill the content map" skill picks the missing topics to write first and adds them to the plan.

## Running cost

Per build:
- 3 DataForSEO Labs ranked keywords calls, about 700 rows: about $0.10 (check).
- One Claude Sonnet call of about 1K tokens in and 500 out: about $0.007 (check).
- Plain page loads for the main pages: $0.

That's about $0.11, charged as 40 tasks (about $0.20 of plan value). Add internal links runs the existing links play, already priced in tasks.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Builds, about 2 per team a month (DataForSEO and Claude, check) | ~$11 | ~$110 |
| Main page reads (worker) | $0 | $0 |
| **Monthly total added** | **~$11** | **~$110** |

## Example data

Before the first real result, the tool opens on its start page (`docs/tool-start.md`): what it shows, the example report with numbered parts, how it works, a glossary and common questions, with the tool's real action at the top. "Open the example report" shows this screen on example data from `src/lib/demo.ts`, tagged "Example data", where tabs, filters, panels and the map all work. Buttons that would change real records are off there. It runs in the browser, so it adds $0 a month at Beta and at Growth.
