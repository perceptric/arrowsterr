-- Agentic Writing images (docs/agentic-writing.md, section 5): every image a draft makes, one row each.
-- Run this once in Supabase → SQL Editor, after 050_agentic_writer.sql. Safe to run again.
--
-- writer_images: the draft's image step adds a row for each image of a draft version: a screenshot of a page
--   (url, with the frame page in html) or a drawn image (its page in html, built from a spec in the Brand Kit).
--   The Fly worker leases one at a time (lease_writer_image), makes the picture in Chromium and sends it back to
--   /api/writer/image-done, which saves it in the doc-images bucket at <workspace>/<draft>/<version>/<n>.<ext>.
--   (draft_id, version, n) is unique and the file name comes from it, so a retried step never makes an image twice.
-- Members read. Only the server writes.

create table if not exists public.writer_images (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  draft_id uuid not null references public.writer_drafts (id) on delete cascade,
  version int not null,                             -- the draft's version; a Regenerate makes a new set
  n int not null,                                   -- the image's place in the brief; 0 is the featured image
  kind text not null check (kind in ('featured', 'screenshot', 'chart', 'steps', 'comparison', 'checklist', 'anatomy')),
  url text,                                         -- the page a screenshot shows
  html text check (char_length(html) <= 2000000),   -- the page the worker pictures (for a screenshot, the frame)
  status text not null default 'queued' check (status in ('queued', 'working', 'done', 'failed')),
  attempts int not null default 0,
  locked_by text,
  locked_until timestamptz,
  path text,                                        -- the file in the doc-images bucket
  public_url text,
  width int,
  height int,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (draft_id, version, n)
);
create index if not exists writer_images_ready_idx on public.writer_images (created_at) where status = 'queued';
create index if not exists writer_images_lease_idx on public.writer_images (locked_until) where status = 'working';

alter table public.writer_images enable row level security;
drop policy if exists "writer images read" on public.writer_images;
create policy "writer images read" on public.writer_images for select using (public.has_role(workspace_id, 'viewer'));

-- ─────────────── the worker's lease ───────────────
-- Take the next image to make. Two workers never get the same one, an image whose worker died comes back after
-- its lease (3 tries at most), and images of a draft that was regenerated or finished are left alone.
create or replace function public.lease_writer_image(p_worker text, p_lease_seconds int default 90)
returns setof public.writer_images language sql security definer set search_path = '' as $$
  update public.writer_images i set status = 'working', attempts = i.attempts + 1, locked_by = p_worker,
    locked_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where i.id = (
    select q.id from public.writer_images q
    join public.writer_drafts d on d.id = q.draft_id
    where d.status = 'generating' and d.version = q.version
      and (q.status = 'queued' or (q.status = 'working' and q.locked_until < now() and q.attempts < 3))
    order by q.created_at, q.n
    limit 1
    for update of q skip locked
  )
  returning i.*;
$$;
revoke execute on function public.lease_writer_image(text, int) from public, anon, authenticated;

