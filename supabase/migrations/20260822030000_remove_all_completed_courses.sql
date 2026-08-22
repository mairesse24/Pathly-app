-- "Remove imported coursework" (remove_transcript_import) clears one transcript import.
-- This owner-scoped bulk variant clears every active transcript import atomically. It does
-- not treat personal Degree Audit coursework as interchangeable with transcript coursework:
-- degree-audit rows feed confirmed requirement applications and need their own future reset.
--
-- Blast radius, by table:
--   public.completed_courses      -- only source='transcript' rows owned by the caller
--   public.academic_record_imports -- the caller's own not-yet-removed rows are soft-deleted
--                                      (removed_at set) so "Transcript imports" stops listing
--                                      history for coursework that no longer exists; the
--                                      academic_record_import_courses audit trail underneath
--                                      each import is never touched (same as
--                                      remove_transcript_import)
-- Never touched by this (no FK path exists from completed_courses to either):
--   public.user_degree_plans, public.user_degree_requirement_groups,
--   public.user_degree_requirements -- the confirmed program guide / personal degree audit;
--                                       entirely separate tables. Confirmed guides have their
--                                       own remove_confirmed_guide action; personal audits are
--                                       deliberately not reset by either coursework action.
--   public.uploaded_files          -- completed_courses.source_upload_id and
--                                       academic_record_imports.source_upload_id are nullable
--                                       references *to* uploaded_files (on delete set null on
--                                       the upload side); deleting/soft-deleting these rows
--                                       never cascades toward the upload

create or replace function public.remove_all_imported_coursework()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  course_count integer;
  import_count integer;
begin
  select count(*) into course_count from public.completed_courses
    where user_id=(select auth.uid()) and source='transcript';
  select count(*) into import_count from public.academic_record_imports
    where user_id=(select auth.uid()) and removed_at is null;
  if course_count=0 and import_count=0 then
    raise exception 'You have no imported coursework to remove';
  end if;
  delete from public.completed_courses
    where user_id=(select auth.uid()) and source='transcript';
  update public.academic_record_imports set removed_at=now()
    where user_id=(select auth.uid()) and removed_at is null;
  return jsonb_build_object('courses_removed',course_count,'imports_cleared',import_count);
end $$;

revoke all on function public.remove_all_imported_coursework() from public,anon;
grant execute on function public.remove_all_imported_coursework() to authenticated;
