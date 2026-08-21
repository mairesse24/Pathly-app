create or replace view public.active_uploaded_files
with (security_invoker = true)
as
select files.*
from public.uploaded_files files
where exists (
  select 1
  from storage.objects objects
  where objects.bucket_id = 'source-uploads'
    and objects.name = files.storage_path
);

revoke all on public.active_uploaded_files from anon;
grant select on public.active_uploaded_files to authenticated;

create or replace function private.preserve_organized_note_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.user_id <> new.user_id
    or old.course_id <> new.course_id
    or old.original_text is distinct from new.original_text
    or (old.source_upload_id is null and new.source_upload_id is not null)
    or (old.source_upload_id is not null and new.source_upload_id is not null
      and old.source_upload_id <> new.source_upload_id)
    or old.model <> new.model
    or old.created_at <> new.created_at then
    raise exception 'The original note source cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.preserve_organized_note_source() from public;
