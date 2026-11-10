-- Local Research, phase 2 of docs/local-research-plan.md: the Google profiles of a location's business and of its 3
-- leaders, one row per business per read. `data` is the Profile type in src/lib/localProfile.ts. `confirm` marks the
-- quick second read of the business's own listing after it read differently. Safe to run twice.

create table if not exists public.local_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  location_id uuid not null references public.local_locations (id) on delete cascade,
  cid text,
  you boolean not null default false,
  confirm boolean not null default false,
  read_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists local_profiles_location on public.local_profiles (location_id, read_at desc);

alter table public.local_profiles enable row level security;
drop policy if exists "local profiles read" on public.local_profiles;
create policy "local profiles read" on public.local_profiles for select using (public.has_role(workspace_id, 'viewer'));
