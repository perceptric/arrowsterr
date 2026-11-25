-- Writing chats: the "Content writing" folder in Zippie and the Calendar pieces each chat worked on.
-- Chats started on the Writer page and Autopilot's daily chats go into one Zippie project per workspace
-- (ask_projects, from 037_zippie.sql) marked kind 'writing'. ask_thread_pieces links a chat to each piece its writer
-- tools touched (zippieWriter.ts), so the Writer, the Zippie sidebar and Drafts can show one from the other.
-- Run once in Supabase → SQL Editor, after 102_doc_versions_label.sql. Safe to run again.

alter table public.ask_projects add column if not exists kind text;
create unique index if not exists ask_projects_writing on public.ask_projects (workspace_id) where kind = 'writing';

-- Where a chat came from: 'writer' (the Writer page) or 'autopilot'. Null for every other chat.
alter table public.ask_threads add column if not exists kind text;

create table if not exists public.ask_thread_pieces (
  thread_id uuid not null references public.ask_threads (id) on delete cascade,
  item_id uuid not null references public.calendar_items (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (thread_id, item_id)
);
create index if not exists ask_thread_pieces_item on public.ask_thread_pieces (item_id, created_at desc);
create index if not exists ask_thread_pieces_ws on public.ask_thread_pieces (workspace_id);

-- The server writes links with the admin client; people in the workspace can read them.
alter table public.ask_thread_pieces enable row level security;
drop policy if exists "ask thread pieces read" on public.ask_thread_pieces;
create policy "ask thread pieces read" on public.ask_thread_pieces for select using (public.has_role(workspace_id, 'viewer'));
