-- Canvas history stays preserved, but only selected current Canvas courses are
-- available to the day-to-day Pathly experience.
alter table public.courses
  add column if not exists is_active boolean not null default true;

create index if not exists courses_user_active_idx
  on public.courses (user_id, is_active);
