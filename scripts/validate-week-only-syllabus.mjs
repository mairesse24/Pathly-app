import assert from "node:assert/strict"
import { normalizeSyllabusResult } from "../supabase/functions/_shared/processingSchemas.mjs"

// Mirrors the real CSCE 3444 syllabus: week-based milestones with no
// explicit calendar dates, plus a "Live Final Demos" item that is not
// described as an exam anywhere in the source. Even if the model still put
// these in assignments/exams (as the live extraction once did), the
// safety net must demote every undated item to a milestone and must never
// invent a date.
const weekOnlySyllabus = {
  course_code: "CSCE 3444",
  course_title: "Software Engineering",
  instructor: "Hadiseh Gooran",
  credits: null,
  meeting_days: null,
  meeting_start: null,
  meeting_end: null,
  location: null,
  course_summary: "This course focuses on the modular design and implementation of software systems. Grading: Quiz 30%, Group Project (scaled by peer evaluations) 50%, Individual Assignments 20%.",
  milestones: [],
  assignments: [
    { title: "Project Proposal", description: "Week 2: Project proposals due.", due_at: null, estimated_minutes: null },
    { title: "Project Plan Submission", description: "Week 3: Project plan submission.", due_at: null, estimated_minutes: null },
    { title: "Assignment 1", description: "Week 4: Assignment 1 due.", due_at: null, estimated_minutes: null },
    { title: "SRS", description: "Week 5: SRS due.", due_at: null, estimated_minutes: null },
    { title: "Test Plan", description: "Week 10: Test plan due.", due_at: null, estimated_minutes: null },
    { title: "Final Project Presentations", description: "Week 15: Final Project Presentations.", due_at: null, estimated_minutes: null },
  ],
  exams: [
    { title: "Live Final Demos", exam_at: null, location: null, topics_summary: "Finals: Live final demos." },
  ],
}

const normalized = normalizeSyllabusResult(weekOnlySyllabus)

assert.equal(normalized.milestones.length, 7, "expected all 7 week-based items to become milestones")
assert.equal(normalized.assignments.length, 0, "expected 0 dated assignments -- the source gives no exact dates")
assert.equal(normalized.exams.length, 0, "expected 0 dated exams -- Live Final Demos is not an explicit exam and has no date")
assert.ok(normalized.milestones.some((m) => m.title === "Live Final Demos"), "Live Final Demos must be demoted to a milestone, not kept as an undated exam")
assert.ok(!normalized.exams.some((e) => e.title === "Live Final Demos"), "Live Final Demos must not remain classified as an exam")
const expectedTitles = ["Project Proposal", "Project Plan Submission", "Assignment 1", "SRS", "Test Plan", "Final Project Presentations", "Live Final Demos"]
for (const m of normalized.milestones) assert.ok(expectedTitles.includes(m.title), `unexpected milestone title ${m.title}`)

// Preserved facts must survive normalization untouched -- normalization
// only ever moves schedule items, never rewrites course-level fields.
assert.equal(normalized.course_code, "CSCE 3444")
assert.equal(normalized.instructor, "Hadiseh Gooran")
assert.equal(normalized.credits, null, "credits must not be invented when the syllabus doesn't state them")
assert.equal(normalized.meeting_days, null, "meeting schedule must not be invented when the syllabus doesn't state one")
assert.match(normalized.course_summary, /Quiz 30%/, "grading information must be preserved")

// A genuinely dated, explicitly-labeled exam must NOT be demoted.
const withRealExam = normalizeSyllabusResult({
  ...weekOnlySyllabus,
  exams: [{ title: "Midterm Exam", exam_at: "2026-10-01T14:00:00Z", location: "ENG 230", topics_summary: "Chapters 1-4" }],
})
assert.equal(withRealExam.exams.length, 1, "a dated, explicitly-labeled exam must be kept as an exam")
assert.equal(withRealExam.exams[0].title, "Midterm Exam")
assert.equal(withRealExam.milestones.length, 6, "the 6 undated assignment-shaped items still become milestones")

// A model that already extracts week-only items directly into milestones
// (the well-behaved path, once the extraction instruction is followed)
// must pass through unchanged, with context preserved.
const wellBehaved = normalizeSyllabusResult({
  ...weekOnlySyllabus,
  assignments: [],
  exams: [],
  milestones: [
    { title: "Assignment 1", context: "Week 4", description: "Individual assignment due during UI Design & Accessibility week." },
    { title: "Live Final Demos", context: "Finals", description: "Final live demonstration of the semester-long project during finals week." },
  ],
})
assert.equal(wellBehaved.milestones.length, 2)
assert.equal(wellBehaved.milestones[0].context, "Week 4")
assert.equal(wellBehaved.milestones[1].context, "Finals")
assert.equal(wellBehaved.assignments.length, 0)
assert.equal(wellBehaved.exams.length, 0)

console.log("week-only syllabus schedules normalize to milestones with 0 fabricated dated items")
