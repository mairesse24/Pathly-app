create table public.notification_read_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, notification_key)
);

alter table public.notification_read_states enable row level security;
grant select, insert, update, delete on public.notification_read_states to authenticated;
revoke all on public.notification_read_states from anon;

create policy "notification_states_select_own" on public.notification_read_states for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_states_insert_own" on public.notification_read_states for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notification_states_update_own" on public.notification_read_states for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notification_states_delete_own" on public.notification_read_states for delete to authenticated using ((select auth.uid()) = user_id);

create index notification_read_states_user_idx on public.notification_read_states(user_id, read_at desc);
