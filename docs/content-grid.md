# Library grid

The Library is a grid of articles, like a sheet. Each row is one article. Each column is one part of it, lettered A, B, C so prompts and people can point at it. The letters only name a column's place right now; nothing about an article's shape is fixed.

Code: `src/components/writer/ContentGrid.tsx` (the grid), `CellPanel.tsx` (one cell in the side panel), `src/lib/articleGrid.ts` (pure: split, move, lock, render), `src/lib/gridData.ts` (reads and saves), `src/lib/gridServer.ts` and `src/app/api/agentic-writer/grid/route.ts` (paid calls). Database: `supabase/054_content_grid.sql`.

## Columns

A Keyword · B Status · C Meta title · D Meta description · E Slug · F H1 · G Intro · H Section 1 · I Section 2 … then the columns people add.

- An article is its saved doc (`docs.content`). The intro is everything before the first H2. Each H2 starts a section that runs to the next one. So a section holds anything the editor can: text, lists, tables, quotes, images and HTML blocks.
- Before an article is written, the section columns show the brief's planned H2s.
- Meta title (`metaTitle`), description and slug live in `docs.meta`, the same place Publish reads them. The H1 is the doc's title.
- Drag a column's header to move it. The order is saved per site in this browser. The section columns move as one block.

## Sections

- Click a cell to open it in the side panel: the full editor, with image upload, interactive module and HTML block buttons.
- Drag a section cell along its row to move that section in the article. Its whole slice moves, images and all.
- **+ Section** at the end of a row, or **Add section after** in the panel, adds one. **Delete** in the panel takes one out.
- An H2 typed inside a cell starts a new section. A section saved without its H2 keeps its old one.

## Locks

Saving a cell by hand locks it (`docs.meta.locked`, by "intro" or the section's H2 in lower case). A regenerated article keeps locked cells as they were (`keepLocked` in `writerServer.ts` saveDoc). A locked section the new draft dropped goes back to its old place. **Unlock** in the panel lets the next regenerate write it again. Every regenerate also saves the old text to `doc_versions` first.

## Generate

- **Generate** on selected rows, or the play button in a row's Status cell, makes the whole article in one go.
- No brief yet: the brief starts with `auto_draft` on. When it's ready, the server approves it and starts the draft (`autoDraft` in `writerServer.ts`). A draft that can't start says why on the brief.
- Brief ready: the brief is approved and the draft starts.
- Article ready: it's regenerated after a confirm. Locked cells stay.
- Status shows the step: Researching, Planning, Writing, Checking, Building modules, Saving, Ready or Failed (the error is the tag's tooltip).
- Drafts count against the plan the same way Generate Draft does.

## One cell at a time

- **Write again** in the panel writes that cell again from the brief and the research, with a note. It knows the text that's there. A section the person added gets a plan from its H2. Costs 15 tasks, like the other writer agents.
- **Interactive module** opens the picker (below) and builds the kind you pick into the cell. Costs 25 tasks, like the other interactive elements.
- **HTML block** puts pasted HTML in a sandboxed frame in the editor. It goes out as written.

## Interactive modules

Embeds that make an article fun to use: built as one self-contained HTML block (inline CSS and JS, no outside files, no network), in the brand's colors, checked by `validateModule` and run in a sandboxed frame in the editor. The catalog is `src/lib/moduleCatalog.ts`: each kind has when it helps, how to build it, the words that call for it and a small picture.

| Kind | When it helps |
|---|---|
| Data table | Metrics, features, prices or specs side by side. Sortable, zebra rows, header in the brand color. |
| Step flow | A process or playbook in order, with a green finish step. Click to mark progress. |
| Layered pyramid | Layers or levels. A 3D SVG pyramid; hover a layer to see its card. |
| Calculator | Costs, savings or ROI the reader works out with sliders. |
| Comparison with filters | Tools or plans compared, narrowed by filter chips. |
| Checklist | Tips or requirements with a progress bar. |
| Quiz | Helping the reader pick the right option. |
| Tabbed explainer | One topic by role, industry or plan. |
| Before and after | A change shown with a draggable divider. |
| Stat cards | Big numbers that count up, each with its source. |
| Interactive funnel | Stages people drop out of, with editable rates. |
| 2 by 2 matrix | Options placed on two axes, with hover cards. |
| Self-assessment | A 1 to 5 scorecard with a grade and next steps. |

- **The brief picks them.** The brief's prompt lists every kind with when it helps, and asks for 1 to 3 that fit the article, never two of the same kind. The draft builds each one with the kind's design added to the build prompt.
- **The panel suggests them.** The picker shows three kinds that fit the open section first (`suggestKinds`: words in the H2 count three times, words in the text once), then all 13. Hover a kind for a bigger picture and when it helps. Pick one, add an optional note, and **Build**: it's built from the section's text and, when the article has one, the brief and its research. A failed check is retried once with the reason.
- Older briefs that name `roi` or `diagram` still build.

## Columns people add

- **+ Column**: a Text column holds what people type. An AI column holds a prompt that reads other columns by letter or name: `Write a LinkedIn post from {{F}} and {{H}}`, or `{{H1}}`.
- The play button runs one cell. The column menu runs every empty cell (or the selected rows), edits the column or deletes it.
- Values live in `writer_cells`. An AI cell costs 3 tasks.

## Views and Publish

Open an article from its Keyword cell. The article view has Edit, HTML, Markdown and Text tabs, each with Copy, plus Export and Publish. Publish uses the CMS connections in Settings, with the row's meta title, description and slug.

## Tests

`tests/moduleCatalog.test.ts`: the 13 kinds, their pictures, the brief's list, suggestions from a section's words, and the build prompt. `tests/articleGrid.test.ts`: split and join give back the same doc, moving a section moves only its slice, a cell's edit goes back into its own slice, an H2 in a cell starts a new section, locked cells survive a regenerate (and a dropped locked section returns to its place), plain text, column letters, prompt references, and the plan for writing one cell again.

## Running cost

Same prices as `docs/content-v2.md`: Claude Sonnet 5.5 at $2 input and $10 output per million tokens. Today an article costs about $0.60 there. The grid adds, per article:

| Line | Use per article | Cost |
|---|---|---|
| Write again | about 5 cells, 8K tokens in and 1.5K out each | ~$0.16 |
| AI columns | about 2 cells, 3K in and 0.5K out each | ~$0.02 |
| Interactive modules from the panel | about 2, 10K tokens in and 8K out each | ~$0.20 |
| Servers | the routes run on the existing web service | $0 |
| **Added** | | **~$0.38** |

At 10 articles per team a month:

| Stage | Articles | Added by the grid | Writer total with `content-v2.md` |
|---|---|---|---|
| Beta (50 teams) | 500 | ~$190 | ~$480 |
| Growth (500 teams) | 5,000 | ~$1,900 | ~$4,760 |

The modules the brief plans are already in `content-v2.md`'s article cost. No new service is added.
