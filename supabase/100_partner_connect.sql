-- Partner connect links (docs/API.md, "Partner API" → "Connect an app"). A partner's customer connects their own
-- Cloudflare (for AI crawler data) from the partner's app: the partner asks for a link, the customer signs in with
-- the provider, and our callback sends them straight back to the partner. No Arrowsterr page is shown.
-- Run this once in Supabase → SQL Editor, after 099_nurture.sql. Safe to run again.

-- One row per link. Only the state's hash is saved, a link works once, and it dies after 30 minutes.
create table if not exists public.partner_connect_states (
  state_hash text primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  key_id uuid references public.api_keys (id) on delete set null, -- the partner key that asked for the link
  integration text not null,
  return_url text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists partner_connect_states_expires on public.partner_connect_states (expires_at);
alter table public.partner_connect_states enable row level security; -- no policies: only the server reads or writes it
