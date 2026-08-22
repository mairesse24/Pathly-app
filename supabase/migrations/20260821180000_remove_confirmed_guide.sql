-- Scoped bulk-removal for a confirmed degree/transfer guide (see DegreeGuideReview /
-- confirm_degree_audit_processing). user_degree_plans had no delete grant or policy at all
-- until now, so this was previously impossible from the client.
--
-- Blast radius, by table:
--   public.user_degree_plans            -- the single targeted row (by id, owned by caller)
--   public.user_degree_requirement_groups -- cascades via existing
--                                            "foreign key (plan_id,user_id) references
--                                            user_degree_plans(id,user_id) on delete cascade"
--   public.user_degree_requirements       -- cascades the same way, transitively
-- Never touched by this (no FK path exists from user_degree_plans to either):
--   public.completed_courses            -- the student's actual completed/in-progress
--                                            coursework; entirely separate table
--   public.uploaded_files               -- user_degree_plans.source_upload_id is a nullable
--                                            reference *to* uploaded_files (on delete set
--                                            null on the upload side); deleting the plan
--                                            never cascades toward the upload

create policy user_degree_plans_delete_own on public.user_degree_plans
  for delete to authenticated using ((select auth.uid())=user_id);
grant delete on public.user_degree_plans to authenticated;

create or replace function public.remove_confirmed_guide(p_plan_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  owned public.user_degree_plans;
  group_count integer;
  requirement_count integer;
begin
  select * into owned from public.user_degree_plans
    where id=p_plan_id and user_id=(select auth.uid()) and status='active' for update;
  if not found then raise exception 'Confirmed program guide is unavailable or already removed'; end if;
  -- A confirmed personal degree audit reuses this same table/shape but always carries a
  -- completed-credits figure (see DegreeGuideReview, which forces total_credits_completed to
  -- null for every guide); this action must only ever remove a guide, never a student's
  -- personal audit-derived plan.
  if owned.total_credits_completed is not null then
    raise exception 'Only a confirmed program/transfer guide can be removed with this action. This looks like your personal degree audit, not a guide.';
  end if;
  select count(*) into group_count from public.user_degree_requirement_groups where plan_id=owned.id;
  select count(*) into requirement_count from public.user_degree_requirements where plan_id=owned.id;
  delete from public.user_degree_plans where id=owned.id and user_id=owned.user_id;
  return jsonb_build_object('requirement_groups_removed',group_count,'requirements_removed',requirement_count);
end $$;

revoke all on function public.remove_confirmed_guide(uuid) from public,anon;
grant execute on function public.remove_confirmed_guide(uuid) to authenticated;
