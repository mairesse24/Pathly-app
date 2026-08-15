create or replace function public.confirm_degree_audit_processing(p_processing_id uuid,p_courses jsonb,p_requirements jsonb,p_plan_metadata jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  processing public.ai_processing_results;
  new_plan_id uuid;
  new_group_id uuid;
  requirement_item jsonb;
  code jsonb;
  item_status text;
begin
  select * into processing from public.ai_processing_results where id=p_processing_id and user_id=(select auth.uid()) and kind='degree_audit' and status='ready_for_review' for update;
  if not found then raise exception 'Degree audit review is unavailable or already confirmed'; end if;
  if jsonb_typeof(p_courses)<>'array' or jsonb_typeof(p_requirements)<>'array' or jsonb_typeof(p_plan_metadata)<>'object' then raise exception 'Reviewed degree audit data is invalid'; end if;

  insert into public.completed_courses(user_id,course_code,course_title,credit_hours,term,year,source,status,source_upload_id)
  select processing.user_id,upper(btrim(course_item->>'course_code')),btrim(course_item->>'course_title'),(course_item->>'credit_hours')::numeric,
    nullif(course_item->>'term',''),nullif(course_item->>'year','')::integer,'degree_audit',case when course_item->>'status'='in_progress' then 'in_progress' else 'completed' end,processing.upload_id
  from jsonb_array_elements(p_courses) course_item
  where btrim(coalesce(course_item->>'course_code',''))<>'' and btrim(coalesce(course_item->>'course_title',''))<>''
  on conflict(user_id,course_code) do update set course_title=excluded.course_title,credit_hours=excluded.credit_hours,term=excluded.term,year=excluded.year,source=excluded.source,status=excluded.status,source_upload_id=excluded.source_upload_id,updated_at=now();

  update public.user_degree_plans set status='replaced',superseded_at=now(),updated_at=now() where user_id=processing.user_id and status='active';
  insert into public.user_degree_plans(user_id,source_upload_id,university,major,catalog_year,total_credits_required,total_credits_completed)
  values(processing.user_id,processing.upload_id,nullif(btrim(p_plan_metadata->>'university'),''),nullif(btrim(p_plan_metadata->>'major'),''),nullif(p_plan_metadata->>'catalog_year','')::integer,nullif(p_plan_metadata->>'total_credits_required','')::numeric,nullif(p_plan_metadata->>'total_credits_completed','')::numeric)
  returning id into new_plan_id;

  for requirement_item in select value from jsonb_array_elements(p_requirements) loop
    item_status:=case when requirement_item->>'status' in ('satisfied','incomplete','in_progress','unclear') then requirement_item->>'status' else 'unclear' end;
    insert into public.user_degree_requirement_groups(plan_id,user_id,requirement_label,status,credits_required,credits_completed,credits_remaining,details,sort_order)
    values(new_plan_id,processing.user_id,btrim(requirement_item->>'requirement_label'),item_status,nullif(requirement_item->>'credits_required','')::numeric,nullif(requirement_item->>'credits_completed','')::numeric,nullif(requirement_item->>'credits_remaining','')::numeric,nullif(btrim(requirement_item->>'details'),''),coalesce((requirement_item->>'sort_order')::integer,0)) returning id into new_group_id;
    for code in select value from jsonb_array_elements(coalesce(requirement_item->'required_course_codes','[]'::jsonb)) loop
      if btrim(code#>>'{}')<>'' then insert into public.user_degree_requirements(group_id,plan_id,user_id,requirement_type,course_code,requirement_text,status) values(new_group_id,new_plan_id,processing.user_id,'course',upper(btrim(code#>>'{}')),upper(btrim(code#>>'{}')),item_status); end if;
    end loop;
    if nullif(btrim(requirement_item->>'choice_requirement_text'),'') is not null then
      insert into public.user_degree_requirements(group_id,plan_id,user_id,requirement_type,requirement_text,status) values(new_group_id,new_plan_id,processing.user_id,'choice',btrim(requirement_item->>'choice_requirement_text'),item_status);
    elsif jsonb_array_length(coalesce(requirement_item->'required_course_codes','[]'::jsonb))=0 then
      insert into public.user_degree_requirements(group_id,plan_id,user_id,requirement_type,requirement_text,status) values(new_group_id,new_plan_id,processing.user_id,'other',coalesce(nullif(btrim(requirement_item->>'details'),''),btrim(requirement_item->>'requirement_label')),item_status);
    end if;
  end loop;
  update public.ai_processing_results set status='approved',approved_at=now() where id=processing.id;
  update public.uploaded_files set processing_status='processed' where id=processing.upload_id and user_id=processing.user_id;
  return new_plan_id;
end $$;

revoke all on function public.confirm_degree_audit_processing(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.confirm_degree_audit_processing(uuid,jsonb,jsonb,jsonb) to authenticated;
