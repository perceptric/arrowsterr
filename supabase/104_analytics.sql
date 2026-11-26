-- Analytics: Search Console and Google Analytics 4 synced once a day per brand (src/lib/analyticsServer.ts), so the
-- Analytics page, Opportunities, Research ("You rank #8") and Zippie read real numbers without calling Google each time.
-- One Google sign-in (ga4_connections) now covers both: `scopes` says whether it includes Search Console.
-- Runs on its own from the app (README, Migrations run on their own). Safe to run twice.

alter table public.ga4_connections add column if not exists scopes text;
alter table public.brands add column if not exists gsc_property text;

-- Where the sync is for each brand. gsc_from/gsc_to: the oldest and newest Search Console day saved.
create table if not exists public.analytics_state (
  brand_id uuid primary key references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  gsc_from date,
  gsc_to date,
  ga4_to date,
  backfilled boolean not null default false,
  syncing boolean not null default false,
  error text,
  synced_at timestamptz
);

-- Search Console totals by day. Page and query rows leave out private queries, so totals come from here.
create table if not exists public.analytics_gsc_days (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position real,
  primary key (brand_id, day)
);

-- Search Console by day, page (a path like /blog/x) and query.
create table if not exists public.analytics_gsc (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  page text not null,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  position real not null default 0,
  primary key (brand_id, day, page, query)
);
create index if not exists analytics_gsc_query on public.analytics_gsc (brand_id, query, day);

-- Google Analytics by day and landing page: sessions, key events and visits from AI (ai: {"ChatGPT": 4, ...}).
create table if not exists public.analytics_ga4 (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  page text not null,
  sessions integer not null default 0,
  conversions integer not null default 0,
  ai_sessions integer not null default 0,
  ai jsonb not null default '{}'::jsonb,
  primary key (brand_id, day, page)
);

-- The day's Opportunities for each brand, worked out after each sync.
create table if not exists public.analytics_opportunities (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  id text not null,
  kind text not null,
  title text not null,
  page text,
  query text,
  gain_clicks integer not null default 0,
  gain_signups real,
  why text not null default '',
  data jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  primary key (brand_id, id)
);

-- People in the workspace read; only the server writes.
alter table public.analytics_state enable row level security;
alter table public.analytics_gsc_days enable row level security;
alter table public.analytics_gsc enable row level security;
alter table public.analytics_ga4 enable row level security;
alter table public.analytics_opportunities enable row level security;
drop policy if exists "analytics state read" on public.analytics_state;
create policy "analytics state read" on public.analytics_state for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "analytics gsc days read" on public.analytics_gsc_days;
create policy "analytics gsc days read" on public.analytics_gsc_days for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "analytics gsc read" on public.analytics_gsc;
create policy "analytics gsc read" on public.analytics_gsc for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "analytics ga4 read" on public.analytics_ga4;
create policy "analytics ga4 read" on public.analytics_ga4 for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "analytics opportunities read" on public.analytics_opportunities;
create policy "analytics opportunities read" on public.analytics_opportunities for select using (public.has_role(workspace_id, 'viewer'));

-- Totals for a date range, worked out in the database so the app never pulls every row.
create or replace function public.analytics_queries(p_brand uuid, p_from date, p_to date, p_limit integer)
returns table (query text, clicks bigint, impressions bigint, avg_position double precision)
language sql stable as $$
  select g.query, sum(g.clicks)::bigint, sum(g.impressions)::bigint,
    (sum(g.position * g.impressions) / nullif(sum(g.impressions), 0))::double precision
  from public.analytics_gsc g
  where g.brand_id = p_brand and g.day between p_from and p_to
  group by g.query
  order by sum(g.impressions) desc
  limit p_limit
$$;

create or replace function public.analytics_query_pages(p_brand uuid, p_from date, p_to date, p_limit integer)
returns table (query text, page text, clicks bigint, impressions bigint, avg_position double precision)
language sql stable as $$
  select g.query, g.page, sum(g.clicks)::bigint, sum(g.impressions)::bigint,
    (sum(g.position * g.impressions) / nullif(sum(g.impressions), 0))::double precision
  from public.analytics_gsc g
  where g.brand_id = p_brand and g.day between p_from and p_to
  group by g.query, g.page
  order by sum(g.impressions) desc
  limit p_limit
$$;

create or replace function public.analytics_pages(p_brand uuid, p_from date, p_to date, p_limit integer)
returns table (page text, clicks bigint, impressions bigint, avg_position double precision, sessions bigint, conversions bigint, ai_sessions bigint)
language sql stable as $$
  with s as (
    select g.page, sum(g.clicks)::bigint as clicks, sum(g.impressions)::bigint as impressions,
      (sum(g.position * g.impressions) / nullif(sum(g.impressions), 0))::double precision as pos
    from public.analytics_gsc g
    where g.brand_id = p_brand and g.day between p_from and p_to
    group by g.page
  ), a as (
    select x.page, sum(x.sessions)::bigint as sessions, sum(x.conversions)::bigint as conversions, sum(x.ai_sessions)::bigint as ai_sessions
    from public.analytics_ga4 x
    where x.brand_id = p_brand and x.day between p_from and p_to
    group by x.page
  )
  select coalesce(s.page, a.page), coalesce(s.clicks, 0), coalesce(s.impressions, 0), s.pos,
    coalesce(a.sessions, 0), coalesce(a.conversions, 0), coalesce(a.ai_sessions, 0)
  from s full outer join a on a.page = s.page
  order by coalesce(s.clicks, 0) desc, coalesce(a.sessions, 0) desc
  limit p_limit
$$;

create or replace function public.analytics_ga4_days(p_brand uuid, p_from date, p_to date)
returns table (day date, sessions bigint, conversions bigint, ai_sessions bigint)
language sql stable as $$
  select x.day, sum(x.sessions)::bigint, sum(x.conversions)::bigint, sum(x.ai_sessions)::bigint
  from public.analytics_ga4 x
  where x.brand_id = p_brand and x.day between p_from and p_to
  group by x.day
  order by x.day
$$;

create or replace function public.analytics_ai(p_brand uuid, p_from date, p_to date)
returns table (engine text, sessions bigint)
language sql stable as $$
  select e.key, sum(e.value::integer)::bigint
  from public.analytics_ga4 x, jsonb_each_text(x.ai) e
  where x.brand_id = p_brand and x.day between p_from and p_to
  group by e.key
  order by 2 desc
$$;
