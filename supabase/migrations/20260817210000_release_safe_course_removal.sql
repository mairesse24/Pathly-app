create or replace function public.get_course_removal_impact(p_course_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owned_course public.courses;
  assignment_count integer;
  exam_count integer;
  session_count integer;
  processing_count integer;
  upload_count integer;
  note_count integer := 0;
begin
  select * into owned_course from public.courses
  where id = p_course_id and user_id = (select auth.uid());
  if not found then raise exception 'Course not found'; end if;

  select count(*) into assignment_count from public.assignments where course_id=p_course_id and user_id=owned_course.user_id;
  select count(*) into exam_count from public.exams where course_id=p_course_id and user_id=owned_course.user_id;
  select count(*) into session_count from public.study_sessions where course_id=p_course_id and user_id=owned_course.user_id;
  select count(*) into processing_count from public.ai_processing_results where course_id=p_course_id and user_id=owned_course.user_id;
  select count(*) into upload_count from public.uploaded_files where course_id=p_course_id and user_id=owned_course.user_id;
  if to_regclass('public.organized_course_notes') is not null then
    execute 'select count(*) from public.organized_course_notes where course_id=$1 and user_id=$2'
      into note_count using p_course_id, owned_course.user_id;
  end if;

  return jsonb_build_object(
    'source', coalesce(owned_course.source,'manual'),
    'assignments', assignment_count,
    'exams', exam_count,
    'study_sessions', session_count,
    'processed_materials', processing_count,
    'uploads', upload_count,
    'saved_notes', note_count
  );
end;
$$;

revoke all on function public.get_course_removal_impact(uuid) from public, anon;
grant execute on function public.get_course_removal_impact(uuid) to authenticated;

drop function if exists public.delete_course_safely(uuid);
create function public.delete_course_safely(p_course_id uuid, p_mode text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owned_course public.courses;
  has_linked_content boolean;
  storage_paths jsonb := '[]'::jsonb;
begin
  if p_mode not in ('preserve','delete_empty','delete_with_content') then
    raise exception 'Unsupported course removal mode';
  end if;

  select * into owned_course from public.courses
  where id=p_course_id and user_id=(select auth.uid()) for update;
  if not found then raise exception 'Course not found'; end if;

  has_linked_content :=
    exists(select 1 from public.assignments where course_id=p_course_id and user_id=owned_course.user_id)
    or exists(select 1 from public.exams where course_id=p_course_id and user_id=owned_course.user_id)
    or exists(select 1 from public.study_sessions where course_id=p_course_id and user_id=owned_course.user_id)
    or exists(select 1 from public.ai_processing_results where course_id=p_course_id and user_id=owned_course.user_id)
    or exists(select 1 from public.uploaded_files where course_id=p_course_id and user_id=owned_course.user_id);
  if to_regclass('public.organized_course_notes') is not null then
    execute 'select $1 or exists(select 1 from public.organized_course_notes where course_id=$2 and user_id=$3)'
      into has_linked_content using has_linked_content, p_course_id, owned_course.user_id;
  end if;

  if p_mode='preserve' then
    update public.courses set is_active=false,updated_at=now()
    where id=p_course_id and user_id=owned_course.user_id;
    return jsonb_build_object('action','archived','storage_paths',storage_paths);
  end if;

  if owned_course.source='canvas' then
    raise exception 'Canvas courses can only be removed from active Study Hub';
  end if;

  if p_mode='delete_empty' and has_linked_content then
    raise exception 'This course now has linked content. Review it before deleting the course';
  end if;

  if p_mode='delete_with_content' then
    select coalesce(jsonb_agg(storage_path), '[]'::jsonb) into storage_paths
    from public.uploaded_files
    where course_id=p_course_id and user_id=owned_course.user_id
      and category in ('syllabus','lecture');

    -- Delete only course-owned Study Hub content. Degree-audit and transcript
    -- uploads are retained and detached even if a malformed client linked them.
    delete from public.study_sessions where course_id=p_course_id and user_id=owned_course.user_id;
    delete from public.assignments where course_id=p_course_id and user_id=owned_course.user_id;
    delete from public.exams where course_id=p_course_id and user_id=owned_course.user_id;
    if to_regclass('public.organized_course_notes') is not null then
      execute 'delete from public.organized_course_notes where course_id=$1 and user_id=$2'
        using p_course_id, owned_course.user_id;
    end if;
    -- Deleting a source-file row removes its processing result through the
    -- existing upload-owner FK. If an unexpected result remains, the existing
    -- course-delete guard fails closed instead of cascading it silently.
    delete from public.uploaded_files
    where course_id=p_course_id and user_id=owned_course.user_id
      and category in ('syllabus','lecture');
    update public.uploaded_files set course_id=null
    where course_id=p_course_id and user_id=owned_course.user_id;
  end if;

  delete from public.courses where id=p_course_id and user_id=owned_course.user_id;
  return jsonb_build_object('action','deleted','storage_paths',storage_paths);
end;
$$;

revoke all on function public.delete_course_safely(uuid,text) from public, anon;
grant execute on function public.delete_course_safely(uuid,text) to authenticated;
