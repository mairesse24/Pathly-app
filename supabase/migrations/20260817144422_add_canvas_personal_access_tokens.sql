alter table public.canvas_connections
  add column auth_type text not null default 'oauth',
  add constraint canvas_connections_auth_type_check
    check (auth_type in ('oauth', 'personal_access_token'));

comment on column public.canvas_connections.auth_type is
  'Canvas authentication method only; secret credentials remain encrypted in private server-managed storage.';
