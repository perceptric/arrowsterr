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

## Generate content

**Generate** next to the keyword (all sections) or in the side panel (that section) opens the review screen.

- **Brand first.** Nothing runs until the Brand page has a Brand Voice, Brand Guidelines and a Brand Kit (`brandMissing` in `articleGrid.ts`). The screen lists what's missing with Open Brand page, and the server refuses the same way.
- **Review.** Each section shows the brief's points for it (edit them, one per line) and the interactive module to build at its end: the one the brief planned for that H2, any of the 13 kinds, or none, with a line on when it helps. Sections that already have text say Replaces text. One note goes to every section.
- **Run.** Sections run one at a time (`generateSection` in `gridServer.ts`): written from the brief's plan with the edited points, cited from the research, in the Brand Voice, building on the text that's there. Each lands in the doc as it finishes, and its row shows Waiting, Writing, Done or Failed. A module that fails its checks twice is left out and named; the text still lands. The doc is made from the brief first if it doesn't exist, and the piece moves to Writing.
- Costs 15 tasks a section, plus 25 for a module.

## Listicles for BOFU

Bottom-of-funnel keywords win as listicles (`src/lib/listicle.ts`):
- The Content Plan's suggested slug is `best-` with the main noun made plural: "seo agency" to `/best-seo-agencies`, "seo consultant for small business" to `/best-seo-consultants-for-small-business`. Keywords that already lead with best or top, or compare ("vs", "alternatives"), keep their words. A slug someone set stays.
- The brief for a BOFU piece is a listicle: "N Best ... in 2026" titles, an H2 on how the options were picked, one H2 per option with who it's for, pricing, pros and cons, then how to choose, with a comparison or quiz module. Its slug is the listicle slug whatever the model returns.

## Connect and sync to the CMS

- **Connect site** in the Library (and **Connect a site** in Publish when the brand has none) opens the connect guide for this brand, step by step, for WordPress, Webflow, Shopify, HubSpot and Ghost (`ConnectWizard.tsx`, `cmsGuide.ts`). Connecting needs an admin.
- **WordPress in one click** (`wpAuthorize.ts`): type the site address and click Connect with WordPress. A WordPress window opens on its own Authorize Application screen; the person approves, WordPress sends back an application password for their user to `/connect/wordpress`, which hands it to the Library window and closes. Nothing to copy. If the window loses its link back, the answer goes through the browser's storage and is cleared at once. An application password is still there as a fallback.
- The guide's last step installs the Arrowsterr Connector plugin, with a button to the plugin upload screen and **Check plugin**, which asks the site (`wp_plugin`).
- **Sync** on a row, or **Sync to CMS** in Full view, sends the saved article to the brand's site (`push` in `/api/cms`): the same post every time, built on the server from the doc (`docToHtml`). A draft stays a draft and a live post stays live; the category and tags from the last Publish stay. Image notes never go out.
- **HTML and modules:** WordPress gets each interactive module through the plugin (sized, sandboxed, kept across updates), or as a sandboxed frame in a Custom HTML block without it (`wpConvert.ts`). Other sites get each module as a self-contained sandboxed frame with its whole page inside (`framedModules`), so nothing has to load from elsewhere. Tables, lists and images go as plain HTML.

## Interactive modules

Generated sections, and drafts written from the brief's page (Generate Draft), can carry interactive modules, only where one helps more than text, a list or a table (most articles get none or one, never more than two): each built as one self-contained HTML block (inline CSS and JS, no outside files, no network), in the brand's colors, checked by `validateModule` and run in a sandboxed frame. The catalog is `src/lib/moduleCatalog.ts`: each kind says when it helps and how to build it. The brief's prompt lists every kind and picks 1 to 3 that fit the article, never two of the same kind; the draft builds each with its kind's design.

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

Every module follows the brand's style guide (`moduleStyle`, `moduleTheme`): the Brand Kit's colors and what each is for, its heading and body fonts (loaded from Google Fonts), its corners, its tone for labels, and the written Brand Guidelines. Older briefs that name `roi` or `diagram` still build.

## Lists and images

- The writer puts three or more parallel things (options, features, tips, pros, cons) in a bullet list, steps and rankings in a numbered list, and several options compared on the same points in a table.
- The brief names 2 to 5 places an image helps: the H2 it goes under, what it shows (a screenshot of a named tool, a chart of a number from the sources, a diagram of a process) and its alt text. They show in each section's notes in the side panel, and as notes in the doc (generated sections, full drafts and the doc a writer starts) right where the image goes. Notes show in the editor and never publish.

## Tests

`tests/articleGrid.test.ts` (the doc as heading and section pairs, the brief's plan before the doc, the skeleton from the brief, each section's notes, saving a section into its slice, the pair count, plain text, letters), `tests/moduleCatalog.test.ts` (the 13 kinds, the brief's list, the build prompt), `tests/library.test.ts` (the status picker the grid and the deep dive share), `tests/listicle.test.ts` (plurals, listicle slugs, the plan's slug, the brief's listicle rules and slug), `tests/wpAuthorize.test.ts` (site addresses, the approve screen's address, reading WordPress's answer); `tests/moduleCatalog.test.ts` also covers the brand style in the build prompt, the fonts, the module and list rules, image notes and modules framed for other CMSs.

## Running cost

Prices from `docs/content-v2.md`: Claude Sonnet 5.5 at $2 input and $10 output per million tokens.

| Line | Use per article | Cost |
|---|---|---|
| Brief | research and one Claude call, now also naming image spots | ~$0.18 (check) |
| Generate content | about 8 sections, 25K tokens in (mostly cached) and 1.5K out each | ~$0.25 |
| Modules | only where they help: about 1, 12K in and 8K out | ~$0.10 |
| Connect, sync and publish | the CMS's own API, on the existing web service | $0 |
| **One article, fully generated** | | **~$0.53** |

At 10 articles per team a month, if every article is fully generated:

| Stage | Articles | Monthly |
|---|---|---|
| Beta (50 teams) | 500 | ~$265 (check) |
| Growth (500 teams) | 5,000 | ~$2,650 (check) |

Fewer modules bring it down from ~$315 and ~$3,150. Articles writers fill by hand cost only the brief (~$90 and ~$900). Brand fonts load free from Google Fonts. Writing, saving and Full view use the browser's own Supabase connection: $0.
