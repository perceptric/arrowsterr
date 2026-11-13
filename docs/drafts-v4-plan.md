# Drafts v4: the plan

A new way to make an article in Arrowsterr, from a keyword to a live post. It follows the content process Frase.io moved to in 2026 (research you pin, a brief you approve fact by fact, a writer that uses only what you approved, an editor with scores, then publish behind rules), and keeps what Arrowsterr already does better: AI Visibility data, clusters, quote-checked facts, house-rule style passes and branded images.

Written November 2026. Builds on `docs/content-v3-plan.md` (Research, Review, Forms) and `docs/agentic-writing.md` (the writer). Prices marked "check" couldn't be confirmed on the vendor's own page.

---

## 1. What's wrong today

- **The grid is the editor.** Drafts is a wide sheet with a column for every heading and section, so people scroll sideways to read an article and edit it one cell at a time.
- **One button does everything.** Write draft runs research, outline and writing in one go. Nobody sees the research or the outline, and nobody can steer them before the words are written.
- **Facts arrive unchecked by people.** The writer cuts claims it can't support, but nobody picks which facts and sources go in.
- **There's no score.** Nothing tells the writer how the draft compares with the pages that rank, or how easily AI answers can quote it.
- **Updating a live page is a separate path** (Refresh) that people don't find.

## 2. What Frase does (November 2026)

From Frase's own docs at docs.frase.io (the app was rebuilt in 2026; most reviews still describe the old one):

1. **Start:** Generate Article (Frase does it all), Research First, Optimize Existing, Import Brief, or Start from scratch.
2. **Research:** sections for keywords, what ranks and its headings, questions, evidence with sources, competitors, topic directions. You **pin** what you want; only pinned items feed the brief.
3. **Brief:** an outline section by section, with facts mapped to each section. You approve or reject each fact and each source. Templates per content type (16 types) set headings and word counts.
4. **Write:** each section is assigned to "Frase writes" or "I write". A single-pass writer uses only approved facts and sources. External links come only from research sources; internal links need a site audit.
5. **Editor:** the article in the middle, a right panel (Checklist, Score, Research, Brief, Images, Meta, Comments, Ask AI). Three scores, 0 to 100: SEO, GEO and EEAT. **Improve** shows a rewrite with a score preview before you apply it.
6. **Publish:** to WordPress, Webflow, Sanity, Wix or Frase CMS, live or draft. Rules with Error severity block a publish; Warning asks to publish anyway.
7. **Automate:** batches of up to 10 articles, playbooks per content type, auto-publish that starts with "require your approval".

Pricing for scale: Starter $49 for 10 articles, Professional $129 for 40, Scale $299 for 100 (frase.io/pricing, November 2026).

## 3. The new flow

```
Content Opportunities / Calendar / New draft
        │  pick how to start
        ▼
Research (the agent from Content v3) ── pin keywords, headings, questions, facts, sources
        ▼
Brief ── outline by section, facts per section (approve or reject), sources, terms, word count,
         who writes each section (Arrowsterr or me)
        ▼
Write ── one pass per section, only approved facts, house rules, style passes, images
        ▼
Editor ── the article, scores (SEO, AI answers, Trust), Improve with a preview, comments, co-editing
        ▼
Review (Content v3) ── approve or request changes
        ▼
Publish ── Integrations, live or draft, now or on the Calendar, behind publish rules
```

### 3.1 Starting a draft

**New draft** opens one dialog with five ways to start:

| Option | What happens |
|---|---|
| **Write it for me** | Research, brief and draft run on their own, as today. The brief is saved, so it can be opened later. |
| **Research first** | Runs Research, then stops so you pin what you want and build the brief. |
| **Update a live page** | Paste a URL or pick a post from a connected site. The page comes in as the draft, with Research run against it. |
| **Import a brief** | Paste text or a Google Docs link; it becomes the brief. |
| **Blank** | An empty draft with just the keyword. |

The same choice shows when you send rows from Content Opportunities or the Calendar ("Write it for me" is the default for a batch). A batch runs up to 10 at once, 2 at a time per workspace, and keeps going if you leave the page.

### 3.2 Research with pins

Research is the agent from `content-v3-plan.md` section 4. The research doc gets a **pin** on every item:

- keywords and related terms
- headings from the top pages
- questions (People Also Ask and the questions AI answers raise)
- facts with their quote and page
- sources
- angles to win

Pinned items feed the brief. With nothing pinned, the brief uses the agent's own picks, so "Write it for me" still works with no clicks.

### 3.3 The brief

The brief replaces the hidden outline. It opens as a tab in the editor:

