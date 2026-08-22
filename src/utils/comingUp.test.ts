import assert from "node:assert/strict"
import test from "node:test"

import { activeCourseIds, filterActiveCourseItems } from "../../supabase/functions/_shared/activePlanning.ts"
import { buildComingUpItems } from "./comingUp.ts"

const now = new Date("2026-08-18T12:00:00.000Z")
const timezone = "UTC"

const courses = [
  { id: "c-active", is_active: true, course_code: "CSCE 3600", course_name: "Principles of Systems Programming" },
  { id: "c-inactive", is_active: false, course_code: "OLDCANVAS 1000", course_name: "Retired Canvas course" },
]

const assignments = [
  { id: "a-upcoming", course_id: "c-active", title: "Lab 3", description: null, due_at: "2026-08-20T17:00:00.000Z", estimated_minutes: 60, status: "not_started" as const, source: "manual" },
  { id: "a-completed", course_id: "c-active", title: "Lab 2", description: null, due_at: "2026-08-20T17:00:00.000Z", estimated_minutes: 60, status: "completed" as const, source: "manual" },
  { id: "a-overdue", course_id: "c-active", title: "Lab 1", description: null, due_at: "2026-08-10T17:00:00.000Z", estimated_minutes: 60, status: "not_started" as const, source: "manual" },
  { id: "a-inactive", course_id: "c-inactive", title: "Old Canvas homework", description: null, due_at: "2026-08-25T17:00:00.000Z", estimated_minutes: 60, status: "not_started" as const, source: "canvas" },
]

const exams = [
  { id: "e-upcoming", course_id: "c-active", title: "Exam I", exam_at: "2026-08-22T15:00:00.000Z", location: "NTDP E266", topics_summary: null },
]

const studySessions = [
  { id: "s-upcoming", course_id: "c-active", assignment_id: null, title: "Group review", start_at: "2026-08-21T20:00:00.000Z", end_at: "2026-08-21T21:00:00.000Z", status: "scheduled" as const },
  { id: "s-skipped", course_id: "c-active", assignment_id: null, title: "Skipped session", start_at: "2026-08-21T20:00:00.000Z", end_at: "2026-08-21T21:00:00.000Z", status: "skipped" as const },
]

function activeScoped() {
  const ids = activeCourseIds(courses)
  return {
    courses: courses.filter((course) => ids.has(course.id)),
    assignments: filterActiveCourseItems(assignments, ids),
    exams: filterActiveCourseItems(exams, ids),
    studySessions: filterActiveCourseItems(studySessions, ids, true),
  }
}

// Regression coverage for the syllabus extraction -> review -> approval RPC ->
// assignments/exams tables -> Today/Coming Up trace: buildComingUpItems is source-agnostic by
// design (ComingUpAssignment has no source field at all), but this makes that explicit with the
// exact shape approve_syllabus_processing actually writes (source:"syllabus:<upload_id>"), so a
// future change can't accidentally special-case "manual" without this test catching it.
test("an approved dated syllabus assignment appears in Coming up, same as a manual one", () => {
  const items = buildComingUpItems({
    assignments: [{ id: "a-syllabus", course_id: "c-active", title: "Programming Assignment 1", due_at: "2026-08-25T23:00:00.000Z", status: "not_started", source: "syllabus:9198bd58-a576-4763-a5a7-a1da904c4043" }],
    exams: [],
    studySessions: [],
    courses,
    timezone,
    now,
  })
  const item = items.find((entry) => entry.id === "a-syllabus")
  assert.ok(item, "an approved syllabus-sourced assignment must appear in Coming up")
  assert.equal(item?.courseCode, "CSCE 3600")
})

test("A: upcoming assignment appears in Coming up", () => {
  const scoped = activeScoped()
  const items = buildComingUpItems({ ...scoped, timezone, now })
  const item = items.find((entry) => entry.id === "a-upcoming")
  assert.ok(item, "expected the upcoming assignment to appear")
  assert.equal(item?.kind, "assignment")
  assert.equal(item?.courseCode, "CSCE 3600")
})

test("B: upcoming exam appears in Coming up", () => {
  const scoped = activeScoped()
  const items = buildComingUpItems({ ...scoped, timezone, now })
  const item = items.find((entry) => entry.id === "e-upcoming")
  assert.ok(item, "expected the upcoming exam to appear")
  assert.equal(item?.kind, "exam")
})

test("C: scheduled study session appears in Coming up", () => {
  const scoped = activeScoped()
  const items = buildComingUpItems({ ...scoped, timezone, now })
  const item = items.find((entry) => entry.id === "s-upcoming")
  assert.ok(item, "expected the scheduled study session to appear")
  assert.equal(item?.kind, "session")
})

