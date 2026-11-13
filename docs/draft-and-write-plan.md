# Draft and Write: the plan

Two buttons make an article:

1. **Generate draft** researches the topic and returns an outline to review. Every section has a tooltip that shows exactly what it will hold: its job, its points, its facts with sources, the visual planned for it and the links it carries.
2. **Write** turns the reviewed outline into a finished article: text, images, flowcharts, charts and interactive elements, checked and ready to go live.

The steps follow the Perceptric house writer process (`perceptric-site/.claude/skills/perceptric-writer`), the one behind the Perceptric and Arrowsterr blogs. Builds on `docs/agentic-writing.md` (the writer, style passes, images) and `docs/drafts-v4-plan.md` (the editor and scores). Written November 2026.

---

## 1. Generate draft (about 90 seconds)

| Step | What happens | Perceptric skill behind it |
|---|---|---|
| 1. Research | The research agent (Content v3) collects notes: one fact per note with its source, date and link; quotes word for word; counter-evidence; examples from the reader's world; AI answers and the top pages' headings. The notes are then frozen. | `writing-fragments` |
| 2. Brief | Five lines: reader, the job the reader will do after reading, the point of view in one sentence, keywords with volume, one CTA. Plus the leading word the piece hangs on, when there is one. | perceptric-writer step 2 |
| 3. Shape | Names the default structure, sketches two others, picks one and says why. Orders the points so each builds on the last. | perceptric-writer step 3, `writing-beats` |
| 4. Outline | H1, meta title, description, slug, then each H2 and H3 with its **section card** (section 2). | `draft-content`, `content-creation` |
| 5. Visuals | The visual planner picks the right element for each section (section 3). | `dataviz`, diagram rules |

A gap in the notes shows on the card as **Detail needed**, with what's missing and where to find it. Nothing is invented to fill it.

## 2. The section card (the tooltip)

Hover or tap the info icon next to any heading to open its card:

- **Job:** what the reader needs from this section, in one line.
- **Points:** the 2 to 5 things it will say, in order.
- **Facts:** each with its quote, source and date. Approve or remove.
- **Visual:** the element planned (flowchart, chart, interactive, table, image, screenshot or none) and why it fits.
- **Words:** a target from the top pages.
- **Links:** internal links (cluster pillar and pages) and outside sources.
- **Keyword:** where the keyword goes, if this section carries it.

Everything on the card can be edited. Removing a visual removes it from the Write step.

## 3. How visuals are picked

Rules in code read the section's points and facts, then Claude Sonnet confirms the pick and fills a small spec. A visual goes in only where a rule fires:

| The section has | Visual | Built with |
|---|---|---|
| 3 or more ordered steps | **Flowchart** | A step spec rendered to SVG from a fixed template in the Brand Kit's colors |
| Numbers by category or over time, each with a source | **Chart** (bars or a line) | A data spec rendered with the `dataviz` rules: one accent, the source under the chart, labels from the real values |
| The same 3+ attributes for 3+ items | **Comparison table** | A table, plus a comparison graphic when it's the article's main list |
| A choice the reader has to make ("which one is for me") | **Interactive picker** | A quiz module from the module catalog: 2 to 3 questions, an answer from the article's own picks |
| A calculation the reader can do with their own numbers | **Interactive calculator** | A calculator module whose formula comes from a sourced fact |
| A named product, tool or page | **Screenshot** | The worker's Chromium, as today |
| The parts of a thing | **Anatomy diagram** | The anatomy template |
| The whole article | **Featured image** | The featured template |

**Limits:** about one visual per 300 words, at most 2 interactive elements per article, nothing in the intro except the featured image, and nothing without a reason on the card. A spec that fails its checks (a number with no source, text too long) is fixed once, then dropped to a note.

## 4. Write (about 3 to 5 minutes)

