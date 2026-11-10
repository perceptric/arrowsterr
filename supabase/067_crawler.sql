-- Crawler v2 (docs/technical-seo-plan.md, phase 1): a crawl runs as a chain of jobs with its queue and pages in the
-- database, so it can read thousands of pages and survive restarts. Pages get their own rows for the Pages table.
-- Runs once on the VPS database by the migrate runner.

alter table public.site_audits add column if not exists crawl jsonb;
alter table public.site_audits add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.site_audits add column if not exists heartbeat_at timestamptz;
alter table public.brands add column if not exists audit_settings jsonb not null default '{}'::jsonb;

-- The crawl's to-do list: each URL once per crawl. Only the server reads it.
create table if not exists public.crawl_queue (
  audit_id uuid not null references public.site_audits (id) on delete cascade,
  url text not null,
  depth int not null default 0,
  source text not null default 'link',
  state text not null default 'queued',
  primary key (audit_id, url)
);
create index if not exists crawl_queue_todo on public.crawl_queue (audit_id, state, depth);
alter table public.crawl_queue enable row level security;

-- One row per crawled URL. The two newest finished crawls per brand keep their rows; older ones keep their summary.
create table if not exists public.crawl_pages (
  audit_id uuid not null references public.site_audits (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  url text not null,
  status int not null default 0,
  template text,
  indexable boolean not null default false,
  reason text,
  depth int,
  words int not null default 0,
  links_in int not null default 0,
  ms int not null default 0,
  in_sitemap boolean not null default false,
  title text,
  issues text[] not null default '{}',
  facts jsonb not null default '{}'::jsonb,
  primary key (audit_id, url)
);
create index if not exists crawl_pages_status on public.crawl_pages (audit_id, status);
create index if not exists crawl_pages_template on public.crawl_pages (audit_id, template);
create index if not exists crawl_pages_issues on public.crawl_pages using gin (issues);
alter table public.crawl_pages enable row level security;
drop policy if exists "crawl pages read" on public.crawl_pages;
create policy "crawl pages read" on public.crawl_pages for select using (public.has_role(workspace_id, 'viewer'));
