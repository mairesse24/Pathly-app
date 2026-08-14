alter table public.profiles
  add column timezone text;

alter table public.profiles
  add constraint profiles_timezone_length_check
  check (timezone is null or char_length(timezone) between 1 and 100);
