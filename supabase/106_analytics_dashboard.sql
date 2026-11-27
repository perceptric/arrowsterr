-- Analytics dashboard (docs/seo-analytics.md): where visitors come from (GA4 sessions by channel), page titles from GA4
-- for the Pages table, and the reads behind "What changed" and "Where you rank".
-- Runs on its own from the app (README, Migrations run on their own). Safe to run twice.

-- GA4 sessions by day and default channel group ("Organic Search", "Direct", "Referral", ...).
create table if not exists public.analytics_ga4_channels (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  channel text not null,
  sessions integer not null default 0,
  primary key (brand_id, day, channel)
);

-- Each page's title as GA4 last saw it (the one with the most views), keyed by path like /blog/x.
create table if not exists public.analytics_page_titles (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  page text not null,
  title text not null,
  primary key (brand_id, page)
);

alter table public.analytics_ga4_channels enable row level security;
alter table public.analytics_page_titles enable row level security;
drop policy if exists "analytics channels read" on public.analytics_ga4_channels;
create policy "analytics channels read" on public.analytics_ga4_channels for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "analytics page titles read" on public.analytics_page_titles;
create policy "analytics page titles read" on public.analytics_page_titles for select using (public.has_role(workspace_id, 'viewer'));

-- Sessions by channel over a date range.
create or replace function public.analytics_channels(p_brand uuid, p_from date, p_to date)
returns table (channel text, sessions bigint)
language sql stable as $$
  select c.channel, sum(c.sessions)::bigint
  from public.analytics_ga4_channels c
  where c.brand_id = p_brand and c.day between p_from and p_to
  group by c.channel
  order by 2 desc
$$;

-- Daily clicks for a few queries or pages (p_kind 'query' or 'page'), for the small trend lines.
create or replace function public.analytics_trends(p_brand uuid, p_kind text, p_keys text[], p_from date, p_to date)
returns table (key text, day date, clicks bigint)
language sql stable as $$
  select case when p_kind = 'page' then g.page else g.query end, g.day, sum(g.clicks)::bigint
  from public.analytics_gsc g
  where g.brand_id = p_brand and g.day between p_from and p_to
    and (case when p_kind = 'page' then g.page else g.query end) = any(p_keys)
  group by 1, 2
$$;

-- Searches by Google position, week by week: for each of the last p_weeks weeks ending p_to (0 = the latest), how
-- many searches averaged positions 1-3, 4-10 and 11-20 that week. Matches rankBucket() in src/lib/seoAnalytics.ts.
create or replace function public.analytics_rank_weeks(p_brand uuid, p_to date, p_weeks integer)
returns table (week_back integer, bucket text, queries bigint)
language sql stable as $$
  with w as (
    select g.query, ((p_to - g.day) / 7)::integer as week_back,
      sum(g.position * g.impressions) / nullif(sum(g.impressions), 0) as pos
    from public.analytics_gsc g
    where g.brand_id = p_brand and g.day > p_to - (p_weeks * 7) and g.day <= p_to
    group by 1, 2
  )
  select w.week_back,
    case when w.pos < 3.5 then 'top3' when w.pos < 10.5 then 'top10' else 'top20' end,
    count(*)::bigint
  from w
  where w.pos is not null and w.pos < 20.5
  group by 1, 2
$$;
