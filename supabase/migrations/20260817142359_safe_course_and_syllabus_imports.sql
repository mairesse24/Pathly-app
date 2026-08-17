alter table public.assignments add column syllabus_item_key text;
alter table public.exams add column source text not null default 'manual';
alter table public.exams add column syllabus_item_key text;

create unique index assignments_syllabus_item_key_unique
  on public.assignments(user_id, syllabus_item_key)
  where syllabus_item_key is not null;
create unique index exams_syllabus_item_key_unique
  on public.exams(user_id, syllabus_item_key)
  where syllabus_item_key is not null;

create or replace function private.protect_ai_processing_result()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.user_id <> new.user_id or old.upload_id <> new.upload_id
    or old.kind <> new.kind or old.model <> new.model or old.result <> new.result
    or old.created_at <> new.created_at then
    raise exception 'AI processing result content cannot be changed';
  end if;
  if old.status <> 'ready_for_review' or new.status <> 'approved' then
    raise exception 'Only ready results can be approved';
  end if;
  if old.course_id is distinct from new.course_id and not exists (
    select 1 from public.uploaded_files upload
    where upload.id = new.upload_id and upload.user_id = new.user_id
      and upload.course_id = new.course_id
  ) then raise exception 'Confirmed course must match the source upload'; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop function if exists public.approve_syllabus_processing(uuid,jsonb,jsonb);
create function public.approve_syllabus_processing(
  p_processing_id uuid,
  p_assignments jsonb,
  p_exams jsonb,
  p_course_id uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  processing public.ai_processing_results;
  target_course_id uuid;
begin
  select * into processing from public.ai_processing_results
  where id = p_processing_id and user_id = (select auth.uid())
    and kind = 'syllabus' and status = 'ready_for_review'
  for update;
  if not found then raise exception 'Syllabus review is unavailable or already approved'; end if;
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_typeof(p_exams) <> 'array' then
    raise exception 'Reviewed syllabus items must be arrays';
  end if;
  target_course_id := coalesce(p_course_id, processing.course_id);
  if not exists (select 1 from public.courses where id=target_course_id and user_id=processing.user_id) then
    raise exception 'The selected course is unavailable';
  end if;

  update public.uploaded_files set course_id=target_course_id
  where id=processing.upload_id and user_id=processing.user_id;

  insert into public.assignments (user_id,course_id,title,description,due_at,estimated_minutes,status,source,syllabus_item_key)
  select processing.user_id,target_course_id,trim(item->>'title'),nullif(item->>'description',''),
    nullif(item->>'due_at','')::timestamptz,nullif(item->>'estimated_minutes','')::integer,
    'not_started','syllabus:'||processing.upload_id::text,
    processing.upload_id::text||':assignment:'||lower(regexp_replace(trim(item->>'title'),'\s+',' ','g'))||':'||coalesce(item->>'due_at','undated')
  from jsonb_array_elements(p_assignments) item where trim(coalesce(item->>'title',''))<>''
  on conflict (user_id,syllabus_item_key) where syllabus_item_key is not null do nothing;

  insert into public.exams (user_id,course_id,title,exam_at,location,topics_summary,source,syllabus_item_key)
  select processing.user_id,target_course_id,trim(item->>'title'),nullif(item->>'exam_at','')::timestamptz,
    nullif(item->>'location',''),nullif(item->>'topics_summary',''),'syllabus:'||processing.upload_id::text,
    processing.upload_id::text||':exam:'||lower(regexp_replace(trim(item->>'title'),'\s+',' ','g'))||':'||coalesce(item->>'exam_at','undated')
  from jsonb_array_elements(p_exams) item where trim(coalesce(item->>'title',''))<>''
  on conflict (user_id,syllabus_item_key) where syllabus_item_key is not null do nothing;

  update public.ai_processing_results set status='approved',approved_at=now(),course_id=target_course_id
  where id=processing.id;
  update public.uploaded_files set processing_status='processed',course_id=target_course_id
  where id=processing.upload_id and user_id=processing.user_id;
end;
$$;
revoke all on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid) to authenticated;

create or replace function public.delete_course_safely(p_course_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare owned_course public.courses;
begin
  select * into owned_course from public.courses where id=p_course_id and user_id=(select auth.uid()) for update;
  if not found then raise exception 'Course not found'; end if;
  if exists(select 1 from public.assignments where course_id=p_course_id and user_id=owned_course.user_id)
    or exists(select 1 from public.exams where course_id=p_course_id and user_id=owned_course.user_id)
    or exists(select 1 from public.study_sessions where course_id=p_course_id and user_id=owned_course.user_id)
    or exists(select 1 from public.ai_processing_results where course_id=p_course_id and user_id=owned_course.user_id) then
    raise exception 'Move or remove linked assignments, exams, study sessions, and processed materials before deleting this course';
  end if;
  delete from public.courses where id=p_course_id and user_id=owned_course.user_id;
end;
$$;
revoke all on function public.delete_course_safely(uuid) from public,anon;
grant execute on function public.delete_course_safely(uuid) to authenticated;
create or replace function private.guard_course_delete()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is not null and old.user_id=(select auth.uid()) and (
    exists(select 1 from public.assignments where course_id=old.id and user_id=old.user_id)
    or exists(select 1 from public.exams where course_id=old.id and user_id=old.user_id)
    or exists(select 1 from public.study_sessions where course_id=old.id and user_id=old.user_id)
    or exists(select 1 from public.ai_processing_results where course_id=old.id and user_id=old.user_id)
  ) then raise exception 'Move or remove linked assignments, exams, study sessions, and processed materials before deleting this course'; end if;
  return old;
end;
$$;
revoke all on function private.guard_course_delete() from public;
create trigger courses_safe_delete before delete on public.courses for each row execute function private.guard_course_delete();
grant delete on public.courses to authenticated;
