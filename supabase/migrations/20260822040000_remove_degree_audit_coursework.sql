-- Degree Audit confirmation writes two coupled projections: completed coursework and an
-- active personal-audit plan whose requirement rows can independently display audit-derived
-- progress. Removing only completed_courses would therefore leave misleading progress behind.
-- This owner-scoped, atomic reset removes both projections while preserving source artifacts
-- and independently confirmed program-guide data.
--
-- The existing confirmed-guide workflow distinguishes a guide from a personal audit by
-- total_credits_completed being null. This function uses the same persisted discriminator:
-- only active plans with a non-null completed-credit total are personal Degree Audit plans.

create or replace function public.remove_degree_audit_coursework()
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  caller_id uuid := (select auth.uid());
  course_count integer;
  plan_count integer;
  group_count integer;
  requirement_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into course_count
  from public.completed_courses
  where user_id=caller_id and source='degree_audit';

  select count(distinct p.id),count(distinct g.id),count(distinct r.id)
    into plan_count,group_count,requirement_count
  from public.user_degree_plans p
  left join public.user_degree_requirement_groups g
    on g.plan_id=p.id and g.user_id=p.user_id
  left join public.user_degree_requirements r
    on r.plan_id=p.id and r.user_id=p.user_id
  where p.user_id=caller_id
    and p.status='active'
    and p.total_credits_completed is not null;

  if course_count=0 then
    raise exception 'You have no Degree Audit coursework to remove';
  end if;

  delete from public.completed_courses
  where user_id=caller_id and source='degree_audit';

  -- Requirement groups and requirements cascade only from the owned personal-audit plan.
  delete from public.user_degree_plans
  where user_id=caller_id
    and status='active'
    and total_credits_completed is not null;

  return jsonb_build_object(
    'courses_removed',course_count,
    'personal_audit_plans_removed',plan_count,
    'requirement_groups_removed',group_count,
    'requirements_removed',requirement_count
  );
end $$;

revoke all on function public.remove_degree_audit_coursework() from public,anon;
grant execute on function public.remove_degree_audit_coursework() to authenticated;
