-- Visibility › Traffic: projects that track where a domain or a URL ranks on Google for chosen keywords, every day.
-- Safe to run twice.

-- One project: a domain (every page on it counts) or one URL (only that page counts), in one country, on one device.
create table if not exists public.rank_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete set null,
  name text not null,
  target text not null, -- "stride.com" or "stride.com/blog/best-running-shoes"
  scope text not null default 'domain' check (scope in ('domain', 'url')),
  location int not null default 2840, -- DataForSEO location code
  language text not null default 'en',
  device text not null default 'desktop' check (device in ('desktop', 'mobile')),
  paused boolean not null default false,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists rank_projects_ws_idx on public.rank_projects (workspace_id, created_at);
alter table public.rank_projects enable row level security;
drop policy if exists "rank projects read" on public.rank_projects;
create policy "rank projects read" on public.rank_projects for select using (public.has_role(workspace_id, 'viewer'));

-- A keyword a project tracks.
create table if not exists public.rank_keywords (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.rank_projects(id) on delete cascade,
  keyword text not null,
  tags text[] not null default '{}',
  volume int,
  created_at timestamptz not null default now(),
  unique (project_id, keyword)
);
create index if not exists rank_keywords_project_idx on public.rank_keywords (project_id);
alter table public.rank_keywords enable row level security;
drop policy if exists "rank keywords read" on public.rank_keywords;
create policy "rank keywords read" on public.rank_keywords for select using (public.has_role(workspace_id, 'viewer'));

-- One check of one keyword on one day. position is null when the target isn't in the results read (depth).
-- A queued check has a task id and no checked_at yet.
create table if not exists public.rank_checks (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.rank_projects(id) on delete cascade,
  keyword_id uuid not null references public.rank_keywords(id) on delete cascade,
  day date not null,
  depth int not null default 30, -- results read: 30 on most days, 100 once a week
  task_id text,
  posted_at timestamptz,
  checked_at timestamptz,
  position int,
  url text, -- the target's page that ranks
  features text[] not null default '{}', -- AI Overview, People also ask, and other parts Google showed
  top jsonb, -- the top 10 as [{rank, domain, url}]
  error text,
  attempts int not null default 0,
  unique (keyword_id, day)
);
create index if not exists rank_checks_project_day_idx on public.rank_checks (project_id, day);
create index if not exists rank_checks_waiting_idx on public.rank_checks (posted_at) where checked_at is null and task_id is not null;
alter table public.rank_checks enable row level security;
drop policy if exists "rank checks read" on public.rank_checks;
create policy "rank checks read" on public.rank_checks for select using (public.has_role(workspace_id, 'viewer'));
