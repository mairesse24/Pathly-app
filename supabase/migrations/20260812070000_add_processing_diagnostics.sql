alter table public.uploaded_files
  add column processing_stage text
    check (processing_stage in ('preparing', 'reading', 'creating', 'saving')),
  add column processing_error_code text,
  add column error_message text;

comment on column public.uploaded_files.processing_error_code is
  'Developer-facing stable error code. Never render directly in the student UI.';
comment on column public.uploaded_files.error_message is
  'Developer-facing processing diagnostic. Never render directly in the student UI.';
