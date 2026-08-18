-- The 5-parameter approve_syllabus_processing (added in
-- 20260817220000_apply_confirmed_syllabus_metadata.sql) has an assignments
-- INSERT with 9 target columns but only 8 select expressions: the
-- 'not_started' status literal present in the 4-parameter version's INSERT
-- was dropped. Postgres validates column counts at parse time, so every
-- call that reaches this statement fails with
-- "INSERT has more target columns than expressions", regardless of the
-- reviewed items' content. The frontend (src/services/processing.ts
-- approveSyllabus) always passes p_course_metadata, so it always resolves
-- to this broken overload.
create or replace function public.approve_syllabus_processing(
  p_processing_id uuid,
  p_assignments jsonb,
  p_exams jsonb,
  p_course_id uuid,
  p_course_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare processing public.ai_processing_results; target_course_id uuid;
begin
  select * into processing from public.ai_processing_results where id=p_processing_id and user_id=(select auth.uid()) and kind='syllabus' and status='ready_for_review' for update;
  if not found then raise exception 'Syllabus review is unavailable or already approved'; end if;
  if jsonb_typeof(p_assignments)<>'array' or jsonb_typeof(p_exams)<>'array' or jsonb_typeof(p_course_metadata)<>'object' then raise exception 'Reviewed syllabus values are invalid'; end if;
  target_course_id:=coalesce(p_course_id,processing.course_id);
  if not exists(select 1 from public.courses where id=target_course_id and user_id=processing.user_id) then raise exception 'The selected course is unavailable'; end if;
  update public.courses set
    instructor=case when p_course_metadata ? 'instructor' then nullif(trim(p_course_metadata->>'instructor'),'') else instructor end,
    credits=case when p_course_metadata ? 'credits' then nullif(p_course_metadata->>'credits','')::numeric else credits end,
    meeting_days=case when p_course_metadata ? 'meeting_days' then array(select jsonb_array_elements_text(p_course_metadata->'meeting_days')) else meeting_days end,
    meeting_start=case when p_course_metadata ? 'meeting_start' then nullif(p_course_metadata->>'meeting_start','')::time else meeting_start end,
    meeting_end=case when p_course_metadata ? 'meeting_end' then nullif(p_course_metadata->>'meeting_end','')::time else meeting_end end,
    updated_at=now()
  where id=target_course_id and user_id=processing.user_id;
  update public.uploaded_files set course_id=target_course_id where id=processing.upload_id and user_id=processing.user_id;
  insert into public.assignments (user_id,course_id,title,description,due_at,estimated_minutes,status,source,syllabus_item_key)
  select processing.user_id,target_course_id,trim(item->>'title'),nullif(item->>'description',''),nullif(item->>'due_at','')::timestamptz,nullif(item->>'estimated_minutes','')::integer,'not_started','syllabus:'||processing.upload_id::text,processing.upload_id::text||':assignment:'||lower(regexp_replace(trim(item->>'title'),'\s+',' ','g'))||':'||coalesce(item->>'due_at','undated') from jsonb_array_elements(p_assignments)item where trim(coalesce(item->>'title',''))<>'' on conflict (user_id,syllabus_item_key) where syllabus_item_key is not null do nothing;
  insert into public.exams (user_id,course_id,title,exam_at,location,topics_summary,source,syllabus_item_key)
  select processing.user_id,target_course_id,trim(item->>'title'),nullif(item->>'exam_at','')::timestamptz,nullif(item->>'location',''),nullif(item->>'topics_summary',''),'syllabus:'||processing.upload_id::text,processing.upload_id::text||':exam:'||lower(regexp_replace(trim(item->>'title'),'\s+',' ','g'))||':'||coalesce(item->>'exam_at','undated') from jsonb_array_elements(p_exams)item where trim(coalesce(item->>'title',''))<>'' on conflict (user_id,syllabus_item_key) where syllabus_item_key is not null do nothing;
  update public.ai_processing_results set status='approved',approved_at=now(),course_id=target_course_id where id=processing.id;
  update public.uploaded_files set processing_status='processed',course_id=target_course_id where id=processing.upload_id and user_id=processing.user_id;
end; $$;
revoke all on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb) from public,anon;
grant execute on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb) to authenticated;
