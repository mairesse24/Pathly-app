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
