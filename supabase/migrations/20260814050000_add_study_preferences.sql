alter table public.profiles
  add column preferred_study_time text,
  add column focus_session_minutes integer,
  add column prefers_breaks boolean,
  add column break_duration_minutes integer,
  add constraint profiles_preferred_study_time_check
    check (preferred_study_time is null or preferred_study_time in ('morning','afternoon','evening','late_night','no_preference')),
  add constraint profiles_focus_session_minutes_check
    check (focus_session_minutes is null or focus_session_minutes between 10 and 240),
  add constraint profiles_break_duration_minutes_check
    check (break_duration_minutes is null or break_duration_minutes between 1 and 60);

