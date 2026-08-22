import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const review = readFileSync(new URL("../src/components/uploads/ProcessingReview.tsx", import.meta.url), "utf8")
const context = readFileSync(new URL("../src/context/AcademicDataContext.tsx", import.meta.url), "utf8")
const reassociation = readFileSync(new URL("../supabase/migrations/20260817180000_reassociate_syllabus_processing_course.sql", import.meta.url), "utf8")

assert.match(review, /Use an existing Pathly course/)
assert.match(review, /Confirm selected course/)
assert.match(review, /Create a new course from this syllabus/)
assert.match(review, /Course code<input[^>]*value=\{newCourseCode\}/)
assert.match(review, /Course title<input[^>]*value=\{newCourseTitle\}/)
assert.match(review, /syllabusCourseDraft\(initial\.course_code,initial\.course_title\)/)

const create = review.slice(review.indexOf("async function createNewCourse"), review.indexOf("async function createIdentifiedCourse"))
assert.match(create, /if\(courseActionBusy\)return/, "repeated clicks must be ignored while creation is in flight")
assert.match(create, /findReusableSyllabusCourse\(allCourses,code\)/, "normalized duplicate codes must reuse the owned course")
assert.ok(create.indexOf("await addCourse") < create.indexOf("await reassociateSyllabusCourse"), "the new owned course must be created before reassociation")
assert.doesNotMatch(create, /approveSyllabus|onApproved/, "course creation must never approve the review")
assert.match(review, /disabled=\{courseActionBusy\|\|!newCourseCode\.trim\(\)\|\|!newCourseTitle\.trim\(\)\}/)

assert.match(context, /if \(!user\) throw new Error\("You must be signed in to add a course"\)/)
assert.match(context, /user_id: user\.id/)
assert.match(reassociation, /user_id = \(select auth\.uid\(\)\)[\s\S]*kind = 'syllabus' and status = 'ready_for_review'/)
assert.match(reassociation, /select 1 from public\.courses where id = p_course_id and user_id = processing\.user_id/)
assert.doesNotMatch(create, /assignments|exams|roadmap/, "creation/reassociation must not write review candidates")

console.log("Syllabus uncertain-match course creation: choices, prefill, owner scope, ready-review preservation, and duplicate-click safety verified")