- **Outline:** H1, then each H2 and H3, drag to reorder, add or remove.
- **Facts per section:** each fact shows under the heading it supports, with its quote and source. Approve or reject; a fact moves with its heading.
- **Sources:** approve or reject each one. Blocked domains (Settings › Brand) never show.
- **Terms:** the words the top pages use, each with a target range (section 4.1).
- **Word count:** the median of the top 5 pages, rounded to 100, shown as a range of ±20%.
- **Content type:** listicle, how-to, comparison, alternatives, review, guide, landing page or glossary. Each type has a template (headings, FAQ, word count) the brand can edit in Settings › Brand.
- **Who writes:** each section is set to **Arrowsterr writes** or **I write**.

**Write** writes the sections set to Arrowsterr and leaves the others empty with their notes.

### 3.4 Writing

The writer stays as `agentic-writing.md` describes (sections, style lint, style review, style fix, claim check, proofread, images, modules), with three changes:

- It uses **only approved facts and sources**. A claim with no approved fact behind it is cut, as today.
- **External links** come only from approved sources, placed next to the claim they support.
- **Internal links:** 3 to 8 per article, picked by relevance from the cluster's pages and the site's own pages (sitemap), with the pillar link always in.

### 3.5 The editor

The article opens as a document, with the grid gone from this view:

- **Middle:** the article, edited live (co-editing and comments from Content v3).
- **Top right:** three scores, 0 to 100, each green (70+), yellow (40 to 69) or red, with the top pages' average beside it.
- **Right panel tabs:** Checklist, Brief, Research, Images, Meta, Comments, Ask Zippie.
- **Checklist:** every rule behind the scores, grouped (Coverage, Structure, Answers, Trust, Meta), each with its points.
- **Improve:** pick a score or type a direction. Arrowsterr rewrites only the sections that need it and shows the change with the new scores before you **Apply**. Undo puts it back.

### 3.6 The Drafts list

Drafts becomes a plain sheet, one row per article: Title, Keyword, Type, Status, Scores, Words, Writer, Due, Updated. The heading and section columns go. A row opens the editor. Status values: Researching, Brief, Writing, In review, Approved, Scheduled, Published, Failed.

### 3.7 Publish rules

Before a publish, the draft is checked against the brand's rules:

- **Blocks (error):** a "Never" term (Settings › Brand › Terminology), no meta title, a failed claim check, approval needed and missing.
- **Asks first (warning):** a score under 40, fewer than 2 sources, no featured image, an internal link that 404s.

Publish goes through Integrations as today: live or draft, now or on the Calendar.

## 4. How the scores work

All three scores are computed in code from the draft and the research, so they cost nothing and give the same number every time. Tests run them on recorded pages. AI is used only for Improve.

### 4.1 SEO score

Measured against the top 10 pages read during research.

| Check | Points |
|---|---|
| **Terms:** words and 2 to 3 word phrases used by at least 3 of the top 10 pages, each with a target range (the 25th to 75th percentile of how often they use it, scaled to our word count). Points for each term inside its range, half for under | 40 |
| **Keyword placement:** in the H1, the first 100 words, at least one H2, the meta title and the slug (whole words only) | 15 |
| **Length:** inside the word count range | 10 |
| **Headings:** one H1, no skipped levels, no section over 400 words without a subheading | 10 |
| **Links:** 3+ internal and 2+ external, none broken | 10 |
| **Readability:** grade 9 or lower (Flesch-Kincaid), paragraphs of 3 sentences or fewer | 10 |
| **Meta:** title 30 to 60 characters, description 120 to 155 | 5 |

### 4.2 AI answers score

How easily ChatGPT, Gemini, AI Mode and Perplexity can quote the article.

| Check | Points |
|---|---|
| **Direct answers:** each question heading is followed by a 40 to 60 word answer in its first paragraph | 25 |
| **Question coverage:** share of the pinned questions answered under their own heading or in the FAQ | 25 |
| **Structure:** at least one list and one table where the content type expects them | 15 |
| **Sourced facts:** facts with a source link, per 500 words | 15 |
| **Definitions:** each featured product or term opens with "X is a ..." (already a house rule) | 10 |
| **Freshness:** the year in the title and a visible "Updated" date when the type asks for one | 10 |

### 4.3 Trust score

| Check | Points |
|---|---|
| **Author:** a byline with a bio (Settings › Members) | 25 |
| **Sources:** 3+ approved sources, at least one from an official or research site | 25 |
| **First-hand detail:** screenshots, the brand's own data or quotes from a named person | 25 |
| **Claim check passed** with nothing cut in the last run | 25 |

The top pages' average for each score comes from running the same checks on them, so "beat the average" is a fair comparison.

