# Pricing v7

Replaced by `docs/pricing-v8.md`. Subscribers on a v6 or v7 price keep these limits (`extras.limitsFrom = "v7"`).

Built November 2026. Replaces the prices in `docs/pricing-v6.md`. Unit costs are the same as v6: one prompt tracked for a month ~$0.27, one task ~$0.005, one article ~$0.82, plus each plan's other costs from v6 (traffic, reports and the rest: ~$1.72 on Starter, ~$6.07 on Pro, ~$17.67 on Agency).

What changed from v6:

- **Tick what you need.** Each card has two boxes, AI Visibility and SEO Research. Both start ticked. Unticking one lowers the price. One always stays on.
- **No Free plan.** Every plan starts with a 7-day free trial, no card. When the trial ends, or a paid plan is canceled, the workspace goes read-only until someone picks a plan (`effectivePlan` in `src/lib/plans.ts`). Nothing is deleted, and its prompts stop being checked. The workspaces already on Free keep it.
- **Extra tasks on the card.** The – / + stepper adds 1,000 tasks a month for $10 each, bought with the plan. Task packs stay on the Billing page for anyone who runs out mid-month.

## The plans

| | Starter | Pro | Agency | Enterprise |
|---|---|---|---|---|
| Both toolsets, monthly | **$49** | **$199** | **$599** | from $1,500 |
| Both toolsets, yearly (15% off) | $42 | $169 | $509 | custom |
| SEO Research only, monthly | **$29** | **$129** | **$349** | – |
| SEO Research only, yearly | $25 | $110 | $297 | – |
| AI Visibility only, monthly | **$29** | **$99** | **$299** | – |
| AI Visibility only, yearly | $25 | $84 | $254 | – |
| Prompts checked daily, 6 AIs | 50 | 150 | 500 | 1,500+ |
| Tasks a month (AI Visibility only) | 2,000 (500) | 8,000 (1,500) | 20,000 (4,000) | 50,000+ |
| Agentic Writer articles a month | 3 | 20 | 60 | 150+ |
| Brands | 2 | 5 | 25 | Unlimited |
| Seats | 3 | 5 | 15 | Unlimited |
| MCP + 60 skills (use tasks) | Yes | Yes | Yes | Yes |
| Slack, Zapier, API | – | Yes | Yes | Yes + SSO |
| Extra tasks | +1,000 a month for $10 ($8.50 yearly) | same | same | custom |

What each mix leaves out (`oneToolset` in `src/lib/plans.ts`):

- **SEO Research only:** no prompts tracked (`prompts` 0, `checkNowPerDay` 0). Research, the Content Plan, the Calendar, the Writer and publishing are all there.
- **AI Visibility only:** no Writer, no Content Plan (`writer` "none", `articlesPerMonth` 0, `plansPerMonth` 0) and fewer tasks (`VIS_TASKS`), enough for Zippie, MCP and reports.

The mix is stored the way v5 Starter stored its pick: `extras.track` ("visibility" or "seo"; none means both). `access()` opens only that toolset. Extra tasks are `extras.tasks`, a count of 1,000-task steps that `limitsFor` adds to the month's tasks.

## Margins at full use

Every prompt, every task and every article used.

| Plan | Mix | Cost | Monthly margin | Yearly margin |
|---|---|---|---|---|
| Starter | Both | $27.68 | 44% | 34% |
| Starter | SEO Research | $14.18 | 51% | 43% |
| Starter | AI Visibility | $17.72 | 39% | 29% |
| Pro | Both | $102.97 | 48% | 39% |
| Pro | SEO Research | $62.47 | 52% | 43% |
| Pro | AI Visibility | $54.07 | 45% | 36% |
| Agency | Both | $301.87 | 50% | 41% |
| Agency | SEO Research | $166.87 | 52% | 44% |
| Agency | AI Visibility | $172.67 | 42% | 32% |
| Extra tasks | 1,000 a month | $5.00 | 50% | 41% |

AI Visibility only has the thinnest margin, because prompts are the biggest cost. Typical use (every prompt, half the tasks) adds about 10 points to each row, like v6.

## Stripe

Lookup keys are `arrowsterr_v7_{plan}_{mix}_{interval}`, where mix is `both`, `visibility` or `seo`, and `arrowsterr_v7_tasks_{interval}` for extra tasks, sold by quantity (one unit is 1,000 tasks a month). `npm run stripe:setup` makes all 20 prices: 18 plan prices under the products `arrowsterr_foundation`, `arrowsterr_scale` and `arrowsterr_agency`, and 2 under a new product `arrowsterr_tasks`.

- Checkout (`/api/billing/checkout`) takes `mix` and `tasks` (steps) with the plan. A new subscription gets the plan item and, with steps, the tasks item. A change swaps the plan price and adds, updates or removes the tasks item.
- The webhook (`syncSubscription` in `src/lib/billing.ts`) sets `extras.track` from the plan price's mix and `extras.tasks` from the tasks item's quantity.
- Anyone on a v6 price keeps both toolsets and the v6 limits, which are the same as v7's "both". Anyone on v5 or older keeps the v5 limits, as before. A v5 Starter can still switch its one toolset for free (`/api/billing/track`); a v7 one-toolset plan changes on the Billing page, because it was paid for.
