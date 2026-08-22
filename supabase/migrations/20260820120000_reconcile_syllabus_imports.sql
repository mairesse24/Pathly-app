-- Reconcile syllabus imports across uploads without touching manual or Canvas data.
create table public.syllabus_exam_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  processing_id uuid references public.ai_processing_results(id) on delete set null,
  proposed_upload_id uuid,
  existing_exam_id uuid not null,
  normalized_title text not null,
  proposed_title text not null,
  proposed_exam_at timestamptz,
  proposed_location text,
  proposed_topics_summary text,
  proposed_syllabus_item_key text,
  status text not null default 'pending' check (status in ('pending','kept_existing','replaced')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (id,user_id),
  foreign key (course_id,user_id) references public.courses(id,user_id) on delete cascade
);

create index syllabus_exam_conflicts_owner_status_idx
  on public.syllabus_exam_conflicts (user_id,status,created_at desc);
create unique index syllabus_exam_conflicts_pending_proposal_unique
  on public.syllabus_exam_conflicts (user_id,course_id,normalized_title,proposed_exam_at)
  where status='pending';

alter table public.syllabus_exam_conflicts enable row level security;
grant select on public.syllabus_exam_conflicts to authenticated;
revoke insert,update,delete on public.syllabus_exam_conflicts from authenticated;
revoke all on public.syllabus_exam_conflicts from anon;
create policy "syllabus_exam_conflicts_select_own" on public.syllabus_exam_conflicts
  for select to authenticated using ((select auth.uid())=user_id);

-- Preserve the later conflicting values as pending review before removing them
-- from the active exam list. Every predicate is tied to the one verified owner,
-- course, source upload, and exact row IDs from the 2026-08-20 audit.
do $$
declare
  target_user_id uuid;
  target_course_id constant uuid := '0d617649-71db-40aa-95cd-d9acb9c83f15';
  later_upload_id constant uuid := '9198bd58-a576-4763-a5a7-a1da904c4043';
  migrated_count integer;
begin
  select user_id into strict target_user_id from public.courses where id=target_course_id;

  insert into public.syllabus_exam_conflicts (
    user_id,course_id,processing_id,proposed_upload_id,existing_exam_id,
    normalized_title,proposed_title,proposed_exam_at,proposed_location,
    proposed_topics_summary,proposed_syllabus_item_key
  )
  select target_user_id,target_course_id,'a26f9186-c28b-4fb9-9c1d-faef54900f78',later_upload_id,
    old_exam.id,lower(regexp_replace(btrim(later_exam.title),'\s+',' ','g')),
    later_exam.title,later_exam.exam_at,later_exam.location,later_exam.topics_summary,later_exam.syllabus_item_key
  from public.exams later_exam
  join public.exams old_exam
    on old_exam.user_id=later_exam.user_id and old_exam.course_id=later_exam.course_id
   and lower(regexp_replace(btrim(old_exam.title),'\s+',' ','g'))=lower(regexp_replace(btrim(later_exam.title),'\s+',' ','g'))
   and old_exam.source='syllabus:99c5eccb-ddbb-4367-8ef6-fac5d3b4f5b0'
  where later_exam.user_id=target_user_id and later_exam.course_id=target_course_id
    and later_exam.source='syllabus:'||later_upload_id::text
    and later_exam.id=any(array[
      '852105db-dd6e-4df3-a9b7-4ce1fde53d93'::uuid,
      'f69e361d-7b23-4202-bc2c-6c16116663d4'::uuid,
      'e14f312f-a806-4639-86ca-bfad1e795cda'::uuid
    ]);
  get diagnostics migrated_count=row_count;
  if migrated_count<>3 then raise exception 'Expected to preserve 3 syllabus exam conflicts, preserved %',migrated_count; end if;

  delete from public.exams
  where user_id=target_user_id and course_id=target_course_id
    and source='syllabus:'||later_upload_id::text
    and id=any(array[
      '852105db-dd6e-4df3-a9b7-4ce1fde53d93'::uuid,
      'f69e361d-7b23-4202-bc2c-6c16116663d4'::uuid,
      'e14f312f-a806-4639-86ca-bfad1e795cda'::uuid
    ]);
  get diagnostics migrated_count=row_count;
  if migrated_count<>3 then raise exception 'Expected to remove 3 preserved conflicting exams, removed %',migrated_count; end if;
