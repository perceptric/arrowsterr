# Agentic Writing

One button on each Editorial Calendar row takes a keyword from outline to draft to a live post. The writer follows the method we used for the Perceptric and Arrowsterr blogs: a voice taken from a real sample, strict house rules, review passes after the draft, and branded images (screenshots of every example, diagrams, charts and a featured image).

Builds on `docs/content-v2.md` (research, brief, draft, check) and `docs/content-grid.md` (Library grid, sections, Publish). Nothing there is thrown away.

## 1. The Write column

A new column sits right after **Keyword** in the Editorial Calendar list (pinned with it), in the Day panel and in the Library grid. It replaces the **Library** column and "Import to Library": the first click puts the piece in the Library.

| Piece state | Button | Open button (next to it) |
|---|---|---|
| No outline | **Write outline** | none |
| Outline being written | `Researching` or `Outlining` tag | none |
| Outline ready | **Write draft** | Opens the outline in the right sidebar |
| Draft being written | `Writing`, `Reviewing`, `Images` or `Checking` tag | Opens the outline (read only) |
| Draft ready | **Publish content** | Opens the draft in a new tab (Library full view, `/library/<docId>`) |
| Published | **View post** (opens the live URL) | Opens the draft |
| Failed | **Try again** | The reason in the tooltip |

- The state comes from one pure function, `writeState(item, brief, draft, doc)` in `src/lib/writeFlow.ts`, so the Calendar, Day panel, Library grid and Keyword Deep Dive always show the same button.
- **Write draft** approves the outline and starts the draft in one click (`approve` then `draft` in `/api/agentic-writer`). It counts as one of the month's articles, as today.
- **Publish content** opens the existing `PublishPanel` for the brand's sites. When the CMS reports the post live, the row turns **View post** (already done in `/api/cms`).
- Bulk: pick rows, then **Write outline** or **Write draft**.
- The Content status moves on its own: Brief ready, Writing, In review, Published (`statusPatch`).

## 2. The outline sidebar

The open button on an outline opens a right `SidePanel` (wide) with the outline editor (`BriefEditor`, compact mode). Every edit saves as you type. The sidebar's footer holds **Write draft**. The Calendar row updates when the sidebar closes.

The sidebar has four tabs:

1. **Outline**: H1, title options, meta description, slug, H2s with points and H3s, FAQ, CTA.
2. **Examples**: the tools, companies or pages the article features, one card each (see 4).
3. **Images**: every image the draft will make, with its kind, where it goes and what it shows (see 5). Remove one or change its words.
4. **Voice**: the writing guide for this piece: the Brand Voice, the house rules that apply and the person it writes in. Read only here; it changes on the Brand page.

## 3. The brand is set up for you

Nobody fills in the Brand page before writing. The first outline (or the first generated section in the Library grid) runs `ensureBrandSetup` (`src/lib/brandSetupServer.ts`), which fills in only what's missing and never changes what a person saved:

- **Brand Kit:** learned from the brand's homepage with the existing kit learner (`learnKit`). A site that can't be read gets the default kit with the brand's name.
- **Brand Guidelines:** one Claude call reads the homepage and writes what the company is, what it offers, who it writes for, the proof the page states, its own words and its call to action (`brandSetup.ts`). A site that can't be read gets the name and the website, so writing still starts.
- **Brand Voice:** the Perceptric blog's voice (`DEFAULT_VOICE` in `houseRules.ts`) with the brand's own name and the reader from its guidelines.
- **Voice sample:** a brand with no pasted writing of its own (300 characters or more) writes from the Perceptric sample (`DEFAULT_SAMPLE`). The writer copies how it sounds and never its facts or names.

### The voice: sample plus house rules

The Brand Voice is a short summary (tone words, sentence length, use and avoid). Real samples carried the Perceptric voice much further, so every prompt also gets two more parts.

**Voice sample** (`brand_voices.sample_text`, the writing pasted on the Brand page, or `DEFAULT_SAMPLE`): every section, review and fix prompt includes it with "write the way this sounds".

**House rules** (`HOUSE_RULES` in `houseRules.ts`), the same for every brand, shown in the outline's Voice tab:

- Short paragraphs, 1 to 3 sentences, about 60 words at most.
- A list at least every 150 to 250 words: steps, options, checklists, do and don't. List items are plain sentences with no bold lead-in.
- Most sentences 12 to 25 words. No short sentences for drama; join them.
- Talk to the reader ("you"). Write as "we".
- Every featured example opens with "{Name} is a {kind of} {company or software} that {what it does}."
- A feeling adverb now and then ("Thankfully,", "Luckily,"), about one every 300 to 400 words, never the same twice. Never "quietly".
- Kind and professional about every company. No verdict words ("the catch", "falls short", "lazy", "nobody reads").
- No setups and reveals ("Here's the thing:", "The result?"), no slogan lines, no staged one-line paragraphs.
- No em or en dashes. No "not X, Y" or "X, not Y". No lists of three for rhythm. No emoji.
- No "In conclusion" and no recap ending; end on a next step.
- 9th grade words.
- Facts only from the sources. A stat names its source.

