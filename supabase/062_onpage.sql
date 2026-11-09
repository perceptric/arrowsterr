-- On-page Audit (docs/onpage-audit.md): one page scored against Google's top 10 for one keyword, kept per brand so
-- the screen shows every audited page and each page's history. Run once in Supabase → SQL Editor, after
-- 061_site_audits.sql. Safe to run again.

create table if not exists public.onpage_audits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  url text not null,
  keyword text not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  step text not null default 'Starting',
  score int,
  top_score int,
  result jsonb,
  error text,
  -- The tasks this audit took, so a failed audit hands them back: { period, plan, pack }.
  charge jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists onpage_audits_brand on public.onpage_audits (brand_id, created_at desc);
create index if not exists onpage_audits_page on public.onpage_audits (brand_id, url, created_at desc);

alter table public.onpage_audits enable row level security;
drop policy if exists "onpage audits read" on public.onpage_audits;
create policy "onpage audits read" on public.onpage_audits for select using (public.has_role(workspace_id, 'viewer'));
