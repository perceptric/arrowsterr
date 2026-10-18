-- Library: a keyword's brief and draft as their own documents, and a Review step before Published.
-- Run this once in Supabase → SQL Editor, after 046_report_files.sql. Safe to run again.

-- ─────────────── review status ───────────────
alter table public.calendar_items drop constraint if exists calendar_items_status_check;
alter table public.calendar_items
  add constraint calendar_items_status_check check (status in ('planned', 'brief', 'writing', 'review', 'published'));

-- ─────────────── library ───────────────
-- When a keyword was imported into the Library. Null means it lives only on the Content Plan.
alter table public.calendar_items add column if not exists library_at timestamptz;

-- Keywords that already have a brief or a draft are in the Library from the start.
update public.calendar_items c
set library_at = coalesce(c.brief_at, c.created_at)
where c.library_at is null
  and (c.brief is not null or exists (select 1 from public.docs d where d.calendar_item_id = c.id));

create index if not exists calendar_items_library_idx on public.calendar_items (site_id, library_at) where library_at is not null;

-- ─────────────── draft versions ───────────────
-- A draft is never overwritten without a copy: generating it again saves the old one here first.
create table if not exists public.doc_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  doc_id uuid not null references public.docs (id) on delete cascade,
  title text not null default 'Untitled',
  content jsonb not null default '{}',
  words int not null default 0,
  reason text not null default 'regenerate',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists doc_versions_doc_idx on public.doc_versions (doc_id, created_at desc);
alter table public.doc_versions enable row level security;
drop policy if exists "doc versions read" on public.doc_versions;
drop policy if exists "doc versions add" on public.doc_versions;
drop policy if exists "doc versions delete" on public.doc_versions;
create policy "doc versions read" on public.doc_versions for select using (public.has_role(workspace_id, 'viewer'));
create policy "doc versions add" on public.doc_versions for insert with check (public.has_role(workspace_id, 'editor'));
create policy "doc versions delete" on public.doc_versions for delete using (public.has_role(workspace_id, 'editor'));
