-- RiseLocale: accounts, businesses and the Local Rank Tracker.
-- The app reads and writes everything from the server, scoped by workspace_id in every query.

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- id is the sha256 of the cookie value, so a leaked table can't be used to sign in.
create table sessions (
  id text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user on sessions(user_id);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  credits integer not null default 0 check (credits >= 0),
  monthly_credits integer not null default 10000,
  credits_reset_at timestamptz not null default now() + interval '1 month',
  -- White label: shown on shared reports instead of RiseLocale.
  report_name text not null default '',
  report_logo_url text not null default '',
  report_color text not null default '',
  report_footer text not null default '',
  alert_emails boolean not null default true,
  created_at timestamptz not null default now()
);

create table members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'editor', 'viewer')),
  primary key (workspace_id, user_id)
);
create index members_user on members(user_id);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  address text not null default '',
  phone text not null default '',
  domain text not null default '',
  category text not null default '',
  place_id text not null default '',
  cid text not null default '',
  lat double precision not null,
  lng double precision not null,
  rating real,
  reviews integer,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index businesses_ws on businesses(workspace_id);

-- A recurring scan. The worker turns each due schedule into a scan.
create table schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  keyword text not null,
  config jsonb not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  next_run_at timestamptz not null,
  active boolean not null default true,
  report_to text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index schedules_due on schedules(next_run_at) where active;

-- One run over a set of pins. workspace_id is null for a free scan from the website.
create table scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  schedule_id uuid references schedules(id) on delete set null,
  -- The last finished scan with the same business, keyword and pins. Pins are compared with it.
  prev_scan_id uuid references scans(id) on delete set null,
  keyword text not null,
  -- The business as it was matched: name, domain, cid, place_id, lat, lng.
  target jsonb not null,
  -- shape: grid or area; size; spacing_m; center; area (polygon [[lat,lng]...]).
  config jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'partial', 'failed')),
  priority smallint not null default 1,
  pins_total integer not null,
  credits_charged integer not null default 0,
  summary jsonb,
  share_token text unique,
  free_email text,
  free_ip text,
  demo boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index scans_ws on scans(workspace_id, created_at desc);
create index scans_schedule on scans(schedule_id, created_at desc);
create index scans_free_ip on scans(free_ip, created_at) where workspace_id is null;
create index scans_open on scans(status) where status in ('queued', 'running');

-- One scan point. Maps and organic (which holds the Local Pack) are two searches per pin.
create table pins (
  id bigserial primary key,
  scan_id uuid not null references scans(id) on delete cascade,
  idx integer not null,
  row_i integer not null,
  col_i integer not null,
  lat double precision not null,
  lng double precision not null,
  maps_task text,
  maps_state text not null default 'new' check (maps_state in ('new', 'posted', 'done', 'failed')),
  maps_posted_at timestamptz,
  maps_attempts smallint not null default 0,
  maps_rank smallint,
  maps_first_rank smallint,
  maps_rechecked boolean not null default false,
  maps_top jsonb,
  organic_task text,
  organic_state text not null default 'new' check (organic_state in ('new', 'posted', 'done', 'failed')),
  organic_posted_at timestamptz,
  organic_attempts smallint not null default 0,
  pack_rank smallint,
  organic_rank smallint,
  pack_top jsonb,
  organic_top jsonb,
  polled_at timestamptz,
  error text,
  unique (scan_id, idx)
);
create index pins_open on pins(scan_id) where maps_state in ('new', 'posted') or organic_state in ('new', 'posted');

create table alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  business_id uuid references businesses(id) on delete cascade,
  scan_id uuid references scans(id) on delete cascade,
  kind text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_ws on alerts(workspace_id, created_at desc);

-- Counts for public limits (free scans, business lookups), by hashed IP.
create table rate_events (
  key text not null,
  at timestamptz not null default now()
);
create index rate_events_key on rate_events(key, at);
