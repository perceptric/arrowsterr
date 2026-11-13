# Zippie skills, the writer persona and every anti-AI writing skill

Three changes:

1. **The writer uses every writing skill we use for Perceptric**, so drafts read like a careful person wrote them in the brand's own voice.
2. **Zippie gets Skills and Knowledge the way Otto has them in Omniscient**, and takes over technical SEO and internal linking as skills he runs in chat.
3. **Onboarding learns the brand and builds a full writer persona** before the first draft.

The current draft editor stays as it is. Written November 13, 2026.

---

## 1. Where we start

| Piece | Today | Change |
|---|---|---|
| Writer style passes | 5 skills in `skills/` (humanizer, anti-ai-writing, writing-enforcer, proofread, claim-boundary-checker) as one cached system prompt (`writerStyle.ts`) | All 23 writing skills, each placed at the step it fits (section 2) |
| Voice | The Perceptric voice with the brand's name, plus a pasted sample (`brandSetup.ts`, `houseRules.ts`) | A full writer persona built at onboarding (section 4) |
| Zippie skills | 7 short built-in instructions (`zippieSkills.ts`) that a workspace can turn off or add to | Playbook skills in the Agent Skills format, in 3 scopes, picked by `/` or by Zippie himself (section 3) |
| Zippie Knowledge | Files, links and notes (`ZippiePage.tsx`, `read_knowledge`) | Kept, with Add to Knowledge from chat and pages by kind, as in Omniscient |
| Technical SEO | Removed as pages and saved crawls (PR 133) | Zippie runs the checks on demand in chat, with no saved crawl (section 3.2) |
| Fixes on the site | `propose_changes` with plays alt, meta, schema, faq, links (`plays.ts`), each waits for approval | New plays for redirects, broken links, canonicals and robots rules, all still waiting for approval |

---

## 2. Every anti-AI writing skill, and where it runs

The writer runs these in order on every draft. The same skills are also Zippie skills, so a person can run any of them on any text in chat. Each keeps its license file (MIT, Apache 2.0 or CC-BY-SA 4.0) in `skills/`.

| Step | Skill | What it does in the writer |
|---|---|---|
| Persona | `voice-profiler` | Builds the brand's writer persona at onboarding (section 4) |
| Research | `writing-fragments` | Turns the research into frozen fact notes, one fact per note with its quote |
| Order | `writing-beats` | Orders the points so each builds on the one before |
| Draft | `writing-shape` | Writes block by block: prose for argument, lists only for parallel items, tables for repeated shapes |
| Draft | `draft-content`, `content-creation` | Channel rules: title, meta, H2s, FAQ, CTA |
| Claims | `claim-boundary-checker` | A ledger of every claim: supported, unsupported or uncertain, each fixed |
| Lint | `perceptric-writer` lint, ported to `houseLint.ts` | Code checks: dashes, contrast lines, lists of three, recap endings, paragraph length, reading level |
| AI tells | `anti-ai-writing` (strict review) | Finds banned words, banned structures and the deeper tells (stated morals, tidy endings, vague references) |
| AI tells | `humanizer` | The Wikipedia "Signs of AI writing" patterns |
| AI tells | `writing-enforcer` | The 47-pattern check as a second opinion |
| Structure | `proseshape` | Fixes default shapes: hook, three tips, upbeat close, epilogue paragraph |
| Voice | `humanize` | Rewrites flagged lines in the brand's persona (from step 1) |
| Voice | `brand-review` | Flags lines that could sit on any other blog and sections with no named thing |
| Simple | `plain-language`, `orwells-rules` | Short everyday words at the persona's reading level, no dead phrases |
| Facts | `humanizer-en` post-edit audit, ported to `factAudit.ts` | After every rewrite: no number, date, name, quote, link or hedge changed. A changed line goes back |
| Copyedit | `redline-edit` (medium) | Errors, consistency, wordiness |
| Length | `cut-to-length` | Only when the brief sets a word target |
| Series | `style-sheet` | Keeps spellings and terms the same across a brand's posts |
| Proof | `proofread` | Ship or Hold. Hold keeps Publish off |
| Update | `content-refresh` | For Update a live page: dated facts marked current, stale or to check |
| Routing | `writing-quality-router` | Zippie only: picks the right skill when someone asks to "fix this text" |
| Not used | `business-writing`, `business-writing-intent-enforcer`, `journalism-ap` | Memos and press releases. Available as Zippie skills, outside the article writer |

