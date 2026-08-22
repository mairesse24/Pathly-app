import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const migration = read("supabase/migrations/20260821150000_fix_course_details_only_syllabus_approval.sql")
const service = read("src/services/processing.ts")

assert.match(migration, /p_assignments jsonb/)
assert.match(migration, /p_exams jsonb/)
assert.match(migration, /p_course_metadata jsonb default '\{\}'::jsonb/)
assert.match(migration, /p_roadmap jsonb default '\[\]'::jsonb/)
assert.doesNotMatch(migration, /jsonb_array_length\(p_(assignments|exams|roadmap)\)\s*>\s*0/, "empty selected-item arrays must be valid")
assert.match(migration, /assignment_item\.value->>'title'/, "assignment JSON must use an unambiguous qualified alias")
assert.match(migration, /for exam_item in select value/, "exam iteration must not conflict with a SQL alias")
assert.doesNotMatch(migration, /declare[\s\S]*\bitem jsonb;/, "the ambiguous PL/pgSQL item variable must not return")
assert.match(migration, /when p_course_metadata \? 'instructor'/, "only explicitly supplied metadata keys may update a course")
assert.match(migration, /else instructor end/, "omitted metadata must preserve the existing course value")
assert.match(migration, /set status = 'approved', approved_at = now\(\)/, "a metadata-only review must be finalized")
assert.match(migration, /set processing_status = 'processed'/, "the source upload must leave review state")
assert.match(service, /p_assignments: assignments, p_exams: exams[^\n]*p_course_metadata: input\.courseMetadata \|\| \{\}, p_roadmap: roadmap/, "the frontend must send all required JSON arguments, including empty arrays")
assert.match(service, /throw syllabusApprovalError\(error\)/, "PostgREST errors must be converted into visible diagnostic errors")

console.log("course-details-only syllabus approval accepts empty item arrays, updates selected metadata, and finalizes review state")
