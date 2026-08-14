create table public.canvas_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_base_url text not null,
  canvas_user_id text,
  status text not null default 'not_connected',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (id, user_id),
  check (canvas_base_url ~ '^https://[^/]+$'),
  check (status in ('not_connected','connecting','connected','needs_reauthorization','connection_unavailable'))
);

alter table public.canvas_connections enable row level security;
revoke all on public.canvas_connections from authenticated;
grant select on public.canvas_connections to authenticated;
revoke all on public.canvas_connections from anon;
create policy canvas_connections_select_own on public.canvas_connections
  for select to authenticated using ((select auth.uid()) = user_id);
create index canvas_connections_user_id_idx on public.canvas_connections (user_id);

create table public.canvas_credentials (
  connection_id uuid primary key,
  user_id uuid not null,
  access_token_ciphertext text not null,
  access_token_nonce text not null,
  refresh_token_ciphertext text,
  refresh_token_nonce text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  foreign key (connection_id, user_id)
    references public.canvas_connections(id, user_id) on delete cascade
);

alter table public.canvas_credentials enable row level security;
revoke all on public.canvas_credentials from anon, authenticated;
create index canvas_credentials_user_id_idx on public.canvas_credentials (user_id);

create table public.canvas_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_base_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (canvas_base_url ~ '^https://[^/]+$')
);

alter table public.canvas_oauth_states enable row level security;
revoke all on public.canvas_oauth_states from anon, authenticated;
create index canvas_oauth_states_user_id_idx on public.canvas_oauth_states (user_id);
create index canvas_oauth_states_expires_at_idx on public.canvas_oauth_states (expires_at);

alter table public.courses
  add column source text not null default 'manual',
  add column canvas_connection_id uuid references public.canvas_connections(id) on delete set null,
  add column canvas_course_id text,
  add column canvas_name text,
  add column canvas_course_code text,
  add column canvas_updated_at timestamptz,
  add constraint courses_source_check check (source in ('manual','canvas'));

create unique index courses_canvas_external_id_uidx
  on public.courses (user_id, canvas_connection_id, canvas_course_id)
  where canvas_connection_id is not null and canvas_course_id is not null;
create index courses_canvas_connection_id_idx on public.courses (canvas_connection_id);

alter table public.assignments
  add column canvas_connection_id uuid references public.canvas_connections(id) on delete set null,
  add column canvas_assignment_id text,
  add column canvas_course_id text,
  add column canvas_title text,
  add column canvas_due_at timestamptz,
  add column canvas_available_from timestamptz,
  add column canvas_available_until timestamptz,
  add column canvas_submission_status text,
  add column canvas_last_applied_status text,
  add column canvas_submission_types text[],
  add column canvas_updated_at timestamptz,
  add constraint assignments_canvas_submission_status_check
    check (canvas_submission_status is null or canvas_submission_status in ('submitted','unsubmitted','late','missing','unknown')),
  add constraint assignments_canvas_last_applied_status_check
    check (canvas_last_applied_status is null or canvas_last_applied_status in ('not_started','in_progress','completed','overdue','awaiting_confirmation'));

create unique index assignments_canvas_external_id_uidx
  on public.assignments (user_id, canvas_connection_id, canvas_assignment_id)
  where canvas_connection_id is not null and canvas_assignment_id is not null;
create index assignments_canvas_connection_id_idx on public.assignments (canvas_connection_id);