**How the text goes in:** each skill's rules are rewritten as our own short checklists (as `STYLE_SYSTEM` does today) and cached once for every article. Tool, file and script parts of a skill are left out. `node scripts/skills.mjs` rebuilds `skillText.ts` from `skills/`.

**What fixes are allowed:** only flagged lines are rewritten, and the fact audit runs after each pass. The lint runs again after every rewrite, since rewrites bring tells back.

---

## 3. Zippie skills

### 3.1 How skills work (taken from Omniscient)

- **Format:** a skill is a folder led by `SKILL.md` in the Agent Skills format: a name, a description that says when to use it ("Use it when..."), the tools it may call, then sections for When to use, When not to use, Steps, Hard calls, Output and Rules. Extra files hold long reference lists.
- **Scopes:** System (ours, read only, copy to change), Workspace (owners and admins edit) and Personal.
- **Picking:** type `/` in the chat to pick one, or Zippie picks one himself from the descriptions with `use_skill`. The answer shows "Used Site health check".
- **Saving from chat:** Create a skill and Add to Knowledge end in a card with Save. Nothing is written before the click.
- **Changes to a site** always go through `propose_changes` and wait for approval.
- **Checks:** a test makes sure every system skill names only tools Zippie has. Evals check that a plain sentence picks the right skill.

### 3.2 New tools Zippie needs

| Tool | What it does | Cost |
|---|---|---|
| `crawl_page` | Reads one page: status, redirects, title, meta, canonical, robots tags, hreflang, headings, links, images, structured data, word count | Free (our server) |
| `crawl_site` | Reads up to 200 pages from the sitemap and internal links, with the same fields | Free, about 2 minutes |
| `check_urls` | Status and redirect chain for a list of links | Free |
| `page_speed` | Google PageSpeed Insights for a URL, mobile and desktop | Free up to 25,000 a day (check) |
| `read_robots` | robots.txt and the sitemap index, read and checked | Free |
| `get_rankings` | The rank tracker's keywords and positions for a page or domain | Already paid in Traffic |
| `get_clusters` | Opportunities clusters, pillars and pages | Free |

New plays for `propose_changes`: `redirects` (a redirect map, on CMSs that support it), `fix_links` (swap or remove broken links), `canonical`, `robots` (AI crawler rules).

### 3.3 Every skill Zippie can run

**Technical SEO**

| Skill | What it does | Tools |
|---|---|---|
| Site health check | Crawls up to 200 pages and reports errors, redirect chains, broken pages, noindex pages, canonical problems, duplicate titles and descriptions, thin pages and orphan pages, most harmful first | `crawl_site`, `check_urls` |
| Page audit | Checks one URL from top to bottom and lists each fix with the reason | `crawl_page`, `page_speed` |
| Indexing check | robots.txt, sitemap, noindex, canonicals and blocked files: what Google can and can't reach | `read_robots`, `crawl_site` |
| Page speed | Core Web Vitals for key page types, with fixes in plain words | `page_speed` |
| Broken links and redirects | Finds broken internal and outside links and proposes redirects or swaps | `crawl_site`, `check_urls`, `propose_changes` (fix_links, redirects) |
| Structured data | Checks JSON-LD and adds Article, FAQ, HowTo, Product or LocalBusiness where it fits | `crawl_page`, `propose_changes` (schema) |
| Image check | Missing alt text and oversized images | `crawl_site`, `propose_changes` (alt) |
| Canonicals and duplicates | Finds duplicate pages and proposes the right canonical | `crawl_site`, `propose_changes` (canonical) |
| Hreflang check | Language and region tags that point back to each other | `crawl_site` |
| Site move check | Compares an old URL list with the new site and builds the redirect map | `check_urls`, `propose_changes` (redirects) |
| AI crawler access | Which AI bots robots.txt lets in (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) and the rules to change | `read_robots`, `propose_changes` (robots) |
| llms.txt writer | Writes the site's llms.txt (exists today) | `get_site_content` |

**Internal linking**

