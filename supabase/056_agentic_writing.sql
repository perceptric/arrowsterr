-- Agentic Writing (docs/agentic-writing.md). Run after 055_brand_check.sql.
--   The draft gains two steps between writing and the modules: style (the lint, the review with the writing skills
--   and the fixes) and images (screenshots and branded images from the worker, 057_writer_images.sql).
--   styled holds the sections after the style passes, with what they fixed and what's left for a person.
--   images holds the images made for the draft's version and the ones left as notes.

alter table public.writer_drafts add column if not exists styled jsonb;
alter table public.writer_drafts add column if not exists images jsonb;

alter table public.writer_drafts drop constraint if exists writer_drafts_step_check;
alter table public.writer_drafts add constraint writer_drafts_step_check
  check (step in ('sections', 'style', 'check', 'images', 'modules', 'save', 'done'));
