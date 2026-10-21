# Free tools

Seventeen free tools on arrowsterr.com. Each one answers a real question in under a minute and ends with a button that starts the Free plan with the result already loaded. They all follow the AI Snapshot pattern that already works (`src/app/api/snapshot/route.ts`, `pages/snapshot` in the site repo).

## Status

| Built | What |
|---|---|
| Yes | Shared parts: `src/lib/freeTools.ts` (guard), `src/lib/freeLimits.ts` (limit rules, tested), `/api/free/[tool]`, `supabase/044_free_tools.sql` |
| Yes | 5 Free Keyword Tool, at arrowsterr.com/free-tools/keyword-tool/ and the hub at /free-tools/ |
| Yes | Keyword Volume Checker and Keyword Difficulty Checker (same API as the keyword tool) |
| Yes | AI Crawler Checker, llms.txt Generator, AI Answer-Ready Checker, Domain Authority Checker, Page Speed Checker, Broken Link and Redirect Checker (`src/lib/freeRunners.ts`), Keyword Clustering Tool (in the browser) |
| No | ChatGPT Rank Checker, AI Overview Checker, AI Prompt Generator, AI Sources Finder, AI Share of Voice, AI Schema Generator, Domain Snapshot |
| No | Third set (planned below): Website Traffic Checker, Backlink Checker, Keyword Rank Checker, Keyword Gap Tool, Schema Markup Generator, Meta Title and Description Generator, Robots.txt Tester |
| No | Long content under every tool page (planned below) |

**Second set, how each works:**

| Tool | Built on | Cost a run | Limits (per visitor a day / all visitors a day / saved for) |
|---|---|---|---|
| AI Crawler Checker | robots.txt read the way Google reads it, plus the homepage asked for as GPTBot, ClaudeBot and PerplexityBot to spot firewall blocks | $0 | 20 / 3,000 / 1 day |
| llms.txt Generator | The site's sitemap (or homepage links), the top 40 pages opened for titles | $0 | 10 / 1,000 / 7 days |
| AI Answer-Ready Checker | Mozilla Readability (open source) for the main content, 13 weighted checks in `freeChecks.ts` | $0 | 20 / 3,000 / 1 day |
| Domain Authority Checker | Open PageRank (free API, `OPR_API_KEY`) and the Tranco list (free) | $0 | 20 / 2,000 / 7 days |
| Page Speed Checker | Google PageSpeed Insights (free API, `PAGESPEED_API_KEY`) | $0 | 10 / 1,500 / 1 day |
| Broken Link and Redirect Checker | Its own crawler: 25 pages, 250 links, HEAD then GET | $0 | 5 / 300 / 1 day |
| Keyword Clustering Tool | all-MiniLM-L6-v2 through transformers.js, in the visitor's browser. Falls back to shared words when the model can't load | $0, no server | none |

**Safety:** every address a visitor types goes through `src/lib/safeFetch.ts`. It refuses private, local and cloud metadata addresses at connect time, for each redirect too, so DNS tricks can't reach the server's own network. Tools that cost nothing keep working when the paid tools hit the day's spend. A visitor gets 40 new runs a day across all tools.

**More setup (optional):**
- `OPR_API_KEY`: a free key from openpagerank.com. Without it, the authority tool shows only the Tranco rank.
- `PAGESPEED_API_KEY`: a free Google Cloud key with the PageSpeed Insights API on. Without it, Google allows only a few tests a day.

**Setup:**
- Run `supabase/044_free_tools.sql` in Supabase.
- Optional server settings: `FREE_CAP_KEYWORD` (default 500 runs a day), `FREE_PER_TOOL` (5), `FREE_PER_VISITOR` (15), `FREE_SPEND_DAY` (15 dollars), `FREE_ALERT_EMAIL` (who hears when the spend alarm trips).
- Bot check: set `TURNSTILE_SECRET` on the app and `AW_TURNSTILE_SITEKEY` in the site's wp-config.php together, or neither.

**How the limits work, in order:**
1. A saved result for the same keyword and country (30 days) comes back free and counts toward no limit.
2. A visitor gets 5 new runs a tool and 15 across tools in 24 hours, then is asked to sign up.
3. The tool stops at its daily cap, and all paid runs stop when the day's spend passes `FREE_SPEND_DAY` (one email a day). Both reset at midnight UTC.
4. A run counts from the moment it starts, so many at once can't slip past. A failed run gives the visitor's run back.
5. Free tool spend is logged per run in `free_runs.cost`, since the cost ledger needs a workspace.

