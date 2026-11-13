-- Zippie skills and Knowledge like Omniscient (docs/zippie-skills-plan.md, section 3.1). Safe to run twice.
-- Skills are folders of files led by SKILL.md, in Workspace (the team's) or Personal (one person's) scope. System skills
-- live in code. Knowledge pages are Workspace or Personal too, and can be edited in place.

alter table public.ask_skills add column if not exists scope text not null default 'workspace' check (scope in ('workspace', 'personal'));
alter table public.ask_skills add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.ask_skills add column if not exists files jsonb not null default '{}';
alter table public.ask_skills add column if not exists updated_at timestamptz not null default now();
update public.ask_skills set owner_id = created_by where owner_id is null and builtin is null;

alter table public.ask_knowledge add column if not exists scope text not null default 'workspace' check (scope in ('workspace', 'personal'));
alter table public.ask_knowledge add column if not exists owner_id uuid references auth.users (id) on delete cascade;
alter table public.ask_knowledge add column if not exists updated_at timestamptz not null default now();
update public.ask_knowledge set owner_id = created_by where owner_id is null;

-- Personal rows are only for their owner. The server writes; these policies guard reads made with a person's own client.
drop policy if exists "ask skills read" on public.ask_skills;
create policy "ask skills read" on public.ask_skills for select using (public.has_role(workspace_id, 'viewer') and (scope = 'workspace' or owner_id = auth.uid()));
drop policy if exists "ask knowledge read" on public.ask_knowledge;
create policy "ask knowledge read" on public.ask_knowledge for select using (public.has_role(workspace_id, 'viewer') and (scope = 'workspace' or owner_id = auth.uid()));