The rules live in `src/lib/houseRules.ts`: each rule has its prompt line and, where it can, a code check (see 6).

## 4. The outline prepares every task

The outline is the writer's full set of instructions, so the draft never has to guess. `WriterBrief` gains:

- `examples`: for listicles and example posts, one entry per featured item: name, URL, kind ("SEO software", "B2B blog"), the opening sentence ("Ahrefs is an SEO software that..."), 2 to 4 facts with the source numbers behind them, and the screenshot URL (its homepage or the exact page the article talks about).
- `images`: each with a `kind` (featured, screenshot, chart, steps, comparison, checklist, anatomy), where it goes, what it shows, its alt text, and for charts the numbers with their source numbers.
- `voice`: which house rules are on, the person (we or I) and the sample's first lines, so the outline shows what the draft will sound like.
- `checks`: facts the writer could not confirm from the sources, listed for the person to verify. The draft never states them as fact.

**Example pages are read too.** Each example's URL goes into the article research (049) next to Google's top 10 and the AI-cited pages, read by Playwright on the worker. The example's facts then come from its own page, and the claim check covers them.

The outline prompt (`briefPrompt`) gets the house rules, the examples rules and the image kinds, and `cleanBrief` checks every example URL is a real web address and every chart number points to a source.

## 5. Branded images

All images are made on the Fly worker with the Chromium it already runs, then saved to the `doc-images` bucket at `<workspace>/<draft>/<version>/<n>.webp`. The same path every time, so a retried job overwrites and never stores twice.

**Screenshots** (`screenshot` job kind, `scripts/worker.mjs`): our capture method from the blogs.
- 1440 by 900 window, waits for the page to settle, accepts cookie prompts, hides consent banners, chat bubbles and sticky bars (shadow DOM too), and scrolls to the part the article talks about when the outline names one.
- 20 seconds a page, robots.txt respected, private addresses refused (`netCheck.ts`), no logins.
- A page that blocks the bot, comes back blank (checked by pixel spread) or times out keeps an image note with the URL. The draft still finishes, and the note shows "Add screenshot" so a person can upload one.
- Shown in a browser frame with the page address in the bar, like the blog's `pc-shot`.

**Diagrams and charts** (`render_image` job kind): Claude never draws free HTML for these. It fills a small JSON spec, and the worker renders a fixed template in the Brand Kit's colors, fonts, corners and logo:
- `steps`: numbered steps in a row or a column
- `comparison`: two or three columns side by side
- `checklist`: a card of items with checks
- `anatomy`: the parts of a page, labeled
- `bars`: a bar chart, one accent color and the rest gray, every number with its source under the chart
- `featured`: 1600 by 840, the logo, the title and shapes that hint at the topic

Templates live in `src/lib/imageTemplates.ts` (pure HTML from a spec, so tests run offline). Text is at least 30px in the 1600px file, so it reads at 760px wide. A spec that fails its checks (text too long, a number with no source) is fixed once, then dropped to a note.

**On Publish** the images go into the site's own media library (WordPress media, Webflow assets, Shopify files, HubSpot files, Ghost images) and the post points there, so nothing loads from Arrowsterr. The featured image becomes the post's featured image.

## 6. The draft: write, review, check, images

The `write_article` steps become:

| Step | What happens | Model |
|---|---|---|
| 1. Sections | One call each, as today, with the voice sample, the house rules and the examples in the cached prefix | Sonnet 5.5 |
| 2. Style lint | Code checks every sentence against the house rules: dashes, banned words, "not X, Y" patterns, short sentences, paragraph length, words since the last list, "quietly", repeated adverbs, missing "{Name} is a..." openers | none |
| 3. Style review | One call reads the whole draft against the rules (the method of the humanizer, anti-ai-writing strict review and writing-enforcer skills, written as our own rules) and returns the ids of lines that break them, with the reason | Sonnet 5.5 |
| 4. Style fix | One call rewrites only the flagged lines from steps 2 and 3, keeping facts and links. Step 2 runs again; a line that still fails keeps its fixed text and is listed in the draft's review notes | Sonnet 5.5 |
| 5. Claim check | As today: unsupported claims are cut, links checked | Sonnet 5.5 |
| 6. Proofread | Code: a title's number matches the count of items ("11 Best" and 11 H2s), dates match their weekdays, no leftover markers, no repeated paragraphs | none |
| 7. Images | Screenshots, then the image specs (one call) and renders, then each image goes in where the outline put it | Sonnet 5.5 for specs |
| 8. Modules | As today | Sonnet 5.5 |
| 9. Save | Into the doc, Status Ready | none |

