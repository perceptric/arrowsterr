-- Alerts in Microsoft Teams and Discord, next to Slack (Settings → Integrations). Workspace-wide.
alter table public.integrations add column if not exists teams_webhook text;
alter table public.integrations add column if not exists discord_webhook text;
