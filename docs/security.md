# Security

How Arrowsterr keeps one workspace's data away from another, keeps the server from being used against itself, and
keeps paid work behind the plan. Reviewed and hardened on 2026-10-25 (migrations 058 and 059).

## 1. Who can do what

- **API routes:** every session route calls `requireRole(request, workspaceId, role)` before it reads or writes.
  A route that uses the admin client (`adminClient()`) pins every query to that workspace.
- **Database:** every table has row-level security. The browser may write only the columns it really edits:
  - brands: insert workspace_id, url, domain, name, logo, category, prompts, profile, topics; update name, prompts, category, logo, daily, profile, topics. GA4 columns are server-only.
  - workspace_members: update role only. workspaces: update name, avatar, timezone, ai_settings. The allowed
    domain and join role go through `/api/workspace/join` (admins, their own confirmed email domain only).
  - report_links: read only. Revoke, password and expiry go through `/api/reports/links`.
  - Stripe ids and share-link password hashes are hidden from the browser (`has_customer` replaces the ids).
- **Database functions:** queue, billing and rate-limit functions are server-only. Signed-out visitors can call
  none. Invites need a confirmed email and expire after 14 days.
- **Spending:** viewers read; editors spend tasks. Article research takes tasks like other research.
  Plan and allowance checks fail closed in production when the database can't answer.
- **Zippie:** deleting or changing Content Plan pieces and starting an audit wait for an Approve card
  (`ApprovalCard`). Tool output goes back to the model marked as untrusted data. The MCP tools `add_prompts` and
  `remove_from_content_plan` need `confirm: true`.

## 2. Fetching outside addresses

- Every fetch of a customer's site, a scraped link, a webhook or a CMS goes through `safeFetch`
  (`src/lib/safeFetch.ts`): the address is checked when it connects (no DNS rebinding), every redirect is
  checked again, keys are dropped on a redirect to another site, and size and time are limited.
- `src/lib/netCheck.ts` decides what is private: loopback, private ranges, link local (169.254.169.254), CGNAT,
  IPv6 private and mapped forms (`::ffff:7f00:1`), NAT64, 6to4, Teredo, `fdaa::` and names like `.internal`.
- `tests/noPlainFetch.test.ts` fails when new code calls plain `fetch()` outside its allowlist of vendor APIs.
- The audit only crawls the audited domain and its www twin.
- The worker's Chromium goes through a small proxy in `scripts/worker.mjs` that looks up and checks every host,
  then connects to that address only. WebSockets are checked and WebRTC UDP is off. PDFs use the same filter.

## 3. Secrets

- CMS keys and passwords and Slack webhook addresses are encrypted in the database (`src/lib/sealed.ts`).
  Google refresh tokens are encrypted in `google.ts`. API keys, OAuth codes and share tokens are stored as hashes.
- Each job has its own optional key. Each falls back to the old one, so nothing breaks before it's set.

| Setting | Used for | Falls back to |
|---|---|---|
| `SECRETS_KEY` | CMS and Slack secrets | the Google token key |
| `GOOGLE_TOKEN_KEY` | Google refresh tokens | `SUPABASE_SECRET_KEY` |
| `REPORT_LINK_SECRET` | share links and their cookies | `CRON_SECRET` |
| `UNSUBSCRIBE_SECRET` | unsubscribe links | the old key (old links still work) |
| `WORKER_SECRET` | the Fly worker's token | `CRON_SECRET` |
| `TURNSTILE_SECRET` | the bot check on free tools | none: production refuses without it |

Setting `REPORT_LINK_SECRET` signs people out of password-protected share links once. Links shared after
migration 058 can only be copied again while that key stays the same.

## 4. Abuse limits

- Rate limits live in the database (`hit_limit`, `src/lib/limit.ts`), so they hold across machines and deploys.
  Keys are hashed. Share-link passwords: 10 tries an hour per link, 30 per IP. MCP: 60 calls a minute per key.
  OAuth sign-ups: 10 an hour per IP. Free tools and the AI Snapshot keep their daily caps.
- The visitor's IP is Fly's `Fly-Client-IP` header (`src/lib/clientIp.ts`), never the first `X-Forwarded-For`.
- `/api/setup-check` needs `CRON_SECRET` or a workspace admin.

## 5. Browser

- Headers on every page: HSTS, nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy, and a
  Content-Security-Policy with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` and `form-action`.
  A fuller policy runs as Report-Only first (`next.config.ts`).
- HTML written by agents is cleaned with DOMPurify (`src/lib/cleanHtml.ts`).
- SVG uploads are refused in the doc-images and brand-files buckets, and nobody outside a workspace can list
  its files.
- The WordPress connect callback needs the state saved when the connect started.

## 6. Keeping it that way

- CI runs `npm audit --omit=dev --audit-level=high`, and Dependabot opens updates weekly.
- Run Supabase's security advisor after every migration.
- Turn on leaked-password protection in Supabase (Authentication, then Policies).

## 7. Running cost

Nothing new to pay for: no new services and no AI calls. Rate limits are a few small rows in Supabase, and the
worker's address check runs inside the worker machine.

| Stage | Added each month |
|---|---|
| Beta (50 teams) | $0 |
| Growth (500 teams) | $0 |
