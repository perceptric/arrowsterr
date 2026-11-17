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
