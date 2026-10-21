-- The Library grid (docs/content-grid.md): Generate Draft in one click.
-- Run this once in Supabase → SQL Editor, after 050_agentic_writer.sql. Safe to run again.
--
-- writer_briefs.auto_draft: Generate Draft on a row with no brief starts the brief with this on. When the brief
--   is ready, the server approves it and starts the draft, so one click makes the whole draft.
-- An earlier version of this file made writer_columns and writer_cells, for columns people added to the grid.
-- That feature is gone, so they are dropped here if they exist.

alter table public.writer_briefs add column if not exists auto_draft boolean not null default false;

drop table if exists public.writer_cells;
drop table if exists public.writer_columns;
