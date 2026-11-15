# Pricing v6

Built November 2026. Replaces the prices in `docs/pricing-v5.md`. Unit costs are from `docs/pricing-v4.md` (cost_ledger) and `docs/agentic-writing.md`: one prompt tracked for a month ~$0.27, one task ~$0.005, one article ~$0.82.

## The plans

| | Free forever | Starter | Pro | Agency | Enterprise |
|---|---|---|---|---|---|
| Monthly | $0 | **$49** | **$199** | **$599** | from $1,500 |
| Billed yearly (15% off) | $0 | $42 | $169 | $509 | custom |
| Toolsets | Both, light | Both | Both | Both | Both |
| Prompts | 15 weekly, ChatGPT + AI Overviews | 50 daily, 6 AIs | 150 daily | 500 daily | 1,500+ |
| Tasks a month | 200 | 2,000 | 8,000 | 20,000 | 50,000+ |
| Agentic Writer articles | 1 to try, once | 3 a month | 20 a month | 60 a month | 150+ |
| Brands | 1 | 2 | 5 | 25 | Unlimited |
| Seats | 1 | 3 | 5 | 15 | Unlimited |
| MCP + 60 skills (use tasks) | – | Yes | Yes | Yes | Yes |
| Slack, Zapier, API | – | – | Yes | Yes | Yes + SSO |

Articles count per workspace now (`draftQuota` in `src/lib/plans.ts`, `writer_take_draft` in `supabase/088_writer_workspace_quota.sql`). Free's article uses the period `once`, so it never resets.

Every MCP tool call uses 1 task (`TASK_COST.mcp`); `keyword_research` uses 10.

## Margins

| Plan | Cost at full use | Margin, full use | Margin, typical use |
|---|---|---|---|
| Starter | $27.68 | 44% | 54% |
| Pro | $102.97 | 48% | 58% |
| Agency | $301.87 | 50% | 58% |

Typical use: every prompt, half the tasks, all articles. Yearly billing at full use: 35%, 40% and 41%.

## Add-ons

| Add-on | Price | Margin | In the app |
|---|---|---|---|
| 1,000 tasks (packs never expire) | $12 | 53% | Yes (`TASK_PACKS`) |
| 10 articles | $39 | 75% | Not yet: by request |
| 100 prompts a month | $49 | 41% | Not yet: set `extras.prompts` |
| Extra brand | $19 a month | 95% | Not yet: set `extras.brands` |

## Moving to it
- New Stripe keys `arrowsterr_v6_*`. After deploy, run `npm run stripe:setup` once to make the v6 prices.
- Anyone on a v5 or older price keeps that price and the v5 limits (`extras.limitsFrom = "v5"`, set by 088 for everyone paying today and by the webhook after). A v5 Starter keeps its one toolset until it chooses Starter again on Billing, which moves it to v6 with both.
