-- AI Shopping: Merchant Center feed health (src/lib/merchantHealth.ts), saved by each catalog sync and shown on
-- the AI Shopping page. Item counts by status, the top item issues and missing details, as one JSON value.
-- The AI crawler report (src/lib/aiCrawlersServer.ts) needs no tables here: it reads Cloudflare or the
-- WordPress connector plugin each time. Safe to run twice, and safe before the code ships.
begin;

alter table public.shop_sources add column if not exists health jsonb;
alter table public.shop_sources add column if not exists health_at timestamptz;

commit;
