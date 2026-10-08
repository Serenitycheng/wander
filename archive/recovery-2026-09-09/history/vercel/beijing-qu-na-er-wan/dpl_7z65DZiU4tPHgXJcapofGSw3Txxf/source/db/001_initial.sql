create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique check (username in ('serenity', 'zzz')),
  password_hash text not null,
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references users(id) on delete cascade,
  display_name text not null,
  revision bigint not null default 1,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_readers (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (workspace_id, user_id)
);

create table if not exists workspace_snapshots (
  owner_username text primary key check (owner_username in ('serenity', 'zzz')),
  payload jsonb not null,
  revision bigint not null default 1,
  updated_by text not null check (updated_by in ('serenity', 'zzz')),
  updated_at timestamptz not null default now()
);

create table if not exists activities (
  id text primary key,
  category text not null,
  name text not null,
  duration_min_minutes integer not null,
  duration_max_minutes integer not null,
  budget_min_yuan integer not null,
  budget_max_yuan integer not null,
  energy text not null,
  indoor boolean not null,
  tags jsonb not null default '[]'::jsonb,
  verification_state text not null,
  source_url text,
  source_checked_at timestamptz,
  revision bigint not null default 1,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  activity_id text references activities(id) on delete set null,
  name text not null,
  exact_address text,
  amap_location point,
  official_url text,
  business_status text not null default 'needs_confirmation',
  source_checked_at timestamptz,
  revision bigint not null default 1,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists current_events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id) on delete set null,
  title text not null,
  event_type text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  official_url text,
  source_checked_at timestamptz,
  verification_state text not null default 'needs_confirmation',
  revision bigint not null default 1,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  organizer_id uuid not null references users(id),
  title text not null,
  trip_date date,
  status text not null default 'draft',
  mode text not null default 'plan',
  settings jsonb not null default '{}'::jsonb,
  selected_activity_id text references activities(id),
  revision bigint not null default 1,
  updated_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_participants (
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references users(id),
  exact_origin_address text,
  origin_amap_location point,
  response_completed boolean not null default false,
  response jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists trip_recommendations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  activity_id text not null references activities(id),
  score integer not null,
  explanation jsonb not null,
  route_snapshot jsonb,
  weather_snapshot jsonb,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_id uuid references users(id),
  workspace_id uuid references workspaces(id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_revision bigint,
  after_revision bigint,
  created_at timestamptz not null default now()
);

create table if not exists release_versions (
  version text primary key,
  title text not null,
  notes text not null,
  git_commit text,
  deployed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trips_workspace_updated_idx on trips(workspace_id, updated_at desc);
create index if not exists events_time_idx on current_events(starts_at, ends_at);
create index if not exists audit_workspace_time_idx on audit_logs(workspace_id, created_at desc);

-- Every update API must use: update ... set revision = revision + 1 where id = $1 and revision = $expected.
-- A zero-row update is a conflict; the UI must ask whether to keep local, load cloud, or save a copy.
