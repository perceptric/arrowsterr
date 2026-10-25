-- Security fixes: column grants for the browser, hashed share tokens, invites that expire, and rate limits.
-- Run this once in Supabase → SQL Editor, after 057_writer_images.sql. Safe to run again.
--
-- Signed-in people (the authenticated role) may only write the columns the app's own screens write.
-- Everything else is written by the server with the secret key.

-- ─────────────── brands ───────────────
-- The browser adds brands (onboarding, import) and saves them (src/lib/db.ts addBrand and saveBrand).
-- Google Analytics, brand checks and website tracking columns are written by the server only.
revoke insert, update on public.brands from authenticated, anon;
grant insert (workspace_id, url, domain, name, logo, category, prompts, profile, topics) on public.brands to authenticated;
grant update (name, prompts, category, logo, daily, profile, topics) on public.brands to authenticated;

-- ─────────────── members ───────────────
-- Admins change a member's role and nothing else. New members come from create_workspace, accept_invite and join_by_domain.
revoke insert, update on public.workspace_members from authenticated, anon;
grant update (role) on public.workspace_members to authenticated;

-- A workspace counts only when one of its owners or admins has a confirmed email at that domain.
-- The address comes from the sign-in data, never from workspace_members.email.
create or replace function public.join_by_domain() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  em text;
  dom text;
  ws record;
  first uuid;
begin
  if auth.uid() is null then return null; end if;
  select lower(u.email) into em from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if em is null or position('@' in em) = 0 then return null; end if;
  dom := split_part(em, '@', 2);
  -- Shared email services never count, or anyone with a Gmail address could walk in.
  if dom = any (array['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','yahoo.com','ymail.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','gmx.com','gmx.de','mail.com','zoho.com','yandex.com','yandex.ru','qq.com','163.com','hey.com','fastmail.com','web.de','orange.fr','free.fr','libero.it']) then
    return null;
  end if;
  for ws in
    select w.id, w.join_role from public.workspaces w
    where w.allowed_domain = dom
      and exists (
        select 1 from public.workspace_members m
        join auth.users u on u.id = m.user_id
        where m.workspace_id = w.id and m.role in ('owner', 'admin')
          and u.email_confirmed_at is not null and lower(split_part(u.email, '@', 2)) = dom
      )
      and not exists (select 1 from public.workspace_members m where m.workspace_id = w.id and m.user_id = auth.uid())
    order by w.created_at
  loop
    begin
      insert into public.workspace_members (workspace_id, user_id, email, role) values (ws.id, auth.uid(), em, ws.join_role);
      first := coalesce(first, ws.id);
    exception when others then
      null; -- no free seat
    end;
  end loop;
  return first;
end;
$$;

-- ─────────────── workspaces ───────────────
-- Admins rename the workspace and set its picture, time zone and AI notes from the browser.
-- Who may join by email domain is saved by the server (/api/workspace/join). New workspaces come from create_workspace.
revoke insert, update on public.workspaces from authenticated, anon;
grant update (name, avatar, timezone, ai_settings) on public.workspaces to authenticated;

-- Whether the workspace has a Stripe customer, so the billing page can show it without reading the Stripe ids.
alter table public.workspaces add column if not exists has_customer boolean generated always as (stripe_customer_id is not null) stored;

-- Members read every column but the Stripe ids. Columns added later need their own grant select.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'workspaces' and column_name not in ('stripe_customer_id', 'stripe_subscription_id');
  revoke select on public.workspaces from authenticated, anon;
  execute format('grant select (%s) on public.workspaces to authenticated', cols);
end $$;

-- ─────────────── share links ───────────────
-- Links are made, changed and revoked by the server only (/api/reports/share and /api/reports/links).
drop policy if exists "report links edit" on public.report_links;
revoke insert, update on public.report_links from authenticated, anon;

-- Only the sha256 of a token is kept. Links made before this keep their token and get its hash here.
alter table public.report_links add column if not exists token_hash text;
update public.report_links set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex') where token_hash is null and token is not null;
create unique index if not exists report_links_token_hash_idx on public.report_links (token_hash);
-- New links store no token. The default stays only so older app code still makes working links while it deploys.
alter table public.report_links alter column token drop not null;

-- A link saved with a token gets its hash, so a link can always be found by its hash.
create or replace function public.report_link_hash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.token is not null and new.token_hash is null then
    new.token_hash := encode(sha256(convert_to(new.token, 'UTF8')), 'hex');
  end if;
  return new;
end;
$$;
drop trigger if exists report_links_hash on public.report_links;
create trigger report_links_hash before insert or update on public.report_links
  for each row execute function public.report_link_hash();

-- Members read every column but the password and token hashes. The app reads locked instead.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'report_links' and column_name not in ('password_hash', 'token_hash');
  revoke select on public.report_links from authenticated, anon;
  execute format('grant select (%s) on public.report_links to authenticated', cols);
end $$;

