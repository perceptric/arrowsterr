-- Content Map (docs/content-map.md): each build of a brand's topic map, newest on screen. Run once with psql on the VPS
-- database, after 064_link_building.sql. Safe to run again.

create table if not exists public.content_maps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  step text not null default 'Starting',
  result jsonb,
  error text,
  charge jsonb, -- the tasks it took, handed back if it fails: { period, plan, pack }
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists content_maps_brand on public.content_maps (brand_id, created_at desc);

alter table public.content_maps enable row level security;
drop policy if exists "content maps read" on public.content_maps;
create policy "content maps read" on public.content_maps for select using (public.has_role(workspace_id, 'viewer'));
