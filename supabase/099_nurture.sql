-- Getting-started emails (src/lib/nurture.ts): people can turn them off like the other notification emails.
-- Run this once in Supabase → SQL Editor, after 098_partner.sql.
-- They log to email_log as nurture:<step>, so nothing else is needed.

alter table public.notification_prefs add column if not exists tips boolean not null default true; -- getting-started emails
