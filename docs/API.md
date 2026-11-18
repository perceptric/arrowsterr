# Arrowsterr API, webhooks and Zapier

Pro and up. Create a key in **Settings → Workspace & members → Integrations → API keys**.
Send it in the `X-API-Key` header (or `Authorization: Bearer <key>`). Base URL: `https://app.arrowsterr.com/api/v1`.

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/me` | The workspace the key belongs to. Use it to test a connection. |
| GET | `/brands` | Brands: `id`, `name`, `domain`. |
| GET | `/visibility?brand_id=…&days=30` | AI visibility by day, with the top competitors and the AIs checked that day. |
| GET | `/visibility/models?brand_id=…&days=30` | Visibility for each AI model. `models`: totals for the period. `days`: one row per day and model. Each row has `answers`, `mentions`, `visibility`, `position` and `sentiment`. |
| GET | `/competitors?brand_id=…&days=30&limit=15` | Every brand AI names next to this one over the period, most visible first: `name`, `you`, `mentions`, `visibility`, `position`, `sentiment`. The brand itself is always in the list. `limit` goes up to 50. |
| GET | `/prompts?brand_id=…` | Tracked prompts and topics. `rows` has one `{ topic, prompt }` per prompt, with loose prompts under "Other prompts". |
| GET | `/topic-bank?brand_id=…` | Topic Bank keywords: volume, difficulty, intent, stage, CPC, theme, job. |
| GET | `/calendar?brand_id=…` | Editorial Calendar items with status, due date, brief status and live URL. |
| GET | `/webhooks` | Webhook subscriptions and the list of events. |
| POST | `/webhooks` | Subscribe: `{ "url": "https://…", "event": "daily.result" }` (or `"*"` for all). Returns `{ id }`. |
| DELETE | `/webhooks/{id}` | Stop a subscription. |
| GET | `/samples/{event}` | A sample of an event, as a list of one. |

Example:

```bash
curl https://app.arrowsterr.com/api/v1/brands -H "X-API-Key: aw_live_…"
```

## Brand keys

A brand key (`aw_brand_…`) is made through the partner API below. It works on the MCP server and on `/brands`, `/visibility`, `/visibility/models`, `/competitors`, `/prompts`, `/topic-bank` and `/calendar`, and sees only its one brand: any other brand id, name or domain is "not found", and `brand_id` can be left out. `/me`, `/webhooks` and `/samples` cover the whole workspace, so they answer 403 to a brand key.

On the MCP server a brand key can also call `domain_overview` for any website (like `katalon.com`): its Google traffic, ranked keywords, positions, last 12 months and best keywords. It reads public Google data only, uses the brand's country, and takes 10 tasks from the partner's workspace (counted in the brand's `usage`), or none when the site was looked up in the last 30 days.

## Partner API

For partners that sell Arrowsterr inside their own product (Morning Telos first). A partner makes one brand per customer, then gives that customer's AI agents a brand key.

- **Turn it on (us, by hand):** in Supabase → SQL Editor, `update public.workspaces set extras = extras || '{"partner": true}'::jsonb where id = '<workspace id>';` The workspace needs a plan with the API and MCP (Pro and up). A partner workspace has no brand cap; prompts still count against the plan (raise them with `extras.prompts`).
- **Partner key:** the workspace owner clicks **Create partner key** in Settings → Workspace & members → Integrations → API keys. It starts with `aw_partner_` and is shown once.
- **Auth:** `Authorization: Bearer aw_partner_…`. Base URL: `https://app.arrowsterr.com/api/partner`. Up to 120 calls a minute per key.
- **Which brands:** any brand in the partner's workspace that a partner key made. Brands made in the app answer 403, brands in other workspaces 404.

| Method | Path | Body / answer |
|---|---|---|
| POST | `/brands` | `{ name, domain, external_id }` → `201 { id, name, domain, external_id }`. The same `external_id` again → `200` with that brand. A domain another brand in the workspace tracks → `409`. |
| GET | `/brands/{id}` | `{ id, name, domain, external_id, status, prompts, last_checked_at }`. `status` is `tracking` or `no_prompts`. |
| DELETE | `/brands/{id}` | `204`. Revokes its brand keys, then deletes the brand and its data. |
| POST | `/brands/{id}/keys` | `201 { key, prefix }`. The `aw_brand_…` key is shown once. Up to 20 at once per brand. |
| DELETE | `/brands/{id}/keys` | `204`. Revokes every brand key of the brand. |
| GET | `/brands/{id}/usage?month=YYYY-MM` | `{ brand_id, external_id, month, tasks, checks, answers, prompts }`. `tasks`: tasks its brand keys used on the MCP server. `checks`: AI visibility checks run. `answers`: AI answers read. Daily checks never cost tasks. |

Errors are `{ "error": { "code", "message" } }`: 401 (no key or a bad key), 403 (not a partner, or not your brand), 404, 409, 422 (bad input), 429 (too many calls), 503 (try again).

## Events

Each webhook gets a JSON `POST` with `event` and the fields below. Answer `410 Gone` to unsubscribe.

| Event | When |
|---|---|
| `daily.result` | After each brand's daily check: `visibility`, `previous`, `change`, `competitors`. |
| `visibility.alert` | Visibility moved by the workspace's alert size, or a competitor overtook the brand. Adds `reasons`. |
| `brief.ready` | A content brief is ready: `keyword`, `item_id`, `url`. |
| `post.published` | A draft was published live: `title`, `url`, `cms`. |
| `shopping.alert` | AI Shopping found a wrong price, a price under your floor, a product out of stock, a new reseller or a drop in product share. Adds `reasons`. |

Visibility is a percent from 0 to 100. Mentions is how many AI answers named the brand. Position is the brand's average spot in the list an answer names (1 is best). Sentiment is 0 to 100.

Visibility compares only the AIs checked on both days, since Claude and Perplexity are checked weekly.

## Setting up the Zapier app (one time, for Arrowsterr)

In the [Zapier Developer Platform](https://developer.zapier.com), create an integration named Arrowsterr:

1. **Authentication**: API Key. One field, `api_key`. Add it to every request as the `X-API-Key` header.
   Test: `GET https://app.arrowsterr.com/api/v1/me`. Connection label: `{{bundle.inputData.workspace.name}}`.
2. **Triggers** (one per event: Daily result, Visibility alert, Brief ready, Post published). Type: REST Hook.
   - Subscribe: `POST /api/v1/webhooks` with body `{ "url": "{{bundle.targetUrl}}", "event": "daily.result" }`.
   - Unsubscribe: `DELETE /api/v1/webhooks/{{bundle.subscribeData.id}}`.
   - Perform list (sample): `GET /api/v1/samples/daily.result`.
3. **Searches** (optional): Find brand (`GET /brands`), Get visibility (`GET /visibility`).

Until the app is public, share its invite link with customers so they can use it.

## Other connectors

These live in `integrations/`. Each folder has a README with install steps.

| Folder | What it is |
|---|---|
| `integrations/looker-studio` | Looker Studio community connector: visibility over time, by AI model, competitors and prompts. |
| `integrations/n8n-nodes-arrowsterr` | n8n community node with an action node for every endpoint and a trigger for events. |
| `integrations/make` | Make custom app: a connection, modules for every endpoint and an instant trigger. |
| `integrations/google-sheets` | Arrowsterr for Sheets: a menu that fills tabs, plus a weekly refresh. |
