-- Contentful, Sanity and Strapi join the publishing sites (src/lib/cms.ts). Safe to run again, and before the code ships:
-- it only adds kinds to the list, so every site saved now still passes.
begin;
alter table public.cms_connections drop constraint if exists cms_connections_kind_check;
alter table public.cms_connections add constraint cms_connections_kind_check check (kind in ('wordpress', 'webflow', 'framer', 'shopify', 'hubspot', 'ghost', 'wix', 'webhook', 'contentful', 'sanity', 'strapi'));
commit;
