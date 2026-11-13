-- Audit, phase 1: the link crawler (docs/audit-plan.md, sections 4.5 and 8). One crawl per brand reads its pages and
-- their links, so Internal links and Content decay can both read the same rows. Safe to run twice.
-- The old Technical SEO tables (site_audits, crawl_queue, crawl_pages and the rest) stay unused.

-- One crawl of one brand's site.
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  root text not null, -- the start address, "https://acme.com/"
  settings jsonb not null default '{}'::jsonb, -- the crawl settings and page limit it ran with
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'partial', 'failed')),
  stage text not null default 'seed' check (stage in ('seed', 'fetch', 'graph', 'done')),
  partial_reason text, -- home, no_answer, time, robots, firewall, stalled
  error text,
  runtime jsonb not null default '{}'::jsonb, -- what the crawl needs between turns: robots rules, speed, query counts
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  lease_until timestamptz, -- one turn at a time: a turn holds the crawl until this time
  resumes int not null default 0,
  pages_found int not null default 0,
  pages_done int not null default 0,
  over_limit int not null default 0, -- addresses found after the page limit was reached
  stats jsonb, -- the numbers the screens show, written when the crawl finishes
  previous_id uuid references public.audits(id) on delete set null, -- the last full crawl before this one
  trigger text not null default 'manual' check (trigger in ('manual', 'weekly')),
  started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists audits_brand_idx on public.audits (brand_id, created_at desc);
create index if not exists audits_running_idx on public.audits (heartbeat_at) where status in ('queued', 'running');
alter table public.audits enable row level security;
drop policy if exists "audits read" on public.audits;
create policy "audits read" on public.audits for select using (public.has_role(workspace_id, 'viewer'));

-- The crawl queue: every address the crawl found, and whether it has been read.
create table if not exists public.audit_urls (
  audit_id uuid not null references public.audits(id) on delete cascade,
  url_hash text not null,
  url text not null,
  depth int not null default 0,
  found_from text not null default 'link' check (found_from in ('home', 'sitemap', 'link', 'redirect', 'ai', 'gsc', 'ga4')),
  state text not null default 'queued' check (state in ('queued', 'done', 'skipped', 'error')),
  skip_reason text, -- robots, excluded
  tries int not null default 0,
  retry_at timestamptz,
  in_sitemap boolean not null default false,
  lastmod timestamptz, -- the sitemap's lastmod
  id bigserial,
  primary key (audit_id, url_hash)
);
create index if not exists audit_urls_next_idx on public.audit_urls (audit_id, depth, id) where state = 'queued';
alter table public.audit_urls enable row level security;
-- Server only: no policies.

-- Every page the crawl read, with its facts and, after the graph step, its place in the site's links.
create table if not exists public.audit_pages (
  audit_id uuid not null references public.audits(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url_hash text not null,
  url text not null,
  final_url text, -- where a redirect ends
  status int not null default 0, -- 0 when it never answered
  error text,
  redirect_chain jsonb,
  content_type text,
  ms int,
  title text,
  h1 text[] not null default '{}',
  h2 text[] not null default '{}',
  canonical text,
  meta_robots text,
  indexable boolean not null default false,
  words int not null default 0,
  published_at timestamptz,
  modified_at timestamptz,
  in_sitemap boolean not null default false,
  sitemap_lastmod timestamptz,
  found_from text not null default 'link',
  links_to text[] not null default '{}', -- url_hash of every internal page it links to, once each
  body_links_to text[] not null default '{}', -- the same, only links in the main body
  links_out int not null default 0, -- internal links, once per target
  ext_links int not null default 0,
  depth int, -- clicks from the home page; null when no path reaches it
  links_in int not null default 0, -- pages that link to it
  body_links_in int not null default 0,
  link_score real not null default 0, -- 0 to 10
  orphan boolean not null default false,
  bad_links_out int not null default 0, -- links to redirects or broken pages
  ai_citations int not null default 0, -- AI answers that cited it in the last 30 days
  value real not null default 0, -- 0 to 1
  fetched_at timestamptz not null default now(),
  primary key (audit_id, url_hash)
);
create index if not exists audit_pages_value_idx on public.audit_pages (audit_id, value desc);
alter table public.audit_pages enable row level security;
drop policy if exists "audit pages read" on public.audit_pages;
create policy "audit pages read" on public.audit_pages for select using (public.has_role(workspace_id, 'viewer'));

-- Every internal link, for the page panel and the link suggestions.
create table if not exists public.audit_links (
  id bigserial primary key,
  audit_id uuid not null references public.audits(id) on delete cascade,
  from_hash text not null,
  to_hash text not null,
  to_url text not null,
  anchor text not null default '',
  rel text not null default '',
  place text not null default 'body' check (place in ('body', 'nav', 'footer'))
);
create index if not exists audit_links_from_idx on public.audit_links (audit_id, from_hash);
create index if not exists audit_links_to_idx on public.audit_links (audit_id, to_hash);
alter table public.audit_links enable row level security;
-- Server only: no policies. The page panel reads links through /api/audit.

-- brands.audit_weekly (061) and brands.audit_settings (067) already exist; added again for databases that skipped them.
alter table public.brands add column if not exists audit_weekly boolean not null default true;
alter table public.brands add column if not exists audit_settings jsonb not null default '{}'::jsonb;
