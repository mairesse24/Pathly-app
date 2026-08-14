create table public.degree_programs (
  id uuid primary key default gen_random_uuid(),
  university text not null,
  degree text not null,
  major text not null,
  catalog_year integer not null,
  total_credits_required numeric(5,1) not null check (total_credits_required > 0),
  source_url text not null,
  source_title text not null,
  verified_at timestamptz not null,
  unique (university, degree, major, catalog_year)
);

create table public.requirement_groups (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.degree_programs(id) on delete cascade,
  name text not null,
  description text,
  requirement_type text not null check (requirement_type in ('all_courses','minimum_credits','total_degree')),
  minimum_credits numeric(5,1) not null default 0 check (minimum_credits >= 0),
  sort_order integer not null default 0,
  unique (program_id, name)
);

create table public.requirement_course_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.requirement_groups(id) on delete cascade,
  course_code text not null,
  course_title text,
  credit_hours numeric(4,1) not null check (credit_hours > 0),
  unique (group_id, course_code)
);

create table public.completed_courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_code text not null check (char_length(trim(course_code)) between 2 and 30),
  course_title text not null check (char_length(trim(course_title)) between 1 and 200),
  credit_hours numeric(4,1) not null check (credit_hours > 0 and credit_hours <= 12),
  term text check (term is null or term in ('Spring','Summer','Fall','Winter')),
  year integer check (year is null or year between 1900 and 2200),
  source text not null default 'manual' check (source in ('manual','degree_audit','transcript')),
  status text not null default 'completed' check (status in ('completed','in_progress')),
  source_upload_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_upload_id, user_id) references public.uploaded_files(id, user_id) on delete set null (source_upload_id),
  unique (user_id, course_code)
);

alter table public.degree_programs enable row level security;
alter table public.requirement_groups enable row level security;
alter table public.requirement_course_options enable row level security;
alter table public.completed_courses enable row level security;

revoke all on public.degree_programs, public.requirement_groups, public.requirement_course_options, public.completed_courses from anon, authenticated;
grant select on public.degree_programs, public.requirement_groups, public.requirement_course_options to authenticated;
grant select, insert, update, delete on public.completed_courses to authenticated;

create policy degree_programs_authenticated_read on public.degree_programs for select to authenticated using (true);
create policy requirement_groups_authenticated_read on public.requirement_groups for select to authenticated using (true);
create policy requirement_options_authenticated_read on public.requirement_course_options for select to authenticated using (true);
create policy completed_courses_select_own on public.completed_courses for select to authenticated using ((select auth.uid()) = user_id);
create policy completed_courses_insert_own on public.completed_courses for insert to authenticated with check ((select auth.uid()) = user_id);
create policy completed_courses_update_own on public.completed_courses for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy completed_courses_delete_own on public.completed_courses for delete to authenticated using ((select auth.uid()) = user_id);

create index requirement_groups_program_id_idx on public.requirement_groups(program_id);
create index requirement_course_options_group_id_idx on public.requirement_course_options(group_id);
create index completed_courses_user_id_idx on public.completed_courses(user_id);
create index completed_courses_source_upload_id_idx on public.completed_courses(source_upload_id);

alter table public.ai_processing_results drop constraint ai_processing_results_kind_check;
alter table public.ai_processing_results add constraint ai_processing_results_kind_check
  check (kind in ('syllabus','lecture','degree_audit','unofficial_transcript'));
alter table public.ai_processing_results alter column course_id drop not null;

