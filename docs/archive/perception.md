> **Removed, November 2026.** Local Research, Perception and Content Map were taken out of the app. Their screens, routes, jobs and Zippie and MCP tools are gone; their tables stay in the database, unused. Kept here for history.

# Perception

The words AI uses for a brand, on one radar. It lives under AI Visibility → Perception (`/perception`).

Each brand gets 10 words, 7 good and 3 bad, like *Affordable, Simple, Integrated* and *Expensive, Complicated, Limited*. Every answer that names the brand is read once, and each word's score is the share of those answers that clearly say it. Every score links to the quotes behind it.

## The page

- **Radar.** Good words sit around the top and bad words across the bottom, on a light red zone. A shape that leans up reads as good. Your brand is Signal Blue. Up to 2 rivals show as black and gray outlines.
- **Logos, not names.** Rival toggles, the engine filter, legends, cards and quotes all use logos, with the name as the tooltip.
- **One sentence.** The verdict: what AI says about you, then the one thing to watch ("AI sees HubSpot as Affordable and Simple. GoHighLevel wins on Integrated.").
- **Seen as.** A tag beside the brand: the category AI puts it in most ("Seen as CRM 98%"), with In category or Off category against the brand's expected category. Click it to see every category with a bar per brand.
- **Three cards.** Biggest gap (the good word where a rival leads you most), Your concern (your top bad word, by engine), Their weak spot (a rival's top bad word).
- **Buyer answers / Asked directly.** Buyer answers come from the tracked prompts. Asked directly comes from the weekly questions about the brand.
- **Click a word** to see each brand's score, the split by engine, the quotes, and the full answer with the quote marked.
- The shared filters apply: period, topic (buyer answers only) and model.

## How it works

1. **The word list.** The first time an editor opens the page, Haiku picks 10 words for the brand's market from its name, category, topics and the brands AI names next to it (`wordsFor` in `src/lib/perceptionServer.ts`, through `/api/perception`). It's saved on `brands.perception` and stays fixed, so scores compare across weeks and brands.
   The same call writes 6 to 10 categories at one level of detail (a kind of product, never a feature, audience or opinion) and picks the one the brand should be in. They're saved on `brands.perception` as `categories` and `expected`. Brands set up before categories existed get their list on the next read.
2. **Read each run once.** The schedule queues a `perception` job for every finished run (`supabase/059_perception.sql` adds `runs.perception_read`). The job reads the run's saved answers 12 at a time. It judges the tracked brand and the 5 brands the run names most.
3. **Haiku picks, code proves.** Haiku picks up to 5 words per brand per answer, each with a quote copied from the answer. `checkWords` in `src/lib/perception.ts` keeps a word only when:
   - it's on the list,
   - its quote is really in the answer,
   - the quote sits in a sentence about that brand (`splitAnswer` decides who each sentence is about, from names and headings),
   - and it isn't a bad word pulled from a comparison on a prompt about leaving the brand ("HubSpot alternatives").
   The same Haiku read also picks one category per brand from the list. The JSON schema only allows names on the list (or "" when the answer doesn't say), and `cleanCategory` checks it again. So "office crm", "flexible crm" and "sales pipeline tool" can never become new labels: they all have to land on "CRM" or be left out.
4. **Direct questions, weekly.** On paid plans, a `perception_probe` job runs once a week per brand, on the brand's own day. It asks ChatGPT, Gemini, Perplexity, Claude and AI Mode "Describe {brand} in a few words" and "Why might someone decide not to choose {brand}?" about the brand and its 3 top rivals. Answers that say the model doesn't know the brand are marked, and the page shows "Not known when asked".
5. **Count.** `perception_summary` (SQL) sums answers, word hits and categories per brand, engine and prompt. Seen as counts buyer answers and the direct "describe" question, never the objections question. The page turns that into shares with `scoresFromSummary`. Fewer than 3 answers shows a dash.

A wrong word costs more than a missing one, so every rule leans toward leaving a word out. `tests/perception.test.ts` covers the answer layouts that broke earlier versions: bold numbered headings, "Label: **Brand**" headings, bold subtitles, comparison headings, glued citations, and alternatives prompts.

## Files

| Part | File |
|---|---|
| Rules, scoring, verdict (pure, tested) | `src/lib/perception.ts`, `tests/perception.test.ts` |
| Word list, reading, weekly questions | `src/lib/perceptionServer.ts` |
| Jobs and schedule | `src/lib/worker/handlers.ts` (`schedule`), `src/app/api/worker/route.ts` |
| Plain questions to an engine | `askPlain` in `src/lib/engines.ts` |
| Page | `src/components/PerceptionPage.tsx` |
| First word list | `src/app/api/perception/route.ts` |
| MCP and Zippie | `get_brand_perception` in `src/lib/mcp/tools.ts` |
| Tables | `supabase/059_perception.sql` |

## Setup

Run `supabase/059_perception.sql`, then `supabase/060_perception_category.sql`, with `psql` on the VPS database. Until 060 runs, reads are saved without a category and the Seen as tag stays hidden. Before it runs, the schedule queues nothing and the page asks for it. The last 30 days of runs are read once, newest first, up to 40 runs every 10-minute tick. A one-time cost of about $0.0003 per answer, so roughly $2 for a team with 6,500 answers a month.

Reads are saved with plain inserts (`insertReads` in `src/lib/perception.ts`). The buyer key is a partial index, and an upsert can't name one, so version 1 saved nothing; version 2 reads every run again under new job keys. A retried batch skips rows it already saved.

A brand's first direct questions go out once, right after its first run is read, so its own words show before its weekly day. That is one extra round per brand, about 40 engine answers plus their Haiku reads, roughly $0.45 (check): about $35 once at Beta (50 teams, 1.5 brands each) and about $340 once at Growth (500 teams). It adds nothing per month.

## Running cost

Assumes a team checks 50 prompts on the 6 engines (Claude and Perplexity weekly), about 6,500 answers a month, and tracks 1.5 brands. Haiku 5.5 is $0.10 per million input tokens and $0.50 per million output (the prices in `src/lib/meter.ts`, check). Each read is about 2,000 tokens in and 250 out.

| Monthly | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Haiku reading buyer answers, ~$0.0003 each | ~$105 | ~$1,050 |
| Weekly direct questions, paid plans (~80% of teams): about 260 engine answers per team at ~$0.01 each (check), plus Haiku reading them | ~$110 | ~$1,080 |
| Word and category lists, once per brand | under $1 | under $5 |
| Seen as: about 20 more output tokens per read, in the same call | under $1 | about $3 |
| Postgres on the VPS for `perception_reads`, about 6.5 MB per team a month (check) | ~$1 | ~$10 |
| **Added per month** | **~$215** | **~$2,150** |

The direct questions are the line to watch. Asking rivals monthly instead of weekly cuts that line by about two thirds.

## Next

- Editing the word and category lists on the page.
- A "Fix" button on a weak or bad word that adds a brief to the Editorial Calendar.
- An alert when a bad word jumps, and a radar slide in reports.
