create schema if not exists private;

create table public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid,
  category text not null check (category in ('syllabus', 'lecture', 'degree_audit', 'unofficial_transcript')),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  )),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  processing_status text not null default 'pending_upload' check (processing_status in ('pending_upload', 'uploaded', 'upload_failed')),
  is_sensitive boolean generated always as (category in ('degree_audit', 'unofficial_transcript')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uploaded_files_course_owner_fkey foreign key (course_id, user_id)
    references public.courses(id, user_id) on delete set null (course_id)
);

create index uploaded_files_user_created_idx on public.uploaded_files(user_id, created_at desc);
create index uploaded_files_course_idx on public.uploaded_files(course_id) where course_id is not null;

alter table public.uploaded_files enable row level security;
grant select, insert, update, delete on public.uploaded_files to authenticated;
revoke all on public.uploaded_files from anon;

create policy "Users can view their uploaded files" on public.uploaded_files
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can reserve their uploaded files" on public.uploaded_files
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their uploaded files" on public.uploaded_files
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their uploaded files" on public.uploaded_files
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function private.enforce_uploaded_file_limits()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  used_bytes bigint;
  expected_folder text;
  extension text;
begin
  if new.user_id <> (select auth.uid()) then
    raise exception 'Upload owner must match the authenticated user';
  end if;

  expected_folder := case
    when new.category in ('syllabus', 'lecture') then new.category
    else 'academic-progress'
  end;
  if new.storage_path !~ ('^' || new.user_id::text || '/' || expected_folder || '/[A-Za-z0-9_.-]+$') then
    raise exception 'Invalid storage path for upload category';
  end if;

  extension := lower(substring(new.original_filename from '\\.([^.]+)$'));
  if extension is null or extension not in ('pdf', 'pptx', 'docx', 'png', 'jpg', 'jpeg') then
    raise exception 'Unsupported file extension';
  end if;
  if (extension = 'pdf' and new.mime_type <> 'application/pdf')
    or (extension = 'pptx' and new.mime_type <> 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    or (extension = 'docx' and new.mime_type <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or (extension = 'png' and new.mime_type <> 'image/png')
    or (extension in ('jpg', 'jpeg') and new.mime_type <> 'image/jpeg') then
    raise exception 'File extension and MIME type do not match';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select coalesce(sum(size_bytes), 0) into used_bytes
  from public.uploaded_files
  where user_id = new.user_id and (tg_op = 'INSERT' or id <> new.id);
  if used_bytes + new.size_bytes > 524288000 then
    raise exception 'The 500 MB source-file storage limit would be exceeded';
  end if;

  if tg_op = 'UPDATE' and (
    new.user_id <> old.user_id or new.storage_path <> old.storage_path or
    new.size_bytes <> old.size_bytes or new.mime_type <> old.mime_type or
    new.category <> old.category or new.original_filename <> old.original_filename
  ) then
    raise exception 'Stored file identity fields cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.enforce_uploaded_file_limits() from public;
create trigger uploaded_files_enforce_limits
before insert or update on public.uploaded_files
for each row execute function private.enforce_uploaded_file_limits();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-uploads', 'source-uploads', false, 26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can upload reserved source files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.uploaded_files f
      where f.user_id = (select auth.uid()) and f.storage_path = name
    )
  );
create policy "Users can read their source files" on storage.objects
  for select to authenticated using (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Users can delete their source files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'source-uploads'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
