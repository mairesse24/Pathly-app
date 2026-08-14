alter table public.uploaded_files drop constraint uploaded_files_processing_status_check;
alter table public.uploaded_files add constraint uploaded_files_processing_status_check
  check (processing_status in (
    'pending_upload', 'uploaded', 'upload_failed', 'processing',
    'ready_for_review', 'processed', 'processing_failed'
  ));
alter table public.uploaded_files add constraint uploaded_files_id_user_id_key unique (id, user_id);

create table public.ai_processing_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  upload_id uuid not null references public.uploaded_files(id) on delete cascade,
  course_id uuid not null,
  kind text not null check (kind in ('syllabus', 'lecture')),
  status text not null default 'ready_for_review'
    check (status in ('ready_for_review', 'approved')),
  model text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (upload_id),
  constraint ai_processing_results_upload_owner_fkey foreign key (upload_id, user_id)
    references public.uploaded_files(id, user_id) on delete cascade,
  constraint ai_processing_results_course_owner_fkey foreign key (course_id, user_id)
    references public.courses(id, user_id) on delete cascade
);

create index ai_processing_results_user_created_idx
  on public.ai_processing_results(user_id, created_at desc);

alter table public.ai_processing_results enable row level security;
grant select, update on public.ai_processing_results to authenticated;
revoke all on public.ai_processing_results from anon;

create policy "Users can view their AI processing results"
  on public.ai_processing_results for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can approve their AI processing results"
  on public.ai_processing_results for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and status = 'approved'
    and approved_at is not null
  );

create or replace function private.protect_ai_processing_result()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.user_id <> new.user_id or old.upload_id <> new.upload_id
    or old.course_id <> new.course_id or old.kind <> new.kind
    or old.model <> new.model or old.result <> new.result
    or old.created_at <> new.created_at then
    raise exception 'AI processing result content cannot be changed';
  end if;
  if old.status <> 'ready_for_review' or new.status <> 'approved' then
    raise exception 'Only ready results can be approved';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.protect_ai_processing_result() from public;
create trigger ai_processing_results_protect
before update on public.ai_processing_results
for each row execute function private.protect_ai_processing_result();

create or replace function public.approve_syllabus_processing(
  p_processing_id uuid,
  p_assignments jsonb,
  p_exams jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  processing public.ai_processing_results;
begin
  select * into processing from public.ai_processing_results
  where id = p_processing_id and user_id = (select auth.uid())
    and kind = 'syllabus' and status = 'ready_for_review'
  for update;
  if not found then raise exception 'Syllabus review is unavailable or already approved'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_typeof(p_exams) <> 'array' then
    raise exception 'Reviewed syllabus items must be arrays';
  end if;

  insert into public.assignments (user_id, course_id, title, description, due_at, estimated_minutes, status, source)
  select processing.user_id, processing.course_id, trim(item->>'title'), nullif(item->>'description', ''),
    nullif(item->>'due_at', '')::timestamptz, nullif(item->>'estimated_minutes', '')::integer,
    'not_started', 'claude_syllabus:' || processing.upload_id::text
  from jsonb_array_elements(p_assignments) item
  where trim(coalesce(item->>'title', '')) <> '';

  insert into public.exams (user_id, course_id, title, exam_at, location, topics_summary)
  select processing.user_id, processing.course_id, trim(item->>'title'), nullif(item->>'exam_at', '')::timestamptz,
    nullif(item->>'location', ''), nullif(item->>'topics_summary', '')
  from jsonb_array_elements(p_exams) item
  where trim(coalesce(item->>'title', '')) <> '';

  update public.ai_processing_results set status = 'approved', approved_at = now()
  where id = processing.id;
  update public.uploaded_files set processing_status = 'processed'
  where id = processing.upload_id and user_id = processing.user_id;
end;
$$;

revoke all on function public.approve_syllabus_processing(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.approve_syllabus_processing(uuid, jsonb, jsonb) to authenticated;
