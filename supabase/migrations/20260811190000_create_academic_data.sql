create table public.semesters (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null, start_date date, end_date date, is_current boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,user_id), check (end_date is null or start_date is null or end_date >= start_date)
);
create table public.courses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 semester_id uuid, course_code text not null, course_name text not null, credits numeric, instructor text,
 meeting_days text[], meeting_start time, meeting_end time, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,user_id), foreign key (semester_id,user_id) references public.semesters(id,user_id) on delete cascade,
 check (credits is null or credits >= 0), check (meeting_end is null or meeting_start is null or meeting_end > meeting_start)
);
create table public.assignments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 course_id uuid not null, title text not null, description text, due_at timestamptz, estimated_minutes integer,
 status text not null default 'not_started', source text not null default 'manual',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,user_id), foreign key (course_id,user_id) references public.courses(id,user_id) on delete cascade,
 check (estimated_minutes is null or estimated_minutes >= 0),
 check (status in ('not_started','in_progress','completed','overdue','awaiting_confirmation'))
);
create table public.exams (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 course_id uuid not null, title text not null, exam_at timestamptz, location text, topics_summary text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (id,user_id), foreign key (course_id,user_id) references public.courses(id,user_id) on delete cascade
);
create table public.study_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 course_id uuid, assignment_id uuid, title text not null, start_at timestamptz not null, end_at timestamptz not null,
 status text not null default 'scheduled', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (course_id,user_id) references public.courses(id,user_id) on delete cascade,
 foreign key (assignment_id,user_id) references public.assignments(id,user_id) on delete set null (assignment_id),
 check (end_at > start_at), check (status in ('scheduled','completed','skipped','rescheduled'))
);
create table public.daily_reflections (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 reflection_date date not null, mood text, energy text, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (user_id,reflection_date)
);
do $$
declare table_name text;
begin
 foreach table_name in array array['semesters','courses','assignments','exams','study_sessions','daily_reflections'] loop
  execute format('alter table public.%I enable row level security',table_name);
  execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
  execute format('revoke all on public.%I from anon',table_name);
  execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',table_name||'_select_own',table_name);
  execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',table_name||'_insert_own',table_name);
  execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',table_name||'_update_own',table_name);
  execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',table_name||'_delete_own',table_name);
 end loop;
end $$;
