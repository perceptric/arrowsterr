-- Only the server sets a brand's tracking ids. Run this once in Supabase → SQL Editor, after 057_writer_images.sql. Safe to run again.
--
-- The Umami website id is public: it sits in the snippet on the customer's site. The "brands edit" policy lets editors
-- change any column, so an editor could copy another customer's id into their own brand, and /api/traffic and
-- /api/visitors would then show that customer's visits. The same goes for the Google Analytics property.
-- People signed in from the browser (the authenticated and anon roles) may no longer set these columns.
-- The server (service_role) and the SQL Editor (postgres) still can.

create or replace function public.brands_tracking_locked() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.umami_website_id is not null or new.install_token is not null or new.ga4_property is not null
       or new.ga4_property_name is not null or new.ga4_email is not null then
      raise exception 'Only the server sets a brand''s tracking.';
    end if;
  elsif new.umami_website_id is distinct from old.umami_website_id
     or new.install_token is distinct from old.install_token
     or new.ga4_property is distinct from old.ga4_property
     or new.ga4_property_name is distinct from old.ga4_property_name
     or new.ga4_email is distinct from old.ga4_email then
    raise exception 'Only the server sets a brand''s tracking.';
  end if;
  return new;
end;
$$;

drop trigger if exists brands_tracking_locked on public.brands;
create trigger brands_tracking_locked before insert or update on public.brands
  for each row execute function public.brands_tracking_locked();

-- Brands that share a website or a property with a brand in another workspace. Each brand gets its own
-- website, so any row here was copied and should be cleared:
--   select umami_website_id, array_agg(id), array_agg(workspace_id) from public.brands
--   where umami_website_id is not null group by umami_website_id having count(distinct workspace_id) > 1;
--   select ga4_property, array_agg(id), array_agg(workspace_id) from public.brands
--   where ga4_property is not null group by ga4_property having count(distinct workspace_id) > 1;
