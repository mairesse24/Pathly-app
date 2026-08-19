import assert from "node:assert/strict"
import test from "node:test"

import {
  activeCourseIds,
  filterActiveCourseItems,
} from "../../supabase/functions/_shared/activePlanning.ts"
import { buildSmartPlan } from "../../supabase/functions/_shared/smartPlanning.ts"

test("current planning excludes inactive course work before prioritization", () => {
  const courses = [
    { id: "active", is_active: true, course_code: "CSCE 3600" },
    { id: "inactive", is_active: false, course_code: "MATH 1332" },
  ]
  const ids = activeCourseIds(courses)
  const assignments = filterActiveCourseItems(
    [
      {
        id: "current-assignment",
        course_id: "active",
        title: "Systems programming review",
        due_at: "2026-08-18T18:00:00.000Z",
        estimated_minutes: 45,
        status: "not_started",
      },
      {
        id: "old-assignment",
        course_id: "inactive",
        title: "Old MATH 1332 homework",
        due_at: "2026-08-10T18:00:00.000Z",
        estimated_minutes: 45,
        status: "overdue",
      },
    ],
    ids,
  )

  const plan = buildSmartPlan({
    assignments,
    exams: [],
    studySessions: [],
    courses: courses.filter((course) => ids.has(course.id)),
    timeZone: "America/Chicago",
    now: new Date("2026-08-17T18:00:00.000Z"),
  })

  assert.deepEqual(assignments.map((assignment) => assignment.id), ["current-assignment"])
  assert.deepEqual(plan.priorities.map((priority) => priority.courseId), ["active"])
  assert.doesNotMatch(JSON.stringify(plan), /MATH 1332|old-assignment/i)
})

// Regression for a P0 where live assignments for an active, manually-created
// course (real example: CSCE 3600.004, is_active=true, source=manual) were
// present in Supabase but never reached Course Details/Calendar, while exams
// for the same course rendered fine. The two item types run through this
// exact same filter, with the same course id set -- so this locks in that
// filterActiveCourseItems treats assignments and exams identically for an
// active course, and that an old, deactivated Canvas course's items are
// still correctly excluded (the behavior that must be preserved).
test("an active manually-created course's assignments survive filtering exactly like its exams, while an inactive Canvas course's items are still excluded", () => {
  const courses = [
    { id: "csce-3600-004", is_active: true, course_code: "CSCE 3600.004" },
    { id: "old-canvas-course", is_active: false, course_code: "HIST 1060" },
  ]
  const ids = activeCourseIds(courses)
  assert.ok(ids.has("csce-3600-004"))
  assert.ok(!ids.has("old-canvas-course"))

  const rawAssignments = [
    { id: "see", course_id: "csce-3600-004", title: "see", due_at: "2026-08-18T17:00:00.000Z", estimated_minutes: null, status: "not_started" },
    { id: "regex", course_id: "csce-3600-004", title: "REGEX", due_at: "2026-08-17T23:35:00.000Z", estimated_minutes: null, status: "not_started" },
    { id: "regex-practice", course_id: "csce-3600-004", title: "REGEX Practice", due_at: "2026-08-19T23:35:00.000Z", estimated_minutes: null, status: "not_started" },
    { id: "stale-canvas-hw", course_id: "old-canvas-course", title: "Old Canvas homework", due_at: "2026-08-10T18:00:00.000Z", estimated_minutes: null, status: "overdue" },
  ]
  const rawExams = [
    { id: "exam-i", course_id: "csce-3600-004", title: "EXAM I", exam_at: "2026-09-23T20:25:00.000Z" },
    { id: "stale-canvas-exam", course_id: "old-canvas-course", title: "Old Canvas final", exam_at: "2026-05-01T18:00:00.000Z" },
  ]

  const assignments = filterActiveCourseItems(rawAssignments, ids)
  const exams = filterActiveCourseItems(rawExams, ids)

  assert.deepEqual(assignments.map((a) => a.id).sort(), ["regex", "regex-practice", "see"])
  assert.deepEqual(exams.map((e) => e.id), ["exam-i"])
  assert.equal(assignments.length, rawAssignments.length - 1, "only the inactive course's assignment is dropped")
  assert.equal(exams.length, rawExams.length - 1, "only the inactive course's exam is dropped, same rule as assignments")
})
