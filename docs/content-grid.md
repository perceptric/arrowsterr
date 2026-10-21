# Library grid

The Library is a grid of articles. Each row is one article, and the columns are lettered A, B, C like a sheet. Arrowsterr writes the draft; people publish it to WordPress or their CMS and edit it there.

Code: `src/components/writer/ContentGrid.tsx` (the grid), `src/lib/articleGrid.ts` (pure: the doc as heading and section pairs), `src/lib/gridData.ts` (reads and saves), `src/app/api/agentic-writer/grid/route.ts` (Generate draft). Database: `supabase/054_content_grid.sql`.

## Columns

**A Keyword**, with View draft (or View brief before the draft).

**Metadata**
- **B Status:** the Content status, the same field and choices as the Keyword Deep Dive (Idea, Planned, Brief ready, Writing, In review, Published), through `statusChoice` and `statusPatch` in `library.ts`. Changing it here changes it there and in the Editorial Calendar. The writer moves it on as the brief and draft finish. While the writer works, a tag under it shows the step (Researching, Planning, Writing, Checking, Building modules, Saving), or Failed with the reason as its tooltip.
- **C Meta title, D Meta description, E Slug:** from the brief until the draft exists, then saved in `docs.meta` (`metaTitle`, `description`, `slug`), where Publish reads them. Click to edit.

**Content**: pairs of a heading and its section, always H1 and Section 1 through H20 and Section 20. **+** at the end adds another pair (per site, in this browser), and the grid never shows fewer pairs than its longest article needs.
- **H1** is the article's title and **Section 1** its intro.
- **H2, H3 …** are the draft's H2s in order, and each **Section** is the text under it: its preview, what's inside (List, Table, Interactive, Image, Quote) and its word count. H3s stay inside their section.
- Before the draft, the headings show the brief's H1 and outline and the sections stay empty.
- Click a section to view the draft as a doc.

## Generate draft

- Select rows and press **Generate draft**, or press the play button next to a row's status.
- No brief yet: the brief starts with `auto_draft` on. When it's ready, the server approves it and starts the draft (`autoDraft` in `writerServer.ts`). A draft that can't start says why on the brief.
- Brief ready: the brief is approved and the draft starts.
- Draft ready: it's regenerated after a confirm. The old text is saved to `doc_versions` first.
- Drafts count against the plan the same way Generate Draft does.

## The draft

View draft opens the doc with Edit, HTML, Markdown and Text tabs (each with Copy), Export and **Publish** to the CMS connections in Settings, with the row's meta title, description and slug.

## Interactive modules

The draft can carry interactive modules: each built as one self-contained HTML block (inline CSS and JS, no outside files, no network), in the brand's colors, checked by `validateModule` and run in a sandboxed frame. The catalog is `src/lib/moduleCatalog.ts`: each kind says when it helps and how to build it. The brief's prompt lists every kind and picks 1 to 3 that fit the article, never two of the same kind; the draft builds each with its kind's design.

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

Older briefs that name `roi` or `diagram` still build.

## Tests

`tests/articleGrid.test.ts` (the doc as heading and section pairs, the brief's plan before the draft, the pair count, plain text, letters), `tests/moduleCatalog.test.ts` (the 13 kinds, the brief's list, the build prompt), `tests/library.test.ts` (the status picker the grid and the deep dive share).

## Running cost

None beyond the draft itself. Generate draft runs the same brief and draft as before, priced in `docs/content-v2.md` at about $0.60 an article: about $290 a month at Beta (50 teams) and $2,860 at Growth (500 teams). The grid reads and saves with the browser's own Supabase connection, so it adds $0 at Beta and $0 at Growth.
