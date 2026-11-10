-- Technical SEO phase 2 (docs/technical-seo-plan.md): Search Console and Chrome UX Report data for the Indexing and
-- Speed screens. Runs once on the VPS database by the migrate runner.

-- Each brand's Search Console sign-in, encrypted. No policies: only the server reads it.
create table if not exists public.gsc_connections (
  brand_id uuid primary key references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  refresh_token text not null,
  email text,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  backfilled_at timestamptz,
  synced_at timestamptz,
  sync_error text,
  inspect_day date,
  inspected_today int not null default 0
);
alter table public.gsc_connections enable row level security;

-- The property the brand uses, and the account that connected it. Safe to show.
alter table public.brands add column if not exists gsc_site text;
alter table public.brands add column if not exists gsc_email text;

-- Clicks and impressions per day for the whole site, up to 16 months.
create table if not exists public.gsc_daily (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  clicks int not null default 0,
  impressions int not null default 0,
  position real not null default 0,
  primary key (brand_id, day)
);

-- Each page's last 28 days and the 28 before, refreshed daily.
create table if not exists public.gsc_pages (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  page text not null,
  clicks int not null default 0,
  impressions int not null default 0,
  position real not null default 0,
  clicks_prev int not null default 0,
  impressions_prev int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (brand_id, page)
);
create index if not exists gsc_pages_clicks on public.gsc_pages (brand_id, clicks desc);

-- The latest URL Inspection answer for each page.
create table if not exists public.gsc_inspections (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  url text not null,
  inspected_at timestamptz not null default now(),
  indexed boolean not null default false,
  verdict text,
  coverage text,
  robots text,
  google_canonical text,
  user_canonical text,
  last_crawl timestamptz,
  crawled_as text,
  mobile text,
  rich jsonb not null default '[]'::jsonb,
  primary key (brand_id, url)
);

-- Sitemaps as Search Console sees them.
create table if not exists public.gsc_sitemaps (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  path text not null,
  last_downloaded timestamptz,
  last_submitted timestamptz,
  pending boolean not null default false,
  is_index boolean not null default false,
  errors int not null default 0,
  warnings int not null default 0,
  submitted int not null default 0,
  indexed int not null default 0,
  primary key (brand_id, path)
);

-- Chrome UX Report field data: the site (origin) per device, with its weekly history, and single pages.
create table if not exists public.cwv_origin (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_factor text not null,
  fetched_at timestamptz not null default now(),
  vitals jsonb not null default '{}'::jsonb,
  history jsonb not null default '{}'::jsonb,
  primary key (brand_id, form_factor)
);
create table if not exists public.cwv_urls (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  url text not null,
  form_factor text not null,
  fetched_at timestamptz not null default now(),
  vitals jsonb not null default '{}'::jsonb,
  source text not null default 'crux',
  lab jsonb,
  primary key (brand_id, url, form_factor)
);

do $$
declare t text;
begin
  foreach t in array array['gsc_daily', 'gsc_pages', 'gsc_inspections', 'gsc_sitemaps', 'cwv_origin', 'cwv_urls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s read" on public.%I', t, t);
    execute format('create policy "%s read" on public.%I for select using (public.has_role(workspace_id, ''viewer''))', t, t);
  end loop;
end $$;
