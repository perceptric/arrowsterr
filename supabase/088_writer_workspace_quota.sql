-- Pricing v6 (docs/pricing-v6.md): Agentic Writer drafts count per workspace, and Free's 1 article counts once ever
-- (period 'once'). p_scope 'brand' keeps the v5 count per brand, for subscribers on v5 prices and the trial.
-- Replaces writer_take_draft from 050. Callers that leave out p_scope still count per brand.
drop function if exists public.writer_take_draft(uuid, uuid, uuid, uuid, uuid, text, int, uuid);
create or replace function public.writer_take_draft(
  p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit int, p_user uuid default null, p_scope text default 'brand'
) returns table (draft_id uuid, outcome text) language plpgsql security definer set search_path = '' as $$
declare
  n int;
  found uuid;
begin
  if p_scope = 'workspace' then
    perform pg_advisory_xact_lock(hashtext('writer_draft_ws:' || p_workspace::text));
  else
    perform pg_advisory_xact_lock(hashtext('writer_draft:' || coalesce(p_brand::text, p_site::text)));
  end if;
  select d.id into found from public.writer_drafts d where d.item_id = p_item;
  if found is not null then
    return query select found, 'exists'::text;
    return;
  end if;
  if p_scope = 'workspace' then
    select count(*) into n from public.writer_drafts d where d.period = p_period and d.workspace_id = p_workspace;
  else
    select count(*) into n from public.writer_drafts d
      where d.period = p_period and (case when p_brand is null then d.site_id = p_site else d.brand_id = p_brand end);
  end if;
  if n >= p_limit then
    return query select null::uuid, 'full'::text;
    return;
  end if;
  insert into public.writer_drafts (workspace_id, brand_id, site_id, item_id, brief_id, period, created_by)
    values (p_workspace, p_brand, p_site, p_item, p_brief, p_period, p_user)
    returning id into found;
  return query select found, 'created'::text;
end;
$$;
revoke execute on function public.writer_take_draft(uuid, uuid, uuid, uuid, uuid, text, int, uuid, text) from public, anon, authenticated;
create index if not exists writer_drafts_ws_quota_idx on public.writer_drafts (workspace_id, period);

-- Everyone paying for Starter, Pro or Agency today bought a v5 (or older) price, so they keep v5 limits
-- (Extras.limitsFrom in src/lib/plans.ts). The Stripe webhook keeps it in step from here on.
update public.workspaces
  set extras = extras || '{"limitsFrom":"v5"}'::jsonb
  where plan in ('foundation', 'scale', 'agency') and stripe_subscription_id is not null and not (extras ? 'limitsFrom');

-- Free forever goes from 10 to 15 weekly prompts (2 AIs: 30 answers a day at most).
update public.workspaces set prompt_limit = 15, daily_answer_limit = 30 where plan = 'free' and prompt_limit = 10;
