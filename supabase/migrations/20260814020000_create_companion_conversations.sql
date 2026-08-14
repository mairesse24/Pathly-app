create table public.companion_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Pathly Companion' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.companion_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint companion_messages_conversation_owner_fkey
    foreign key (conversation_id, user_id)
    references public.companion_conversations(id, user_id) on delete cascade,
  unique (conversation_id, request_id, role)
);

create index companion_conversations_user_updated_idx
  on public.companion_conversations(user_id, updated_at desc);
create index companion_messages_conversation_created_idx
  on public.companion_messages(conversation_id, created_at);
create index companion_messages_user_idx on public.companion_messages(user_id);

alter table public.companion_conversations enable row level security;
alter table public.companion_messages enable row level security;

grant select, delete on public.companion_conversations to authenticated;
grant select on public.companion_messages to authenticated;
revoke all on public.companion_conversations from anon;
revoke all on public.companion_messages from anon;

create policy "Users can view their Companion conversations"
  on public.companion_conversations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can delete their Companion conversations"
  on public.companion_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can view their Companion messages"
  on public.companion_messages for select to authenticated
  using ((select auth.uid()) = user_id);
