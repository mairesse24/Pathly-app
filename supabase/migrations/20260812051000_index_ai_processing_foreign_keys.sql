create index ai_processing_results_upload_owner_idx
  on public.ai_processing_results(upload_id, user_id);
create index ai_processing_results_course_owner_idx
  on public.ai_processing_results(course_id, user_id);