Each step saves its output before the next, as today, so a killed job starts where it stopped and pays once. The Library's draft view shows a **Review notes** panel: lines the style fix could not clear, facts in `checks`, and screenshots that need a person.

The writing skills we used on the blogs live in `skills/` (MIT licensed, each with its LICENSE): humanizer, anti-ai-writing, writing-enforcer with its AI pattern catalog, and proofread go into the style review and fixes as one system prompt (`STYLE_SYSTEM` in `writerStyle.ts`), cached once and shared by every article; claim-boundary-checker goes into the claim check. `node scripts/skills.mjs` rebuilds `src/lib/skillText.ts` from them.

A fix that adds, drops or changes a number or a link is thrown away, and that section keeps its first text. Each fixed section is saved as it lands, so a killed job picks up at the next section and never pays for the review twice.

## 7. The Library

The Library holds every piece that is in work: outlines, drafts and published posts. The grid stays, with the Write column after the keyword and a filter at the top: All, Outlines, Drafts, Published. Opening a row works as today: an outline opens in the same sidebar, a draft in full view.

## 8. Build order

| Step | Build | Done when |
|---|---|---|
| 1 | `writeFlow.ts` and the Write column in the Calendar, Day panel and Library; the outline sidebar; one-click Write draft | Write outline, Write draft, Publish content and View post all work on one row without leaving the Calendar |
| 2 | Voice sample and house rules on the Brand page; the rules in every prompt; style lint, review and fix | A draft passes the lint with no dashes, no short dramatic lines and every example opening with "is a" |
| 3 | Examples in the outline, read by the research; `checks` | Every featured example's facts point to its own page |
| 4 | Screenshots and image templates on the worker; images in the draft; Review notes | A listicle draft has a screenshot of every example that allows it, and notes for the rest |
| 5 | Images into the CMS media library on Publish; featured image | A WordPress post shows every image from its own media library |

## 9. Tests

Reliability first: each test proves a flaky case.

- `writeState` gives the right button for every mix of outline, draft and post states, including a failed draft over a ready outline.
- Two quick clicks on Write draft make one draft and one charge.
- The style lint catches each rule on a sample line and passes the clean version (dashes, "not X, Y", short lines, missing openers, lists too far apart).
- The style fix never changes a number, a link or a source.
- A screenshot that times out, a page that blocks the bot and a blank page each leave a note, and the draft still finishes.
- A job killed during images restarts with no duplicate files.
- An image spec with a number that has no source is dropped to a note.
- The title count fix: "10 Best" with 11 items becomes "11 Best".
- Publish uploads each image once, and a second Publish reuses the uploaded files.

## 10. Running cost

Claude Sonnet 5.5 at $2 input and $10 output per million tokens (from `docs/content-v2.md`, check). The brand, research and outline stay a cached prefix, and the writing skills (about 22K tokens) are a second cached block shared by every article, read at a tenth of the price.

| Line | Per article | Cost |
|---|---|---|
| Today's full article (brief, sections, modules) | from `docs/content-grid.md` | ~$0.53 |
| Bigger outline (examples, images, checks) | +2K in, +4K out | ~$0.05 |
| Style review | 10K in plus the cached blocks, 2K out | ~$0.04 |
| Style fixes | about 6 sections, 2K in and 1.2K out each | ~$0.10 |
| Writing skills, cached | read on about 7 calls, written now and then | ~$0.05 |
| Image specs | 8K in, 3K out | ~$0.05 |
| Example pages read, screenshots and renders | plain fetches on the web service, Chromium on the worker | ~$0 |
| Lint and proofread | code | $0 |
| **One article** | | **~$0.82** |

Setting up a brand costs about $0.04 once (the kit and guidelines calls), so about $4 for 100 brands. Images add about 2 MB of storage per article (12 images at about 150 KB) and leave Supabase once, when Publish copies them to WordPress.

| Line | Beta (50 teams, 500 articles) | Growth (500 teams, 5,000 articles) |
|---|---|---|
| Claude for articles | ~$410 | ~$4,100 |
| DataForSEO and AI engine calls (today) | ~$30 (check) | ~$300 (check) |
| Brand setup (new brands that month) | ~$2 | ~$20 |
| Image storage (1 GB a month at Beta, 10 GB at Growth, inside Supabase Pro's 100 GB at first) | ~$0 (check) | ~$0 for the first 9 months, then ~$0.02 a GB (check) |
| Fly worker: a second 2 GB machine at Growth for screenshots and renders | $0 | ~$12 (check) |
| **Monthly total** | **~$442** | **~$4,432** |

That adds about $147 at Beta and about $1,482 at Growth over today's article cost.
