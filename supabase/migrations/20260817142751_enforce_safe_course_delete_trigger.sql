create or replace function private.guard_course_delete()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if (select auth.uid()) is not null and old.user_id=(select auth.uid()) and (
    exists(select 1 from public.assignments where course_id=old.id and user_id=old.user_id)
    or exists(select 1 from public.exams where course_id=old.id and user_id=old.user_id)
    or exists(select 1 from public.study_sessions where course_id=old.id and user_id=old.user_id)
    or exists(select 1 from public.ai_processing_results where course_id=old.id and user_id=old.user_id)
  ) then raise exception 'Move or remove linked assignments, exams, study sessions, and processed materials before deleting this course'; end if;
  return old;
end;
$$;
revoke all on function private.guard_course_delete() from public;
drop trigger if exists courses_safe_delete on public.courses;
create trigger courses_safe_delete before delete on public.courses for each row execute function private.guard_course_delete();
grant delete on public.courses to authenticated;
