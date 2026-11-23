-- Comments and saved versions for articles in Drafts (docs). Run once in Supabase → SQL Editor, after
-- 100_partner_connect.sql. Safe to run again.

-- doc_comments: a thread starts on a quote from the article (parent_id null); replies point to it.
-- Anyone in the workspace can read and comment; editors and the comment's author can resolve it; the author can delete it.
create table if not exists public.doc_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  doc_id uuid not null references public.docs (id) on delete cascade,
  parent_id uuid references public.doc_comments (id) on delete cascade,
  quote text not null default '' check (char_length(quote) <= 1000),
  body text not null check (char_length(body) between 1 and 4000),
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  author_name text not null default '' check (char_length(author_name) <= 200),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists doc_comments_doc_idx on public.doc_comments (doc_id, created_at);
alter table public.doc_comments enable row level security;

drop policy if exists "doc comments read" on public.doc_comments;
create policy "doc comments read" on public.doc_comments for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "doc comments add" on public.doc_comments;
create policy "doc comments add" on public.doc_comments for insert with check (
  public.has_role(workspace_id, 'viewer')
  and author_id = auth.uid()
  and exists (select 1 from public.docs d where d.id = doc_id and d.workspace_id = doc_comments.workspace_id)
);
drop policy if exists "doc comments edit" on public.doc_comments;
create policy "doc comments edit" on public.doc_comments for update
  using (public.has_role(workspace_id, 'editor') or author_id = auth.uid())
  with check (public.has_role(workspace_id, 'editor') or author_id = auth.uid());
drop policy if exists "doc comments delete" on public.doc_comments;
create policy "doc comments delete" on public.doc_comments for delete using (author_id = auth.uid() or public.has_role(workspace_id, 'admin'));

-- doc_versions already exists (053_library_review.sql): a copy of an article's text. Version history saves copies
-- by hand and while editing, so an insert must also be for an article in the same workspace. The app keeps the
-- newest 50 per article. 102_doc_versions_label.sql adds the label and author_name columns.
create index if not exists doc_versions_doc_idx on public.doc_versions (doc_id, created_at desc);
alter table public.doc_versions enable row level security;

drop policy if exists "doc versions read" on public.doc_versions;
create policy "doc versions read" on public.doc_versions for select using (public.has_role(workspace_id, 'viewer'));
drop policy if exists "doc versions add" on public.doc_versions;
create policy "doc versions add" on public.doc_versions for insert with check (
  public.has_role(workspace_id, 'editor')
  and exists (select 1 from public.docs d where d.id = doc_id and d.workspace_id = doc_versions.workspace_id)
);
drop policy if exists "doc versions delete" on public.doc_versions;
create policy "doc versions delete" on public.doc_versions for delete using (public.has_role(workspace_id, 'editor'));
