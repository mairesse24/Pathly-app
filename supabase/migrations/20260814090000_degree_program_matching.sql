create table public.degree_program_aliases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.degree_programs(id) on delete cascade,
  university_alias text not null,
  major_alias text not null,
  created_at timestamptz not null default now()
);

create unique index degree_program_aliases_normalized_unique
  on public.degree_program_aliases (
    program_id,
    lower(regexp_replace(btrim(university_alias), '\s+', ' ', 'g')),
    lower(regexp_replace(btrim(major_alias), '\s+', ' ', 'g'))
  );

alter table public.degree_program_aliases enable row level security;
revoke all on table public.degree_program_aliases from anon, authenticated;

insert into public.degree_program_aliases (program_id, university_alias, major_alias)
select id, 'University of North Texas', alias
from public.degree_programs
cross join unnest(array[
  'Computer Science',
  'CS',
  'B.S. Computer Science',
  'BS Computer Science'
]) as alias
where university = 'University of North Texas'
  and major = 'Computer Science';

create or replace function public.match_degree_program(
  p_university text,
  p_major text,
  p_catalog_year integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  matched_program public.degree_programs%rowtype;
  canonical_university text;
  canonical_major text;
  supported_years integer[];
  missing_fields text[] := array[]::text[];
begin
  if nullif(btrim(p_university), '') is null then
    missing_fields := array_append(missing_fields, 'university');
  end if;
  if nullif(btrim(p_major), '') is null then
    missing_fields := array_append(missing_fields, 'major');
  end if;
  if cardinality(missing_fields) > 0 then
    return jsonb_build_object(
      'status', 'missing_academic_details',
      'missing_fields', to_jsonb(missing_fields),
      'supported_catalog_years', '[]'::jsonb,
      'program', null,
      'message', 'Add your ' || array_to_string(missing_fields, ' and ') || ' in Academic Details so Pathly can look for verified requirements.'
    );
  end if;

  select dp.university, dp.major, array_agg(distinct dp.catalog_year order by dp.catalog_year)
  into canonical_university, canonical_major, supported_years
  from public.degree_program_aliases dpa
  join public.degree_programs dp on dp.id = dpa.program_id
  where lower(regexp_replace(btrim(dpa.university_alias), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_university), '\s+', ' ', 'g'))
    and lower(regexp_replace(btrim(dpa.major_alias), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_major), '\s+', ' ', 'g'))
  group by dp.university, dp.major
  order by dp.university, dp.major
  limit 1;

  if canonical_university is null then
    return jsonb_build_object(
      'status', 'program_unavailable',
      'missing_fields', '[]'::jsonb,
      'supported_catalog_years', '[]'::jsonb,
      'program', null,
      'message', 'Pathly does not have verified requirements for this university and major yet.'
    );
  end if;

  if p_catalog_year is null then
    return jsonb_build_object(
      'status', 'missing_catalog_year',
      'canonical_university', canonical_university,
      'canonical_major', canonical_major,
      'missing_fields', jsonb_build_array('catalog_year'),
      'supported_catalog_years', to_jsonb(supported_years),
      'program', null,
      'message', 'Pathly found a verified ' || canonical_university || ' ' || canonical_major || ' program, but your catalog year is missing.'
    );
  end if;

  select dp.* into matched_program
  from public.degree_program_aliases dpa
  join public.degree_programs dp on dp.id = dpa.program_id
  where lower(regexp_replace(btrim(dpa.university_alias), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_university), '\s+', ' ', 'g'))
    and lower(regexp_replace(btrim(dpa.major_alias), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(p_major), '\s+', ' ', 'g'))
    and dp.catalog_year = p_catalog_year
  limit 1;

  if matched_program.id is null then
    return jsonb_build_object(
      'status', 'unsupported_catalog_year',
      'canonical_university', canonical_university,
      'canonical_major', canonical_major,
      'missing_fields', '[]'::jsonb,
      'supported_catalog_years', to_jsonb(supported_years),
      'program', null,
      'message', 'Pathly found the verified ' || canonical_university || ' ' || canonical_major || ' program, but does not have verified requirements for your ' || p_catalog_year || ' catalog.'
    );
  end if;

  return jsonb_build_object(
    'status', 'matched',
    'canonical_university', matched_program.university,
    'canonical_major', matched_program.major,
    'missing_fields', '[]'::jsonb,
    'supported_catalog_years', to_jsonb(supported_years),
    'program', to_jsonb(matched_program),
    'message', 'Verified program matched.'
  );
end;
$$;

revoke all on function public.match_degree_program(text, text, integer) from public, anon;
grant execute on function public.match_degree_program(text, text, integer) to authenticated;
