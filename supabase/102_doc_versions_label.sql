-- Names and authors on saved article versions (Drafts → History). doc_versions comes from 053_library_review.sql;
-- the server saves a copy there before a draft is written again (reason 'regenerate'). Version history in the
-- article screen also saves copies by hand and while editing, with a name and the person's display name.
-- Run once in Supabase → SQL Editor, after 101_doc_comments_versions.sql. Safe to run again.
alter table public.doc_versions add column if not exists label text not null default '';
alter table public.doc_versions add column if not exists author_name text not null default '';