end $$;

create unique index exams_one_active_syllabus_title_per_course
  on public.exams (user_id,course_id,lower(regexp_replace(btrim(title),'\s+',' ','g')))
  where source like 'syllabus:%';

-- The audited upload contains 29 dated lecture-plan rows, not deliverables.
-- Migrate them losslessly into the roadmap before deleting only those exact rows.
do $$
declare
  target_user_id uuid;
  target_course_id constant uuid := '0d617649-71db-40aa-95cd-d9acb9c83f15';
  source_upload_id constant uuid := '9198bd58-a576-4763-a5a7-a1da904c4043';
  candidate_ids constant uuid[] := array[
    'd735c050-48f2-4f84-86f0-4dda6540dd07','bb461dca-255c-4cf0-9643-8d78c2a18ef0','73711a12-a634-4cd2-b58c-f26224aa914b',
    '4afe607d-8c25-4cab-b22c-5724966d038d','74497a95-0cbe-4163-9acf-86b8a6bbabe0','aa228d14-6012-4ee9-822a-2adc0e8596ac',
    '30269091-3a59-4cae-b2f4-3310cd0e2915','e138eb18-d32a-493d-a089-f2c026856ca0','258e82d9-e0ba-4ec3-9f9b-23b6a6615149',
    '9b8a6727-5509-4924-8932-fb723c8741a1','9c0bb751-4bbb-40c8-acb9-db008762db1b','3d409409-c40f-4e93-9327-73926b0cd155',
    'f76afcb5-2d10-4c1c-94f2-88912c409b96','e8b79dbd-c0fb-42b8-a17d-9f47933f5d21','f385d5fb-77fd-410d-b029-c536f41c7d98',
    '07fb8955-815e-42f1-95a0-b61a7fcbc016','504cec40-0e16-409f-a6df-a33d772afd28','acbfa5f8-a395-441f-a6fa-adae3c6edab9',
    'ebdce7c4-a601-4767-89c3-7130bd3b94a4','0c256c6c-c43b-4541-8f46-4929aff1db5d','83f14abc-b44d-425c-9f96-bc821103eb7a',
    'd78fdf33-ea97-4fef-a15b-6391909624cf','e8233913-f5b5-43e0-a248-c77677afb854','e4b6b1c7-2d74-478f-9a98-efe6a74e1de0',
    '41a32c03-7a1e-417c-b799-6f6a59845cad','574388ab-0509-4f42-abc1-410c63abbcf0','ae4b01b6-a660-4a92-ae0b-993a1a8ab73c',
    '1f8b64ba-8b69-4e44-b36a-0b5f4b55cfbc','3ab595be-8393-4499-a33d-a4eec8b24cb2'
  ]::uuid[];
  migrated_count integer;
begin
  select user_id into strict target_user_id from public.courses where id=target_course_id;
  insert into public.course_roadmap_entries (
    user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key
  )
  select a.user_id,a.course_id,null,a.title,a.description,null,
    (a.due_at at time zone 'America/Chicago')::date,a.source,
    row_number() over(order by a.due_at,a.id)-1,'reconciled:assignment:'||a.id::text
  from public.assignments a
  where a.user_id=target_user_id and a.course_id=target_course_id
    and a.source='syllabus:'||source_upload_id::text and a.status='not_started'
    and a.id=any(candidate_ids)
  on conflict (user_id,roadmap_item_key) where roadmap_item_key is not null do nothing;

  select count(*) into migrated_count from public.course_roadmap_entries
  where user_id=target_user_id and course_id=target_course_id
    and roadmap_item_key like 'reconciled:assignment:%'
    and substring(roadmap_item_key from 23)::uuid=any(candidate_ids);
  if migrated_count<>29 then raise exception 'Expected 29 reconciled roadmap rows, found %',migrated_count; end if;

  delete from public.assignments
  where user_id=target_user_id and course_id=target_course_id
    and source='syllabus:'||source_upload_id::text and status='not_started'
    and id=any(candidate_ids);
  get diagnostics migrated_count=row_count;
  if migrated_count<>29 then raise exception 'Expected to remove 29 migrated topic assignments, removed %',migrated_count; end if;
