-- Technical SEO phase 3 (docs/technical-seo-plan.md): JavaScript rendering of crawled pages in the worker's Chromium,
-- an internal link score per page, and what the Site structure screen needs. Runs once by the migrate runner.

alter table public.crawl_pages add column if not exists render_state text;
alter table public.crawl_pages add column if not exists render_lease timestamptz;
alter table public.crawl_pages add column if not exists render_shot boolean not null default false;
alter table public.crawl_pages add column if not exists rendered jsonb;
alter table public.crawl_pages add column if not exists rendered_words int;
alter table public.crawl_pages add column if not exists shot text;
alter table public.crawl_pages add column if not exists internal_rank real;
create index if not exists crawl_pages_render on public.crawl_pages (render_state, audit_id) where render_state in ('queued', 'leased');
