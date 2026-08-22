drop policy if exists "Users can approve their AI processing results" on public.ai_processing_results;
drop policy if exists "Users can reassign ready syllabus processing results" on public.ai_processing_results;
create policy "Users can update their AI processing results"
  on public.ai_processing_results for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      (status = 'approved' and approved_at is not null)
      or (kind = 'syllabus' and status = 'ready_for_review')
    )
  );