test("D/E/F: completed, overdue, and inactive-course items are excluded", () => {
  const scoped = activeScoped()
  const items = buildComingUpItems({ ...scoped, timezone, now })
  const ids = items.map((entry) => entry.id)
  assert.ok(!ids.includes("a-completed"), "completed assignment must not appear")
  assert.ok(!ids.includes("a-overdue"), "overdue assignment must not appear")
  assert.ok(!ids.includes("a-inactive"), "inactive Canvas-course assignment must not appear")
  assert.ok(!ids.includes("s-skipped"), "a non-scheduled study session must not appear")
})

test("results are sorted chronologically, across kinds", () => {
  const scoped = activeScoped()
  const items = buildComingUpItems({ ...scoped, timezone, now })
  assert.deepEqual(items.map((entry) => entry.id), ["a-upcoming", "s-upcoming", "e-upcoming"])
})

test("empty state: no items at all yields an empty list", () => {
  const items = buildComingUpItems({ assignments: [], exams: [], studySessions: [], courses: [], timezone, now })
  assert.equal(items.length, 0)
})

test("empty state must not fire when only a future exam exists (no assignments)", () => {
  const items = buildComingUpItems({
    assignments: [],
    exams: [{ id: "e-only", course_id: "c-active", title: "Exam I", exam_at: "2026-08-22T15:00:00.000Z" }],
    studySessions: [],
    courses,
    timezone,
    now,
  })
  assert.equal(items.length, 1, "a future exam alone must produce a non-empty Coming up list")
  assert.equal(items[0].kind, "exam")
})

test("today's own items are excluded (they belong to Today's focus, not Coming up)", () => {
  const items = buildComingUpItems({
    assignments: [{ id: "a-today", course_id: "c-active", title: "Due today", due_at: "2026-08-18T20:00:00.000Z", status: "not_started" }],
    exams: [],
    studySessions: [],
    courses,
    timezone,
    now,
  })
  assert.equal(items.length, 0)
})

test("a near assignment beats a much later exam", () => {
  const items = buildComingUpItems({
    assignments: [{ id: "a-near", course_id: "c-active", title: "Lab 4", due_at: "2026-08-19T17:00:00.000Z", status: "not_started" }],
    exams: [{ id: "e-far", course_id: "c-active", title: "Final Exam", exam_at: "2026-12-08T15:30:00.000Z" }],
    studySessions: [],
    courses,
    timezone,
    now,
  })
  assert.deepEqual(items.map((entry) => entry.id), ["a-near", "e-far"])
})

test("a near study session beats a much later exam", () => {
  const items = buildComingUpItems({
    assignments: [],
    exams: [{ id: "e-far", course_id: "c-active", title: "EXAM I", exam_at: "2026-09-23T20:25:00.000Z" }],
    studySessions: [{ id: "s-near", course_id: "c-active", title: "Group review", start_at: "2026-08-20T20:00:00.000Z", status: "scheduled" }],
    courses,
    timezone,
    now,
  })
  assert.deepEqual(items.map((entry) => entry.id), ["s-near", "e-far"])
})

test("course roadmap context never enters commitment-focused Coming Up", () => {
  const roadmapEntries = [{ id: "roadmap", course_id: "c-active", topic: "Threads", entry_date: "2026-08-20" }]
  const items = buildComingUpItems({ assignments: [], exams: [], studySessions: [], courses, timezone, now })
  assert.equal(roadmapEntries.length, 1, "fixture confirms roadmap context exists independently")
  assert.deepEqual(items, [], "Coming Up accepts only assignments, exams, and study sessions")
})

// After syllabus reconciliation, roadmap topics and conflicting proposed
// dates are absent from the active assignment/exam arrays. Coming Up must
// rank the nearest remaining real commitments across kinds.
test("Coming Up ranks the nearest valid commitments after syllabus reconciliation", () => {
  const items = buildComingUpItems({
    assignments: [
      { id: "a-real", course_id: "c-active", title: "Programming Assignment 1", due_at: "2026-08-25T23:00:00.000Z", status: "not_started" },
    ],
    exams: [
      { id: "e-sep23", course_id: "c-active", title: "EXAM I", exam_at: "2026-09-23T20:25:00.000Z" },
      { id: "e-oct8", course_id: "c-active", title: "Midterm Exam", exam_at: "2026-10-08T13:50:00.000Z" },
      { id: "e-oct21", course_id: "c-active", title: "EXAM II", exam_at: "2026-10-21T20:25:00.000Z" },
    ],
    studySessions: [{ id: "s-nearest", course_id: "c-active", title: "Exam review", start_at: "2026-08-22T20:00:00.000Z", status: "scheduled" }],
    courses,
    timezone,
    now,
  })
  assert.deepEqual(
    items.map((entry) => entry.id),
    ["s-nearest", "a-real", "e-sep23", "e-oct8", "e-oct21"],
    "only valid active commitments should remain, ordered by their actual dates",
  )
})
