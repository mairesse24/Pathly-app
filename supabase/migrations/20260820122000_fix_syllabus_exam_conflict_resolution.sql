create or replace function public.resolve_syllabus_exam_conflict(
  p_conflict_id uuid,
  p_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  conflict public.syllabus_exam_conflicts;
  resolved_status text;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if p_resolution not in ('keep_existing', 'replace') then
    raise exception 'Invalid syllabus exam resolution';
  end if;

  select *
  into conflict
  from public.syllabus_exam_conflicts
  where id = p_conflict_id
    and user_id = caller_id
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Syllabus exam conflict is unavailable or already resolved';
  end if;

  if p_resolution = 'replace' then
    update public.exams
    set title = conflict.proposed_title,
        exam_at = conflict.proposed_exam_at,
        location = conflict.proposed_location,
        topics_summary = conflict.proposed_topics_summary,
        source = 'syllabus:' || conflict.proposed_upload_id::text,
        syllabus_item_key = conflict.proposed_syllabus_item_key,
        updated_at = now()
    where id = conflict.existing_exam_id
      and user_id = caller_id
      and course_id = conflict.course_id
      and source like 'syllabus:%';

    if not found then
      raise exception 'The active syllabus exam is unavailable';
    end if;
  end if;

  resolved_status := case
    when p_resolution = 'replace' then 'replaced'
    else 'kept_existing'
  end;

  update public.syllabus_exam_conflicts
  set status = resolved_status,
      resolved_at = now()
  where id = conflict.id
    and user_id = caller_id
    and status = 'pending';

  if not found then
    raise exception 'Syllabus exam conflict is unavailable or already resolved';
  end if;
end;
$$;

revoke all on function public.resolve_syllabus_exam_conflict(uuid, text) from public;
revoke all on function public.resolve_syllabus_exam_conflict(uuid, text) from anon;
grant execute on function public.resolve_syllabus_exam_conflict(uuid, text) to authenticated;