-- Count one view. The server calls this for a link's page; nobody else can.
create or replace function public.report_link_viewed(p_token text) returns void
language sql security definer set search_path = '' as $$
  update public.report_links set views = views + 1, last_viewed_at = now()
  where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;
revoke all on function public.report_link_viewed(text) from public, anon, authenticated;

-- ─────────────── invites ───────────────
-- An invite works for 14 days. Open invites made before this get 14 days from now.
alter table public.workspace_invites add column if not exists expires_at timestamptz;
update public.workspace_invites set expires_at = now() + interval '14 days' where expires_at is null and accepted_at is null;
alter table public.workspace_invites alter column expires_at set default (now() + interval '14 days');

-- Join a workspace from an invite link. The invite must be for the signed-in email, that email must be confirmed,
-- and the invite must not have expired.
create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.workspace_invites; em text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select lower(u.email) into em from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  if em is null then raise exception 'Confirm your email address first, then open the invite link again.'; end if;
  select * into inv from public.workspace_invites where token = p_token and accepted_at is null for update;
  if inv.id is null then raise exception 'This invite link is not valid or was already used.'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then
    raise exception 'This invite link has expired. Ask for a new one.';
  end if;
  if lower(inv.email) <> em then
    raise exception 'This invite is for %. Sign in with that email to accept it.', inv.email;
  end if;
  insert into public.workspace_members (workspace_id, user_id, email, role)
  values (inv.workspace_id, auth.uid(), em, inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end;
$$;

-- Members plus open invites can never be more than the plan's seats. An expired invite no longer holds a seat.
create or replace function public.check_seats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim int; members int; open_invites int;
begin
  select seat_limit into lim from public.workspaces where id = new.workspace_id;
  if lim is null then return new; end if;
  select count(*) into members from public.workspace_members where workspace_id = new.workspace_id;
  if tg_table_name = 'workspace_members' then
    -- An invite already holds its seat, so joining only needs a free member spot.
    if members > 0 and members >= lim then
      raise exception 'This workspace uses all % seats on its plan. Boost the plan to add people.', lim;
    end if;
  else
    select count(*) into open_invites from public.workspace_invites
    where workspace_id = new.workspace_id and accepted_at is null and (expires_at is null or expires_at > now());
    if members + open_invites >= lim then
      raise exception 'This workspace uses all % seats on its plan. Boost the plan to add people.', lim;
    end if;
  end if;
  return new;
end;
$$;

-- ─────────────── functions ───────────────
-- Nobody signed out may call these. Signed-in people call only the ones the app uses.
revoke execute on function public.has_role(uuid, public.ws_role) from public, anon;
revoke execute on function public.create_workspace(text) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.join_by_domain() from public, anon;
revoke execute on function public.take_answer(uuid) from public, anon;
grant execute on function public.has_role(uuid, public.ws_role) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.join_by_domain() to authenticated;
grant execute on function public.take_answer(uuid) to authenticated;

-- Trigger functions run from their triggers, never by hand.
revoke execute on function public.check_brand_limits() from public, anon, authenticated;
revoke execute on function public.check_seats() from public, anon, authenticated;
revoke execute on function public.cms_brand_matches() from public, anon, authenticated;
revoke execute on function public.doc_publication_matches() from public, anon, authenticated;
revoke execute on function public.run_brand_matches() from public, anon, authenticated;
revoke execute on function public.trial_from_signup() from public, anon, authenticated;
revoke execute on function public.report_link_hash() from public, anon, authenticated;

-- ─────────────── storage ───────────────
-- Draft pictures open from their public links, so nobody needs to list the bucket. Members may still list their own
-- workspace's folder, which uploads need.
drop policy if exists "doc images read" on storage.objects;
create policy "doc images read" on storage.objects for select to authenticated
  using (bucket_id = 'doc-images' and public.has_role(((storage.foldername(name))[1])::uuid, 'viewer'));

-- SVG files can carry scripts, so they can't be uploaded to either bucket.
update storage.buckets set allowed_mime_types = array_remove(allowed_mime_types, 'image/svg+xml')
where id in ('doc-images', 'brand-files');

-- ─────────────── rate limits ───────────────
-- A fixed window per key, shared by every server machine. Keys are hashed by the app (src/lib/limit.ts).
-- Server only: no policies, and the function is closed to signed-in people.
create table if not exists public.rate_hits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_hits enable row level security;

-- Count one hit. Returns true while the key has used fewer than p_max hits in this window.
create or replace function public.hit_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / greatest(p_window_seconds, 1)) * greatest(p_window_seconds, 1));
  got int;
begin
  insert into public.rate_hits as h (key, window_start, hits) values (p_key, w, 1)
  on conflict (key, window_start) do update set hits = h.hits + 1 where h.hits < p_max
  returning hits into got;
  if random() < 0.01 then delete from public.rate_hits where window_start < now() - interval '2 days'; end if;
  return got is not null and got <= p_max;
end;
$$;
revoke execute on function public.hit_limit(text, int, int) from public, anon, authenticated;
