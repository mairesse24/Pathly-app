-- Canvas imports are owned by the same user as their connection. Pairing the
-- connection id with user_id makes that invariant structural, not just an RLS
-- or Edge Function convention. NOT VALID keeps the initial lock short; the
-- explicit validation below proves existing rows are compatible.
alter table public.courses
  drop constraint courses_canvas_connection_id_fkey,
  add constraint courses_canvas_connection_owner_fkey
    foreign key (canvas_connection_id, user_id)
    references public.canvas_connections(id, user_id)
    on delete set null (canvas_connection_id)
    not valid;

alter table public.assignments
  drop constraint assignments_canvas_connection_id_fkey,
  add constraint assignments_canvas_connection_owner_fkey
    foreign key (canvas_connection_id, user_id)
    references public.canvas_connections(id, user_id)
    on delete set null (canvas_connection_id)
    not valid;

alter table public.courses validate constraint courses_canvas_connection_owner_fkey;
alter table public.assignments validate constraint assignments_canvas_connection_owner_fkey;

-- These records are populated by authenticated RPCs or server-side functions.
-- The browser needs read access only; owner-scoped RLS remains the row boundary.
revoke all privileges on table public.course_roadmap_entries from anon;
revoke all privileges on table public.course_roadmap_entries from authenticated;
grant select on table public.course_roadmap_entries to authenticated;

revoke all privileges on table public.ai_processing_results from anon;
revoke all privileges on table public.ai_processing_results from authenticated;
grant select on table public.ai_processing_results to authenticated;
