# Pricing v5

Built October 2026. Replaces the prices in `docs/pricing-v4.md`; its unit costs, competitor prices and Free plan still hold.

## The plans

| | Free forever | Starter | Pro | Agency | Enterprise |
|---|---|---|---|---|---|
| Monthly | $0 | **$39** | **$179** | **$499** | from $1,500 |
| Billed yearly (15% off) | $0 | $33 | $152 | $424 | custom |
| Toolsets | Both, light | **Pick one**, switch once a month | Both | Both | Both |
| AI Visibility | 10 prompts weekly, ChatGPT + AI Overviews | 50 prompts daily, 6 AIs | 150 daily | 400 daily | 1,000+ |
| Organic Research | 200 tasks | 3,000 tasks, Content Plan | 8,000 tasks | 20,000 tasks | 150,000 |
| Brands | 1 | 3 | 10 | Unlimited | Unlimited |
| Seats | 1 | 2 | 5 | 15 | Unlimited |
| Agentic Writer | – | – | Yes | Yes | Yes |

The trial (7 days, both toolsets, no card) still drops to Free.

## Margins (cost a month per customer, typical use)

| Plan | Price | Typical cost | Margin |
|---|---|---|---|
| Starter, AI Visibility | $39 | ~$17 | ~56% |
| Starter, Organic Research | $39 | ~$8 | ~80% |
| Pro | $179 | ~$71 | ~61% |
| Agency | $499 | ~$204 | ~60% |

## Running cost a month

Mix: 50% Starter, 40% Pro, 10% Agency.

| | Beta (50 paying, 500 free) | Growth (500 paying, 5,000 free) |
|---|---|---|
| Paying teams, typical use | ~$2,765 | ~$27,650 |
| Free users | ~$225 | ~$2,250 |
| Servers: the Hostinger VPS (web, worker and Postgres; old Render, Fly and Supabase numbers, check) | ~$45 | ~$150 |
| **Total cost** | **~$3,035** | **~$30,050** |
| Revenue (monthly billing) | ~$7,050 | ~$70,500 |
| **Gross margin** | **~57%** | **~57%** |

## SEO tools (November 2026)

Four tools added on the Organic Research side, on every plan that has it: Backlinks, Link Building, Content Map and Local Research. (Site Audit and On-page Audit were added too, then removed with the rest of Technical SEO.) They spend the plan's tasks like the rest of Organic Research, at roughly $0.005 a task, so plan prices and margins don't change.

| Job | Tasks | Our cost |
|---|---|---|
| Backlinks overview | 20 | ~$0.10 |
| A page of 100 links | 6 | ~$0.028 |
| Link gap, up to 3 rivals | 25 | ~$0.10 |
| Dead rival pages | 20 | ~$0.08 |
| Unlinked mentions | 20 | ~$0.09 (check) |
| Pitch draft | 3 | ~$0.006 (check) |
| Content map | 40 | ~$0.11 (check) |
| Google Maps grid, weekly (standard queue) | 6 | ~$0.03 |
| Google Maps grid, Scan now (priority queue) | 12 | ~$0.06 |
| Finding the business on Google Maps | 1 | $0.002 |

What they add to the monthly bill at typical use (each tool's doc has the details):

| Tool | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| Backlinks (`docs/backlinks.md`) | ~$37 | ~$365 |
| Link Building (`docs/link-building.md`) | ~$15 | ~$144 |
| Content Map (`docs/content-map.md`) | ~$11 | ~$110 |
| Local Research (`docs/local-research.md`) | ~$5 | ~$51 |
| **Total added** | **~$68** | **~$670** |

That moves the running cost above from about $3,035 to about $3,103 a month at Beta, and from about $30,050 to about $30,720 at Growth. Gross margin stays about 56%.

## Moving to it
- New Stripe keys `arrowsterr_v5_*`. Anyone on `v3` or `v4` keeps their price.
- After deploy, run `npm run stripe:setup` once to make the v5 prices.
