create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  google_account_id text,
  google_account_email text,
  status text not null default 'connecting'
    check (status in ('connecting','connected','needs_reauthorization')),
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (id, user_id)
);

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;
grant select on public.google_calendar_connections to authenticated;
create policy google_calendar_connections_select_own
  on public.google_calendar_connections for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.google_calendar_credentials (
  connection_id uuid primary key,
  user_id uuid not null,
  access_token_ciphertext text not null,
  access_token_nonce text not null,
  refresh_token_ciphertext text not null,
  refresh_token_nonce text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (connection_id, user_id)
    references public.google_calendar_connections(id, user_id) on delete cascade
);
alter table public.google_calendar_credentials enable row level security;
revoke all on public.google_calendar_credentials from anon, authenticated;

create table public.google_calendar_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.google_calendar_oauth_states enable row level security;
revoke all on public.google_calendar_oauth_states from anon, authenticated;

create table public.google_calendars (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  user_id uuid not null,
  google_calendar_id text not null,
  display_name text not null,
  time_zone text,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, google_calendar_id),
  foreign key (connection_id, user_id)
    references public.google_calendar_connections(id, user_id) on delete cascade
);
alter table public.google_calendars enable row level security;
revoke all on public.google_calendars from anon, authenticated;
grant select on public.google_calendars to authenticated;
create policy google_calendars_select_own on public.google_calendars
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.calendar_busy_periods (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null,
  calendar_id uuid not null references public.google_calendars(id) on delete cascade,
  user_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  source text not null default 'google_calendar' check (source = 'google_calendar'),
  created_at timestamptz not null default now(),
  unique (connection_id, calendar_id, starts_at, ends_at),
  foreign key (connection_id, user_id)
    references public.google_calendar_connections(id, user_id) on delete cascade,
  check (ends_at > starts_at)
);
alter table public.calendar_busy_periods enable row level security;
revoke all on public.calendar_busy_periods from anon, authenticated;
grant select on public.calendar_busy_periods to authenticated;
create policy calendar_busy_periods_select_own on public.calendar_busy_periods
  for select to authenticated using ((select auth.uid()) = user_id);

create index google_calendar_connections_user_idx on public.google_calendar_connections(user_id);
create index google_calendar_oauth_states_expiry_idx on public.google_calendar_oauth_states(expires_at);
create index google_calendars_user_idx on public.google_calendars(user_id);
create index calendar_busy_periods_user_time_idx on public.calendar_busy_periods(user_id, starts_at, ends_at);
