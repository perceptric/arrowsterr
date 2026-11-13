-- Technical SEO was taken out of the app in November 2026 (docs: Site Audit, On-page Audit, Indexing, Speed, Site
-- structure, AI access). Its code is gone; this drops its tables and columns and the jobs still waiting in the queue.
-- The data is deleted for good. Safe to run twice. Nothing in the app reads any of these.

-- Jobs of the removed kinds: no worker runs them any more.
delete from public.jobs where kind in ('audit', 'onpage', 'gsc_sync', 'cwv_sync') and status in ('queued', 'running');

-- Site Audit and its crawler (036, 061, 067, 069). crawl_queue and crawl_pages point at site_audits, so they go first.
drop table if exists public.crawl_pages;
drop table if exists public.crawl_queue;
drop table if exists public.site_audits;

-- On-page Audit (062).
drop table if exists public.onpage_audits;

-- Search Console and Chrome UX Report (008, 068, 070).
drop table if exists public.gsc_inspections;
drop table if exists public.gsc_sitemaps;
drop table if exists public.gsc_pages;
drop table if exists public.gsc_daily;
drop table if exists public.gsc_connections;
drop table if exists public.gsc_site_connections;
drop table if exists public.cwv_urls;
drop table if exists public.cwv_origin;

-- Columns that only those tools used.
alter table public.brands drop column if exists audit_weekly;
alter table public.brands drop column if exists audit_settings;
alter table public.brands drop column if exists gsc_site;
alter table public.brands drop column if exists gsc_email;
alter table public.sites drop column if exists gsc_property;
alter table public.sites drop column if exists gsc_email;
