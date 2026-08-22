import assert from "node:assert/strict"
import { normalizeSyllabusResult } from "../supabase/functions/_shared/processingSchemas.mjs"

// Reproduces the real reported bug shape: a syllabus schedule table where
// holiday/no-class rows carry a concrete date, same as real deliverables.
// Even if the model still put these in assignments/exams, the normalizer's
// holiday safety net must demote them to roadmap entries regardless of date.
const base = {
  course_code: "CSCE 3600.004",
  course_title: "Systems Programming",
  instructor: null, credits: null, meeting_days: null, meeting_start: null, meeting_end: null, location: null,
  course_summary: "Systems programming course.",
  roadmap: [],
}

const withHolidaysAndTopics = normalizeSyllabusResult({
  ...base,
  assignments: [
    { title: "REGEX Practice", description: null, due_at: "2026-09-10T23:59:00Z", estimated_minutes: 60 },
    { title: "Assignment 1", description: null, due_at: "2026-09-17T23:59:00Z", estimated_minutes: 120 },
    { title: "Labor Day Holiday", description: "No class.", due_at: "2026-09-07T00:00:00Z", estimated_minutes: null },
    { title: "Thanksgiving Holiday", description: "No class.", due_at: "2026-11-26T00:00:00Z", estimated_minutes: null },
  ],
  exams: [
    { title: "EXAM I", exam_at: "2026-10-01T14:00:00Z", location: "ENG 230", topics_summary: "Chapters 1-4" },
    { title: "Fall Break", exam_at: "2026-10-15T00:00:00Z", location: null, topics_summary: "No class." },
  ],
})

// Real deliverables and the real exam survive untouched -- titles are
// preserved exactly as extracted, never replaced with a generic label.
assert.equal(withHolidaysAndTopics.assignments.length, 2, "REGEX Practice and Assignment 1 must remain assignments")
assert.deepEqual(withHolidaysAndTopics.assignments.map((a) => a.title).sort(), ["Assignment 1", "REGEX Practice"])
assert.equal(withHolidaysAndTopics.exams.length, 1, "only the explicitly-labeled exam must remain an exam")
assert.equal(withHolidaysAndTopics.exams[0].title, "EXAM I")

// Holiday/no-class rows are demoted to roadmap entries even though they
// carry a concrete date -- the safety net checks for holiday language, not
// just date-presence.
assert.ok(withHolidaysAndTopics.roadmap.some((entry) => entry.topic === "Labor Day Holiday"), "Labor Day Holiday must be demoted to a roadmap entry")
assert.ok(withHolidaysAndTopics.roadmap.some((entry) => entry.topic === "Thanksgiving Holiday"), "Thanksgiving Holiday must be demoted to a roadmap entry")
assert.ok(withHolidaysAndTopics.roadmap.some((entry) => entry.topic === "Fall Break"), "Fall Break must be demoted to a roadmap entry even though it was extracted into exams")
assert.ok(!withHolidaysAndTopics.assignments.some((a) => /holiday/i.test(a.title)), "no holiday-titled row may remain in assignments")
assert.ok(!withHolidaysAndTopics.exams.some((e) => /break/i.test(e.title)), "no break-titled row may remain in exams")

// A dated assignment that just happens to contain "class" in an unrelated
// word must not be caught by the holiday pattern (word-boundary check).
const noFalsePositive = normalizeSyllabusResult({
  ...base,
  assignments: [{ title: "Classify the Grammar", description: null, due_at: "2026-09-20T23:59:00Z", estimated_minutes: 90 }],
  exams: [],
})
assert.equal(noFalsePositive.assignments.length, 1, "\"Classify the Grammar\" must not be caught by the no-class/holiday pattern")

console.log("holiday/no-class syllabus rows normalize to roadmap without touching real deliverables")
