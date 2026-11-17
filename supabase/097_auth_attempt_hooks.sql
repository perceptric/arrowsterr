-- Supabase Auth hooks that lock an account for 15 minutes after 5 wrong passwords or 5 wrong 2-step codes.
-- They run inside Supabase Auth, so calling Supabase directly can't get around them.
-- Turn them on in Supabase: Authentication, Hooks, "Password verification attempt" and "MFA verification attempt",
-- pick Postgres, schema public, and the matching function below.
create table if not exists public.auth_failures (
  user_id uuid not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists auth_failures_user_idx on public.auth_failures (user_id, kind, at desc);
alter table public.auth_failures enable row level security;

create or replace function public.auth_attempt_decision(p_user uuid, p_kind text, p_valid boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  wrong int;
begin
  select count(*) into wrong from public.auth_failures
    where user_id = p_user and kind = p_kind and at > now() - interval '15 minutes';
  if wrong >= 5 then
    return jsonb_build_object('decision', 'reject', 'message', 'Too many wrong tries. Wait 15 minutes, or reset your password.', 'should_logout_user', false);
  end if;
  if p_valid then
    delete from public.auth_failures where user_id = p_user and kind = p_kind;
  else
    insert into public.auth_failures (user_id, kind) values (p_user, p_kind);
    delete from public.auth_failures where at < now() - interval '1 day';
  end if;
  return jsonb_build_object('decision', 'continue');
end;
$$;

create or replace function public.hook_password_verification_attempt(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.auth_attempt_decision((event->>'user_id')::uuid, 'password', (event->>'valid')::boolean);
end;
$$;

create or replace function public.hook_mfa_verification_attempt(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.auth_attempt_decision((event->>'user_id')::uuid, 'mfa', (event->>'valid')::boolean);
end;
$$;

-- Only Supabase Auth may call these.
revoke execute on function public.auth_attempt_decision(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated;
revoke execute on function public.hook_mfa_verification_attempt(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
grant execute on function public.hook_mfa_verification_attempt(jsonb) to supabase_auth_admin;
grant execute on function public.auth_attempt_decision(uuid, text, boolean) to supabase_auth_admin;
grant select, insert, delete on public.auth_failures to supabase_auth_admin;
