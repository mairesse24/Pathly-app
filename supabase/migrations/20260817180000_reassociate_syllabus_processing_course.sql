drop policy if exists "Users can reassign ready syllabus processing results" on public.ai_processing_results;
create policy "Users can reassign ready syllabus processing results"
  on public.ai_processing_results for update to authenticated
  using ((select auth.uid()) = user_id and kind = 'syllabus' and status = 'ready_for_review')
  with check ((select auth.uid()) = user_id and kind = 'syllabus' and status = 'ready_for_review');

create or replace function private.protect_ai_processing_result()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.user_id <> new.user_id or old.upload_id <> new.upload_id
    or old.kind <> new.kind or old.model <> new.model or old.result <> new.result
    or old.created_at <> new.created_at then
    raise exception 'AI processing result content cannot be changed';
  end if;
  if old.status = 'ready_for_review' and new.status = 'ready_for_review' and old.kind = 'syllabus' then
    if old.course_id is distinct from new.course_id and not exists (
      select 1 from public.uploaded_files upload where upload.id = new.upload_id
        and upload.user_id = new.user_id and upload.course_id = new.course_id
    ) then raise exception 'Syllabus processing must match the source upload course'; end if;
  elsif old.status = 'ready_for_review' and new.status = 'approved' then
    if old.course_id is distinct from new.course_id and not exists (
      select 1 from public.uploaded_files upload where upload.id = new.upload_id
        and upload.user_id = new.user_id and upload.course_id = new.course_id
    ) then raise exception 'Confirmed course must match the source upload'; end if;
  else raise exception 'Only ready syllabus results can be reassociated or approved';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.reassociate_syllabus_processing_course(p_processing_id uuid, p_course_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare processing public.ai_processing_results;
begin
  select * into processing from public.ai_processing_results
  where id = p_processing_id and user_id = (select auth.uid())
    and kind = 'syllabus' and status = 'ready_for_review' for update;
  if not found then raise exception 'Syllabus review is unavailable or already approved'; end if;
  if not exists (select 1 from public.courses where id = p_course_id and user_id = processing.user_id) then
    raise exception 'The selected course is unavailable';
  end if;
  update public.uploaded_files set course_id = p_course_id
  where id = processing.upload_id and user_id = processing.user_id;
  update public.ai_processing_results set course_id = p_course_id
  where id = processing.id and user_id = processing.user_id;
end;
$$;
revoke all on function public.reassociate_syllabus_processing_course(uuid,uuid) from public, anon;
grant execute on function public.reassociate_syllabus_processing_course(uuid,uuid) to authenticated;
