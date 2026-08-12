alter table public.profiles
add column catalog_year integer,
add column expected_graduation_term text,
add constraint profiles_catalog_year_check check (catalog_year between 1900 and 2200),
add constraint profiles_expected_graduation_term_check check (expected_graduation_term in ('Spring','Summer','Fall','Winter'));
