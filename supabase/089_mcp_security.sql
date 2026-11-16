-- MCP security (docs: developers/mcp). Connected-app access tokens now expire after an hour; the app refreshes them.
-- Manual API keys keep expires_at null and never expire.
alter table public.api_keys add column if not exists expires_at timestamptz;

-- A member who leaves or is removed takes their keys and connected apps with them.
create or replace function public.revoke_member_keys() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.api_keys set revoked_at = now()
    where workspace_id = old.workspace_id and created_by = old.user_id and revoked_at is null;
  return old;
end;
$$;

drop trigger if exists workspace_members_revoke_keys on public.workspace_members;
create trigger workspace_members_revoke_keys after delete on public.workspace_members
  for each row execute function public.revoke_member_keys();

-- Connected apps from before this change get a day, then must refresh like new ones.
update public.api_keys set expires_at = now() + interval '1 day'
  where client_id is not null and expires_at is null and revoked_at is null;
