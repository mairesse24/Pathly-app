alter table public.requirement_groups
  add column matching_strategy text not null default 'course_options'
  check (matching_strategy in ('course_options', 'degree_total', 'degree_audit_review'));

alter table public.requirement_course_options
  add column prerequisite_text text,
  add column source_note text;

update public.requirement_groups
set matching_strategy = case
  when requirement_type = 'total_degree' then 'degree_total'
  else 'course_options'
end;

with program as (
  insert into public.degree_programs (
    university, degree, major, catalog_year, total_credits_required,
    source_url, source_title, verified_at
  ) values (
    'University of North Texas', 'BS', 'Computer Science', 2025, 120,
    'https://engineering.unt.edu/sites/default/files/2025-2026_Guidebook.pdf',
    'University of North Texas 2025-2026 Undergraduate Academic Guidebook',
    '2026-08-14T00:00:00Z'::timestamptz
  )
  returning id
), aliases as (
  insert into public.degree_program_aliases (program_id, university_alias, major_alias)
  select program.id, 'University of North Texas', alias
  from program
  cross join unnest(array[
    'Computer Science', 'CS', 'B.S. Computer Science', 'BS Computer Science'
  ]) as alias
), groups as (
  insert into public.requirement_groups (
    program_id, name, description, requirement_type, minimum_credits,
    sort_order, matching_strategy
  )
  select id, 'Computer Science Required Courses',
    'Explicitly required CSCE courses in the official 2025-2026 guidebook.',
    'all_courses', 40, 1, 'course_options' from program
  union all select id, 'Mathematics Requirements',
    'Calculus I, Calculus II, Probability Models, and Linear Algebra.',
    'all_courses', 13, 2, 'course_options' from program
  union all select id, 'Supporting Coursework',
    'Digital Logic Design, Technical Writing, and one 4000-level TECM course.',
    'all_courses', 9, 3, 'course_options' from program
  union all select id, 'Science with Lab',
    'Two lab-science selections. Eligible options must be confirmed in the student degree audit.',
    'minimum_credits', 6, 4, 'degree_audit_review' from program
  union all select id, 'CSCE Core Choices',
    'Choose 6 hours from the CSCE Core options shown in the student degree audit.',
    'minimum_credits', 6, 5, 'degree_audit_review' from program
  union all select id, 'CSCE Breadth Choices',
    'Choose 6 hours from the CSCE Breadth options shown in the student degree audit.',
    'minimum_credits', 6, 6, 'degree_audit_review' from program
  union all select id, 'CSCE Option Courses',
    'Choose 6 hours from CSCE Options shown in the student degree audit.',
    'minimum_credits', 6, 7, 'degree_audit_review' from program
  union all select id, 'University Core, College, and Elective Requirements',
    'University core, college requirements, and any electives needed to reach 120 total hours.',
    'total_degree', 120, 8, 'degree_total' from program
  returning id, name
)
insert into public.requirement_course_options (
  group_id, course_code, course_title, credit_hours, prerequisite_text, source_note
)
select groups.id, valueset.course_code, valueset.course_title, valueset.credit_hours,
  valueset.prerequisite_text, 'Verified from the official UNT 2025-2026 Undergraduate Academic Guidebook.'
from groups
join (values
  ('Computer Science Required Courses','CSCE 1010','Discovering Computer Science',3.0,null),
  ('Computer Science Required Courses','CSCE 1015','Computing Tools and Techniques Laboratory',1.0,'Corequisite: CSCE 1030 or CSCE 1035.'),
  ('Computer Science Required Courses','CSCE 1030','Computer Science I',3.0,'Prerequisites: MATH 1100 and CSCE 1010. Corequisite: CSCE 1015.'),
  ('Computer Science Required Courses','CSCE 1040','Computer Science II',3.0,'Prerequisites: MATH 1100 and CSCE 1030.'),
  ('Computer Science Required Courses','CSCE 2100','Foundations of Computing',3.0,'Prerequisite: CSCE 1040 or CSCE 1045. Corequisite: MATH 1710.'),
  ('Computer Science Required Courses','CSCE 2110','Foundations of Data Structures',3.0,'Prerequisite: CSCE 1040 or CSCE 1045.'),
  ('Computer Science Required Courses','CSCE 2610','Assembly Language and Computer Organization',3.0,'Prerequisite: CSCE 2100. Prerequisite or corequisite: EENG 2710.'),
  ('Computer Science Required Courses','CSCE 3444','Software Engineering',3.0,'Prerequisite: CSCE 2110.'),
  ('Computer Science Required Courses','CSCE 3550','Foundations of Computer Security',3.0,'Prerequisite or corequisite: CSCE 2110.'),
  ('Computer Science Required Courses','CSCE 3600','Systems Programming',3.0,'Prerequisites: CSCE 2100 and CSCE 2110.'),
  ('Computer Science Required Courses','CSCE 4010','Social Issues in Computing',3.0,'Prerequisite: CSCE 3600.'),
  ('Computer Science Required Courses','CSCE 4110','Analysis of Algorithms',3.0,'Prerequisite: CSCE 2110.'),
  ('Computer Science Required Courses','CSCE 4901','Capstone I',3.0,'Prerequisites: TECM 2700 and CSCE 3444.'),
  ('Computer Science Required Courses','CSCE 4902','Capstone II',3.0,'Prerequisite: CSCE 4901.'),
  ('Mathematics Requirements','MATH 1710','Calculus I',4.0,'Prerequisite: MATH 1650 or test placement.'),
  ('Mathematics Requirements','MATH 1720','Calculus II',3.0,'Prerequisite: MATH 1710.'),
  ('Mathematics Requirements','MATH 1780','Probability Models',3.0,'Prerequisite: MATH 1710.'),
  ('Mathematics Requirements','MATH 2700','Linear Algebra',3.0,'Prerequisite: MATH 1720.'),
  ('Supporting Coursework','EENG 2710','Digital Logic Design',3.0,null),
  ('Supporting Coursework','TECM 2700','Technical Writing',3.0,'Prerequisite: Communication Core.'),
  ('Supporting Coursework','TECM 4***','4000-level Technical Communication selection',3.0,'Must meet the prerequisite for the selected course.')
) as valueset(group_name,course_code,course_title,credit_hours,prerequisite_text)
  on groups.name = valueset.group_name;

