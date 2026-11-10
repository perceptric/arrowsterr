-- Local Research, phase 6 of docs/local-research-plan.md: alerts. One row per alert, unique on its key per location,
-- so the same rank drop, review or change never alerts twice. A rank drop starts as 'checking' while the points that
-- dropped are read again (`data` holds that check), then becomes 'open' if the second read agrees or 'dropped' if
-- not. `emailed_at` is when it went out in the location's alert email (one a day at most). Safe to run twice.

create table if not exists public.local_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  location_id uuid not null references public.local_locations (id) on delete cascade,
  kind text not null,
  key text not null,
  status text not null default 'open' check (status in ('checking', 'open', 'dropped')),
  title text not null,
  detail text not null default '',
  data jsonb,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (location_id, key)
);
create index if not exists local_alerts_location on public.local_alerts (location_id, created_at desc);
create index if not exists local_alerts_unsent on public.local_alerts (status, emailed_at) where emailed_at is null;

alter table public.local_alerts enable row level security;
drop policy if exists "local alerts read" on public.local_alerts;
create policy "local alerts read" on public.local_alerts for select using (public.has_role(workspace_id, 'viewer'));