| Step | What happens | Perceptric skill behind it | Model |
|---|---|---|---|
| 1. Sections | Each section is written block by block from its card and the frozen notes only, in the brand's voice (voice profile plus sample). Prose for argument, a list only for parallel items, a table when a shape repeats 3 or more times. | `writing-shape`, voice profile | Sonnet |
| 2. Visuals | Built at the same time as the text: specs rendered to SVG or images, interactive modules from the catalog, screenshots on the worker | `dataviz` | Sonnet for specs |
| 3. Claim check | A claim ledger: each claim supported, unsupported or uncertain. Each unsupported one is removed, qualified or sourced. | `claim-boundary-checker` | Sonnet |
| 4. House lint | Code checks: dashes, contrast phrases, lists of three, recap endings, paragraph length, reading level, house mechanics | `perceptric-writer/scripts/lint.py`, ported | none |
| 5. AI tells | A strict review, then surgical fixes to the flagged lines only, then the lint again | `anti-ai-writing`, `humanize`, `writing-enforcer` | Sonnet |
| 6. Voice check | Lines that could sit unchanged on any other blog get made specific or cut; every section names a real thing | `brand-review` | Sonnet |
| 7. Fact safety | Code compares every number, name and link before and after steps 5 and 6. A changed fact puts the line back. | `humanizer-en` post-edit audit, ported | none |
| 8. Copyedit and proof | A medium copyedit, then a proof with a Ship or Hold verdict | `redline-edit`, `proofread` | Sonnet |
| 9. Ready | Meta, schema (FAQ, HowTo), alt text, internal links. Images go to the site's media library on publish. | | none |

**Hold means no publish:** an open Detail needed or a Hold verdict keeps Publish off and lists what's left. Everything else lands as **Ready to publish**.

Each step saves before the next, so a stopped job picks up where it left off and never pays twice (as today).

## 5. What's new in code

- `src/lib/sectionCard.ts`: the card's shape and its checks.
- `src/lib/visualPlan.ts`: the rules in section 3, pure and tested on 20 recorded outlines.
- `src/lib/visualSpecs.ts`: flowchart, chart, picker and calculator specs, each validated (every chart number points to a note, every picker answer is one of the article's picks).
- `src/lib/houseLint.ts` and `src/lib/factAudit.ts`: the Perceptric lint and the post-edit audit, ported from Python and tested on the same cases.
- Templates for the flowchart and the two interactive modules join `imageTemplates.ts` and `writerModules.ts`.

## 6. Phases

| Phase | Weeks | Ships | Done when |
|---|---|---|---|
| 1. Generate draft | 1.5 | Brief, shape, outline with section cards and tooltips, Detail needed | Every card on 20 test topics has a job, points and sourced facts |
| 2. Visual planner | 1.5 | The rules, the specs, flowchart and chart templates | On 20 outlines, every planned visual has a rule and a reason, and no chart number lacks a source |
| 3. Interactive elements | 1 | Picker and calculator modules, publishing them to each CMS | Both work on WordPress, Webflow and Framer test sites |
| 4. Write passes | 1.5 | House lint, AI-tell passes, voice check, fact audit, copyedit and proof with Hold | On 20 drafts, no fact changes through the passes and the lint finds no FAIL |

About 5.5 weeks for one engineer.

## 7. Running cost

Assumptions: 10 articles a team a month (500 at Beta, 5,000 at Growth); Claude Sonnet 5.5 at $2 in and $10 out per million tokens (check).

| Line | Each | Beta | Growth |
|---|---|---|---|
| Research agent (counted in Content v3) | ~$0.43 | already counted | already counted |
| Brief, shape and outline with cards | ~$0.06 | ~$30 | ~$300 |
| Visual specs (flowcharts, charts, interactive) | ~$0.05 | ~$25 | ~$250 |
| Voice check, copyedit and proof passes | ~$0.08 | ~$40 | ~$400 |
| Lint and fact audit | code | $0 | $0 |
| Writing, style passes and images (today's ~$0.82) | already counted | already counted | already counted |
| **Added a month** | | **~$95** | **~$950** |
