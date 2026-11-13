-- Content v3, phase 1: Opportunities. Pages grouped into clusters with a pillar, a score for every page, and
-- topics from AI answers that name competitors (docs/content-v3-backend.md, sections 2 and 9). Safe to run twice.

-- A group of pages on one topic. The pillar is the broad guide every other page links to.
create table if not exists public.content_clusters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null,
  theme text,
  pillar text, -- the pillar page's keyword
  keywords text[] not null default '{}', -- every page keyword, so the next run can keep this id
  score numeric not null default 0,
  position int not null default 0, -- order on the sheet, highest score first
  updates boolean not null default false, -- the "Pages to update" group
  run_id uuid references public.keyword_runs(id) on delete set null,
  archived_at timestamptz, -- not in the latest run and nothing in it anymore
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists content_clusters_site_idx on public.content_clusters (site_id, position);
alter table public.content_clusters enable row level security;
drop policy if exists "clusters read" on public.content_clusters;
create policy "clusters read" on public.content_clusters for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "clusters add" on public.content_clusters;
create policy "clusters add" on public.content_clusters for insert with check (public.has_role(workspace_id, 'editor'));
drop policy if exists "clusters edit" on public.content_clusters;
create policy "clusters edit" on public.content_clusters for update using (public.has_role(workspace_id, 'editor')) with check (public.has_role(workspace_id, 'editor'));
drop policy if exists "clusters delete" on public.content_clusters;
create policy "clusters delete" on public.content_clusters for delete using (public.has_role(workspace_id, 'editor'));

-- Each opportunity is a calendar item with no date (an idea), so the plan, the calendar and drafts keep one table.
alter table public.calendar_items add column if not exists cluster_id uuid references public.content_clusters(id) on delete set null;
alter table public.calendar_items add column if not exists cluster_role text check (cluster_role in ('pillar', 'page'));
alter table public.calendar_items add column if not exists score numeric;
alter table public.calendar_items add column if not exists chance numeric; -- 0 to 0.95
alter table public.calendar_items add column if not exists level text check (level in ('high', 'medium', 'low'));
alter table public.calendar_items add column if not exists reason text; -- "ChatGPT names Northpeak and Velora"
alter table public.calendar_items add column if not exists reason_engine text; -- the AI engine in the reason, if any
alter table public.calendar_items add column if not exists ai_prompt text; -- the tracked prompt an AI gap came from
alter table public.calendar_items add column if not exists dismissed_at timestamptz;
create index if not exists calendar_items_cluster_idx on public.calendar_items (cluster_id);
