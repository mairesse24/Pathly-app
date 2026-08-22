import assert from "node:assert/strict"
import test from "node:test"
import { findReusableSyllabusCourse, formatSyllabusCourseOption, syllabusCourseDraft } from "./syllabusCourseCreation.ts"

const course = (id: string, code: string, name: string) => ({ id, user_id: "owner", semester_id: null, course_code: code, course_name: name, credits: null, instructor: null, meeting_days: null, meeting_start: null, meeting_end: null, is_active: true })

test("prefills extracted syllabus identity without changing its content", () => {
  assert.deepEqual(syllabusCourseDraft(" CSCE 4110 ", " Algorithms "), { courseCode: "CSCE 4110", courseTitle: "Algorithms" })
  assert.deepEqual(syllabusCourseDraft("CSCE 4110", null), { courseCode: "CSCE 4110", courseTitle: "CSCE 4110" })
})

test("reuses exact and punctuation-equivalent course codes", () => {
  const courses = [course("existing", "csce-4110", "Algorithms")]
  assert.equal(findReusableSyllabusCourse(courses, "CSCE 4110")?.id, "existing")
  assert.equal(findReusableSyllabusCourse(courses, "4110")?.id, "existing")
  assert.equal(findReusableSyllabusCourse(courses, "MATH 4110"), undefined)
})

test("formats dropdown labels readably without mutating source data", () => {
  const stored = course("existing", " cs ", " programming ")
  assert.equal(formatSyllabusCourseOption(stored), "CS — programming")
  assert.equal(stored.course_code, " cs ")
})
