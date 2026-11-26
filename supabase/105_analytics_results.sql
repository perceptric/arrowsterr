-- Analytics, phase 3 (docs/seo-analytics.md): before and after results for every published article and refresh, and the
-- Search Console queries of one page for "Refresh the page".
-- Runs on its own from the app (README, Migrations run on their own). Safe to run twice.

-- When a Calendar piece first went live, and when it was last refreshed (published again, or an update to an existing
-- page went live). Set by the trigger below, so every way of publishing records it.
alter table public.calendar_items add column if not exists published_at timestamptz;
alter table public.calendar_items add column if not exists refreshed_at timestamptz;

create or replace function public.calendar_items_went_live() returns trigger
language plpgsql as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    if new.action = 'update' or new.published_at is not null then
      new.refreshed_at := now();
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end
$$;

drop trigger if exists calendar_items_went_live on public.calendar_items;
create trigger calendar_items_went_live before insert or update of status on public.calendar_items
  for each row execute function public.calendar_items_went_live();

-- Pieces published before this: the first time the article was pushed live, else when the piece was last saved.
update public.calendar_items c
set published_at = coalesce(
  (select min(p.pushed_at) from public.docs d join public.doc_publications p on p.doc_id = d.id
    where d.calendar_item_id = c.id and p.remote_status = 'publish'),
  (select max(d.updated_at) from public.docs d where d.calendar_item_id = c.id),
  c.created_at
)
where c.status = 'published' and c.published_at is null;

create index if not exists calendar_items_published on public.calendar_items (site_id, published_at desc) where status = 'published';

-- Totals for a few pages over one date range: Search Console and GA4 side by side.
create or replace function public.analytics_page_totals(p_brand uuid, p_pages text[], p_from date, p_to date)
returns table (page text, clicks bigint, impressions bigint, avg_position double precision, sessions bigint, conversions bigint, ai_sessions bigint)
language sql stable as $$
  with s as (
    select g.page, sum(g.clicks)::bigint as clicks, sum(g.impressions)::bigint as impressions,
      (sum(g.position * g.impressions) / nullif(sum(g.impressions), 0))::double precision as pos
    from public.analytics_gsc g
    where g.brand_id = p_brand and g.page = any(p_pages) and g.day between p_from and p_to
    group by g.page
  ), a as (
    select x.page, sum(x.sessions)::bigint as sessions, sum(x.conversions)::bigint as conversions, sum(x.ai_sessions)::bigint as ai_sessions
    from public.analytics_ga4 x
    where x.brand_id = p_brand and x.page = any(p_pages) and x.day between p_from and p_to
    group by x.page
  )
  select coalesce(s.page, a.page), coalesce(s.clicks, 0), coalesce(s.impressions, 0), s.pos,
    coalesce(a.sessions, 0), coalesce(a.conversions, 0), coalesce(a.ai_sessions, 0)
  from s full outer join a on a.page = s.page
$$;

-- One page's search queries over one date range, most impressions first.
create or replace function public.analytics_page_queries(p_brand uuid, p_page text, p_from date, p_to date, p_limit integer)
returns table (query text, clicks bigint, impressions bigint, avg_position double precision)
language sql stable as $$
  select g.query, sum(g.clicks)::bigint, sum(g.impressions)::bigint,
    (sum(g.position * g.impressions) / nullif(sum(g.impressions), 0))::double precision
  from public.analytics_gsc g
  where g.brand_id = p_brand and g.page = p_page and g.day between p_from and p_to
  group by g.query
  order by sum(g.impressions) desc
  limit p_limit
$$;
