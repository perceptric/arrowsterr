-- The Library grid (docs/content-grid.md). Safe to run again.
--
-- Earlier versions of this file added writer_briefs.auto_draft (Generate wrote the whole draft) and made
-- writer_columns and writer_cells (columns people added). The grid now generates the brief and writers fill each
-- section, so those are gone. The tables are dropped here if they exist; the unused column is left alone.

drop table if exists public.writer_cells;
drop table if exists public.writer_columns;
