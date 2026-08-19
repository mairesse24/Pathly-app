create table public.organized_course_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  source_upload_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  original_text text check (original_text is null or char_length(original_text) between 1 and 100000),
  organized_content jsonb not null check (jsonb_typeof(organized_content) = 'object'),
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, course_id),
  constraint organized_course_notes_course_owner_fkey foreign key (course_id, user_id)
    references public.courses(id, user_id) on delete cascade,
  constraint organized_course_notes_source_owner_fkey foreign key (source_upload_id, user_id)
    references public.uploaded_files(id, user_id) on delete set null (source_upload_id)
);

create table public.study_flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null,
  organized_note_id uuid not null,
  front text not null check (char_length(btrim(front)) between 1 and 1000),
  back text not null check (char_length(btrim(back)) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint study_flashcards_course_owner_fkey foreign key (course_id, user_id)
    references public.courses(id, user_id) on delete cascade,
  constraint study_flashcards_note_owner_fkey foreign key (organized_note_id, user_id, course_id)
    references public.organized_course_notes(id, user_id, course_id) on delete cascade
);

create index organized_course_notes_user_course_idx on public.organized_course_notes(user_id, course_id, created_at desc);
create index organized_course_notes_course_owner_idx on public.organized_course_notes(course_id, user_id);
create index organized_course_notes_source_owner_idx on public.organized_course_notes(source_upload_id, user_id) where source_upload_id is not null;
create index study_flashcards_user_course_idx on public.study_flashcards(user_id, course_id, created_at desc);
create index study_flashcards_course_owner_idx on public.study_flashcards(course_id, user_id);
create index study_flashcards_note_owner_idx on public.study_flashcards(organized_note_id, user_id, course_id);
alter table public.organized_course_notes enable row level security;
alter table public.study_flashcards enable row level security;
grant select, insert, update, delete on public.organized_course_notes to authenticated;
grant select, insert, update, delete on public.study_flashcards to authenticated;
revoke all on public.organized_course_notes, public.study_flashcards from anon;

create policy "Users manage their organized course notes" on public.organized_course_notes
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their study flashcards" on public.study_flashcards
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function private.preserve_organized_note_source()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.user_id <> new.user_id or old.course_id <> new.course_id or old.original_text is distinct from new.original_text or old.source_upload_id is distinct from new.source_upload_id or old.model <> new.model or old.created_at <> new.created_at then
    raise exception 'The original note source cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.preserve_organized_note_source() from public;
create trigger organized_course_notes_preserve_source before update on public.organized_course_notes
  for each row execute function private.preserve_organized_note_source();