| Skill | What it does | Tools |
|---|---|---|
| Cluster link plan | For one cluster: which pages link to the pillar, which the pillar links to, and the anchor for each | `get_clusters`, `crawl_site` |
| Add internal links | Links a post to up to 3 related pages using words already in the text (exists as a play) | `propose_changes` (links) |
| Orphan page rescue | Pages nothing links to, and the older posts that should link to them | `crawl_site`, `propose_changes` (links) |
| Link a new post | When a post goes live, adds links to it from 3 to 5 older posts | `get_site_content`, `propose_changes` (links) |
| Anchor text review | Anchors that are vague ("click here") or repeat the same exact keyword too often | `crawl_site` |
| Cannibalization check | Two pages fighting for one keyword, and whether to merge, redirect or split | `get_rankings`, `get_clusters`, `crawl_page` |

**On-page and content**

| Skill | What it does | Tools |
|---|---|---|
| Meta titles and descriptions | Exists | `propose_changes` (meta) |
| FAQ sections | Exists | `get_prompt_answers`, `propose_changes` (faq) |
| Content refresh | Marks each dated fact on a live page current, stale or to check, then plans the update (`content-refresh`) | `crawl_page` |
| Answer-first rewrite | Rewrites a section so it answers the question in the first sentence, the way AI answers and featured snippets quote | `crawl_page`, `get_prompt_answers` |
| Content brief | A brief for one keyword from the top pages and AI answers | `find_content_gaps`, `get_prompt_answers` |

**AI visibility**

| Skill | What it does | Tools |
|---|---|---|
| AI visibility review | Exists | `get_ai_visibility`, `get_visibility_trend` |
| Competitor teardown | Exists | `get_competitors`, `get_prompt_answers` |
| Prompt finder | Suggests prompts to track from the plan and the market | `get_content_plan`, `add_prompts` |
| Cited source outreach | Sources AI cites that never mention the brand, and what to pitch each one | `get_cited_sources` |
| Community replies | Exists | `get_prompt_answers` |

**Research and reporting**

| Skill | What it does | Tools |
|---|---|---|
| Content gaps | Topics competitors rank or get cited for that the brand doesn't cover | `find_content_gaps` |
| Cluster review | Checks the Opportunities clusters and suggests merges or splits | `get_clusters` |
| Rank drop explainer | Why a keyword fell: page changes, new competitors, lost links, a split between two pages | `get_rankings`, `crawl_page` |
| Monthly SEO report | Rankings, AI visibility, posts published and the next 3 moves | `get_rankings`, `get_ai_visibility`, `get_content_plan` |

**Writing (the anti-AI skills from section 2, for any text in chat)**

Writer persona, Humanize in our voice, Anti-AI review, 47-pattern check, Fix default structure (ProseShape), Claim check, Fact-safety check, House lint, Plain language, Brand review, Copyedit, Proofread, Cut to length, Style sheet, Business writing (memos and plans), Press release (AP style). Each says which text it's for, and "Fix this text" picks one through the router.

**Helpers (from Omniscient)**

Create a skill, Add to Knowledge (pages by kind: "Competitor: Acme", "Product: Glide 3", "Persona: Stride writer").

That's 50 skills in all: 12 technical SEO, 6 internal linking, 5 on-page, 5 AI visibility, 4 research and reporting, 16 writing, 2 helpers.

---

## 4. The writer persona at onboarding

This step is required. The first draft waits for it.

**What it reads** (on the server, while the person answers the onboarding questions):

1. The homepage, the about page and up to 5 product or service pages.
2. Up to 8 of the brand's own blog posts, newest first, from the sitemap.
3. Anything the person adds: a link to a post they like, or a pasted sample.

**What it builds** (the `voice-profiler` method, one Sonnet call plus code stats):

- **Voice stats in code** from the brand's own posts: sentence and paragraph length, "we", "I" or "you", contractions, reading grade, list and heading habits.
- **The persona:**
  - who the writer is (only what the site says), the reader, and the point of view the brand argues
  - tone words, words to use and words to avoid, and how to write the brand's name
  - approved proof: each number or client result the site states, with its URL
  - claims to never make
  - the CTA
- **A sample paragraph** in that voice, for the person to approve.

**What the person sees:** the last onboarding step, "Your writer". It shows the persona card and the sample paragraph, with Edit and Looks right.

