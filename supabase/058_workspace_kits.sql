-- Every workspace has a Workspace Brand Kit (docs/reports.md, section 31).
-- Workspaces without one get a starter kit named after the workspace, and each new workspace gets one when it is made.
-- A starter kit has no learned_at or confirmed_at, so reports and the writer keep Arrowsterr's look until someone
-- learns it from a website or saves it.
-- Run this once in Supabase → SQL Editor, after 057_writer_images.sql. Safe to run again.

insert into public.brand_kits (workspace_id, key, kit, updated_by)
select w.id, 'workspace', jsonb_build_object('name', w.name), null
from public.workspaces w
on conflict (workspace_id, key) do nothing;

create or replace function public.workspace_starter_kit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.brand_kits (workspace_id, key, kit, updated_by)
  values (new.id, 'workspace', jsonb_build_object('name', new.name), null)
  on conflict (workspace_id, key) do nothing;
  return new;
end $$;

drop trigger if exists workspace_starter_kit on public.workspaces;
create trigger workspace_starter_kit after insert on public.workspaces
  for each row execute function public.workspace_starter_kit();