## Shared parts (build once)

**App: one public route for every tool.** `src/app/api/free/[tool]/route.ts` holds a handler for each tool, plus one guard in `src/lib/freeTools.ts` that every tool goes through:
- **CORS:** only arrowsterr.com may call it, like the snapshot route.
- **Input:** checked and cleaned per tool, such as a domain, a keyword or a brand.
- **Saved results:** in `free_runs`, keyed by tool and input. A repeat run within the tool's save time is free and doesn't count toward any limit.
- **Limits:**
  - Per visitor: a hashed IP, 5 runs a day per tool and 15 across all tools.
  - Per tool a day: `FREE_CAP_<TOOL>` caps the total, so a burst can't run up the bill.
- **Bot check:** Cloudflare Turnstile when `TURNSTILE_SECRET` is set. It's free.
- **Cost tracking:** every paid call goes to `cost_ledger` as "free tool: {name}" through `charge()`.

**Database:** `supabase/044_free_tools.sql` adds the `free_runs` table:
- Columns: `id`, `tool`, `key`, `ip_hash`, `result jsonb`, `cost`, `created_at`.
- Indexes on (tool, key, created_at) and (ip_hash, created_at).
- Row-level security is on with no policies, so only the server reads and writes it.

**Site:**
- One template, `inc/free-tool.php`: hero, form, result, how it works, FAQ, CTA.
- One script, `assets/free-tools.js`, that draws each tool's result as text only, never HTML from the API.
- A hub page at `/free-tools/` links all of them. The header and footer get a "Free tools" link.
- Each tool links to two related tools and to the matching blog posts.

**Hand-off to the app:**
- "Track this daily" opens `app.arrowsterr.com/?from={tool}&q={input}`.
- Onboarding reads it, so the brand, prompts or keyword are already filled in when the Free plan starts.

**Tracking:** each run and each CTA click is an Umami event, so we can see which tool brings sign-ups.

## The tools

| # | Tool and page | Someone enters | They get | Built from | Cost a run | Saved for |
|---|---|---|---|---|---|---|
| 1 | AI Crawler Checker `/free-tools/ai-crawler-checker` | A domain | Each AI bot (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent) shown as allowed or blocked, with the robots.txt line that decides it. It also checks for a firewall block, by loading the homepage as GPTBot and comparing the answer. Includes the fix to paste. | `AI_BOTS` and robots reading in `audit.ts` | $0 | 1 day |
| 2 | llms.txt Generator `/free-tools/llms-txt-generator` | A domain | A ready llms.txt: the site summary, then its key pages in sections. Copy or download. | `findPages()` in `sitemap.ts`, `fetchSite()`, Haiku | ~$0.01 | 7 days |
| 3 | ChatGPT Rank Checker `/free-tools/chatgpt-rank-checker` | A brand or domain and one buyer question | Whether ChatGPT names the brand, in what spot, which brands it names instead, and the pages it cites | `answerChat()` with the ChatGPT engine | ~$0.005 to $0.02 (check) | 7 days per question |
| 4 | AI Overview Checker `/free-tools/ai-overview-checker` | A keyword and a country | Whether Google shows an AI Overview, the links it cites, and the top 10 below it | `serp()` in `kwReport.ts` (already saved 7 days) | ~$0.002 to $0.004 (check) | 7 days |
| 5 | Free Keyword Tool `/free-tools/keyword-tool` | A keyword and a country | Volume, KD, CPC, intent, 12-month trend, 10 variations and 5 questions. "See all with broad, phrase and exact match" leads to the app. | `keywordReport()` pieces (saved 30 days, shared) | ~$0.02, often $0 | 30 days |
| 6 | AI Prompt Generator `/free-tools/ai-prompt-generator` | A website or a category | 20 questions buyers ask AI, in 4 groups: learning, comparing, choosing and asking about the brand. "Track these" leads to the app. | The snapshot's prompt step, made longer | ~$0.003 | 30 days |
| 7 | AI Sources Finder `/free-tools/ai-sources-finder` | A topic or keyword | The sites ChatGPT, AI Overviews and AI Mode cite most for it, ranked, with the cited pages | Three answers through `answerChat()`, plus `cleanSources()` | ~$0.01 to $0.02 (check) | 7 days |
| 8 | AI Share of Voice `/free-tools/ai-share-of-voice` | A domain and up to 3 competitors | Who AI names most across 5 buyer questions on ChatGPT and AI Mode, as a share bar | The snapshot pipeline with competitors added | ~$0.05 to $0.10 | 7 days |
| 10 | AI Schema Generator `/free-tools/schema-generator` | Organization details and FAQs, or a domain to fill them in | Organization, FAQPage and Product JSON-LD to paste in, checked against schema.org types | Templates in the browser; Haiku only for "Fill from my site" | $0 to ~$0.003 | 30 days |
| 11 | AI Readiness Audit `/free-tools/ai-readiness-audit` | A domain | A score from 0 to 100 and the top fixes: bots blocked, text only visible with JavaScript, missing headings and schema, no llms.txt, slow pages | `audit.ts` limited to 5 pages, plus Google PageSpeed Insights (free API key) | $0 | 1 day |
| 12 | Domain Snapshot `/free-tools/domain-overview` | A domain and a country | Google traffic, keyword count, top 10 keywords and top 5 pages | `domainOverview()`, `rankedFor()` and `relevantPages()` | ~$0.03 (check) | 30 days |