create or replace function public.confirm_academic_record_processing(p_processing_id uuid, p_courses jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare processing public.ai_processing_results;
begin
  select * into processing from public.ai_processing_results
  where id = p_processing_id and user_id = (select auth.uid())
    and kind in ('degree_audit','unofficial_transcript') and status = 'ready_for_review'
  for update;
  if not found then raise exception 'Academic record review is unavailable or already confirmed'; end if;
  if jsonb_typeof(p_courses) <> 'array' then raise exception 'Reviewed courses must be an array'; end if;

  insert into public.completed_courses
    (user_id, course_code, course_title, credit_hours, term, year, source, status, source_upload_id)
  select processing.user_id, upper(trim(item->>'course_code')), trim(item->>'course_title'),
    (item->>'credit_hours')::numeric, nullif(item->>'term',''), nullif(item->>'year','')::integer,
    case when processing.kind = 'degree_audit' then 'degree_audit' else 'transcript' end,
    case when item->>'status' = 'in_progress' then 'in_progress' else 'completed' end,
    processing.upload_id
  from jsonb_array_elements(p_courses) item
  where trim(coalesce(item->>'course_code','')) <> '' and trim(coalesce(item->>'course_title','')) <> ''
  on conflict (user_id, course_code) do update set
    course_title = excluded.course_title, credit_hours = excluded.credit_hours,
    term = excluded.term, year = excluded.year, source = excluded.source,
    status = excluded.status, source_upload_id = excluded.source_upload_id, updated_at = now();

  update public.ai_processing_results set status='approved', approved_at=now() where id=processing.id;
  update public.uploaded_files set processing_status='processed' where id=processing.upload_id and user_id=processing.user_id;
end $$;
revoke all on function public.confirm_academic_record_processing(uuid,jsonb) from public, anon;
grant execute on function public.confirm_academic_record_processing(uuid,jsonb) to authenticated;

with program as (
  insert into public.degree_programs (university,degree,major,catalog_year,total_credits_required,source_url,source_title,verified_at)
  values ('University of North Texas','BS','Computer Science',2024,120,'https://catalog.unt.edu/mime/media/view/35/3973/2024-25_UNT_undergraduate_catalog-updated.pdf','University of North Texas 2024-2025 Undergraduate Catalog',now()) returning id
), groups as (
  insert into public.requirement_groups(program_id,name,description,requirement_type,minimum_credits,sort_order)
  select id,'Computer Science Core','All explicitly required CS courses in the verified catalog.','all_courses',40,1 from program
  union all select id,'CS Core Selections','Choose 6 hours from the verified CS core list.','minimum_credits',6,2 from program
  union all select id,'CS Breadth','Choose 6 hours from the verified breadth list.','minimum_credits',6,3 from program
  union all select id,'Remaining Degree Requirements','University core, college requirements, supporting coursework, and electives toward 120 total hours.','total_degree',120,4 from program
  returning id,name
)
insert into public.requirement_course_options(group_id,course_code,course_title,credit_hours)
select g.id, v.code, v.title, v.credits from groups g join (values
 ('Computer Science Core','CSCE 1010','Discovering Computer Science',3.0),('Computer Science Core','CSCE 1015','Computing Tools and Techniques Laboratory',1.0),
 ('Computer Science Core','CSCE 1030','Computer Science I',3.0),('Computer Science Core','CSCE 1040','Computer Science II',3.0),
 ('Computer Science Core','CSCE 2100','Foundations of Computing',3.0),('Computer Science Core','CSCE 2110','Foundations of Data Structures',3.0),
 ('Computer Science Core','CSCE 2610','Assembly Language and Computer Organization',3.0),('Computer Science Core','CSCE 3444','Software Engineering',3.0),
 ('Computer Science Core','CSCE 3550','Foundations of Cybersecurity',3.0),('Computer Science Core','CSCE 3600','Principles of Systems Programming',3.0),
 ('Computer Science Core','CSCE 4010','Social Issues in Computing',3.0),('Computer Science Core','CSCE 4110','Algorithms',3.0),
 ('Computer Science Core','CSCE 4901','Software Development Capstone I',3.0),('Computer Science Core','CSCE 4902','Software Development Capstone II',3.0),
 ('CS Core Selections','CSCE 3530','Introduction to Computer Networks',3.0),('CS Core Selections','CSCE 4115','Formal Languages, Automata and Computability',3.0),
 ('CS Core Selections','CSCE 4430','Programming Languages',3.0),('CS Core Selections','CSCE 4600','Introduction to Operating Systems',3.0),
 ('CS Core Selections','CSCE 4650','Introduction to Compilation Techniques',3.0),
 ('CS Breadth','CSCE 4201','Introduction to Artificial Intelligence',3.0),('CS Breadth','CSCE 4210','Game Programming I',3.0),
 ('CS Breadth','CSCE 4230','Introduction to Computer Graphics',3.0),('CS Breadth','CSCE 4240','Introduction to Digital Image Processing',3.0),
 ('CS Breadth','CSCE 4290','Introduction to Natural Language Processing',3.0),('CS Breadth','CSCE 4350','Fundamentals of Database Systems',3.0),
 ('CS Breadth','CSCE 4460','Software Testing and Empirical Methodologies',3.0)
) as v(group_name,code,title,credits) on g.name=v.group_name;
