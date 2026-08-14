alter table public.companion_messages
  alter column request_id set default gen_random_uuid(),
  add column dedupe_key text;

alter table public.companion_messages
  add constraint companion_messages_dedupe_key_length_check
  check (dedupe_key is null or char_length(dedupe_key) = 64);

create unique index companion_messages_user_dedupe_idx
  on public.companion_messages(user_id, dedupe_key)
  where role = 'user' and dedupe_key is not null;
