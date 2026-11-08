-- arrowsterr: functions. Built from the running database. Unused objects were removed in the move (see README.md).
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- function: accept_invite(text)
CREATE FUNCTION public.accept_invite(p_token text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare inv public.workspace_invites;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  select * into inv from public.workspace_invites where token = p_token and accepted_at is null;
  if inv.id is null then raise exception 'This invite link is not valid or was already used.'; end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'This invite is for %. Sign in with that email to accept it.', inv.email;
  end if;
  insert into public.workspace_members (workspace_id, user_id, email, role)
  values (inv.workspace_id, auth.uid(), auth.jwt() ->> 'email', inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end;
$$;

ALTER FUNCTION public.accept_invite(p_token text) OWNER TO postgres;

-- function: add_task_pack(text, uuid, integer, integer)
CREATE FUNCTION public.add_task_pack(p_id text, p_ws uuid, p_tasks integer, p_amount integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.task_purchases (id, workspace_id, tasks, amount) values (p_id, p_ws, p_tasks, p_amount);
  update public.workspaces set task_credits = task_credits + p_tasks where id = p_ws;
  return true;
exception when unique_violation then
  return false;
end;
$$;

ALTER FUNCTION public.add_task_pack(p_id text, p_ws uuid, p_tasks integer, p_amount integer) OWNER TO postgres;

-- function: append_chat(uuid, jsonb)
CREATE FUNCTION public.append_chat(p_run uuid, p_chat jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare total int; want int;
begin
  update public.runs set chats = chats || jsonb_build_array(p_chat)
  where id = p_run
  returning jsonb_array_length(chats), expected into total, want;
  if want is not null and total >= want then
    update public.runs set status = case when exists (
      select 1 from jsonb_array_elements(chats) c where c->>'error' like 'Daily limit reached%') then 'limited' else 'done' end
    where id = p_run and status = 'running';
    return found;
  end if;
  return false;
end;
$$;

ALTER FUNCTION public.append_chat(p_run uuid, p_chat jsonb) OWNER TO postgres;

-- function: apply_plan(uuid, text, text, integer, integer, integer, jsonb, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.apply_plan(p_ws uuid, p_plan text, p_status text, p_brand_limit integer, p_prompt_limit integer, p_answer_limit integer, p_extras jsonb DEFAULT '{}'::jsonb, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_trial_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.workspaces set
    plan = p_plan, plan_status = p_status, brand_limit = p_brand_limit, prompt_limit = p_prompt_limit,
    daily_answer_limit = p_answer_limit, extras = coalesce(p_extras, '{}'::jsonb), period_end = p_period_end, trial_ends_at = p_trial_ends_at
  where id = p_ws;
$$;

ALTER FUNCTION public.apply_plan(p_ws uuid, p_plan text, p_status text, p_brand_limit integer, p_prompt_limit integer, p_answer_limit integer, p_extras jsonb, p_period_end timestamp with time zone, p_trial_ends_at timestamp with time zone) OWNER TO postgres;

-- function: check_brand_limits()
CREATE FUNCTION public.check_brand_limits() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare w public.workspaces; n int;
begin
  select * into w from public.workspaces where id = new.workspace_id;
  if tg_op = 'INSERT' then
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

ALTER FUNCTION public.check_brand_limits() OWNER TO postgres;

-- function: check_seats()
CREATE FUNCTION public.check_seats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
    select count(*) into open_invites from public.workspace_invites where workspace_id = new.workspace_id and accepted_at is null;
    if members + open_invites >= lim then
      raise exception 'This workspace uses all % seats on its plan. Boost the plan to add people.', lim;
    end if;
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.check_seats() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

-- function: claim_jobs(text, integer, integer, text[])
CREATE FUNCTION public.claim_jobs(p_worker text, p_limit integer DEFAULT 10, p_lease_seconds integer DEFAULT 300, p_kinds text[] DEFAULT NULL::text[]) RETURNS SETOF public.jobs
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.jobs j set status = 'running', attempts = j.attempts + 1, locked_by = p_worker,
    locked_until = now() + make_interval(secs => p_lease_seconds)
  where j.id in (
    select id from public.jobs
    where ((status = 'queued' and run_at <= now()) or (status = 'running' and locked_until < now()))
      and (p_kinds is null or kind = any (p_kinds))
    order by run_at
    limit p_limit
    for update skip locked
  )
  returning j.*;
$$;

ALTER FUNCTION public.claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer, p_kinds text[]) OWNER TO postgres;

-- function: cms_brand_matches()
CREATE FUNCTION public.cms_brand_matches() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.brand_id is not null and not exists (select 1 from public.brands b where b.id = new.brand_id and b.workspace_id = new.workspace_id) then
    raise exception 'Brand is not in this workspace.';
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.cms_brand_matches() OWNER TO postgres;

-- function: create_workspace(text)
CREATE FUNCTION public.create_workspace(p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare ws uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if (select count(*) from public.workspaces where created_by = auth.uid()) >= 3 then
    raise exception 'You can make up to 3 workspaces.';
  end if;
  insert into public.workspaces (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'My workspace'), auth.uid())
  returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, email, role)
  values (ws, auth.uid(), auth.jwt() ->> 'email', 'owner');
  return ws;
end;
$$;

ALTER FUNCTION public.create_workspace(p_name text) OWNER TO postgres;

-- function: doc_publication_matches()
CREATE FUNCTION public.doc_publication_matches() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.docs d where d.id = new.doc_id and d.workspace_id = new.workspace_id)
     or not exists (select 1 from public.cms_connections c where c.id = new.connection_id and c.workspace_id = new.workspace_id) then
    raise exception 'Article and site must be in this workspace.';
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.doc_publication_matches() OWNER TO postgres;

-- function: enqueue_job(text, jsonb, uuid, text, timestamp with time zone, integer)
CREATE FUNCTION public.enqueue_job(p_kind text, p_payload jsonb, p_workspace uuid DEFAULT NULL::uuid, p_key text DEFAULT NULL::text, p_run_at timestamp with time zone DEFAULT now(), p_max_attempts integer DEFAULT 6) RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.jobs (kind, key, workspace_id, payload, run_at, max_attempts)
  values (p_kind, p_key, p_workspace, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_at, now()), p_max_attempts)
  on conflict (key) do nothing
  returning id;
$$;

ALTER FUNCTION public.enqueue_job(p_kind text, p_payload jsonb, p_workspace uuid, p_key text, p_run_at timestamp with time zone, p_max_attempts integer) OWNER TO postgres;

-- function: finish_job(bigint)
CREATE FUNCTION public.finish_job(p_id bigint) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.jobs set status = 'done', finished_at = now(), locked_until = null where id = p_id;
$$;

ALTER FUNCTION public.finish_job(p_id bigint) OWNER TO postgres;

-- function: give_back(uuid, text, text, integer)
CREATE FUNCTION public.give_back(p_ws uuid, p_metric text, p_period text, p_n integer DEFAULT 1) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.usage_counters set used = greatest(0, used - p_n) where workspace_id = p_ws and metric = p_metric and period = p_period;
$$;

ALTER FUNCTION public.give_back(p_ws uuid, p_metric text, p_period text, p_n integer) OWNER TO postgres;

-- function: give_back_tasks(uuid, text, integer, integer)
CREATE FUNCTION public.give_back_tasks(p_ws uuid, p_period text, p_plan_n integer, p_pack_n integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.usage_counters set used = greatest(0, used - p_plan_n) where workspace_id = p_ws and metric = 'tasks' and period = p_period;
  if p_pack_n > 0 then update public.workspaces set task_credits = task_credits + p_pack_n where id = p_ws; end if;
end;
$$;

ALTER FUNCTION public.give_back_tasks(p_ws uuid, p_period text, p_plan_n integer, p_pack_n integer) OWNER TO postgres;

-- function: has_role(uuid, public.ws_role)
CREATE FUNCTION public.has_role(ws uuid, min public.ws_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select public.role_rank(m.role) >= public.role_rank(min)
       from public.workspace_members m
      where m.workspace_id = ws and m.user_id = auth.uid()),
    false)
$$;

ALTER FUNCTION public.has_role(ws uuid, min public.ws_role) OWNER TO postgres;

-- function: join_by_domain()
CREATE FUNCTION public.join_by_domain() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
        where m.workspace_id = w.id and m.role in ('owner', 'admin') and lower(split_part(m.email, '@', 2)) = dom
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

ALTER FUNCTION public.join_by_domain() OWNER TO postgres;

-- function: lease_article_page(text, integer)
CREATE FUNCTION public.lease_article_page(p_worker text, p_lease_seconds integer DEFAULT 60) RETURNS SETOF public.article_pages
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.article_pages p set status = 'rendering', attempts = p.attempts + 1, locked_by = p_worker,
    locked_until = now() + make_interval(secs => p_lease_seconds)
  where p.id = (
    select q.id from public.article_pages q
    join public.article_runs r on r.id = q.run_id
    where r.status in ('searching', 'reading', 'waiting')
      and (q.status = 'queued' or (q.status = 'rendering' and q.locked_until < now() and q.attempts < 3))
    order by q.created_at, q.id
    limit 1
    for update of q skip locked
  )
  returning p.*;
$$;

ALTER FUNCTION public.lease_article_page(p_worker text, p_lease_seconds integer) OWNER TO postgres;

-- function: lease_writer_image(text, integer)
CREATE FUNCTION public.lease_writer_image(p_worker text, p_lease_seconds integer DEFAULT 90) RETURNS SETOF public.writer_images
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.writer_images i set status = 'working', attempts = i.attempts + 1, locked_by = p_worker,
    locked_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where i.id = (
    select q.id from public.writer_images q
    join public.writer_drafts d on d.id = q.draft_id
    where d.status = 'generating' and d.version = q.version
      and (q.status = 'queued' or (q.status = 'working' and q.locked_until < now() and q.attempts < 3))
    order by q.created_at, q.n
    limit 1
    for update of q skip locked
  )
  returning i.*;
$$;

ALTER FUNCTION public.lease_writer_image(p_worker text, p_lease_seconds integer) OWNER TO postgres;

-- function: lock_publication(uuid, integer)
CREATE FUNCTION public.lock_publication(p_id uuid, p_seconds integer DEFAULT 120) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with t as (
    update public.doc_publications set locked_until = now() + make_interval(secs => p_seconds)
    where id = p_id and (locked_until is null or locked_until < now())
    returning 1
  )
  select exists (select 1 from t);
$$;

ALTER FUNCTION public.lock_publication(p_id uuid, p_seconds integer) OWNER TO postgres;

-- function: perception_summary(uuid, timestamp with time zone)
CREATE FUNCTION public.perception_summary(p_brand uuid, p_since timestamp with time zone) RETURNS TABLE(source text, kind text, named text, engine text, prompt text, word text, category text, n integer, unknown integer)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
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

ALTER FUNCTION public.perception_summary(p_brand uuid, p_since timestamp with time zone) OWNER TO postgres;

-- function: prune_jobs()
CREATE FUNCTION public.prune_jobs() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  delete from public.jobs where status = 'done' and finished_at < now() - interval '3 days';
  delete from public.jobs where status = 'dead' and finished_at < now() - interval '30 days';
$$;

ALTER FUNCTION public.prune_jobs() OWNER TO postgres;

-- function: report_link_viewed(text)
CREATE FUNCTION public.report_link_viewed(p_token text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.report_links set views = views + 1, last_viewed_at = now() where token = p_token;
$$;

ALTER FUNCTION public.report_link_viewed(p_token text) OWNER TO postgres;

-- function: retry_job(bigint, text, integer, jsonb, boolean)
CREATE FUNCTION public.retry_job(p_id bigint, p_error text, p_seconds integer, p_payload jsonb DEFAULT NULL::jsonb, p_count boolean DEFAULT true) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.jobs set
    status = case when p_count and attempts >= max_attempts then 'dead' else 'queued' end,
    attempts = case when p_count then attempts else greatest(0, attempts - 1) end,
    run_at = now() + make_interval(secs => p_seconds),
    last_error = p_error,
    payload = coalesce(p_payload, payload),
    locked_until = null,
    finished_at = case when p_count and attempts >= max_attempts then now() else null end
  where id = p_id;
$$;

ALTER FUNCTION public.retry_job(p_id bigint, p_error text, p_seconds integer, p_payload jsonb, p_count boolean) OWNER TO postgres;

-- function: role_rank(public.ws_role)
CREATE FUNCTION public.role_rank(r public.ws_role) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'editor' then 2 else 1 end
$$;

ALTER FUNCTION public.role_rank(r public.ws_role) OWNER TO postgres;

-- function: run_brand_matches()
CREATE FUNCTION public.run_brand_matches() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (select 1 from public.brands b where b.id = new.brand_id and b.workspace_id = new.workspace_id) then
    raise exception 'Brand is not in this workspace.';
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.run_brand_matches() OWNER TO postgres;

-- function: take_allowance(uuid, text, text, integer, integer)
CREATE FUNCTION public.take_allowance(p_ws uuid, p_metric text, p_period text, p_limit integer, p_n integer DEFAULT 1) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare used_now int;
begin
  if p_limit <= 0 or p_n > p_limit then return -1; end if;
  insert into public.usage_counters as u (workspace_id, metric, period, used) values (p_ws, p_metric, p_period, p_n)
  on conflict (workspace_id, metric, period) do update set used = u.used + p_n where u.used + p_n <= p_limit
  returning used into used_now;
  return coalesce(used_now, -1);
end;
$$;

ALTER FUNCTION public.take_allowance(p_ws uuid, p_metric text, p_period text, p_limit integer, p_n integer) OWNER TO postgres;

-- function: take_answer(uuid)
CREATE FUNCTION public.take_answer(p_ws uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare lim int; used int;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not public.has_role(p_ws, 'editor') then
    raise exception 'You need editor access in this workspace.';
  end if;
  select daily_answer_limit into lim from public.workspaces where id = p_ws;
  if lim is null or lim <= 0 then return false; end if;
  insert into public.usage as u (workspace_id, day, answers) values (p_ws, (now() at time zone 'utc')::date, 1)
  on conflict (workspace_id, day) do update set answers = u.answers + 1 where u.answers < lim
  returning answers into used;
  return used is not null;
end;
$$;

ALTER FUNCTION public.take_answer(p_ws uuid) OWNER TO postgres;

-- function: take_rate(text, integer, integer)
CREATE FUNCTION public.take_rate(p_key text, p_per_minute integer, p_n integer DEFAULT 1) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare m timestamptz := date_trunc('minute', now()); got int;
begin
  insert into public.rate_buckets as b (key, minute, used) values (p_key, m, p_n)
  on conflict (key, minute) do update set used = b.used + p_n where b.used + p_n <= p_per_minute
  returning used into got;
  if random() < 0.01 then delete from public.rate_buckets where minute < now() - interval '10 minutes'; end if;
  return got is not null;
end;
$$;

ALTER FUNCTION public.take_rate(p_key text, p_per_minute integer, p_n integer) OWNER TO postgres;

-- function: take_tasks(uuid, text, integer, integer)
CREATE FUNCTION public.take_tasks(p_ws uuid, p_period text, p_limit integer, p_n integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare used_now int; room int; from_pack int; left_after int;
begin
  insert into public.usage_counters (workspace_id, metric, period, used) values (p_ws, 'tasks', p_period, 0)
  on conflict (workspace_id, metric, period) do nothing;
  select used into used_now from public.usage_counters where workspace_id = p_ws and metric = 'tasks' and period = p_period for update;
  room := greatest(0, p_limit - used_now);
  from_pack := greatest(0, p_n - room);
  if from_pack > 0 then
    update public.workspaces set task_credits = task_credits - from_pack where id = p_ws and task_credits >= from_pack returning task_credits into left_after;
    if left_after is null then return -1; end if;
  end if;
  update public.usage_counters set used = used + (p_n - from_pack) where workspace_id = p_ws and metric = 'tasks' and period = p_period;
  return from_pack;
end;
$$;

ALTER FUNCTION public.take_tasks(p_ws uuid, p_period text, p_limit integer, p_n integer) OWNER TO postgres;

-- function: trial_from_signup()
CREATE FUNCTION public.trial_from_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare joined timestamptz;
begin
  if new.plan <> 'trial' or new.created_by is null then return new; end if;
  select created_at into joined from auth.users where id = new.created_by;
  if joined is not null then
    new.trial_ends_at := least(coalesce(new.trial_ends_at, now() + interval '7 days'), joined + interval '7 days');
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.trial_from_signup() OWNER TO postgres;

-- function: workspace_starter_kit()
CREATE FUNCTION public.workspace_starter_kit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.brand_kits (workspace_id, key, kit, updated_by)
  values (new.id, 'workspace', jsonb_build_object('name', new.name), null)
  on conflict (workspace_id, key) do nothing;
  return new;
end $$;

ALTER FUNCTION public.workspace_starter_kit() OWNER TO postgres;

-- function: writer_take_draft(uuid, uuid, uuid, uuid, uuid, text, integer, uuid)
CREATE FUNCTION public.writer_take_draft(p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit integer, p_user uuid DEFAULT NULL::uuid) RETURNS TABLE(draft_id uuid, outcome text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  n int;
  found uuid;
begin
  perform pg_advisory_xact_lock(hashtext('writer_draft:' || coalesce(p_brand::text, p_site::text)));
  select d.id into found from public.writer_drafts d where d.item_id = p_item;
  if found is not null then
    return query select found, 'exists'::text;
    return;
  end if;
  select count(*) into n from public.writer_drafts d
    where d.period = p_period and (case when p_brand is null then d.site_id = p_site else d.brand_id = p_brand end);
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

ALTER FUNCTION public.writer_take_draft(p_workspace uuid, p_brand uuid, p_site uuid, p_item uuid, p_brief uuid, p_period text, p_limit integer, p_user uuid) OWNER TO postgres;
