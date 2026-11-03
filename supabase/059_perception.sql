-- Perception (docs/perception.md): the words AI uses for a brand, scored on a radar. Run once in Supabase → SQL Editor,
-- after 058_workspace_kits.sql. Safe to run again.

-- The brand's word list: { "words": [{ "word", "good", "definition" }], "madeAt" }. Picked once by Haiku, editable.
alter table public.brands add column if not exists perception jsonb;

-- The PERCEPTION_VERSION (src/lib/perception.ts) a run's answers were read with. The schedule queues runs below it.
alter table public.runs add column if not exists perception_read int not null default 0;
create index if not exists runs_perception_idx on public.runs (at) where perception_read = 0;

-- One row per answer per brand it judged. A row with no words still counts: the answer named the brand and said none.
-- buyer: answers to the tracked prompts (their text lives in public.answers). direct: the weekly fixed questions,
-- which keep their own text here.
create table if not exists public.perception_reads (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  run_id uuid references public.runs (id) on delete cascade,
  source text not null check (source in ('buyer', 'direct')),
  kind text check (kind in ('describe', 'objections')),
  at timestamptz not null default now(),
  engine text not null,
  prompt text not null,
  named text not null,
  words jsonb not null default '[]',
  unknown boolean not null default false,
  answer text
);
create index if not exists perception_reads_brand_idx on public.perception_reads (brand_id, at desc);
create unique index if not exists perception_reads_buyer_key on public.perception_reads (run_id, engine, prompt, named) where source = 'buyer';

alter table public.perception_reads enable row level security;
drop policy if exists "perception read" on public.perception_reads;
create policy "perception read" on public.perception_reads for select using (public.has_role(workspace_id, 'viewer'));
-- Only the worker writes rows (it uses the secret key, which skips these policies).

-- The page's numbers without sending every row: answers per brand, engine and prompt (word is null), and how many of
-- those answers support each word. Runs as the signed-in person, so the read policy above applies.
create or replace function public.perception_summary(p_brand uuid, p_since timestamptz)
returns table (source text, kind text, named text, engine text, prompt text, word text, n int, unknown int)
language sql stable security invoker set search_path = '' as $$
  select r.source, r.kind, r.named, r.engine, r.prompt, null::text, count(*)::int, (count(*) filter (where r.unknown))::int
    from public.perception_reads r
   where r.brand_id = p_brand and r.at >= p_since
   group by 1, 2, 3, 4, 5
  union all
  select r.source, r.kind, r.named, r.engine, r.prompt, x->>'word', count(distinct r.id)::int, 0
    from public.perception_reads r
   cross join lateral jsonb_array_elements(r.words) x
   where r.brand_id = p_brand and r.at >= p_since
   group by 1, 2, 3, 4, 5, 6
$$;
