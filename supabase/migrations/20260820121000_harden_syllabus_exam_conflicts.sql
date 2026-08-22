-- Existing project default privileges expose DML on new public tables.
-- Conflict resolution must only occur through the owner-checked RPC.
revoke insert,update,delete on public.syllabus_exam_conflicts from authenticated;
