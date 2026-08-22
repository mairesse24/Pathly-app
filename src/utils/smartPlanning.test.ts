import assert from "node:assert/strict"
import test from "node:test"

import { buildSmartPlan } from "../../supabase/functions/_shared/smartPlanning.ts"

const now = new Date("2026-08-17T18:00:00.000Z")
const timeZone = "America/Chicago"
const courses = [{ id: "course-1", course_code: "CSCE 3600", course_name: "Systems Programming" }]

test("two overdue incomplete assignments both surface as unresolved, without per-item submission questions baked into the reason", () => {
  const plan = buildSmartPlan({
    assignments: [
      { id: "a1", course_id: "course-1", title: "Lab 3", due_at: "2026-08-15T18:00:00.000Z", estimated_minutes: 30, status: "not_started" },
      { id: "a2", course_id: "course-1", title: "Lab 4", due_at: "2026-08-16T18:00:00.000Z", estimated_minutes: 30, status: "not_started" },
    ],
    exams: [],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  assert.equal(plan.priorities.length, 2)
  for (const priority of plan.priorities) {
    assert.equal(priority.overdue, true)
    assert.equal(priority.needsStatusConfirmation, true)
    assert.doesNotMatch(priority.reason, /did you submit/i)
  }
  assert.equal(plan.unresolvedSubmissionStatus, true)
})

test("a completed assignment is never surfaced as unfinished work", () => {
  const plan = buildSmartPlan({
    assignments: [
      { id: "done", course_id: "course-1", title: "Lab 1", due_at: "2026-08-10T18:00:00.000Z", estimated_minutes: 30, status: "completed" },
      { id: "open", course_id: "course-1", title: "Lab 2", due_at: "2026-08-18T18:00:00.000Z", estimated_minutes: 30, status: "not_started" },
    ],
    exams: [],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  assert.deepEqual(plan.priorities.map((priority) => priority.id), ["open"])
})

test("an incomplete assignment with a future due date is flagged upcoming, not overdue, and needs no confirmation", () => {
  const plan = buildSmartPlan({
    assignments: [
      { id: "upcoming", course_id: "course-1", title: "Essay draft", due_at: "2026-08-19T18:00:00.000Z", estimated_minutes: 60, status: "not_started" },
    ],
    exams: [],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  const [priority] = plan.priorities
  assert.equal(priority.overdue, false)
  assert.equal(priority.needsStatusConfirmation, false)
  assert.match(priority.reason, /due in|due today|due within/i)
})

test("an upcoming exam surfaces with exam-review context and no fabricated estimate", () => {
  const plan = buildSmartPlan({
    assignments: [],
    exams: [{ id: "exam-1", course_id: "course-1", title: "Midterm", exam_at: "2026-08-20T18:00:00.000Z" }],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  const [priority] = plan.priorities
  assert.equal(priority.kind, "exam")
  assert.equal(priority.hasEstimate, false)
  assert.match(priority.reason, /exam in \d+ day/i)
})

test("no urgent work yields an empty plan with no fabricated totals", () => {
  const plan = buildSmartPlan({
    assignments: [],
    exams: [],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  assert.deepEqual(plan.priorities, [])
  assert.equal(plan.totalEstimatedMinutes, null)
  assert.equal(plan.unresolvedSubmissionStatus, false)
})

test("a Canvas item with a known submission status is treated as resolved, not asked about", () => {
  const plan = buildSmartPlan({
    assignments: [
      {
        id: "canvas-missing",
        course_id: "course-1",
        title: "Homework 5",
        due_at: "2026-08-16T18:00:00.000Z",
        estimated_minutes: 20,
        status: "not_started",
        canvas_submission_status: "missing",
      },
    ],
    exams: [],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  const [priority] = plan.priorities
  assert.equal(priority.overdue, true)
  assert.equal(priority.needsStatusConfirmation, false)
  assert.match(priority.reason, /canvas confirms/i)
})

test("an item whose external submission status is genuinely unknown is flagged for exactly one caveat", () => {
  const plan = buildSmartPlan({
    assignments: [
      { id: "manual-overdue", course_id: "course-1", title: "Reading response", due_at: "2026-08-15T18:00:00.000Z", estimated_minutes: 15, status: "not_started" },
    ],
    exams: [],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  const [priority] = plan.priorities
  assert.equal(priority.needsStatusConfirmation, true)
  assert.equal(plan.unresolvedSubmissionStatus, true)
  assert.doesNotMatch(priority.reason, /did you submit/i)
})

test("totalEstimatedMinutes only counts priorities with a real stored estimate", () => {
  const plan = buildSmartPlan({
    assignments: [
      { id: "estimated", course_id: "course-1", title: "Problem set", due_at: "2026-08-18T18:00:00.000Z", estimated_minutes: 40, status: "not_started" },
    ],
    exams: [{ id: "exam-1", course_id: "course-1", title: "Midterm", exam_at: "2026-08-20T18:00:00.000Z" }],
    studySessions: [],
    courses,
    timeZone,
    now,
  })

  const estimated = plan.priorities.find((priority) => priority.id === "estimated")
  const exam = plan.priorities.find((priority) => priority.id === "exam-1")
  assert.ok(estimated?.hasEstimate)
  assert.equal(exam?.hasEstimate, false)
  assert.equal(plan.totalEstimatedMinutes, estimated?.suggestedMinutes)
})
