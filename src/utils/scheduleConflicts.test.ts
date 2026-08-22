import assert from "node:assert/strict"
import test from "node:test"

import { buildSmartPlan, type PlanningConflict } from "../../supabase/functions/_shared/smartPlanning.ts"
import {
  dismissScheduleConflict,
  firstUndismissedConflict,
  scheduleConflictEditPath,
  scheduleConflictKey,
} from "./scheduleConflicts.ts"

const session = (id: string, start_at: string, end_at: string) => ({
  id,
  course_id: null,
  assignment_id: null,
  title: id,
  start_at,
  end_at,
  status: "scheduled",
})

const input = {
  assignments: [],
  courses: [],
  timeZone: "UTC",
  now: new Date("2026-08-21T08:00:00.000Z"),
}

test("detects Pathly-session, exam, and Google busy-time conflicts without mutating inputs", () => {
  const studySessions = [
    session("proposed", "2026-08-21T15:00:00.000Z", "2026-08-21T16:00:00.000Z"),
    session("existing", "2026-08-21T15:30:00.000Z", "2026-08-21T16:30:00.000Z"),
  ]
  const exams = [{ id: "exam", course_id: "course", title: "Exam", exam_at: "2026-08-21T15:45:00.000Z" }]
  const busyPeriods = [{ id: "google", starts_at: "2026-08-21T14:45:00.000Z", ends_at: "2026-08-21T15:15:00.000Z", source: "google_calendar" as const }]
  const before = JSON.stringify({ studySessions, exams, busyPeriods })

  const plan = buildSmartPlan({ ...input, studySessions, exams, busyPeriods })

  assert.deepEqual(new Set(plan.conflicts.map((conflict) => conflict.source)), new Set(["study_session", "exam", "google_calendar"]))
  assert.equal(JSON.stringify({ studySessions, exams, busyPeriods }), before, "conflict detection must not modify source commitments")
})

test("Edit opens the conflicting study session", () => {
  const [conflict] = buildSmartPlan({
    ...input,
    exams: [],
    studySessions: [
      session("session/one", "2026-08-21T15:00:00.000Z", "2026-08-21T16:00:00.000Z"),
      session("existing", "2026-08-21T15:30:00.000Z", "2026-08-21T16:30:00.000Z"),
    ],
  }).conflicts
  assert.equal(scheduleConflictEditPath(conflict), "/calendar?item=session%2Fone&type=session")
})

test("Dismiss is immediate, idempotent, and only acknowledges the exact conflict occurrence", () => {
  const conflict: PlanningConflict = {
    firstSessionId: "proposed",
    secondSessionId: "busy",
    source: "google_calendar",
    firstStartAt: "2026-08-21T15:00:00.000Z",
    firstEndAt: "2026-08-21T16:00:00.000Z",
    secondStartAt: "2026-08-21T15:30:00.000Z",
    secondEndAt: "2026-08-21T16:30:00.000Z",
    message: "conflict",
  }
  const source = structuredClone(conflict)
  const once = dismissScheduleConflict(new Set(), conflict)
  const twice = dismissScheduleConflict(once, conflict)

  assert.equal(firstUndismissedConflict([conflict], once), null)
  assert.equal(twice.size, 1, "rapid repeated clicks cannot enqueue duplicate work")
  assert.deepEqual(conflict, source, "dismissal must not modify the underlying busy event")

  const future = { ...conflict, firstStartAt: "2026-08-22T15:00:00.000Z", firstEndAt: "2026-08-22T16:00:00.000Z" }
  assert.notEqual(scheduleConflictKey(future), scheduleConflictKey(conflict))
  assert.equal(firstUndismissedConflict([future], once), future, "a later conflict must still be detected")
})
