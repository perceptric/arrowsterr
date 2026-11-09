-- Backlinks screen (docs/backlinks.md): one snapshot of each brand's link numbers per day it's refreshed, so the
-- screen shows the change since last week. The DataForSEO answers themselves sit in keyword_cache for 7 days.
-- Run once with psql on the VPS database, after 062_onpage.sql. Safe to run again.

create table if not exists public.backlink_snapshots (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  rank int not null default 0,
  backlinks bigint not null default 0,
  domains int not null default 0,
  spam int not null default 0,
  primary key (brand_id, day)
);

alter table public.backlink_snapshots enable row level security;
drop policy if exists "backlink snapshots read" on public.backlink_snapshots;
create policy "backlink snapshots read" on public.backlink_snapshots for select using (public.has_role(workspace_id, 'viewer'));
