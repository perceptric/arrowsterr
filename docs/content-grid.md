# Library grid

The Library is a grid of articles. Each row is one article, and the columns are lettered A, B, C like a sheet. Arrowsterr writes the brief; writers fill the article in, section by section beside the grid or in full view, then publish it to WordPress or their CMS.

Code: `src/components/writer/ContentGrid.tsx` (the grid), `SectionPanel.tsx` (one section in the side panel), `LibraryPage.tsx` (Full view: `ArticleView`), `src/lib/articleGrid.ts` (pure: the doc as heading and section pairs, the skeleton from the brief, each section's notes), `src/lib/gridData.ts` (reads and saves), `src/app/api/agentic-writer/grid/route.ts` (Generate brief).

## Columns

**A Keyword**, with Full view once the article has a doc (or View brief before).

**Metadata**
- **B Status:** the Content status, the same field and choices as the Keyword Deep Dive (Idea, Planned, Brief ready, Writing, In review, Published), through `statusChoice` and `statusPatch` in `library.ts`. Changing it here changes it there and in the Editorial Calendar. A finished brief moves it to Brief ready, and the first section a writer opens moves it to Writing. While the writer job works, a tag under it shows the step (Researching, Planning), or Failed with the reason as its tooltip.
- **C Meta title, D Meta description, E Slug:** from the brief until the doc exists, then saved in `docs.meta` (`metaTitle`, `description`, `slug`), where Publish reads them. Click to edit.

**Content**: pairs of a heading and its section, always H1 and Section 1 through H20 and Section 20. **+** at the end adds another pair (per site, in this browser), and the grid never shows fewer pairs than its longest article needs.
- **H1** is the article's title and **Section 1** its intro.
- **H2, H3 …** are the doc's H2s in order, and each **Section** is what's written under it: its preview, what's inside (List, Table, Interactive, Image, Quote) and its word count. H3s stay inside their section.
- Before the doc, the headings show the brief's H1, outline and FAQ.

## Generate brief

Select rows and press **Generate brief**, or press the play button next to a row's status. Rows whose brief is ready or being written are left alone; a failed one is tried again. The brief fills the headings and the metadata. A full draft can still be written from the brief's own page (Generate Draft).

## Writing

- **Write** on any section starts the article's doc from the brief (`briefSkeleton`): the H1 as its title, an empty intro, each H2 with its H3s and the FAQ questions, all empty, and the brief's meta title, description and slug. Then the section opens in the side panel.
- The panel shows what the brief says to write in that section (`notesFor`: the intro's angle and intent, the H2's key points and H3s with its numbered sources, or the FAQ answers), then the editor: headings, lists, links, tables, images and HTML blocks. It saves a moment after typing stops, into the latest copy of the doc (`replacePart`). Back and Next move along the article.
- **Full view** opens the whole article: the editor with Edit, HTML, Markdown and Text tabs (each with Copy), Export and **Publish** to the CMS connections in Settings, with the row's meta title, description and slug.

## Interactive modules

A draft written from the brief's page (Generate Draft) can carry interactive modules: each built as one self-contained HTML block (inline CSS and JS, no outside files, no network), in the brand's colors, checked by `validateModule` and run in a sandboxed frame. The catalog is `src/lib/moduleCatalog.ts`: each kind says when it helps and how to build it. The brief's prompt lists every kind and picks 1 to 3 that fit the article, never two of the same kind; the draft builds each with its kind's design.

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

`tests/articleGrid.test.ts` (the doc as heading and section pairs, the brief's plan before the doc, the skeleton from the brief, each section's notes, saving a section into its slice, the pair count, plain text, letters), `tests/moduleCatalog.test.ts` (the 13 kinds, the brief's list, the build prompt), `tests/library.test.ts` (the status picker the grid and the deep dive share).

## Running cost

The grid runs only the brief: research and one Claude call, about $0.18 an article at `docs/content-v2.md`'s prices (search ~$0.01, AI sources ~$0.05, brief ~$0.12). At 10 articles per team a month:

| Stage | Briefs | Claude, DataForSEO and AI engines |
|---|---|---|
| Beta (50 teams) | 500 | ~$90 (check) |
| Growth (500 teams) | 5,000 | ~$900 (check) |

That is less than the full drafts the grid used to generate (~$290 and ~$2,860). Writing, saving and Full view use the browser's own Supabase connection: $0 at Beta and $0 at Growth. Drafts generated from a brief's page cost as before.
