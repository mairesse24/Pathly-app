create table public.user_degree_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_upload_id uuid,
  university text,
  major text,
  catalog_year integer check (catalog_year is null or catalog_year between 1900 and 2200),
  total_credits_required numeric(6,1) check (total_credits_required is null or total_credits_required > 0),
  total_credits_completed numeric(6,1) check (total_credits_completed is null or total_credits_completed >= 0),
  requirement_source text not null default 'degree_audit' check (requirement_source = 'degree_audit'),
  status text not null default 'active' check (status in ('active','replaced')),
  confirmed_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (source_upload_id,user_id) references public.uploaded_files(id,user_id) on delete set null (source_upload_id),
  unique (source_upload_id,user_id)
);

create unique index user_degree_plans_one_active_idx on public.user_degree_plans(user_id) where status='active';
create index user_degree_plans_user_id_idx on public.user_degree_plans(user_id);
alter table public.user_degree_plans add constraint user_degree_plans_id_user_unique unique(id,user_id);

create table public.user_degree_requirement_groups (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_degree_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requirement_label text not null check (char_length(btrim(requirement_label)) between 1 and 300),
  status text not null check (status in ('satisfied','incomplete','in_progress','unclear')),
  credits_required numeric(6,1) check (credits_required is null or credits_required >= 0),
  credits_completed numeric(6,1) check (credits_completed is null or credits_completed >= 0),
  credits_remaining numeric(6,1) check (credits_remaining is null or credits_remaining >= 0),
  details text,
  sort_order integer not null default 0,
  confirmed_at timestamptz not null default now(),
  foreign key (plan_id,user_id) references public.user_degree_plans(id,user_id) on delete cascade
);
alter table public.user_degree_requirement_groups add constraint user_degree_requirement_groups_id_user_unique unique(id,user_id);

create table public.user_degree_requirements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.user_degree_requirement_groups(id) on delete cascade,
  plan_id uuid not null references public.user_degree_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  requirement_type text not null check (requirement_type in ('course','choice','other')),
  course_code text,
  requirement_text text not null check (char_length(btrim(requirement_text)) between 1 and 1000),
  status text not null check (status in ('satisfied','incomplete','in_progress','unclear')),
  confirmed_at timestamptz not null default now(),
  foreign key (group_id,user_id) references public.user_degree_requirement_groups(id,user_id) on delete cascade,
  foreign key (plan_id,user_id) references public.user_degree_plans(id,user_id) on delete cascade
);

create index user_degree_requirement_groups_plan_id_idx on public.user_degree_requirement_groups(plan_id);
create index user_degree_requirements_plan_id_idx on public.user_degree_requirements(plan_id);
create index user_degree_requirements_group_id_idx on public.user_degree_requirements(group_id);

alter table public.user_degree_plans enable row level security;
alter table public.user_degree_requirement_groups enable row level security;
alter table public.user_degree_requirements enable row level security;

revoke all on public.user_degree_plans,public.user_degree_requirement_groups,public.user_degree_requirements from anon,authenticated;
grant select,insert,update on public.user_degree_plans,public.user_degree_requirement_groups,public.user_degree_requirements to authenticated;

