alter table public.profiles
  add column non_academic_constraints text[],
  add column planning_style text,
  add column primary_support_goal text,
  add constraint profiles_non_academic_constraints_check
    check (non_academic_constraints is null or non_academic_constraints <@ array['work','commute','family','extracurriculars','varies']::text[]),
  add constraint profiles_planning_style_check
    check (planning_style is null or planning_style in ('structured','flexible','balanced')),
  add constraint profiles_primary_support_goal_check
    check (primary_support_goal is null or primary_support_goal in ('deadlines','study_planning','degree_progress','balance'));
