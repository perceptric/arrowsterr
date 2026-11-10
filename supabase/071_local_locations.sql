-- Local Research, phase 1 of docs/local-research-plan.md: many locations per brand, and grids of any size and shape.
-- Each location keeps its business, keywords and grid settings in `data` (the Location type in src/lib/local.ts).
-- The brand's one location (brands.profile.location) is copied in once, and its scans point at it. Safe to run twice.

create table if not exists public.local_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  data jsonb not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists local_locations_brand on public.local_locations (brand_id, position);

alter table public.local_locations enable row level security;
drop policy if exists "local locations read" on public.local_locations;
create policy "local locations read" on public.local_locations for select using (public.has_role(workspace_id, 'viewer'));

-- Each scan keeps the grid it used, so a later change to the settings never redraws an old scan.
alter table public.local_scans add column if not exists location_id uuid references public.local_locations (id) on delete cascade;
alter table public.local_scans add column if not exists size int not null default 7;
alter table public.local_scans add column if not exists shape text not null default 'square';
alter table public.local_scans add column if not exists center_lat double precision;
alter table public.local_scans add column if not exists center_lng double precision;
create index if not exists local_scans_location on public.local_scans (location_id, keyword, created_at desc);

insert into public.local_locations (workspace_id, brand_id, data)
select b.workspace_id, b.id, b.profile -> 'location'
from public.brands b
where jsonb_typeof(b.profile -> 'location') = 'object'
  and not exists (select 1 from public.local_locations l where l.brand_id = b.id);

update public.local_scans s
set location_id = l.id
from public.local_locations l
where s.location_id is null and l.brand_id = s.brand_id;
