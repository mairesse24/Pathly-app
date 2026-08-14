create index companion_messages_conversation_owner_idx
  on public.companion_messages(conversation_id, user_id);