The current AI Snapshot stays as it is. Tools 3, 7 and 8 link to it as "check your whole brand".

## Third set: research and on-page

Seven more tools. Four are research tools that lead into the paid research screens. Three are on-page tools that lead into Zippie's skills in the app. Numbered 13 to 19 here so they don't clash with the table above.

### Research tools

| # | Tool and page | Someone enters | They get | Built from | Cost a run | Saved for |
|---|---|---|---|---|---|---|
| 13 | Website Traffic Checker `/free-tools/website-traffic-checker` | A domain and a country | Estimated Google visits a month, traffic value in ad dollars, keyword count, and the top 5 pages with their visits and keywords | `domainOverview()`, `relevantPages()` with a limit of 5, `bulkDomains()` for the value (already saved 30 days) | ~$0.02 (check) | 30 days |
| 14 | Backlink Checker `/free-tools/backlink-checker` | A domain or a page | Total backlinks, referring domains, dofollow share, and the top 20 backlinks: one per site, strongest first, with the linking page, anchor text, the page it points to, follow or nofollow, and first seen | DataForSEO Backlinks: `backlinks/summary`, then `backlinks/backlinks` with `mode: one_per_domain`, `limit: 20`, sorted by rank | ~$0.05 (check) | 7 days |
| 15 | Keyword Rank Checker `/free-tools/keyword-rank-checker` | A domain, one keyword and a country | Google: the domain's spot in the top 100, the page that ranks, and the features on the page (AI Overview, People also ask, ads). AI Mode: whether the answer cites the domain, its spot among the sources, and whether the text names it | `topUrls()` widened to 100 results, and the AI Mode engine in `dataforseo.ts` | ~$0.025 (check) | 1 day |
| 16 | Keyword Gap Tool `/free-tools/keyword-gap` | Your domain, a rival's domain and a country | The top 20 keywords the rival ranks for in the top 20 and you don't rank for in the top 100, by volume: keyword, volume, KD, intent, the rival's spot and page. Plus the total count of the gap | `intersect()` from `api/research/gap/route.ts`, moved into `src/lib/gap.ts` so both use it | ~$0.015 (check) | 7 days |

**How each one works:**
- **Website Traffic Checker:** shares saved results with Domain Snapshot (12), so a run of one fills the other. The number is labelled "Google visits (estimate)". "See every page and keyword" opens Website Research in the app with the domain loaded (`?from=traffic&q={domain}`).
- **Backlink Checker:** a page address checks that one page, a bare domain checks the whole site. Spam scores from DataForSEO hide links above 60. It links to the Domain Authority Checker for the same domain. The app has no backlinks screen yet, so "See all backlinks" opens Website Research until one exists.
- **Keyword Rank Checker:** the Google and AI Mode results are saved per keyword and country for 1 day, shared across domains. A second domain checking the same keyword costs $0. Desktop results only. "Track this keyword daily" opens rank tracking in the app with the keyword and domain filled in.
- **Keyword Gap Tool:** the two domains must differ, and both go through `cleanDomain()`. The cache key keeps the order, rival first. "See the full gap" opens Competitors in the app with the rival added.

