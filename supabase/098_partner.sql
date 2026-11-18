-- The partner API (docs/API.md, "Partner API"). A partner (like Morning Telos) makes a brand for each of its
-- customers and gives that customer's AI agents a brand key that only sees that one brand.
-- Run this once in Supabase → SQL Editor, after 097_auth_attempt_hooks.sql. Safe to run again.
--
-- A workspace becomes a partner when we set it by hand (members cannot change workspaces.extras):
--   update public.workspaces set extras = extras || '{"partner": true}'::jsonb where id = '<workspace id>';

-- Keys. A partner key (aw_partner_…) runs /api/partner. A brand key (aw_brand_…) sees one brand.
-- api_keys keeps RLS on with no policies: only the server reads it, so no member ever sees a hash.
alter table public.api_keys add column if not exists partner boolean not null default false;
alter table public.api_keys add column if not exists brand_id uuid references public.brands (id) on delete cascade;
do $$ begin
  alter table public.api_keys add constraint api_keys_partner_or_brand check (not (partner and brand_id is not null));
exception when duplicate_object then null;
end $$;
create index if not exists api_keys_brand on public.api_keys (brand_id) where brand_id is not null;

-- Brands a partner made: its own id for the customer (external_id) and the partner key that made it.
alter table public.brands add column if not exists external_id text;
alter table public.brands add column if not exists created_by_key uuid;
create unique index if not exists brands_external_id on public.brands (workspace_id, external_id) where external_id is not null;

-- Only the server sets external_id and created_by_key. A member's insert or edit keeps them as they were,
-- so nobody can hand a brand to the partner API, or take one away, from the app.
create or replace function public.keep_partner_columns() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.external_id := null;
      new.created_by_key := null;
    else
      new.external_id := old.external_id;
      new.created_by_key := old.created_by_key;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists brands_keep_partner_columns on public.brands;
create trigger brands_keep_partner_columns before insert or update on public.brands
  for each row execute function public.keep_partner_columns();

-- A partner workspace has no brand cap. The prompt limit still applies (raise it with extras.prompts).
create or replace function public.check_brand_limits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare w public.workspaces; n int;
begin
  select * into w from public.workspaces where id = new.workspace_id;
  if tg_op = 'INSERT' and coalesce((w.extras ->> 'partner')::boolean, false) is not true then
    select count(*) into n from public.brands where workspace_id = new.workspace_id;
    if n >= w.brand_limit then
      raise exception 'This workspace can track % brands. Remove one first.', w.brand_limit;
    end if;
  end if;
  -- Only block when prompts are added, so a workspace over its limit can still remove some.
  if cardinality(new.prompts) > (case when tg_op = 'UPDATE' then cardinality(old.prompts) else 0 end) then
    select coalesce(sum(cardinality(prompts)), 0) into n from public.brands where workspace_id = new.workspace_id and id <> new.id;
    if n + cardinality(new.prompts) > w.prompt_limit then
      raise exception 'This workspace can track % prompts. % are in use.', w.prompt_limit, n;
    end if;
  end if;
  return new;
end;
$$;

-- Tasks each brand used, by calendar month ("2026-11"), for the partner's billing. Brand-key MCP calls add to it.
create table if not exists public.brand_usage (
  brand_id uuid not null references public.brands (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  period text not null,
  tasks int not null default 0,
  primary key (brand_id, period)
);
alter table public.brand_usage enable row level security; -- no policies: only the server reads or writes it

create or replace function public.add_brand_tasks(p_brand uuid, p_ws uuid, p_period text, p_n int) returns void
language sql security definer set search_path = '' as $$
  insert into public.brand_usage as u (brand_id, workspace_id, period, tasks) values (p_brand, p_ws, p_period, p_n)
  on conflict (brand_id, period) do update set tasks = u.tasks + p_n;
$$;
revoke execute on function public.add_brand_tasks(uuid, uuid, text, int) from public, anon, authenticated;
