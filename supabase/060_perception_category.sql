-- Perception "Seen as" (docs/perception.md): what kind of product each answer says a brand is. Run once in
-- Supabase → SQL Editor, after 059_perception.sql. Safe to run again.

-- One category per answer per brand, always from the brand's fixed list (brands.perception.categories), or null when
-- the answer doesn't say.
alter table public.perception_reads add column if not exists category text;

-- The summary now also returns category rows: word is null and category is set, n is the answers that say it.
drop function if exists public.perception_summary(uuid, timestamptz);
create function public.perception_summary(p_brand uuid, p_since timestamptz)
returns table (source text, kind text, named text, engine text, prompt text, word text, category text, n int, unknown int)
language sql stable security invoker set search_path = '' as $$
  select r.source, r.kind, r.named, r.engine, r.prompt, null::text, null::text, count(*)::int, (count(*) filter (where r.unknown))::int
    from public.perception_reads r
   where r.brand_id = p_brand and r.at >= p_since
   group by 1, 2, 3, 4, 5
  union all
  select r.source, r.kind, r.named, r.engine, r.prompt, x->>'word', null::text, count(distinct r.id)::int, 0
    from public.perception_reads r
   cross join lateral jsonb_array_elements(r.words) x
   where r.brand_id = p_brand and r.at >= p_since
   group by 1, 2, 3, 4, 5, 6
  union all
  select r.source, r.kind, r.named, r.engine, r.prompt, null::text, r.category, count(*)::int, 0
    from public.perception_reads r
   where r.brand_id = p_brand and r.at >= p_since and r.category is not null
   group by 1, 2, 3, 4, 5, 7
$$;
