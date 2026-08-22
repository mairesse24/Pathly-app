-- Defense-in-depth for "Course-roadmap topics, lecture topics, holidays, and other
-- non-deliverables must not clutter the main commitment Calendar." The review UI already
-- disables the checkbox for an undated assignment/exam (see NewSyllabusReview in
-- ProcessingReview.tsx), so a normal approval can never submit one -- but this RPC is the
-- authoritative last line of defense, and until now it didn't actually require a due_at/exam_at
-- before inserting: a client bypassing the disabled checkbox (or a future UI regression that
-- forgets to disable it) could still write an undated row into assignments/exams. Calendar,
-- Coming Up, and Today's focus already filter out anything without a date (see
-- src/utils/calendarEvents.ts, comingUp.ts, smartPlanning.ts), so this never actually clutters
-- the Calendar today -- but an undated row would still sit in the table as an orphan. Require
-- the date at the point of insertion instead of relying only on downstream filters.
create or replace function public.approve_syllabus_processing(
  p_processing_id uuid,p_assignments jsonb,p_exams jsonb,p_course_id uuid,
  p_course_metadata jsonb default '{}'::jsonb,p_roadmap jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  processing public.ai_processing_results; target_course_id uuid; exam_item jsonb;
  existing_exam public.exams; normalized_title text; proposed_exam_at timestamptz;
  conflicts_created integer := 0; inserted_exams integer := 0;
begin
  select * into processing
  from public.ai_processing_results
  where id = p_processing_id
    and user_id = (select auth.uid())
    and kind = 'syllabus'
    and status = 'ready_for_review'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'syllabus_review_unavailable: This syllabus review is unavailable or already approved';
  end if;

  if jsonb_typeof(p_assignments) <> 'array'
    or jsonb_typeof(p_exams) <> 'array'
    or jsonb_typeof(p_course_metadata) <> 'object'
    or jsonb_typeof(p_roadmap) <> 'array' then
    raise exception using errcode = '22023', message = 'syllabus_invalid_payload: Assignments, exams, metadata, or roadmap values have the wrong shape';
  end if;

  target_course_id := coalesce(p_course_id, processing.course_id);
  perform 1 from public.courses
  where id = target_course_id and user_id = processing.user_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'syllabus_course_unavailable: The selected course is unavailable';
  end if;

  update public.courses set
    instructor = case when p_course_metadata ? 'instructor' then nullif(btrim(p_course_metadata->>'instructor'), '') else instructor end,
    credits = case when p_course_metadata ? 'credits' then nullif(p_course_metadata->>'credits', '')::numeric else credits end,
    meeting_days = case when p_course_metadata ? 'meeting_days' then array(select jsonb_array_elements_text(p_course_metadata->'meeting_days')) else meeting_days end,
    meeting_start = case when p_course_metadata ? 'meeting_start' then nullif(p_course_metadata->>'meeting_start', '')::time else meeting_start end,
    meeting_end = case when p_course_metadata ? 'meeting_end' then nullif(p_course_metadata->>'meeting_end', '')::time else meeting_end end,
    updated_at = now()
  where id = target_course_id and user_id = processing.user_id;

  update public.uploaded_files
  set course_id = target_course_id
  where id = processing.upload_id and user_id = processing.user_id;

  -- A roadmap-only/undated item must never become a Calendar commitment: require a real,
  -- parseable due_at before it can ever reach the assignments table.
  insert into public.assignments (user_id,course_id,title,description,due_at,estimated_minutes,status,source,syllabus_item_key)
  select processing.user_id,target_course_id,btrim(assignment_item.value->>'title'),nullif(assignment_item.value->>'description',''),nullif(assignment_item.value->>'due_at','')::timestamptz,
    nullif(assignment_item.value->>'estimated_minutes','')::integer,'not_started','syllabus:'||processing.upload_id::text,
    processing.upload_id::text||':assignment:'||lower(regexp_replace(btrim(assignment_item.value->>'title'),'\s+',' ','g'))||':'||coalesce(assignment_item.value->>'due_at','undated')
  from jsonb_array_elements(p_assignments) as assignment_item(value)
  where btrim(coalesce(assignment_item.value->>'title','')) <> ''
    and nullif(assignment_item.value->>'due_at','') is not null
  on conflict (user_id,syllabus_item_key) where syllabus_item_key is not null do nothing;

  for exam_item in select value from jsonb_array_elements(p_exams) loop
    if btrim(coalesce(exam_item->>'title','')) = '' then continue; end if;
    normalized_title := lower(regexp_replace(btrim(exam_item->>'title'),'\s+',' ','g'));
    proposed_exam_at := nullif(exam_item->>'exam_at','')::timestamptz;
    -- Same requirement as assignments: an exam mentioned by name but never dated (e.g. "Final
    -- Exam" on a module list with no printed date) must never become a Calendar commitment.
    if proposed_exam_at is null then continue; end if;

    if exists(
      select 1 from public.exams e
      where e.user_id = processing.user_id and e.course_id = target_course_id
        and e.source like 'syllabus:%'
        and lower(regexp_replace(btrim(e.title),'\s+',' ','g')) = normalized_title
        and e.exam_at is not distinct from proposed_exam_at
    ) then continue; end if;

    select * into existing_exam from public.exams e
    where e.user_id = processing.user_id and e.course_id = target_course_id
      and e.source like 'syllabus:%'
      and lower(regexp_replace(btrim(e.title),'\s+',' ','g')) = normalized_title
    limit 1;
    if found then
      insert into public.syllabus_exam_conflicts (
        user_id,course_id,processing_id,proposed_upload_id,existing_exam_id,normalized_title,
        proposed_title,proposed_exam_at,proposed_location,proposed_topics_summary,proposed_syllabus_item_key
      ) values (
        processing.user_id,target_course_id,processing.id,processing.upload_id,existing_exam.id,normalized_title,
        btrim(exam_item->>'title'),proposed_exam_at,nullif(exam_item->>'location',''),nullif(exam_item->>'topics_summary',''),
        processing.upload_id::text||':exam:'||normalized_title||':'||coalesce(exam_item->>'exam_at','undated')
      ) on conflict (user_id,course_id,normalized_title,proposed_exam_at) where status = 'pending' do nothing;
      if found then conflicts_created := conflicts_created + 1; end if;
    else
      insert into public.exams (user_id,course_id,title,exam_at,location,topics_summary,source,syllabus_item_key)
      values (processing.user_id,target_course_id,btrim(exam_item->>'title'),proposed_exam_at,nullif(exam_item->>'location',''),nullif(exam_item->>'topics_summary',''),
        'syllabus:'||processing.upload_id::text,processing.upload_id::text||':exam:'||normalized_title||':'||coalesce(exam_item->>'exam_at','undated'));
      inserted_exams := inserted_exams + 1;
    end if;
  end loop;

  insert into public.course_roadmap_entries (user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key)
  select processing.user_id,target_course_id,nullif(btrim(t.item->>'period_label'),''),btrim(t.item->>'topic'),nullif(t.item->>'description',''),
    nullif(t.item->>'deliverable',''),nullif(t.item->>'date','')::date,'syllabus:'||processing.upload_id::text,t.ord-1,
    processing.upload_id::text||':roadmap:'||lower(regexp_replace(coalesce(t.item->>'period_label','')||'|'||coalesce(t.item->>'topic',''),'\s+',' ','g'))
  from jsonb_array_elements(p_roadmap) with ordinality as t(item,ord)
  where btrim(coalesce(t.item->>'topic','')) <> ''
  on conflict (user_id,roadmap_item_key) where roadmap_item_key is not null do nothing;

  update public.ai_processing_results
  set status = 'approved', approved_at = now(), course_id = target_course_id
  where id = processing.id;

  update public.uploaded_files
  set processing_status = 'processed', course_id = target_course_id
  where id = processing.upload_id and user_id = processing.user_id;

  return jsonb_build_object('inserted_exams', inserted_exams, 'conflicts_created', conflicts_created);
end;
$$;

revoke all on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb,jsonb) to authenticated;
