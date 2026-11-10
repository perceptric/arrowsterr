# AI access

Phase 4 of the Technical SEO plan (`docs/technical-seo-plan.md`). Each Site Audit crawl checks whether search and AI crawlers may fetch the site and can read it, and a new screen, AI access (Technical SEO, at `/ai-access`), shows the answers.

## The bot check

16 crawlers (`BOTS` in `src/lib/tech/ai.ts`): Googlebot, Google-Extended, Bingbot, OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Applebot, Applebot-Extended, CCBot, Meta-ExternalAgent and Bytespider. Each is AI search, AI user fetch, AI training or search.

- **robots.txt:** our robots.txt reader, per bot, with the line that decides it.
- **Firewall or CDN:** after the fetch phase, the crawl fetches the home page and 2 more pages (from other folders) with each bot's user agent, next to a normal browser. A dropped connection, an error status, a challenge page, a redirect elsewhere or a body under a third of the browser's counts against the bot.
- **Meta and headers:** noindex, noai, noimageai and nosnippet that each bot gets from X-Robots-Tag (general or `gptbot: noindex`) and from robots or bot-named meta tags on the home page.
- **Can read text:** from rendering (`docs/site-structure.md`): the share of the rendered text already in the raw HTML. AI crawlers don't run JavaScript; Googlebot does.

## Reliability

- **Two strikes:** a bot that fails a page on the first pass gets a second pass on that page at least a minute later, with a fresh browser fetch next to it. It counts as blocked only when both passes failed for the bot and worked for the browser. A bot that failed once and was never checked again is "unknown", never blocked.
- **Unknown is never blocked:** when the browser fetch itself fails or gets a challenge, nothing is said about the bots.
- **Bots firewalls check by IP** (Googlebot, Bingbot, Applebot) are not tested by user agent, since a firewall that blocks a fake Googlebot is doing its job. They show "Checked by IP address". Google-Extended and Applebot-Extended are robots.txt tokens only.
- **Broken cited pages:** a cited page (or llms.txt link) that answers 401, 403, 429 or nothing at all is unknown, never broken. A redirect counts only when it goes to another path (not a trailing slash, case or www change).
- **IndexNow** counts as off only when the brand's WordPress plugin says so. Without WordPress, or when the plugin can't be reached, it isn't judged.
- Tested end to end with a local test site: a site that challenges OAI-SearchBot, GPTBot and PerplexityBot is flagged and one bot with a single failed request isn't; the same site with no firewall rules flags nothing. Unit tests in `tests/techChecks.test.ts`.

## Checks

| id | Severity | Rule |
|---|---|---|
| `ai_firewall_block` | Error | The firewall blocks or challenges an AI search or user bot (two strikes) |
| `bing_blocked` | Error | robots.txt blocks Bingbot |
| `ai_js_dependent` | Error | Pages AI cites or pages with search clicks with under half their text in the raw HTML |
| `ai_cited_page_broken` | Error | A page AI answers cited in the last 30 days now errors, redirects elsewhere or says noindex |
| `ai_firewall_training` | Notice | The firewall blocks AI training bots (can be a choice) |
| `no_indexnow` | Notice | The WordPress plugin says IndexNow is off |
| `llms_txt_invalid` | Notice | llms.txt doesn't start with a `#` title |
| `llms_txt_broken_links` | Notice | llms.txt links to pages that error or redirect |
| `noai_meta` | Notice | Pages with noai or noimageai |
| `answer_ready` | Notice | Pages with clicks or citations without a 15 to 90 word opening answer, or with question headings and no FAQ, Q&A or HowTo markup |

Kept from before: `ai_bots_blocked` (Error, AI search bots in robots.txt), `ai_training_blocked` and `no_llms_txt` (Notices).

## The screen

- **Numbers:** AI-readable pages (rendered pages with 70% or more of their text in the raw HTML), bots allowed, bots blocked by the firewall, JavaScript-dependent pages, llms.txt, IndexNow.
- **AI crawlers:** the bot table above.
- **JavaScript dependence by template:** raw words against rendered words, headings, and the phone screenshot.
- **llms.txt:** found or missing, broken links, and a draft from the crawl (pages AI cites, pages with clicks and the strongest pages, by template, in the llmstxt.org format) to edit, copy, download, or publish to WordPress.
- **IndexNow:** on or off, with Turn on for WordPress sites with the plugin.
- **Your pages AI cites:** cited in the share of answers, status and raw text share.
- **Competitor pages AI cites:** the 8 competitor pages AI cites most, fetched and read, against the brand's own cited (or strongest) pages: text in the HTML, an answer up top, question headings, FAQ markup, structured data, length and headings. Cached a day.
- **Structured data for answers:** types per template.

## WordPress plugin 1.2.0

`wp-plugin/arrowsterr-connector` (the zip in `public/downloads` is rebuilt from it):
- **IndexNow:** `POST /arrowsterr/v1/indexnow {on}` (administrators) makes a key, serves it at `/<key>.txt`, and sends every published or updated post or page to `api.indexnow.org` once per request, after the page is done, without waiting. Fixes made through Arrowsterr update posts, so they're sent too. Rank Math's Instant Indexing counts as on.
- **llms.txt:** `POST /arrowsterr/v1/llms {text}` (administrators) stores it and serves it at `/llms.txt` when the site has no file of its own.
- `GET /arrowsterr/v1/status` now says `indexnow`, `indexnow_by`, `llms` and `admin`.

## Data

No new tables. The crawl's state keeps the bot passes (`site_audits.crawl.bots`) and the result keeps the answers (`site_audits.result.ai`). Page facts gain `firstWords`, `questions` and `noai`. `/api/tech` gains `ai`, `shot`, `rivals`, `llms`, `llmsPublish` and `indexnow`.

## Running cost

No paid API and no Claude tokens. Each crawl adds about 45 bot and browser fetches, up to 30 second-pass fetches and up to 60 for cited pages and llms.txt links. Comparing competitor pages fetches up to 8 pages, at most once a day per brand unless refreshed. IndexNow is free.

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Extra fetches on the worker (about 135 a crawl, under 1% of a crawl's pages) | $0 | $0 |
| Competitor page fetches (cached a day) | $0 | $0 |
| IndexNow | $0 | $0 |
| **Monthly total added** | **$0** | **$0** |