**DataForSEO setup:** Backlinks API access has to be turned on in the DataForSEO account. A third-party summary says the $100 monthly minimum ended on July 1, 2026, with Backlinks prices up 20%. Check both on dataforseo.com before launch.

### On-page tools (tie to Zippie)

| # | Tool and page | Someone enters | They get | Built from | Cost a run | Saved for |
|---|---|---|---|---|---|---|
| 17 | Schema Markup Generator `/free-tools/schema-generator` | A type (FAQ, Article, Product, Organization or LocalBusiness) and its fields, or a page address to fill them in | JSON-LD to copy, checked against the schema.org fields Google needs for that type, with missing fields flagged | Templates in the browser; Haiku 5.5 only for "Fill from my page", reading the page through `safeFetch` and Readability | $0, ~$0.001 with fill | 30 days (fill only) |
| 18 | Meta Title and Description Generator `/free-tools/meta-generator` | A page address, or a topic and a main keyword | 5 titles and 5 descriptions, each with its character count and a Google snippet preview (desktop and mobile) that cuts off where Google does | Haiku 5.5 with the rules from Zippie's `meta-writer` skill (`zippieSkills.ts`). The preview measures pixel width in the browser: 580px for titles, 920px for descriptions | ~$0.001 | 7 days |
| 19 | Robots.txt Tester `/free-tools/robots-txt-tester` | A domain, or pasted robots.txt text, plus a path and a bot | Allowed or blocked for that path, the exact line that decides it, and the same answer for Googlebot, Bingbot and the 10 AI bots at once. The text can be edited on the page and re-tested | `robotsOf()` in `freeRunners.ts` to fetch, `robotsVerdicts()` in `freeChecks.ts` to decide (Google's rules: the longest match wins, Allow wins a tie) | $0 | 1 day (fetch only) |

**How each one works:**
- **Schema Markup Generator:** replaces tool 10 (AI Schema Generator) and adds Article and LocalBusiness. One page targets "schema markup generator", with a section for each type. "Add this to every page" opens the app with Zippie's `faq-builder` skill and the page loaded, so the schema goes in through the CMS sync.
- **Meta Title and Description Generator:** never shows a title that breaks the meta-writer rules: anything over 60 characters or under 30 is rewritten before it is shown. "Fix every page on my site" opens the app with Zippie's `meta-writer` skill, which proposes changes through `propose_changes` with play "meta".
- **Robots.txt Tester:** `robotsVerdicts()` moves to a file that both the server and the browser can load, so edits re-test with no server call. It links to the AI Crawler Checker, and the Crawler Checker links back. "Watch my robots.txt" opens AI Visibility in the app, where the daily audit flags a new block.

**Code:** `FreeTool` in `freeLimits.ts` gets `traffic`, `backlinks`, `rank`, `gap`, `schema`, `meta` and `robots`. Each gets a case in `/api/free/[tool]` and a runner in `freeRunners.ts`. The schema template code and the robots parser run in the browser, so those two pages work even when the API is down.

### Limits for the third set

They go through the same `freeRun()` guard and `freeBlock()` rules as every other tool: saved results are free, then the per-visitor limits, then the tool's daily cap, then `FREE_SPEND_DAY` for paid tools. The 40 runs a visitor gets a day across all tools stays the same.

| Tool | Per visitor a day | All visitors a day | Saved for | Paid | Most it shows |
|---|---|---|---|---|---|
| 13 Website Traffic Checker | 5 | 300 | 30 days | Yes | Top 5 pages |
| 14 Backlink Checker | 3 | 150 | 7 days | Yes | Top 20 backlinks, one per site |
| 15 Keyword Rank Checker | 5 | 200 | 1 day | Yes | One keyword, top 100 on Google |
| 16 Keyword Gap Tool | 5 | 200 | 7 days | Yes | Top 20 keywords |
| 17 Schema Markup Generator | 10 fills | 1,000 fills | 30 days | Yes | One page read for "Fill from my page" |
| 18 Meta Title and Description Generator | 10 | 500 | 7 days | Yes | 5 titles, 5 descriptions |
| 19 Robots.txt Tester | 20 fetches | 2,000 fetches | 1 day | No | One robots.txt, 500 KB |

**What counts as a run:**
- **Schema Markup Generator:** only "Fill from my page" counts. Building schema from typed fields runs in the browser and has no limit.
- **Robots.txt Tester:** only fetching a site's robots.txt counts. Pasted text and every re-test after an edit run in the browser and have no limit.
- **Keyword Rank Checker:** one domain and one keyword is one run. A keyword someone else checked that day comes back from the saved result and counts toward no limit, even for a new domain.
- **Keyword Gap Tool:** one pair of domains is one run. Swapping the two domains is a new run.

**Input limits, checked before a run counts:**
- Domains go through `cleanDomain()`. The gap tool refuses the same domain twice.
- Keywords go through `cleanKeyword()`: 2 to 80 characters.
- Topics for the meta generator: 2 to 120 characters. Pasted robots.txt: 500 KB at most.

**Code:** each tool gets a line in `FREE_TOOLS` in `freeLimits.ts`:

```ts
traffic: { perTool: 5, cap: 300, saveDays: 30, paid: true },
backlinks: { perTool: 3, cap: 150, saveDays: 7, paid: true },
rank: { perTool: 5, cap: 200, saveDays: 1, paid: true },
gap: { perTool: 5, cap: 200, saveDays: 7, paid: true },
schema: { perTool: 10, cap: 1000, saveDays: 30, paid: true },
meta: { perTool: 10, cap: 500, saveDays: 7, paid: true },
robots: { perTool: 20, cap: 2000, saveDays: 1, paid: false },
```

`FREE_PER_TOOL` sets the per-visitor limit for every paid tool at once, so today it would set the Backlink Checker to 5 as well. Add `FREE_PER_TOOL_<TOOL>` and read it first, so one tool can be changed alone. Tests in `freeLimits.test.ts` cover the new lines: the Backlink Checker blocks the fourth run, the Robots.txt Tester keeps working after `FREE_SPEND_DAY` trips, and `FREE_PER_TOOL_BACKLINKS` wins over `FREE_PER_TOOL`.

**Reliability:** the rank checker's result decides whether someone signs up, so a wrong spot costs more than no spot. Tests in `tests/` cover: a domain with www and without matching the same result, a subdomain that ranks counted only when the domain was entered, AI Mode citing a page with tracking codes, and a SERP call that fails once and then works. Robots tests use Google's own robots.txt test cases.

## Abuse protection with Cloudflare

Free tools need no account, so a new account gets no extra free runs. The limits follow the visitor's IP. The holes today: anyone can fake `x-forwarded-for` to look like a new visitor, IPv6 hands out new addresses for free, and each new Free account costs real money in AI checks (200 tasks a month). Cloudflare plus a few app checks close them.

### 1. Put arrowsterr.com on Cloudflare (Free plan)
- Add arrowsterr.com to Cloudflare. It copies the DNS records from Hostinger. Check that the MX and mail records came across before switching anything.
- At Hostinger, change the nameservers to the two Cloudflare gives. Hostinger keeps hosting WordPress; only the DNS moves.
- Turn the proxy (orange cloud) on for `arrowsterr.com`, `www` and `app`. SSL mode: Full (strict).
- Fly behind the proxy: add the `_acme-challenge.app` CNAME that `fly certs show` gives, so Fly can renew the certificate through DNS.

### 2. Only accept traffic that came through Cloudflare
- A Cloudflare Transform Rule adds a secret header, `x-origin-key`, to every request for `app.arrowsterr.com`.
- The app's middleware refuses `/api/free/*` without the right key (`ORIGIN_KEY` on the server). Someone calling `arrowsterr-web.fly.dev` straight can't skip Cloudflare or fake their IP.
- `ipOf()` in `freeTools.ts` reads `cf-connecting-ip` when the key matches. Cloudflare sets that header and overwrites any fake one.

### 3. Count IPv6 visitors by network
- `hashIp()` hashes the first 64 bits of an IPv6 address, since one home or server gets a whole /64. IPv4 stays as the full address.

### 4. Turn Turnstile on
- The code is already there. Make a Turnstile widget in Cloudflare (managed mode), then set `TURNSTILE_SECRET` on the app and `AW_TURNSTILE_SITEKEY` in wp-config.php.
- Each token works once and is checked on the server before a run counts.

### 5. A rate limit at the edge
- One rate limiting rule (the Free plan allows one): `/api/free/*`, more than 20 requests in 10 seconds from one IP is blocked. Scripts get stopped before they reach the app.
- Bot Fight Mode stays off. It covers the whole domain and would block Stripe webhooks, the WordPress plugin and MCP clients calling the app.

### 6. Stop throwaway accounts
- **Turnstile on sign-up:** Supabase Auth has it built in (Authentication, Attack Protection, CAPTCHA, Turnstile). `AuthScreen.tsx` sends the token with sign-up and sign-in.
- **Email confirmation on:** a Free workspace starts its AI checks only after the email is confirmed.
- **No throwaway email:** sign-up refuses domains on the open-source `disposable-email-domains` list (a file in the repo, updated monthly).
- **One Free workspace per tracked domain:** a domain already tracked by a Free workspace can't be added to another Free workspace. Paid plans aren't affected. Making 10 accounts for the same brand gets nothing.
- **New Free workspaces per network:** at most 3 a day from one IP hash. The fourth sees "Too many new accounts from this network today."

### 7. The backstop
- `FREE_SPEND_DAY` still stops every paid free run for the day, whatever gets past the rest.
- A Free workspace's AI checks are capped by its 200 tasks a month, so the most one account can cost is known.

**Reliability:** tests in `freeLimits.test.ts` and a new `abuse.test.ts` cover: a faked `x-forwarded-for` gets the same hash as the real visitor, two IPv6 addresses in the same /64 count as one, a request without `x-origin-key` is refused, a disposable email is refused with uppercase letters too, and the same domain on a second Free workspace is refused even with `www.` in front.

**Running cost:** Cloudflare Free plan $0, Turnstile $0 (check the free widget limits), the disposable email list $0. Beta $0 a month, Growth $0 a month. If one rate limit rule isn't enough, Cloudflare Pro is about $25 a month (check).

## Content under every tool

Every tool page, old and new, gets a long article below the tool, after the ad block. The tool answers the visitor. The article is what makes the page rank.

**Page order:**
1. Hero: the H1 (the exact search, like "Website Traffic Checker") and one line.
2. The form and the result.
3. The ad block: the "Track this daily" offer for the app.
4. The article, 2,500 to 3,500 words.
5. FAQ, 12 to 15 questions.
6. Related tools (3) and related blog posts (3).

**What each article holds, in this order:**
- **What it is:** what the tool measures and why it matters, in plain words.
- **How to use it:** numbered steps with a screenshot of each step.
- **How we get the numbers:** the data source, how often it updates and how close the estimate is. Honest about limits.
- **How to read the result:** what each number means, with a table of good, average and weak ranges.
- **A worked example:** a real run on a known site, with the result as a screenshot and what to do next.
- **What to do with it:** 5 to 8 concrete moves, each a short section with an H3.
- **Common mistakes:** 5 to 8, each with the fix.
- **Glossary:** 8 to 12 terms from the page, each linked to its own blog post where one exists.
- **The AI search angle:** how the same question works in ChatGPT, AI Overviews and AI Mode, linking to the AI tools.

**Rules:**
- The article is in the page's HTML from the server (the WordPress template), never loaded by script, so Google reads all of it.
- Every article is written for its own page. No shared paragraphs between tools beyond the related links.
- H2 for each part above, H3 inside. A table of contents with jump links sits under the ad block.
- Schema on every page: `WebApplication`, `FAQPage` and `BreadcrumbList`.
- Claude drafts each article from an outline and real runs of the tool. A person edits, checks every number and adds the screenshots before it goes live.
- Each article links to at least 5 other pages on arrowsterr.com and is linked from at least 2 blog posts.

**Site template:** `inc/free-tool.php` gets an `article` slot that reads the page's main content from WordPress, so each article is edited in the WordPress editor. The current "how it works" and FAQ blocks move into the article.

**Size of the job:** 17 pages at about 3,000 words is about 51,000 words. Drafting with Claude Sonnet costs about $3 once (check). Editing is about 2 hours a page.

### Rules for every tool
- Results come back in under 60 seconds, with a progress bar like the snapshot's.
- The first view shows the full answer. No email wall, so pages can rank and be shared.
- Results are plain text. The site never inserts HTML that came from the API.
- Each tool page targets one search ("ai crawler checker", "llms.txt generator", "chatgpt rank checker" and so on) with its own title, FAQ and schema.

## Build order

| Phase | Tools | Why first |
|---|---|---|
| 1 | Shared parts, then 1, 4, 5 | Cost almost nothing and reuse finished code. Each one leads to a paid toolset: AI Visibility (1, 4), Organic Research (5). |
| 2 | 3, 6, 2, 10 | Quick to build. Tools 3 and 6 hand prompts straight to the Free plan. |
| 3 | 7, 8, 11, 12, the hub page and links from the blog | Use more paid calls, or need parts split out of the audit job. |
| 4 | 19, 17, 18, then 13, 16, 15, 14 | The on-page tools cost almost nothing and hand off to Zippie. The research tools reuse the research code; the Backlink Checker goes last since it needs Backlinks API access. |
| 5 | Long articles under every page, highest-search tools first | The tools need to be live to show real runs and screenshots. |

## Running cost a month

Assumes about half of all runs come back from saved results, and Share of Voice is about 7% of runs.

| | Beta (~3,000 runs) | Growth (~30,000 runs) |
|---|---|---|
| DataForSEO and Haiku for the 11 cheap tools | ~$25 | ~$250 |
| AI Share of Voice | ~$15 | ~$150 |
| Turnstile, PageSpeed Insights | $0 | $0 |
| Servers (current Render web and Fly worker; one more Render instance at Growth, check) | $0 | ~$25 |
| **Total** | **~$40** | **~$425** |

The caps per tool (`FREE_CAP_<TOOL>`) set the worst case. With the default caps below, every tool maxed out with no saved results costs about $50 a day:

| Tool | Default cap a day | Most it can cost a day |
|---|---|---|
| 1 AI Crawler Checker, 11 AI Readiness Audit | 1,000 each | $0 |
| 2 llms.txt Generator | 300 | ~$3 |
| 3 ChatGPT Rank Checker | 300 | ~$6 |
| 4 AI Overview Checker | 1,000 | ~$4 |
| 5 Free Keyword Tool | 500 | ~$10 |
| 6 AI Prompt Generator, 10 AI Schema Generator | 1,000 each | ~$3 each |
| 7 AI Sources Finder | 200 | ~$4 |
| 8 AI Share of Voice | 100 | ~$10 |
| 12 Domain Snapshot | 200 | ~$6 |
| 13 Website Traffic Checker | 300 | ~$6 |
| 14 Backlink Checker | 150 | ~$7.50 |
| 15 Keyword Rank Checker | 200 | ~$5 |
| 16 Keyword Gap Tool | 200 | ~$3 |
| 17 Schema Markup Generator | 1,000 | ~$1 |
| 18 Meta Title and Description Generator | 500 | ~$0.50 |
| 19 Robots.txt Tester | 2,000 | $0 |

`FREE_SPEND_DAY` ($15) still stops all paid runs for the day before the caps add up. At Growth, raise it to $25.

### Third set, running cost a month

Assumes about 2,000 runs at Beta and 20,000 at Growth across the seven new tools, half from saved results. Rank checks share Google and AI Mode results across domains, so they get more from the cache.

| | Beta | Growth |
|---|---|---|
| Website Traffic Checker (DataForSEO Labs) | ~$5 | ~$50 |
| Backlink Checker (DataForSEO Backlinks) | ~$10 | ~$100 |
| Keyword Rank Checker (Google SERP and AI Mode, $0.004 a call for AI Mode) | ~$4 | ~$40 |
| Keyword Gap Tool (DataForSEO Labs) | ~$2 | ~$25 |
| Schema and Meta generators (Haiku 5.5) | ~$1 | ~$5 |
| Robots.txt Tester | $0 | $0 |
| Servers (same Render web and Fly worker) | $0 | $0 |
| Long articles (WordPress pages, no new service) | $0 | $0 |
| **Total** | **~$22** | **~$220** |

All free tools together: about **$62** a month at Beta and **$645** at Growth. DataForSEO Labs and Backlinks prices: check (a July 2026 price change; the vendor page couldn't be reached to confirm).
