-- Scheduled reports (docs/reports.md, section 32.4). Run this once in Supabase → SQL Editor, after 046_report_files.sql.
-- Safe to run again.
--
-- Schedules are now added and changed by the server only (/api/schedules), because the plan decides how many may
-- be on. Members still read them and their send history; editors still delete them.
drop policy if exists "report schedules add" on public.report_schedules;
drop policy if exists "report schedules edit" on public.report_schedules;

-- Who each send went to, so the history shows it after the schedule's addresses change.
alter table public.report_sends add column if not exists recipients text[] not null default '{}';
create index if not exists report_sends_schedule_idx on public.report_sends (schedule_id, due_at desc);