end $$;

drop function if exists public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb,jsonb);
create function public.approve_syllabus_processing(
  p_processing_id uuid,p_assignments jsonb,p_exams jsonb,p_course_id uuid,
  p_course_metadata jsonb default '{}'::jsonb,p_roadmap jsonb default '[]'::jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  processing public.ai_processing_results; target_course_id uuid; item jsonb;
  existing_exam public.exams; normalized_title text; proposed_exam_at timestamptz;
  conflicts_created integer:=0; inserted_exams integer:=0;
begin
  select * into processing from public.ai_processing_results where id=p_processing_id and user_id=(select auth.uid()) and kind='syllabus' and status='ready_for_review' for update;
  if not found then raise exception 'Syllabus review is unavailable or already approved'; end if;
  if jsonb_typeof(p_assignments)<>'array' or jsonb_typeof(p_exams)<>'array' or jsonb_typeof(p_course_metadata)<>'object' or jsonb_typeof(p_roadmap)<>'array' then raise exception 'Reviewed syllabus values are invalid'; end if;
  target_course_id:=coalesce(p_course_id,processing.course_id);
  perform 1 from public.courses where id=target_course_id and user_id=processing.user_id for update;
  if not found then raise exception 'The selected course is unavailable'; end if;

  update public.courses set
    instructor=case when p_course_metadata?'instructor' then nullif(btrim(p_course_metadata->>'instructor'),'') else instructor end,
    credits=case when p_course_metadata?'credits' then nullif(p_course_metadata->>'credits','')::numeric else credits end,
    meeting_days=case when p_course_metadata?'meeting_days' then array(select jsonb_array_elements_text(p_course_metadata->'meeting_days')) else meeting_days end,
    meeting_start=case when p_course_metadata?'meeting_start' then nullif(p_course_metadata->>'meeting_start','')::time else meeting_start end,
    meeting_end=case when p_course_metadata?'meeting_end' then nullif(p_course_metadata->>'meeting_end','')::time else meeting_end end,
    updated_at=now()
  where id=target_course_id and user_id=processing.user_id;
  update public.uploaded_files set course_id=target_course_id where id=processing.upload_id and user_id=processing.user_id;

  insert into public.assignments (user_id,course_id,title,description,due_at,estimated_minutes,status,source,syllabus_item_key)
  select processing.user_id,target_course_id,btrim(item->>'title'),nullif(item->>'description',''),nullif(item->>'due_at','')::timestamptz,
    nullif(item->>'estimated_minutes','')::integer,'not_started','syllabus:'||processing.upload_id::text,
    processing.upload_id::text||':assignment:'||lower(regexp_replace(btrim(item->>'title'),'\s+',' ','g'))||':'||coalesce(item->>'due_at','undated')
  from jsonb_array_elements(p_assignments)item where btrim(coalesce(item->>'title',''))<>''
  on conflict (user_id,syllabus_item_key) where syllabus_item_key is not null do nothing;

  for item in select value from jsonb_array_elements(p_exams) loop
    if btrim(coalesce(item->>'title',''))='' then continue; end if;
    normalized_title:=lower(regexp_replace(btrim(item->>'title'),'\s+',' ','g'));
    proposed_exam_at:=nullif(item->>'exam_at','')::timestamptz;

    if exists(
      select 1 from public.exams e where e.user_id=processing.user_id and e.course_id=target_course_id
        and e.source like 'syllabus:%'
        and lower(regexp_replace(btrim(e.title),'\s+',' ','g'))=normalized_title
        and e.exam_at is not distinct from proposed_exam_at
    ) then continue; end if;

    select * into existing_exam from public.exams e
    where e.user_id=processing.user_id and e.course_id=target_course_id and e.source like 'syllabus:%'
      and lower(regexp_replace(btrim(e.title),'\s+',' ','g'))=normalized_title
    limit 1;
    if found then
      insert into public.syllabus_exam_conflicts (
        user_id,course_id,processing_id,proposed_upload_id,existing_exam_id,normalized_title,
        proposed_title,proposed_exam_at,proposed_location,proposed_topics_summary,proposed_syllabus_item_key
      ) values (
        processing.user_id,target_course_id,processing.id,processing.upload_id,existing_exam.id,normalized_title,
        btrim(item->>'title'),proposed_exam_at,nullif(item->>'location',''),nullif(item->>'topics_summary',''),
        processing.upload_id::text||':exam:'||normalized_title||':'||coalesce(item->>'exam_at','undated')
      ) on conflict (user_id,course_id,normalized_title,proposed_exam_at) where status='pending' do nothing;
      if found then conflicts_created:=conflicts_created+1; end if;
    else
      insert into public.exams (user_id,course_id,title,exam_at,location,topics_summary,source,syllabus_item_key)
      values (processing.user_id,target_course_id,btrim(item->>'title'),proposed_exam_at,nullif(item->>'location',''),nullif(item->>'topics_summary',''),
        'syllabus:'||processing.upload_id::text,processing.upload_id::text||':exam:'||normalized_title||':'||coalesce(item->>'exam_at','undated'));
      inserted_exams:=inserted_exams+1;
    end if;
  end loop;

  insert into public.course_roadmap_entries (user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key)
  select processing.user_id,target_course_id,nullif(btrim(t.item->>'period_label'),''),btrim(t.item->>'topic'),nullif(t.item->>'description',''),
    nullif(t.item->>'deliverable',''),nullif(t.item->>'date','')::date,'syllabus:'||processing.upload_id::text,t.ord-1,
    processing.upload_id::text||':roadmap:'||lower(regexp_replace(coalesce(t.item->>'period_label','')||'|'||coalesce(t.item->>'topic',''),'\s+',' ','g'))
  from jsonb_array_elements(p_roadmap) with ordinality as t(item,ord)
  where btrim(coalesce(t.item->>'topic',''))<>''
  on conflict (user_id,roadmap_item_key) where roadmap_item_key is not null do nothing;

  update public.ai_processing_results set status='approved',approved_at=now(),course_id=target_course_id where id=processing.id;
  update public.uploaded_files set processing_status='processed',course_id=target_course_id where id=processing.upload_id and user_id=processing.user_id;
  return jsonb_build_object('inserted_exams',inserted_exams,'conflicts_created',conflicts_created);
end $$;

revoke all on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb,jsonb) to authenticated;

