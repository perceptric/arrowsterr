-- Local Research, phase 3 of docs/local-research-plan.md: Google reviews of a location's business and of its 3
-- leaders. One row per review, saved by Google's review id, so a weekly pull never doubles one. A review that
-- disappears gets removed_at and stays in history. `themes` is null until Haiku has read it (src/lib/localReviews.ts).
-- `reviews_at` on local_locations is when its reviews were last pulled, and `reviews_from` the businesses pulled then
-- ([{ cid, title, you }]). Safe to run twice.

create table if not exists public.local_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  location_id uuid not null references public.local_locations (id) on delete cascade,
  cid text not null,
  title text not null default '',
  you boolean not null default false,
  review_id text not null,
  rating smallint,
  text text,
  author text,
  url text,
  posted_at timestamptz,
  reply text,
  replied_at timestamptz,
  themes jsonb,
  removed_at timestamptz,
  first_seen timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, cid, review_id)
);
create index if not exists local_reviews_location on public.local_reviews (location_id, posted_at desc);

alter table public.local_reviews enable row level security;
drop policy if exists "local reviews read" on public.local_reviews;
create policy "local reviews read" on public.local_reviews for select using (public.has_role(workspace_id, 'viewer'));

alter table public.local_locations add column if not exists reviews_at timestamptz;
alter table public.local_locations add column if not exists reviews_from jsonb;
