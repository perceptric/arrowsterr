-- Link Building board (docs/link-building.md): each outreach target on a brand's "Link building" list is a card with a
-- stage and where it came from, and a won link keeps the page it sits on and its weekly check. Run once with psql
-- on the VPS database, after 063_backlinks.sql. Safe to run again.

alter table public.outreach_targets add column if not exists stage text not null default 'prospect' check (stage in ('prospect', 'contacted', 'replied', 'won', 'lost'));
alter table public.outreach_targets add column if not exists source text not null default 'manual' check (source in ('ai_cites', 'link_gap', 'broken_page', 'unlinked_mention', 'manual'));
alter table public.outreach_targets add column if not exists note text;               -- why it's a prospect, one line
alter table public.outreach_targets add column if not exists authority int;          -- the site's rank, 0 to 100
alter table public.outreach_targets add column if not exists stage_at timestamptz not null default now();
alter table public.outreach_targets add column if not exists link_page text;         -- the page where the won link sits
alter table public.outreach_targets add column if not exists link_live boolean;      -- null until checked
alter table public.outreach_targets add column if not exists link_follow boolean;
alter table public.outreach_targets add column if not exists link_misses int not null default 0;
alter table public.outreach_targets add column if not exists link_checked_at timestamptz;

-- Sites added from the Backlinks link gap before this file.
update public.outreach_targets set source = 'link_gap' where added_from = 'link_gap' and source = 'manual';

create index if not exists outreach_targets_won on public.outreach_targets (stage, link_checked_at) where stage = 'won';