create policy user_degree_plans_select_own on public.user_degree_plans for select to authenticated using ((select auth.uid())=user_id);
create policy user_degree_plans_insert_own on public.user_degree_plans for insert to authenticated with check ((select auth.uid())=user_id);
create policy user_degree_plans_update_own on public.user_degree_plans for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy user_degree_groups_select_own on public.user_degree_requirement_groups for select to authenticated using ((select auth.uid())=user_id);
create policy user_degree_groups_insert_own on public.user_degree_requirement_groups for insert to authenticated with check ((select auth.uid())=user_id);
create policy user_degree_groups_update_own on public.user_degree_requirement_groups for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy user_degree_requirements_select_own on public.user_degree_requirements for select to authenticated using ((select auth.uid())=user_id);
create policy user_degree_requirements_insert_own on public.user_degree_requirements for insert to authenticated with check ((select auth.uid())=user_id);
create policy user_degree_requirements_update_own on public.user_degree_requirements for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create or replace function public.confirm_degree_audit_processing(
  p_processing_id uuid,
  p_courses jsonb,
  p_requirements jsonb,
  p_plan_metadata jsonb
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  processing public.ai_processing_results;
  new_plan_id uuid;
  new_group_id uuid;
  requirement_item jsonb;
  code jsonb;
  item_status text;
begin
  select * into processing from public.ai_processing_results
  where id=p_processing_id and user_id=(select auth.uid()) and kind='degree_audit' and status='ready_for_review'
  for update;
  if not found then raise exception 'Degree audit review is unavailable or already confirmed'; end if;
  if jsonb_typeof(p_courses)<>'array' or jsonb_typeof(p_requirements)<>'array' or jsonb_typeof(p_plan_metadata)<>'object' then
    raise exception 'Reviewed degree audit data is invalid';
  end if;

  insert into public.completed_courses(user_id,course_code,course_title,credit_hours,term,year,source,status,source_upload_id)
  select processing.user_id,upper(btrim(course_item->>'course_code')),btrim(course_item->>'course_title'),
    (course_item->>'credit_hours')::numeric,nullif(course_item->>'term',''),nullif(course_item->>'year','')::integer,
    'degree_audit',case when course_item->>'status'='in_progress' then 'in_progress' else 'completed' end,processing.upload_id
  from jsonb_array_elements(p_courses) course_item
  where btrim(coalesce(course_item->>'course_code',''))<>'' and btrim(coalesce(course_item->>'course_title',''))<>''
  on conflict(user_id,course_code) do update set course_title=excluded.course_title,credit_hours=excluded.credit_hours,
    term=excluded.term,year=excluded.year,source=excluded.source,status=excluded.status,
    source_upload_id=excluded.source_upload_id,updated_at=now();

  update public.user_degree_plans set status='replaced',superseded_at=now(),updated_at=now()
  where user_id=processing.user_id and status='active';

  insert into public.user_degree_plans(user_id,source_upload_id,university,major,catalog_year,total_credits_required,total_credits_completed)
  values(processing.user_id,processing.upload_id,nullif(btrim(p_plan_metadata->>'university'),''),
    nullif(btrim(p_plan_metadata->>'major'),''),nullif(p_plan_metadata->>'catalog_year','')::integer,
    nullif(p_plan_metadata->>'total_credits_required','')::numeric,
    nullif(p_plan_metadata->>'total_credits_completed','')::numeric)
  returning id into new_plan_id;

  for requirement_item in select value from jsonb_array_elements(p_requirements) loop
    item_status:=case when requirement_item->>'status' in ('satisfied','incomplete','in_progress','unclear') then requirement_item->>'status' else 'unclear' end;
    insert into public.user_degree_requirement_groups(plan_id,user_id,requirement_label,status,credits_required,credits_completed,credits_remaining,details,sort_order)
    values(new_plan_id,processing.user_id,btrim(requirement_item->>'requirement_label'),item_status,
      nullif(requirement_item->>'credits_required','')::numeric,nullif(requirement_item->>'credits_completed','')::numeric,
      nullif(requirement_item->>'credits_remaining','')::numeric,nullif(btrim(requirement_item->>'details'),''),
      coalesce((requirement_item->>'sort_order')::integer,0)) returning id into new_group_id;

    for code in select value from jsonb_array_elements(coalesce(requirement_item->'required_course_codes','[]'::jsonb)) loop
      if btrim(code#>>'{}')<>'' then
        insert into public.user_degree_requirements(group_id,plan_id,user_id,requirement_type,course_code,requirement_text,status)
        values(new_group_id,new_plan_id,processing.user_id,'course',upper(btrim(code#>>'{}')),upper(btrim(code#>>'{}')),item_status);
      end if;
    end loop;
    if nullif(btrim(requirement_item->>'choice_requirement_text'),'') is not null then
      insert into public.user_degree_requirements(group_id,plan_id,user_id,requirement_type,requirement_text,status)
      values(new_group_id,new_plan_id,processing.user_id,'choice',btrim(requirement_item->>'choice_requirement_text'),item_status);
    elsif jsonb_array_length(coalesce(requirement_item->'required_course_codes','[]'::jsonb))=0 then
      insert into public.user_degree_requirements(group_id,plan_id,user_id,requirement_type,requirement_text,status)
      values(new_group_id,new_plan_id,processing.user_id,'other',coalesce(nullif(btrim(requirement_item->>'details'),''),btrim(requirement_item->>'requirement_label')),item_status);
    end if;
  end loop;

  update public.ai_processing_results set status='approved',approved_at=now() where id=processing.id;
  update public.uploaded_files set processing_status='processed' where id=processing.upload_id and user_id=processing.user_id;
  return new_plan_id;
end $$;

revoke all on function public.confirm_degree_audit_processing(uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.confirm_degree_audit_processing(uuid,jsonb,jsonb,jsonb) to authenticated;
