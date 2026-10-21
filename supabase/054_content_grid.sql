-- The Library grid (docs/content-grid.md): one-click Generate and columns people add.
-- Run this once in Supabase → SQL Editor, after 050_agentic_writer.sql. Safe to run again.
--
-- writer_briefs.auto_draft: Generate on a row with no brief starts the brief with this on. When the brief is
--   ready, the server approves it and starts the draft, so one click makes the whole article.
-- writer_columns: columns a person adds to a site's grid. A text column holds what people type; an AI column
--   holds a prompt that can read other columns by letter or name ({{F}}, {{H1}}), run for each row.
-- writer_cells: one value per added column and row. Members read; editors add, change and delete.
-- Locked sections need no table: they live in docs.meta.locked (021_doc_meta.sql), next to the doc they protect.

alter table public.writer_briefs add column if not exists auto_draft boolean not null default false;

create table if not exists public.writer_columns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'text' check (kind in ('text', 'ai')),
  prompt text not null default '' check (char_length(prompt) <= 4000),
  position int not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists writer_columns_site_idx on public.writer_columns (site_id, position);

create table if not exists public.writer_cells (
  column_id uuid not null references public.writer_columns (id) on delete cascade,
  item_id uuid not null references public.calendar_items (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  value text not null default '' check (char_length(value) <= 20000),
  status text not null default 'ready' check (status in ('ready', 'generating', 'failed')),
  error text,
  updated_at timestamptz not null default now(),
  primary key (column_id, item_id)
);

alter table public.writer_columns enable row level security;
alter table public.writer_cells enable row level security;
drop policy if exists "writer columns read" on public.writer_columns;
drop policy if exists "writer columns add" on public.writer_columns;
drop policy if exists "writer columns change" on public.writer_columns;
drop policy if exists "writer columns delete" on public.writer_columns;
create policy "writer columns read" on public.writer_columns for select using (public.has_role(workspace_id, 'viewer'));
create policy "writer columns add" on public.writer_columns for insert with check (public.has_role(workspace_id, 'editor'));
create policy "writer columns change" on public.writer_columns for update using (public.has_role(workspace_id, 'editor')) with check (public.has_role(workspace_id, 'editor'));
create policy "writer columns delete" on public.writer_columns for delete using (public.has_role(workspace_id, 'editor'));
drop policy if exists "writer cells read" on public.writer_cells;
drop policy if exists "writer cells add" on public.writer_cells;
drop policy if exists "writer cells change" on public.writer_cells;
drop policy if exists "writer cells delete" on public.writer_cells;
create policy "writer cells read" on public.writer_cells for select using (public.has_role(workspace_id, 'viewer'));
create policy "writer cells add" on public.writer_cells for insert with check (public.has_role(workspace_id, 'editor'));
create policy "writer cells change" on public.writer_cells for update using (public.has_role(workspace_id, 'editor')) with check (public.has_role(workspace_id, 'editor'));
create policy "writer cells delete" on public.writer_cells for delete using (public.has_role(workspace_id, 'editor'));
