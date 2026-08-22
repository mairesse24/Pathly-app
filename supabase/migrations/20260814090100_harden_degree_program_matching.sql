alter function public.match_degree_program(text, text, integer) security invoker;

grant select on table public.degree_program_aliases to authenticated;

create policy "Authenticated users can read reviewed program aliases"
  on public.degree_program_aliases
  for select
  to authenticated
  using (true);
