-- Local Research (docs/local-research.md): each Google Maps rank grid scan for a brand and keyword. The business itself
-- (picked from Google Maps) and its keywords live on brands.profile.location. Run once with psql on the VPS database, after
-- 065_content_map.sql. Safe to run again.

create table if not exists public.local_scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  keyword text not null,
  spacing numeric not null default 1,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  step text not null default 'Starting',
  tasks jsonb not null default '[]'::jsonb,   -- [{ i, id }] DataForSEO task per grid point
  points jsonb not null default '{}'::jsonb,  -- grid point -> its results, or null when it failed
  result jsonb,
  error text,
  charge jsonb,                               -- the tasks it took, handed back if every point fails
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists local_scans_brand on public.local_scans (brand_id, keyword, created_at desc);

alter table public.local_scans enable row level security;
drop policy if exists "local scans read" on public.local_scans;
create policy "local scans read" on public.local_scans for select using (public.has_role(workspace_id, 'viewer'));