create function public.resolve_syllabus_exam_conflict(p_conflict_id uuid,p_resolution text)
returns void language plpgsql security invoker set search_path='' as $$
declare conflict public.syllabus_exam_conflicts;
begin
  if p_resolution not in ('keep_existing','replace') then raise exception 'Invalid syllabus exam resolution'; end if;
  select * into conflict from public.syllabus_exam_conflicts
  where id=p_conflict_id and user_id=(select auth.uid()) and status='pending' for update;
  if not found then raise exception 'Syllabus exam conflict is unavailable or already resolved'; end if;
  if p_resolution='replace' then
    update public.exams set title=conflict.proposed_title,exam_at=conflict.proposed_exam_at,
      location=conflict.proposed_location,topics_summary=conflict.proposed_topics_summary,
      source='syllabus:'||conflict.proposed_upload_id::text,
      syllabus_item_key=conflict.proposed_syllabus_item_key,updated_at=now()
    where id=conflict.existing_exam_id and user_id=conflict.user_id and course_id=conflict.course_id and source like 'syllabus:%';
    if not found then raise exception 'The active syllabus exam is unavailable'; end if;
  end if;
  update public.syllabus_exam_conflicts set status=p_resolution,resolved_at=now() where id=conflict.id and user_id=conflict.user_id;
end $$;
revoke all on function public.resolve_syllabus_exam_conflict(uuid,text) from public,anon;
grant execute on function public.resolve_syllabus_exam_conflict(uuid,text) to authenticated;
