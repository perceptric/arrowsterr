-- AI Shopping, phase 4: shopping prompts, their runs, the daily numbers, reasons and alerts
-- (docs/ai-shopping-plan.md, sections 4, 6, 7, 8 and 9). Safe to run twice.

-- The Catalog panel's retailer list and price floor (percent of your price, 1 to 100).
alter table public.brands add column if not exists shop_retailers text[] not null default '{}';
alter table public.brands add column if not exists shop_floor numeric(5, 2);

-- Shopping questions per brand, up to 40.
create table if not exists public.shop_prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  prompt text not null,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (brand_id, prompt)
);
alter table public.shop_prompts enable row level security;
drop policy if exists "shop prompts read" on public.shop_prompts;
create policy "shop prompts read" on public.shop_prompts for select using (public.has_role(workspace_id, 'viewer'));

-- One question asked once on one engine: 2 a day per prompt and engine, or 20 at once for a deep check.
-- The raw answer is kept gzipped for 30 days, so a better parser can read it again.
create table if not exists public.shop_runs (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  prompt_id uuid not null references public.shop_prompts(id) on delete cascade,
  engine text not null check (engine in ('gpt', 'aim')),
  day date not null,
  kind text not null default 'daily' check (kind in ('daily', 'deep')),
  sample int not null,
  task_id text,
  status text not null default 'new' check (status in ('new', 'posted', 'done', 'failed')),
  cards int,
  sources text[] not null default '{}',
  raw_gz text,
  error text,
  posted_at timestamptz,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (prompt_id, engine, day, kind, sample)
);
create index if not exists shop_runs_open on public.shop_runs (status) where status in ('new', 'posted');
create index if not exists shop_runs_brand_day on public.shop_runs (brand_id, day);
alter table public.shop_runs enable row level security;
drop policy if exists "shop runs read" on public.shop_runs;
create policy "shop runs read" on public.shop_runs for select using (public.has_role(workspace_id, 'viewer'));

-- Cards now come from two places: the daily tracking answers (run_id empty) and shopping runs. source_key keeps
-- a run's cards apart from another run's of the same prompt and day.
alter table public.shop_cards add column if not exists run_id bigint references public.shop_runs(id) on delete cascade;
alter table public.shop_cards add column if not exists source_key text not null default '';
alter table public.shop_cards add column if not exists store text;
alter table public.shop_cards add column if not exists own boolean not null default false;
alter table public.shop_cards add column if not exists text text;
alter table public.shop_cards add column if not exists links text[] not null default '{}';
alter table public.shop_cards add column if not exists flags text[] not null default '{}';
alter table public.shop_cards drop constraint if exists shop_cards_brand_id_day_engine_prompt_block_position_key;
create unique index if not exists shop_cards_place on public.shop_cards (brand_id, day, engine, prompt, block, position, source_key);
create index if not exists shop_cards_run on public.shop_cards (run_id) where run_id is not null;

-- The numbers, one row per brand, day, engine and prompt, from daily runs (section 6). Screens add rows up.
create table if not exists public.shop_daily (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  day date not null,
  engine text not null,
  prompt_id uuid not null references public.shop_prompts(id) on delete cascade,
  runs int not null,
  card_runs int not null,
  cards int not null,
  stats jsonb not null,
  primary key (brand_id, day, engine, prompt_id)
);
alter table public.shop_daily enable row level security;
drop policy if exists "shop daily read" on public.shop_daily;
create policy "shop daily read" on public.shop_daily for select using (public.has_role(workspace_id, 'viewer'));

-- Why AI picks a product, one line made of the AI's own words (section 8).
create table if not exists public.shop_reasons (
  product_id uuid primary key references public.shop_catalog(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  reason text not null,
  at timestamptz not null default now()
);
alter table public.shop_reasons enable row level security;

-- Alerts already sent, so each is sent once.
create table if not exists public.shop_alerts_sent (
  brand_id uuid not null references public.brands(id) on delete cascade,
  key text not null,
  at timestamptz not null default now(),
  primary key (brand_id, key)
);
alter table public.shop_alerts_sent enable row level security;
