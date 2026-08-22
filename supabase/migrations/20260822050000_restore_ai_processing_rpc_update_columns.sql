-- The authenticated confirmation RPCs are SECURITY INVOKER, so they require the caller to
-- hold the table privileges used inside each function. The deployment-boundary hardening in
-- 20260822025219 removed UPDATE entirely, which also removed the privilege required by their
-- SELECT ... FOR UPDATE locks.
--
-- Restore only the three transition columns used by the reviewed/confirmed workflows. RLS
-- remains owner-only, and private.protect_ai_processing_result continues to reject changes to
-- user_id, upload_id, kind, model, result, created_at, or invalid status/course transitions.
grant update(course_id,status,approved_at)
  on table public.ai_processing_results
  to authenticated;

-- The same hardening migration reduced course_roadmap_entries to SELECT, but the current
-- syllabus approval RPC is also SECURITY INVOKER and inserts confirmed roadmap context. Keep
-- direct DELETE/UPDATE unavailable and restore only the columns that RPC inserts.
grant insert(user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key)
  on table public.course_roadmap_entries
  to authenticated;
