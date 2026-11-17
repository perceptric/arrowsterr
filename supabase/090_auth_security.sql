-- Login security (src/app/api/auth/signin/route.ts). Only the server reads and writes these tables.
-- Wrong passwords lock an email for 15 minutes after 5 tries, and an address after 20.
create table if not exists public.auth_attempts (
  id bigserial primary key,
  email text not null,
  ip text not null default '',
  ok boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_email_idx on public.auth_attempts (email, created_at desc);
create index if not exists auth_attempts_ip_idx on public.auth_attempts (ip, created_at desc);
alter table public.auth_attempts enable row level security;

-- Devices each person signed in from, so a new one gets an email.
create table if not exists public.login_devices (
  user_id uuid not null references auth.users on delete cascade,
  device text not null,
  label text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device)
);
alter table public.login_devices enable row level security;