## 5. What Arrowsterr does that Frase doesn't

- **AI Visibility data:** the brief shows which brands each AI engine names for the topic, from the brand's own tracked prompts.
- **Clusters and the link plan** from Content Opportunities feed internal links.
- **Facts only with a quote found on the page**, checked in code.
- **House rules and style passes** written from real blog work, with a lint in code.
- **Branded images:** screenshots, charts and diagrams in the Brand Kit's look.
- **Traffic:** the rank tracker shows the published page's position the day after it goes live.

## 6. Data

| Change | What |
|---|---|
| `content_research` | adds `pins` (jsonb: item ids by kind) |
| `writer_briefs` | adds `facts` (each with section, quote, source, approved), `sources` (approved or not), `terms`, `word_range`, `content_type`, `assign` (per section: auto or me) |
| `docs` | adds `scores` (jsonb: seo, ai, trust, with the rule results), `scored_at` |
| `brand_templates` | content type, headings, FAQ, word count |
| `brand_terms` | term, preferred, avoid or never |
| `blocked_domains` | per brand |

## 7. Reliability

- **Scores:** pure functions in `src/lib/scores.ts`, tested on 10 recorded articles and their top pages. The same draft always gets the same score.
- **Improve** keeps every fact and link as it was (the same guard as style fixes). A rewrite that does is dropped, and the section keeps its text.
- **Only approved facts:** a test drafts from a brief with rejected facts and checks none of them appear.
- **Batches** run on the jobs queue, 2 at a time per workspace. A killed job picks up at the next section and never pays twice.
- **Publish rules** are checked on the server on every publish and schedule, including scheduled jobs at their time.

## 8. Phases

| Phase | Weeks | Ships | Done when |
|---|---|---|---|
| 1. Drafts list and New draft | 1 | The plain list, the five ways to start, batches of 10 | Each start option makes a draft that opens in the editor |
| 2. Pins and the brief | 1.5 | Pins in Research, the brief tab, facts and sources to approve, terms, word range, content types, who writes | A draft from a brief with rejected facts contains none of them |
| 3. Editor and scores | 2 | The editor layout, the right panel, the three scores and the Checklist | On 10 recorded articles, each score matches a hand count within 5 points, every time |
| 4. Improve and Update a live page | 1 | Improve with preview and Apply, import a URL or a CMS post | Improve raises the chosen score on 8 of 10 test drafts with every fact and link kept |
| 5. Publish rules and templates | 1 | Terminology, blocked domains, templates, rules before publish | A Never term blocks every publish path, including a scheduled one |

About 6.5 weeks for one engineer. Each phase ships on its own. Review and co-editing come from Content v3 phases 4 and 5.

## 9. Running cost

**Assumptions:** 50 teams at Beta and 500 at Growth, 10 articles a team a month (500 and 5,000), 2 Improve runs per article. Claude Sonnet 5.5 at $2 in and $10 out per million tokens (check).

| Line | Each | Beta (500 articles) | Growth (5,000 articles) |
|---|---|---|---|
| Writing an article (as today, `agentic-writing.md`) | ~$0.82 | ~$410, already in the bill | ~$4,100, already in the bill |
| Research agent (Content v3) | ~$0.43 | already in the Content v3 estimate | already in the Content v3 estimate |
| Brief: the outline call gains facts per section, terms and word range | ~+$0.02 | ~$10 | ~$100 |
| Scores: code only, top pages already read in research | $0 | $0 | $0 |
| Improve: the sections that need it, ~8K in and 2K out with the cached brand block | ~$0.04 a run, 2 a draft | ~$40 | ~$400 |
| Update a live page: one page fetch | ~$0 | ~$0 | ~$0 |
| Batches, templates, rules: code and the existing queue | $0 | $0 | $0 |
| **Added a month** | | **~$50** | **~$500** |

Articles keep counting against each plan's monthly articles, so heavy use is paid for by the plan it runs on.

## Sources

- Frase docs: [What's new](https://docs.frase.io/whats-new/readme.md), [Research](https://docs.frase.io/feature-reference/deep-research.md), [Create content](https://docs.frase.io/core-workflows/create-new-content-that-ranks.md), [Scores](https://docs.frase.io/feature-reference/content-scores-explained.md), [Brand Hub](https://docs.frase.io/feature-reference/brand-hub.md), [Optimize existing](https://docs.frase.io/core-workflows/optimize-existing-content.md), [Publish](https://docs.frase.io/core-workflows/publish-content-to-your-cms.md), [Automations](https://docs.frase.io/automations/automations.md)
- [Frase pricing](https://www.frase.io/pricing)
