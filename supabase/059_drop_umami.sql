-- Umami website tracking is gone (2026-10-25). Customer traffic comes from their own Google Analytics 4.
-- Drops the columns 005_website_tracking.sql added. Run after 058_security.sql.
alter table public.brands
  drop column if exists umami_website_id,
  drop column if exists site_platform,
  drop column if exists install_token;
