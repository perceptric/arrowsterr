-- Brand checks (src/lib/brandNames.ts): which version of the brand check a brand's saved answers were cleaned with.
-- The daily schedule queues one clean_brands job for each brand below the current version, then this is raised.
alter table public.brands add column if not exists brands_checked int not null default 0;
