-- Wix and webhook sites join the publishing sites (docs/drafts-plan.md, phase 3).
alter table public.cms_connections drop constraint if exists cms_connections_kind_check;
alter table public.cms_connections add constraint cms_connections_kind_check check (kind in ('wordpress', 'webflow', 'framer', 'shopify', 'hubspot', 'ghost', 'wix', 'webhook'));
