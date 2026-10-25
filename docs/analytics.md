# Product analytics (PostHog)

PostHog shows how people use Arrowsterr: which tools teams use, where they drop off between a brief and a published article, and session replays. It's for us, not customers. Customer website analytics come from their own Google Analytics 4.

Code: `src/lib/analytics.ts` (start, identify, workspace, track, reset), `src/instrumentation-client.ts` (starts it next to Sentry), `next.config.ts` (the `/ingest` proxy), `src/components/App.tsx` (who and which workspace).

## Turn it on

1. In PostHog (US cloud), open the project's Settings → General and copy the **Project API key** (`phc_...`). It's public by design, like the Sentry DSN.
2. Set `NEXT_PUBLIC_POSTHOG_KEY` to it where the app is built. It's read at build time:
   - Render (where the app runs today): the `arrowsterr` service's Environment. It's set.
   - Fly (when the app moves): `fly.toml` under `[build.args]`. It's set there too.
3. Deploy, open the app and click around. PostHog's "Waiting for events" turns green within a minute.

Empty means off: nothing loads and every call does nothing.

## What it records

- **Pageviews and page leaves** as people move around the app (the app is one page, so it counts route changes).
- **Who:** each signed-in person by their user id, with email and name, and grouped by **workspace** with its name and plan, so usage reads per team.
- **Events:**

| Event | When | Properties |
|---|---|---|
| `brief_generated` | Generate brief in the Library | rows, failed |
| `writing_started` | A writer opens the first section of an article | sections |
| `section_generated` | Each section Generate content writes | module, module_failed, all |
| `article_synced` | Sync to CMS | from (grid, full_view) |
| `article_published` | Publish | mode, kind |
| `cms_connected` | A site connected | kind, one_click |

- **Session replay** with every input masked (passwords, API keys, anything typed) and any element marked `data-private` hidden.
- Signing out resets it, so the next person on that browser starts fresh.

Events go to `/ingest` on our own address and on to `us.i.posthog.com`, so ad blockers don't drop them. Name new events object_verb in the past tense and call `track()`.

## Running cost

PostHog Cloud's free tier covers 1M events and 5,000 session replays a month (check). About 600 events and 10 replays per active team a month:

| Stage | Events a month | Replays a month | PostHog |
|---|---|---|---|
| Beta (50 teams) | ~30K | ~500 | $0 |
| Growth (500 teams) | ~300K | ~5,000 | $0 (check) |

Past the free tier it's about $0.00005 an event and $0.005 a replay (check). The proxy runs on the existing web service: $0.
