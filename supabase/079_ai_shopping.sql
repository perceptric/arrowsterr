-- AI Shopping, phase 2: the catalog, its sources, and which brands get AI Shopping (docs/ai-shopping-plan.md,
-- sections 3, 3.1 and 9). Safe to run twice.

-- Section 3.1: Auto follows shop_detect; On and Off are set by hand and never changed by the job.
alter table public.brands add column if not exists shop_mode text not null default 'auto';
alter table public.brands drop constraint if exists brands_shop_mode_check;
alter table public.brands add constraint brands_shop_mode_check check (shop_mode in ('auto', 'on', 'off'));
alter table public.brands add column if not exists shop_on boolean not null default false;
alter table public.brands add column if not exists shop_reason text;
alter table public.brands add column if not exists shop_checked_at timestamptz;
alter table public.brands add column if not exists shop_facts jsonb;

-- Where a brand's catalog comes from: a Shopify store already connected in Publishing sites, a Merchant Center
-- account (its encrypted Google sign-in lives here, so only the server reads this table), or a CSV upload.
create table if not exists public.shop_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  kind text not null check (kind in ('shopify', 'merchant', 'csv')),
  cms_connection_id uuid references public.cms_connections(id) on delete cascade,
  account text,
  name text,
  email text,
  refresh_token text,
  status text not null default 'new' check (status in ('new', 'syncing', 'ok', 'error')),
  error text,
  products int not null default 0,
  variants int not null default 0,
  synced_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (brand_id, kind)
);
create index if not exists shop_sources_ws on public.shop_sources (workspace_id);
alter table public.shop_sources enable row level security;

-- One row per product, variants folded in (section 3).
create table if not exists public.shop_catalog (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  source_id uuid not null references public.shop_sources(id) on delete cascade,
  external_id text not null,
  title text not null,
  brand text,
  aliases text[] not null default '{}',
  url text,
  handle text,
  image text,
  product_type text,
  skus text[] not null default '{}',
  gtins text[] not null default '{}',
  mpns text[] not null default '{}',
  price_min numeric(12, 2),
  price_max numeric(12, 2),
  currency text,
  in_stock boolean,
  variants int not null default 1,
  synced_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index if not exists shop_catalog_brand on public.shop_catalog (brand_id);
alter table public.shop_catalog enable row level security;
drop policy if exists "shop catalog read" on public.shop_catalog;
create policy "shop catalog read" on public.shop_catalog for select using (public.has_role(workspace_id, 'viewer'));

-- Each day's price, because a card is always compared with the price on the day it was read.
create table if not exists public.shop_catalog_prices (
  product_id uuid not null references public.shop_catalog(id) on delete cascade,
  day date not null,
  price_min numeric(12, 2),
  price_max numeric(12, 2),
  currency text,
  in_stock boolean,
  primary key (product_id, day)
);
alter table public.shop_catalog_prices enable row level security;

-- Product cards that named the brand in its daily tracking answers (section 3.1, signal 4). One row per prompt,
-- engine and day, so a retried check never counts twice.
create table if not exists public.shop_seen (
  brand_id uuid not null references public.brands(id) on delete cascade,
  day date not null,
  engine text not null,
  prompt text not null,
  cards int not null,
  primary key (brand_id, day, engine, prompt)
);
alter table public.shop_seen enable row level security;

-- New job kinds need nothing here: the jobs table takes any kind.
