-- Course roadmap: the week/period structure of a syllabus schedule table
-- (topic + optional deliverable text per week), persisted separately from
-- assignments/exams so a syllabus like CSCE 3444's "Week 1 -- Introduction;
-- Team creation activity" ... "Week 15 -- Final Project Presentations"
-- becomes 15 roadmap entries instead of 15 fake undated assignments named
-- "Week 1", "Week 2", etc. Roadmap entries are informational only and are
-- never themselves calendar items; only assignments/exams with a reliable
-- printed date ever reach Calendar, exactly as before.
create table public.course_roadmap_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  period_label text,
  topic text not null check (char_length(btrim(topic)) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  deliverable text check (deliverable is null or char_length(deliverable) <= 500),
  entry_date date,
  source text not null default 'manual',
  sort_order integer not null default 0,
  roadmap_item_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade
);

create index course_roadmap_entries_course_id_idx on public.course_roadmap_entries (course_id, sort_order);
create unique index course_roadmap_entries_item_key_unique on public.course_roadmap_entries (user_id, roadmap_item_key) where roadmap_item_key is not null;

alter table public.course_roadmap_entries enable row level security;
create policy "Users manage their course roadmap entries" on public.course_roadmap_entries
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Two stale overloads of approve_syllabus_processing exist in production:
-- the original 4-param version (superseded by
-- 20260817220000_apply_confirmed_syllabus_metadata.sql, which added
-- p_course_metadata as a *new* overload without dropping the old one) and
-- the current 5-param version. The frontend always supplies
-- p_course_metadata, so PostgREST always resolves to the 5-param version
-- and the 4-param one is genuinely dead -- drop both before establishing
-- the single 6-param version below, so there is never more than one live
-- signature to reason about.
drop function if exists public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid);
drop function if exists public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb);

create or replace function public.approve_syllabus_processing(
  p_processing_id uuid,
  p_assignments jsonb,
  p_exams jsonb,
  p_course_id uuid,
  p_course_metadata jsonb default '{}'::jsonb,
  p_roadmap jsonb default '[]'::jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare processing public.ai_processing_results; target_course_id uuid;
begin
  select * into processing from public.ai_processing_results where id=p_processing_id and user_id=(select auth.uid()) and kind='syllabus' and status='ready_for_review' for update;
  if not found then raise exception 'Syllabus review is unavailable or already approved'; end if;
  if jsonb_typeof(p_assignments)<>'array' or jsonb_typeof(p_exams)<>'array' or jsonb_typeof(p_course_metadata)<>'object' or jsonb_typeof(p_roadmap)<>'array' then raise exception 'Reviewed syllabus values are invalid'; end if;
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
  insert into public.course_roadmap_entries (user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key)
  select processing.user_id,target_course_id,nullif(trim(t.item->>'period_label'),''),trim(t.item->>'topic'),nullif(t.item->>'description',''),nullif(t.item->>'deliverable',''),nullif(t.item->>'date','')::date,'syllabus:'||processing.upload_id::text,t.ord-1,
    processing.upload_id::text||':roadmap:'||lower(regexp_replace(coalesce(t.item->>'period_label','')||'|'||coalesce(t.item->>'topic',''),'\s+',' ','g'))
  from jsonb_array_elements(p_roadmap) with ordinality as t(item,ord)
  where trim(coalesce(t.item->>'topic',''))<>''
  on conflict (user_id,roadmap_item_key) where roadmap_item_key is not null do nothing;
  update public.ai_processing_results set status='approved',approved_at=now(),course_id=target_course_id where id=processing.id;
  update public.uploaded_files set processing_status='processed',course_id=target_course_id where id=processing.upload_id and user_id=processing.user_id;
end; $$;
revoke all on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.approve_syllabus_processing(uuid,jsonb,jsonb,uuid,jsonb,jsonb) to authenticated;
