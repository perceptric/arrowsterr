# RiseLocale Local Rank Tracker: running cost

October 2026. The app is `apps/riselocale` (see its README). This is what it adds to the monthly bill.

## Unit costs

| Unit | Our cost | Source |
|---|---|---|
| One Maps search (depth 20, normal priority) | ~$0.0006 | DataForSEO (check) |
| One organic search with the Local Pack (depth 20 = 2 pages of 10) | ~$0.0012 | DataForSEO (check) |
| **One pin, normal priority** (scheduled scans) | **~$0.0018** | the two rows above |
| One pin, high priority (scans started by hand, free scans) | ~$0.0036 | DataForSEO charges more for high priority (check) |
| One business lookup (Maps live search) | ~$0.002 | DataForSEO (check) |
| One free 5×5 scan | ~$0.09 | 25 pins at high priority |
| Rechecks (pins that jumped more than 5 spots) | ~2% more searches | estimate |
| Map tiles | ~$25 to $100 a month | MapTiler or Stadia Maps (check) |
| Email (alerts and reports) | $0 to $20 a month | Resend (check) |
| Web service with the worker | $25 a month each | Render Standard (check) |
| Postgres | $25 a month | Supabase Pro or Render Postgres (check) |

## Typical team

10 keywords on a 7×7 grid, weekly (about 2,100 pins), plus scans run by hand (about 1,900 pins): about 4,000 pins a month, 70% normal priority and 30% high. That is about **$9.40 a month** in DataForSEO per team.

## Monthly totals

| | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| DataForSEO, paying teams | ~$470 | ~$4,700 |
| Free scans (300 / 3,000 a month) | ~$27 | ~$270 |
| Business lookups | ~$2 | ~$20 |
| Web service and worker | ~$25 | ~$100 (2 to 4 instances) |
| Postgres | ~$25 | ~$50 |
| Map tiles | ~$25 | ~$100 |
| Email | $0 | ~$20 |
| **Total** | **~$575** | **~$5,260** |

The free scan cap (`FREE_SCANS_PER_DAY`, default 100) limits free scans to about $270 a month at most.
