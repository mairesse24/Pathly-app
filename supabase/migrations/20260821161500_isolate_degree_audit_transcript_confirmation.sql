-- confirm_academic_record_processing (the confirmation RPC behind the
-- Unofficial Transcript review screen) accepted `kind in ('degree_audit',
-- 'unofficial_transcript')`, not just 'unofficial_transcript'. The current
-- frontend never triggers this on a degree_audit record -- ProcessingReview
-- dispatches strictly on record.kind, routing 'degree_audit' to
-- DegreeAuditReview/confirm_degree_audit_processing and only
-- 'unofficial_transcript' to AcademicRecordReview/this function -- but the
-- function itself is security invoker and granted to authenticated, so any
-- signed-in user could call it directly (devtools, a future regression, a
-- stray call) with one of their own degree_audit processing IDs. Because
-- this function only ever inserts completed_courses and never creates
-- user_degree_plans/user_degree_requirement_groups, doing so would mark the
-- degree audit "approved" while silently discarding its requirement/plan
-- data -- and confirm_degree_audit_processing refuses anything not still
-- 'ready_for_review', so the audit could never be run through the correct
-- path again. Tightening the filter here makes the two document types
-- isolated at the database boundary itself, not only by frontend routing.
create or replace function public.confirm_academic_record_processing(p_processing_id uuid, p_courses jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare processing public.ai_processing_results;
begin
  select * into processing from public.ai_processing_results
  where id = p_processing_id and user_id = (select auth.uid())
    and kind = 'unofficial_transcript' and status = 'ready_for_review'
  for update;
  if not found then raise exception 'Academic record review is unavailable or already confirmed'; end if;
  if jsonb_typeof(p_courses) <> 'array' then raise exception 'Reviewed courses must be an array'; end if;

  insert into public.completed_courses
    (user_id, course_code, course_title, credit_hours, term, year, source, status, source_upload_id)
  select processing.user_id, upper(trim(item->>'course_code')), trim(item->>'course_title'),
    (item->>'credit_hours')::numeric, nullif(item->>'term',''), nullif(item->>'year','')::integer,
    'transcript',
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
