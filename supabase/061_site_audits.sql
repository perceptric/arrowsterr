-- Site Audit screen (docs/site-audit.md): each crawl belongs to a brand, so the screen shows that brand's history and
-- the change since the last crawl, and brands can turn the weekly crawl off. Run once in Supabase → SQL Editor, after
-- 060_perception_category.sql. Safe to run again.

alter table public.site_audits add column if not exists brand_id uuid references public.brands (id) on delete cascade;
create index if not exists site_audits_brand on public.site_audits (brand_id, created_at desc);

-- Crawls made before this file belong to the brand in the same workspace with the same domain.
update public.site_audits a
   set brand_id = b.id
  from public.brands b
 where a.brand_id is null
   and b.workspace_id = a.workspace_id
   and lower(regexp_replace(b.domain, '^(https?://)?(www\.)?', '')) = lower(a.domain);

-- The weekly crawl starts after a brand's first crawl, and is on until an editor turns it off.
alter table public.brands add column if not exists audit_weekly boolean not null default true;
