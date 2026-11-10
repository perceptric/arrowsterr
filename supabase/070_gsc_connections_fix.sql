-- 068 found the old gsc_connections table from 008 (one row per website, keyed by site_id) and skipped creating the
-- new one (one row per brand). The old table is no longer read by the app: it's renamed and kept, and the new one is
-- created. Safe to run twice.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gsc_connections' and column_name = 'site_id')
     and not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gsc_connections' and column_name = 'brand_id') then
    alter table public.gsc_connections rename to gsc_site_connections;
    if exists (select 1 from pg_constraint where conname = 'gsc_connections_pkey' and conrelid = 'public.gsc_site_connections'::regclass) then
      alter table public.gsc_site_connections rename constraint gsc_connections_pkey to gsc_site_connections_pkey;
    end if;
  end if;
end $$;

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
