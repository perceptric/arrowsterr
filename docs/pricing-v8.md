# Pricing v8

Built November 2026. Replaces the prices in `docs/pricing-v7.md`. Unit costs are the same as v7: one prompt tracked for a month ~$0.27, one task ~$0.005, one article ~$0.82, plus each plan's other costs (traffic, reports and the rest): ~$2 on Starter, ~$6 on Pro, ~$18 on Agency.

What changed from v7:

- **Smaller plans that grow on the card.** Each plan starts small and cheap. A – / + stepper adds 25 prompts a day, and another adds 1,000 tasks a month. Only the card's price changes; the page never shows a price per step.
- **Articles are paid in tasks.** One Agentic Writer article takes 200 tasks (`ARTICLE_TASKS`, `TASK_COST.article`) for the research, the outline and the writing, instead of a monthly article count. 200 tasks is ~$1.00 of our task cost, against ~$0.82 for the article. Writing an article again is still free.
- **Every feature explains itself.** Each row on the cards has a hover and focus tooltip (`FEATURE_TIPS` in `src/components/PlanGrid.tsx`), and the (i) next to tasks shows about how many articles or lookups the card's tasks buy, and what each action uses.
- Kept from v7: the AI Visibility and SEO Research boxes on every card, the 7-day trial with no Free plan, and task packs on the Billing page.

## The plans

| | Starter | Pro | Agency | Enterprise |
|---|---|---|---|---|
| Both toolsets, monthly | **$29** | **$89** | **$249** | from $1,500 |
| Both toolsets, yearly (15% off) | $25 | $76 | $212 | custom |
| SEO Research only, monthly | **$19** | **$59** | **$159** | – |
| SEO Research only, yearly | $16 | $50 | $135 | – |
| AI Visibility only, monthly | **$19** | **$59** | **$169** | – |
| AI Visibility only, yearly | $16 | $50 | $144 | – |
| Prompts checked daily, 6 AIs | 25 | 75 | 200 | 1,500+ |
| Tasks a month (AI Visibility only) | 1,200 (300) | 4,000 (1,000) | 12,000 (3,000) | 50,000+ |
| About this many articles (200 tasks each) | 6 | 20 | 60 | 150+ (counted) |
| Brands | 2 | 5 | 25 | Unlimited |
| Seats | 2 | 5 | 15 | Unlimited |
| Competitors per brand | 10 | 15 | 25 | 50 |
| History | 6 months | 1 year | 2 years | 3 years |
| MCP + 60 skills (use tasks) | Yes | Yes | Yes | Yes |
| Slack, Zapier, API | – | Yes | Yes | Yes + SSO |
| White-label reports | – | – | Yes | Yes |

Kept the same as v7 on each plan: on-demand checks a day (3, 10, 30), tracked visits (25k, 250k, 2M), report templates and the Content Plan. Enterprise is unchanged and still counts articles (150 a month).

## Add-ons on the card

| Add-on | Monthly | Yearly (15% off) | Our cost | Margin (monthly / yearly) |
|---|---|---|---|---|
| +25 prompts checked daily (`PROMPT_STEP`) | $15 | $12.75 a month ($153 a year) | ~$6.75 | 55% / 47% |
| +1,000 tasks a month (`TASK_STEP`) | $10 | $8.50 a month ($102 a year) | ~$5.00 | 50% / 41% |

Prompt steps go up to 40 (1,000 more prompts) and task steps up to 100. SEO Research only tracks no prompts, so it has no prompt stepper and buys no prompt steps. The card price is `cardPrice()` in `src/lib/plans.ts`.

## Margins at full use

Every prompt and every task used (articles are inside the tasks).

| Plan | Mix | Monthly | Yearly | Prompts | Tasks | Cost | Monthly margin | Yearly margin |
|---|---|---|---|---|---|---|---|---|
| Starter | Both | $29 | $25 | 25 | 1,200 | $14.75 | 49% | 41% |
| Starter | SEO Research | $19 | $16 | 0 | 1,200 | $8.00 | 58% | 50% |
| Starter | AI Visibility | $19 | $16 | 25 | 300 | $10.25 | 46% | 36% |
| Pro | Both | $89 | $76 | 75 | 4,000 | $46.25 | 48% | 39% |
| Pro | SEO Research | $59 | $50 | 0 | 4,000 | $26.00 | 56% | 48% |
| Pro | AI Visibility | $59 | $50 | 75 | 1,000 | $31.25 | 47% | 38% |
| Agency | Both | $249 | $212 | 200 | 12,000 | $132.00 | 47% | 38% |
| Agency | SEO Research | $159 | $135 | 0 | 12,000 | $78.00 | 51% | 42% |
| Agency | AI Visibility | $169 | $144 | 200 | 3,000 | $87.00 | 49% | 40% |

## How it's stored

- **The mix:** `extras.track` ("visibility" or "seo"; none means both), as in v7. `access()` opens only that toolset.
- **Extra tasks:** `extras.tasks`, a count of 1,000-task steps.
- **Extra prompts:** `extras.prompts`, the prompts themselves (steps × 25). On a v8 subscription the webhook sets it from the prompts item's quantity; on an older price it stays whatever was set by hand.
- **Articles:** a v8 plan has `articleTasks: 200`. `draftQuota` hands the Writer `tasks: 200` and no monthly cap, and `requestDraft` takes the tasks before making the draft (`QuotaStore.pay`, using `take(ws, "tasks", 200)`). If no new draft comes of it (the topic already has one, or the month is full), the tasks are handed back. Out of tasks gives the usual "buy a task pack" answer.

## Stripe

Lookup keys (made by `npm run stripe:setup`, never by the app):

- Plans: `arrowsterr_v8_{plan}_{mix}_{interval}` on the existing `arrowsterr_foundation`, `arrowsterr_scale` and `arrowsterr_agency` products.
- Extra tasks: `arrowsterr_v8_tasks_{interval}` on `arrowsterr_tasks`, sold by quantity.
- Extra prompts: `arrowsterr_v8_prompts_{interval}` on a new `arrowsterr_prompts` product, sold by quantity.

Checkout takes `{ plan, interval, mix, tasks, prompts }` (steps). The webhook (`syncSubscription`) sets `extras.track`, `extras.tasks` and, on v8, `extras.prompts`.

## Moving to it

- Anyone on a v6 or v7 price keeps the v7 limits (`extras.limitsFrom = "v7"`, set by the webhook from the price's version; `PLANS_V7`, `VIS_TASKS_V7`). On v5 or older, `extras.limitsFrom = "v5"` as before. Picking anything on the Billing page moves them to v8.
- At the time of this change no workspace pays for a self-serve plan, so nobody moves today.
