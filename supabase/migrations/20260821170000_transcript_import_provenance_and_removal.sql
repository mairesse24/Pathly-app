create table public.academic_record_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_upload_id uuid,
  kind text not null check (kind = 'unofficial_transcript'),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  foreign key (source_upload_id,user_id) references public.uploaded_files(id,user_id) on delete set null (source_upload_id),
  unique (id,user_id),
  unique (source_upload_id,user_id)
);

create table public.academic_record_import_courses (
  import_id uuid not null references public.academic_record_imports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_code text not null,
  course_title text not null,
  credit_hours numeric(4,1) not null,
  term text,
  year integer,
  status text not null,
  created_at timestamptz not null default now(),
  primary key (import_id,course_code),
  foreign key (import_id,user_id) references public.academic_record_imports(id,user_id) on delete cascade
);
create index academic_record_imports_user_active_idx on public.academic_record_imports(user_id,created_at desc) where removed_at is null;
create index academic_record_import_courses_user_code_idx on public.academic_record_import_courses(user_id,course_code);

alter table public.academic_record_imports enable row level security;
alter table public.academic_record_import_courses enable row level security;
revoke all on public.academic_record_imports,public.academic_record_import_courses from anon,authenticated;
grant select,insert,update on public.academic_record_imports,public.academic_record_import_courses to authenticated;
grant delete on public.academic_record_import_courses to authenticated;
create policy academic_record_imports_select_own on public.academic_record_imports for select to authenticated using ((select auth.uid())=user_id);
create policy academic_record_imports_insert_own on public.academic_record_imports for insert to authenticated with check ((select auth.uid())=user_id);
create policy academic_record_imports_update_own on public.academic_record_imports for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy academic_record_import_courses_select_own on public.academic_record_import_courses for select to authenticated using ((select auth.uid())=user_id);
create policy academic_record_import_courses_insert_own on public.academic_record_import_courses for insert to authenticated with check ((select auth.uid())=user_id);
create policy academic_record_import_courses_update_own on public.academic_record_import_courses for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy academic_record_import_courses_delete_own on public.academic_record_import_courses for delete to authenticated using ((select auth.uid())=user_id);

create or replace function public.confirm_academic_record_processing(p_processing_id uuid,p_courses jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare
  processing public.ai_processing_results;
  import_id uuid;
  item jsonb;
  normalized_code text;
  existing_id uuid;
  existing_source text;
begin
  select * into processing from public.ai_processing_results
  where id=p_processing_id and user_id=(select auth.uid())
    and kind='unofficial_transcript' and status='ready_for_review' for update;
  if not found then raise exception 'Academic record review is unavailable or already confirmed'; end if;
  if jsonb_typeof(p_courses)<>'array' then raise exception 'Reviewed courses must be an array'; end if;

  insert into public.academic_record_imports(user_id,source_upload_id,kind)
  values(processing.user_id,processing.upload_id,'unofficial_transcript') returning id into import_id;

  for item in select value from jsonb_array_elements(p_courses) loop
      normalized_code:=upper(btrim(item->>'course_code'));
      if normalized_code='' or btrim(coalesce(item->>'course_title',''))='' then continue; end if;
      select id,source into existing_id,existing_source from public.completed_courses
        where user_id=processing.user_id and course_code=normalized_code for update;
      if existing_id is null then
        insert into public.completed_courses(user_id,course_code,course_title,credit_hours,term,year,source,status,source_upload_id)
        values(processing.user_id,normalized_code,btrim(item->>'course_title'),(item->>'credit_hours')::numeric,
          nullif(item->>'term',''),nullif(item->>'year','')::integer,'transcript',
          case when item->>'status'='in_progress' then 'in_progress' else 'completed' end,processing.upload_id);
      elsif existing_source<>'manual' then
        update public.completed_courses set course_title=btrim(item->>'course_title'),credit_hours=(item->>'credit_hours')::numeric,
          term=nullif(item->>'term',''),year=nullif(item->>'year','')::integer,source='transcript',
          status=case when item->>'status'='in_progress' then 'in_progress' else 'completed' end,
          source_upload_id=processing.upload_id,updated_at=now() where id=existing_id;
      end if;
      insert into public.academic_record_import_courses(import_id,user_id,course_code,course_title,credit_hours,term,year,status)
      values(import_id,processing.user_id,normalized_code,btrim(item->>'course_title'),(item->>'credit_hours')::numeric,
        nullif(item->>'term',''),nullif(item->>'year','')::integer,
        case when item->>'status'='in_progress' then 'in_progress' else 'completed' end)
      on conflict(import_id,course_code) do update set course_title=excluded.course_title,credit_hours=excluded.credit_hours,
        term=excluded.term,year=excluded.year,status=excluded.status;
  end loop;
  update public.ai_processing_results set status='approved',approved_at=now() where id=processing.id;
  update public.uploaded_files set processing_status='processed' where id=processing.upload_id and user_id=processing.user_id;
end $$;

create or replace function public.preview_transcript_import_removal(p_import_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  with target as (
    select * from public.academic_record_imports where id=p_import_id and user_id=(select auth.uid()) and removed_at is null
  ), affected as (
    select c.course_code,cc.source,
      exists(select 1 from public.academic_record_import_courses oc join public.academic_record_imports oi on oi.id=oc.import_id
        where oc.user_id=c.user_id and oc.course_code=c.course_code and oc.import_id<>c.import_id and oi.removed_at is null) as has_other
    from public.academic_record_import_courses c join target t on t.id=c.import_id
    left join public.completed_courses cc on cc.user_id=c.user_id and cc.course_code=c.course_code
  ) select jsonb_build_object(
    'imported_records',count(*),
    'completed_course_rows_deleted',count(*) filter(where source='transcript' and not has_other),
    'completed_course_rows_restored',count(*) filter(where source='transcript' and has_other),
    'manual_rows_preserved',count(*) filter(where source='manual')
  ) from affected;
$$;

create or replace function public.remove_transcript_import(p_import_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; owned public.academic_record_imports; item public.academic_record_import_courses; replacement public.academic_record_import_courses;
begin
  select * into owned from public.academic_record_imports where id=p_import_id and user_id=(select auth.uid()) and removed_at is null for update;
  if not found then raise exception 'Transcript import is unavailable or already removed'; end if;
  result:=public.preview_transcript_import_removal(p_import_id);
  for item in select * from public.academic_record_import_courses where import_id=p_import_id loop
    select oc.* into replacement from public.academic_record_import_courses oc join public.academic_record_imports oi on oi.id=oc.import_id
      where oc.user_id=owned.user_id and oc.course_code=item.course_code and oc.import_id<>p_import_id and oi.removed_at is null
      order by oi.created_at desc limit 1;
    if found then
      update public.completed_courses set course_title=replacement.course_title,credit_hours=replacement.credit_hours,
        term=replacement.term,year=replacement.year,status=replacement.status,source='transcript',source_upload_id=null,updated_at=now()
      where user_id=owned.user_id and course_code=item.course_code and source='transcript';
    else
      delete from public.completed_courses where user_id=owned.user_id and course_code=item.course_code and source='transcript';
    end if;
  end loop;
  update public.academic_record_imports set removed_at=now() where id=p_import_id;
  return result;
end $$;

revoke all on function public.confirm_academic_record_processing(uuid,jsonb),public.preview_transcript_import_removal(uuid),public.remove_transcript_import(uuid) from public,anon;
grant execute on function public.confirm_academic_record_processing(uuid,jsonb),public.preview_transcript_import_removal(uuid),public.remove_transcript_import(uuid) to authenticated;
