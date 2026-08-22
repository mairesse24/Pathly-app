import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")

const migration = read(
  "supabase/migrations/20260817210000_release_safe_course_removal.sql",
).toLowerCase()
const service = read("src/services/courses.ts")
const studyHub = read("src/pages/StudyHub/index.tsx")
const academicContext = read("src/context/AcademicDataContext.tsx")
const canvasService = read("src/services/canvas.ts")

// Ownership and execution stay under the authenticated caller's RLS context.
assert.match(migration, /security invoker/)
assert.match(migration, /user_id\s*=\s*\(select auth\.uid\(\)\)/)
assert.doesNotMatch(migration, /security definer/)
assert.match(
  migration,
  /revoke all on function public\.delete_course_safely\(uuid,text\) from public, anon/,
)
assert.match(
  migration,
  /grant execute on function public\.delete_course_safely\(uuid,text\) to authenticated/,
)

// Student-created work causes archival, not FK cascades. Empty manual courses
// take the delete branch; uploads remain protected by their SET NULL FK.
for (const dependency of [
  "assignments",
  "exams",
  "study_sessions",
  "ai_processing_results",
  "organized_course_notes",
]) {
  assert.match(migration, new RegExp(dependency))
}
assert.match(migration, /p_mode='preserve'[\s\S]+update public\.courses set is_active=false/)
assert.match(migration, /delete from public\.courses/)
assert.doesNotMatch(migration, /completed_courses|degree_programs|user_degree_plans/)
assert.match(migration, /category in \('syllabus','lecture'\)/)
assert.match(migration, /update public\.uploaded_files set course_id=null/)

// The impact is shown before confirmation, and confirmed removal always reaches
// the RPC instead of being blocked by a frontend-only linked-data exception.
assert.match(service, /get_course_removal_impact/)
assert.match(service, /delete_course_safely/)
assert.match(studyHub, /<Dialog/)
assert.match(studyHub, /linked academic content/)
assert.match(studyHub, /Keep materials and remove course/)
assert.match(studyHub, /Delete course and associated materials/)
assert.doesNotMatch(studyHub, /if\s*\(linked\)\s*throw/)
assert.match(academicContext, /setCourses\(current=>current\.filter/)
assert.match(academicContext, /await load\(\)/)

// Canvas disconnection remains on its existing edge-function path.
assert.match(canvasService, /functions\.invoke\("canvas-disconnect"/)

console.log("course removal safety checks passed")
