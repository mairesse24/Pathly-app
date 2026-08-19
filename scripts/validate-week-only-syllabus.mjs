import assert from "node:assert/strict"
import { normalizeSyllabusResult } from "../supabase/functions/_shared/processingSchemas.mjs"

// Mirrors the real CSCE 3444 (Software Engineering) syllabus schedule:
//   Week 1 -- Introduction; Team creation activity
//   Week 2 -- Process Models; Project proposals due
//   Week 3 -- Requirements gathering and analysis; Project plan submission
//   Week 4 -- UI Design & Accessibility; Assignment 1 due
//   Week 5 -- Software Design & Best Practices; SRS due
//   Week 10 -- Testing & Integration; Test plan due
//   Week 15 -- Final Project Presentations
//   Finals -- Live final demos
// None of these rows carries a concrete calendar date. The regression this
// guards against: they must become 8 course-roadmap entries (topic +
// deliverable kept separate), never 8 (or, historically, 14 once exams were
// counted too) generic assignments literally titled "Week 1", "Week 2", etc.
const csce3444Schedule = [
  { period_label: "Week 1", topic: "Introduction", description: null, deliverable: "Team creation activity", date: null },
  { period_label: "Week 2", topic: "Process Models", description: null, deliverable: "Project proposals due", date: null },
  { period_label: "Week 3", topic: "Requirements gathering and analysis", description: null, deliverable: "Project plan submission", date: null },
  { period_label: "Week 4", topic: "UI Design & Accessibility", description: null, deliverable: "Assignment 1 due", date: null },
  { period_label: "Week 5", topic: "Software Design & Best Practices", description: null, deliverable: "SRS due", date: null },
  { period_label: "Week 10", topic: "Testing & Integration", description: null, deliverable: "Test plan due", date: null },
  { period_label: "Week 15", topic: "Final Project Presentations", description: null, deliverable: null, date: null },
  { period_label: "Finals", topic: "Live final demos", description: null, deliverable: null, date: null },
]

const base = {
  course_code: "CSCE 3444",
  course_title: "Software Engineering",
  instructor: "Hadiseh Gooran",
  credits: null,
  meeting_days: null,
  meeting_start: null,
  meeting_end: null,
  location: null,
  course_summary: "This course focuses on the modular design and implementation of software systems. Grading: Quiz 30%, Group Project (scaled by peer evaluations) 50%, Individual Assignments 20%.",
}

// The well-behaved path: the model follows the new roadmap-aware
// instruction and returns these 8 rows directly as roadmap entries, with
// 0 assignments/exams (nothing in this schedule table carries a concrete
// date). normalizeSyllabusResult must pass them through unchanged --
// topic and deliverable stay distinct fields, never collapsed into one
// generic "Week N" title.
const wellBehaved = normalizeSyllabusResult({ ...base, roadmap: csce3444Schedule, assignments: [], exams: [] })
assert.equal(wellBehaved.roadmap.length, 8, "expected all 8 week/period rows to become roadmap entries")
assert.equal(wellBehaved.assignments.length, 0, "expected 0 dated assignments -- the schedule table gives no exact dates")
assert.equal(wellBehaved.exams.length, 0, "expected 0 dated exams -- Live final demos is not an explicit exam and has no date")
const week4 = wellBehaved.roadmap.find((entry) => entry.period_label === "Week 4")
assert.equal(week4.topic, "UI Design & Accessibility", "topic must stay the real lecture topic, not a generic label")
assert.equal(week4.deliverable, "Assignment 1 due", "deliverable text must be preserved separately from the topic")
const finals = wellBehaved.roadmap.find((entry) => entry.period_label === "Finals")
assert.equal(finals.topic, "Live final demos")
assert.equal(finals.deliverable, null)

// The regression path: even if the model (or a stale cached extraction)
// still dumps these into assignments/exams as undated, generically-titled
// rows -- "Week 1", "Week 2", ... "Finals" -- the safety net must demote
// every one of them to a roadmap entry. This is the literal bug the task
// describes: 8 fake undated assignments must never survive.
const regressed = normalizeSyllabusResult({
  ...base,
  roadmap: [],
  assignments: csce3444Schedule.slice(0, 6).map((entry) => ({ title: entry.period_label, description: `${entry.topic}${entry.deliverable ? `; ${entry.deliverable}` : ""}`, due_at: null, estimated_minutes: null })),
  exams: csce3444Schedule.slice(6).map((entry) => ({ title: entry.period_label, exam_at: null, location: null, topics_summary: entry.topic })),
})
assert.equal(regressed.assignments.length, 0, "no week-labeled row may survive as an undated assignment")
assert.equal(regressed.exams.length, 0, "no week-labeled row may survive as an undated exam")
assert.equal(regressed.roadmap.length, 8, "all 8 week-labeled rows must be demoted to roadmap entries")
for (const label of ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Week 10", "Week 15", "Finals"]) {
  assert.ok(regressed.roadmap.some((entry) => entry.topic === label), `expected a demoted roadmap entry for ${label}`)
}
assert.ok(!regressed.roadmap.some((entry) => /^week \d+$/i.test(entry.period_label || "")), "demoted entries have no period_label -- the week number was only ever the assignment title, never real period context")

// A schedule can coexist with genuinely dated facts elsewhere in the same
// document (e.g. a separate "important dates" list). Assignments/exams
// stay independent of the roadmap: a deliverable that also has a real
// printed date elsewhere must still reach Calendar normally.
const withRealDueDate = normalizeSyllabusResult({
  ...base,
  roadmap: csce3444Schedule,
  assignments: [{ title: "Assignment 1", description: "Individual assignment.", due_at: "2026-09-22T23:59:00Z", estimated_minutes: 120 }],
  exams: [],
})
assert.equal(withRealDueDate.assignments.length, 1, "a deliverable with a genuine printed date must still become a real assignment")
assert.equal(withRealDueDate.roadmap.length, 8, "the roadmap entries themselves are untouched by a coexisting dated assignment")

// Preserved facts must survive normalization untouched -- normalization
// only ever moves schedule items, never rewrites course-level fields.
// Instructor "Hadiseh Gooran" in particular must not be dropped anywhere
// in this pipeline, since it's what approve_syllabus_processing later
// writes onto the course.
assert.equal(wellBehaved.course_code, "CSCE 3444")
assert.equal(wellBehaved.instructor, "Hadiseh Gooran")
assert.equal(wellBehaved.credits, null, "credits must not be invented when the syllabus doesn't state them")
assert.equal(wellBehaved.meeting_days, null, "meeting schedule must not be invented when the syllabus doesn't state one")
assert.match(wellBehaved.course_summary, /Quiz 30%/, "grading information must be preserved")

// A genuinely dated, explicitly-labeled exam must NOT be demoted.
const withRealExam = normalizeSyllabusResult({
  ...base,
  roadmap: csce3444Schedule,
  assignments: [],
  exams: [{ title: "Midterm Exam", exam_at: "2026-10-01T14:00:00Z", location: "ENG 230", topics_summary: "Chapters 1-4" }],
})
assert.equal(withRealExam.exams.length, 1, "a dated, explicitly-labeled exam must be kept as an exam")
assert.equal(withRealExam.exams[0].title, "Midterm Exam")
assert.equal(withRealExam.roadmap.length, 8, "the week/period roadmap is independent of a coexisting dated exam")

console.log("CSCE 3444 week-based syllabus schedule normalizes to 8 roadmap entries, 0 fabricated assignments/exams")
