# On-page Audit

The On-page Audit (Technical SEO, On-page Audit, at `/onpage-audit`) scores one page against the pages Google ranks in the top 10 for one keyword, lists every check with its fix, and writes a suggested title, meta description and opening. It is step 2 of the new tools plan, after Site Audit (`docs/site-audit.md`).

## What it shows

**This page**
- **Score:** 0 to 100, with the top 10 average, how many top pages could be read, and where the page ranks now.
- **Five area bars:** Keyword use, Content depth, Technical, AI answer-ready and Links. Each has a line for the top 10 average.
- **History:** earlier scores for the same page and keyword.
- **Google preview:** Now and Suggested, with title and description lengths and a Copy button.
- **Fixes:** each fix a connected CMS can make (title and description, structured data, FAQ, alt text, internal links), with the points it adds. Fix prepares a change set for this page only and opens it to approve, apply and undo, the same as Site Audit.
- **Checks:** grouped by area, each passed, needs work, failed, or not checked.
- **Suggested opening:** a 40 to 80 word answer, shown when the page doesn't answer first.
- **Terms the top pages share:** how often this page uses each term next to the top 10 average.
- **Top 10:** each result with its own score on the same rules.

**All pages**
- Every page and keyword audited for the brand, lowest score first.
- **Find my pages:** the brand's pages that bring the most Google visits, each with the keyword that brings the most, and an Audit button. It uses DataForSEO Labs ranked keywords (10 tasks).

Zippie can run it too: `start_onpage_audit` and `get_onpage_audit`, and the built-in "On-page fix" skill.

## How it scores

All rules are in `src/lib/onpage.ts` (pure, tested in `tests/onpage.test.ts`). The page is read by `src/lib/onpageRead.ts`, which reuses `pageFacts` from the free AI Answer-Ready Checker, so both tools read pages the same way.

- **Areas and weights:** Keyword use 25, Content depth 30, Technical 20, AI answer-ready 15, Links 10. Each check passes (1), needs work (0.5) or fails (0), weighted inside its area.
- **Same rules for the top 10:** every readable top page is scored with the same checks and the same baseline, so "top 10 average" compares like with like.
- **Terms:** two-word phrases most top pages share come first: at least 40% of the read pages, and at least 3. Single words need 60% and must not be generic words like "business". Plurals count as one term, and the keyword's own words are left out.
- **Suggestions** come from one Claude call that reads only the page. They are kept only if the title is 30 to 65 characters and uses the keyword, the description is 100 to 165 characters, and the opening is 15 to 90 words.

## Reliability

- **Thin comparisons don't move the score.** When fewer than 3 top pages can be read, the checks that compare with them show "Not checked", there's no top 10 average, and the screen says how many were read.
- **A page never competes with itself.** When it ranks in the top 10, it is left out of the comparison and shown as its rank.
- **Unknown checks never count as failures.** Speed shows "Not measured" without `PAGESPEED_API_KEY`.
- **A failed audit hands its 25 tasks back.** The charge is saved on the audit row, so the worker can refund it.
- **Zippie's audits are charged by the job.** The chat route hands back every task it took if its stream fails, so a running audit could otherwise end up free, or refunded twice.
- **No duplicate audits.** Starting the same page and keyword twice within 15 minutes opens the one already running.
- Fix buttons on both audit screens share `src/lib/fixServer.ts`.

## Data

`supabase/062_onpage.sql` adds `onpage_audits`, one row per audit with the result, the score, the top 10 average and the task charge. Viewers may read. `/api/onpage` takes `start`, `pages` and `fix` from editors. The job kind is `onpage`.

## Running cost

Per audit: one DataForSEO Google SERP with People Also Ask and AI Overview (about $0.003, check), plain page loads for the page and the top 10 ($0), PageSpeed Insights (free), and one Claude Sonnet call of about 3K tokens in and 300 out (about $0.009, check). That's about $0.012 per audit, charged as 25 tasks (about $0.125 of plan value). Find my pages is one DataForSEO Labs ranked keywords call for 300 rows (about $0.04, check).

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Audits, about 40 per team a month (DataForSEO and Claude, check) | ~$24 | ~$240 |
| Find my pages, about 2 per team a month (DataForSEO, check) | ~$4 | ~$40 |
| PageSpeed Insights (free with a key) | $0 | $0 |
| Worker time (inside the current worker) | $0 | $0 |
| **Monthly total added** | **~$28** | **~$280** |

## Example data

Before the first real result, the screen shows example data from `src/lib/demo.ts`, tagged "Example data". Tabs, filters, panels and the map all work. The buttons that fetch real data stay live. Buttons that would change real records are off. It runs in the browser, so it adds $0 a month at Beta and at Growth.
