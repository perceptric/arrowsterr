-- Local Research, phase 4 of docs/local-research-plan.md: AI answers on the grid. Each row is one keyword asked of
-- Google's AI Mode from every point of a 5 × 5 grid, and of ChatGPT and Gemini once for the city. `reads` holds each
-- answer as saved (who it names, the sites it cites); `result` is the summary (AiResult in src/lib/localAi.ts).
-- Safe to run twice.

create table if not exists public.local_ai_scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  location_id uuid not null references public.local_locations (id) on delete cascade,
  keyword text not null,
  size int not null default 5,
  spacing numeric not null default 1,
  shape text not null default 'square',
  center_lat double precision not null,
  center_lng double precision not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  step text not null default 'Starting',
  tasks jsonb not null default '[]'::jsonb,       -- [{ k, id, engine }]: k is the grid point, or "ChatGPT" / "Gemini"
  candidates jsonb not null default '[]'::jsonb,  -- the businesses looked for, from the latest Maps scan
  reads jsonb not null default '{}'::jsonb,       -- k -> the answer as saved, or null when it failed
  result jsonb,
  error text,
  charge jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists local_ai_scans_location on public.local_ai_scans (location_id, keyword, created_at desc);

alter table public.local_ai_scans enable row level security;
drop policy if exists "local ai scans read" on public.local_ai_scans;
create policy "local ai scans read" on public.local_ai_scans for select using (public.has_role(workspace_id, 'viewer'));
