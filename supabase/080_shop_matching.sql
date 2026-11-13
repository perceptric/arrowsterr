-- AI Shopping, phase 3: product cards and what they matched (docs/ai-shopping-plan.md, sections 5 and 9). Safe to run twice.

-- Other names a brand goes by on cards ("Fenty" for Fenty Beauty).
alter table public.brands add column if not exists shop_aliases text[] not null default '{}';

-- Every product card in a tracked answer, for brands with AI Shopping on. One row per card place, so a retried
-- check never saves a card twice.
create table if not exists public.shop_cards (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete cascade,
  day date not null,
  engine text not null,
  prompt text not null,
  block int not null,
  position int not null,
  title text not null,
  seller text,
  domain text,
  url text,
  price numeric(12, 2),
  regular numeric(12, 2),
  currency text,
  gid text,
  ext_id text,
  image text,
  name_only boolean not null default false,
  keys text[] not null default '{}',
  verdict text check (verdict in ('matched', 'doubt', 'brand', 'other')),
  product_id uuid references public.shop_catalog(id) on delete set null,
  model text,
  score numeric(4, 2),
  how text,
  why text,
  rival text,
  looked_up boolean not null default false,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (brand_id, day, engine, prompt, block, position)
);
create index if not exists shop_cards_brand_day on public.shop_cards (brand_id, day);
create index if not exists shop_cards_todo on public.shop_cards (brand_id) where matched_at is null;
create index if not exists shop_cards_doubt on public.shop_cards (brand_id) where verdict = 'doubt';
alter table public.shop_cards enable row level security;
drop policy if exists "shop cards read" on public.shop_cards;
create policy "shop cards read" on public.shop_cards for select using (public.has_role(workspace_id, 'viewer'));

-- What a card is, remembered by its keys (Google's product ID, the store's product ID, the link, the name):
-- a product, or not ours when product_id is null and decided_by is set. Auto matches remember only exact IDs.
create table if not exists public.shop_ids (
  brand_id uuid not null references public.brands(id) on delete cascade,
  key text not null,
  product_id uuid references public.shop_catalog(id) on delete cascade,
  decided_by uuid,
  decided_at timestamptz not null default now(),
  primary key (brand_id, key)
);
alter table public.shop_ids enable row level security;

-- Picture hashes (section 5.3), one per picture address.
create table if not exists public.shop_image_hashes (
  url text primary key,
  hash text,
  at timestamptz not null default now()
);
alter table public.shop_image_hashes enable row level security;
