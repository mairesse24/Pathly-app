alter table public.profiles add column display_name text;

update public.profiles
set display_name = coalesce(nullif(trim(full_name), ''), nullif(split_part(coalesce(email, ''), '@', 1), ''), 'Student')
where display_name is null;

alter table public.profiles alter column display_name set default 'Student';
alter table public.profiles alter column display_name set not null;
alter table public.profiles add constraint profiles_display_name_length_check
  check (char_length(display_name) between 1 and 100);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_display_name text;
begin
  new_display_name := trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, ''), '@', 1),
    'Student'
  ));
  insert into public.profiles (id, email, full_name, display_name)
  values (new.id, new.email, new_display_name, new_display_name);
  return new;
end;
$$;