**Where it's saved:** in `brand_voices` (voice, sample and persona) and as a Knowledge page "Persona: {Brand} writer". The writer and Zippie both read it.

**With no blog:** it uses the homepage copy for tone and the house rules for the rest. A line says "Add 2 posts you like to make it sharper".

**Rules it never breaks:** no invented experience, clients, numbers or stories. A gap becomes a question on the card.

---

## 5. Phases

| Phase | Weeks | Ships | Done when |
|---|---|---|---|
| 1. Writer persona at onboarding | 1.5 | Reading, voice stats, persona, "Your writer" step, saved to voice and Knowledge | On the 20 recorded topics' brands, every persona has only facts from the site, and its sample paragraph passes the house lint |
| 2. All writing skills in the writer | 2 | `skillText.ts` from all skills, the new passes in section 2, `houseLint.ts`, `factAudit.ts` | On the 20 baseline topics, house rule findings fall from 4.6 per article to under 1, and no fact changes through the passes |
| 3. Skills like Omniscient | 1.5 | `SKILL.md` format, 3 scopes, `/` menu, `use_skill`, Create a skill, Add to Knowledge, evals | Evals pick the right skill on 35 plain sentences |
| 4. Technical SEO and linking skills | 2 | The tools in 3.2, the new plays, the 18 technical and linking skills | Each skill runs on 3 test sites and every proposed change waits for approval |
| 5. The rest of the catalog | 1 | On-page, AI visibility, research, reporting and writing skills in chat | Every system skill names only tools Zippie has |

**Status, November 13, 2026:** Phases 3, 4 and 5 shipped in #136. The sidebar has Home and Zippie tabs, the chat bar floats on every page and opens Zippie on the right, and Skills and Knowledge have their own pages. All 50 system skills and the new tools are live. The skill-picking evals and the 3-site runs are still to do.

**Phase 1 shipped (writer persona).** Onboarding starts building the persona as soon as the site is read, and "Your writer" is the last step: the persona card, the measured voice stats and the sample paragraph, with Edit and Looks right. Saving writes the voice and the persona to `brand_voices` (087), the brand's own posts as the voice sample when it has none, and the Knowledge page "Persona: {Brand} writer". Every writer prompt now carries the persona: who writes, the point of view, approved proof and claims to never make. Brand > Tone of voice shows it with Edit and Build again. Code: `src/lib/writerPersona.ts` (pure), `writerPersonaRead.ts`, `writerPersonaServer.ts`, `/api/writer-persona`, `src/components/WriterPersona.tsx`.

Tried on 5 real brands (perceptric.com, ahrefs.com, basecamp.com, allbirds.com, stripe.com) with `scripts/writer-persona-try.mjs`: 53 of 54 proof lines quoted their page word for word and were kept, the one that didn't was dropped, every sample paragraph passed the house rules on the first try, and a build took 12 to 25 seconds. Phase 2 is next.

About 8 weeks for one engineer. Phase 2 is the same work as Phase 5 of `docs/draft-and-write-build.md`, so they ship together.

---

## 6. Running cost

Claude Sonnet 5.5 at $2 in and $10 out per million tokens (check). Beta is 50 teams, Growth 500. Assumes 3 new brands a team in the first month and 10 articles a team a month.

| Line | Each | Beta a month | Growth a month |
|---|---|---|---|
| Writer persona (pages read free, 1 call: measured about 19K in and 2.5K out on 5 brands) | ~$0.06 a brand | ~$9 in the first month, ~$2 after | ~$90 first month, ~$20 after |
| Bigger cached skill text (about 60K tokens, read about 7 times a draft) | ~$0.08 an article | ~$40 | ~$400 |
| Humanize-in-persona and ProseShape passes | ~$0.06 an article | ~$30 | ~$300 |
| Zippie skill runs (20 a team a month, ~$0.10 each) | ~$0.10 a run | ~$100 | ~$1,000 |
| Crawls, link checks, robots | our VPS | $0 | $0 |
| PageSpeed Insights | free quota (check) | $0 | $0 |
| **Added a month** | | **~$172** (first month ~$179) | **~$1,720** (first month ~$1,790) |

The voice check, claim ledger, copyedit and proof passes are counted in `docs/draft-and-write-build.md` and are left out here.
