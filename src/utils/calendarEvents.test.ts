import assert from "node:assert/strict"
import test from "node:test"

import { buildCalendarEvents } from "./calendarEvents.ts"
import { weekKeys } from "./dateTime.ts"

// Regression coverage for the syllabus extraction -> review -> approval RPC -> assignments/exams
// tables -> Calendar query trace: proves what the main commitment Calendar actually renders,
// using the shapes and real dates verified live against qyteadrlrsjuhtwggayk (CSCE 3600's real
// syllabus-sourced EXAM I/II/III, and a representative dated assignment in the same shape
// approve_syllabus_processing produces -- source:"syllabus:<upload_id>", not "manual"/"canvas").

const timezone = "America/Chicago"
const today = "2026-08-21"
const days = weekKeys(timezone, new Date("2026-08-21T18:00:00.000Z"))

const courses = [
  { id: "csce-3600", course_code: "CSCE 3600" },
  { id: "csce-4350", course_code: "CSCE 4350" },
]

test("an approved dated syllabus assignment appears on the Calendar, tagged to its course", () => {
  const assignments = [
    { id: "a-syllabus", course_id: "csce-3600", title: "Programming Assignment 1", due_at: "2026-08-21T23:59:00.000Z", status: "not_started", source: "syllabus:9198bd58-a576-4763-a5a7-a1da904c4043" },
  ]
  const events = buildCalendarEvents({ assignments, exams: [], studySessions: [], courses, days, today, timezone })
  const event = events.find((entry) => entry.id === "a-syllabus")
  assert.ok(event, "the approved syllabus assignment must produce a Calendar event")
  assert.equal(event?.kind, "assignment")
  assert.equal(event?.title, "CSCE 3600 — Programming Assignment 1")
  assert.notEqual(event?.day, -1, "its due date must land inside the displayed week")
})

test("an approved syllabus exam appears on the Calendar too", () => {
  // Real row from public.exams: EXAM I, source 'syllabus:9198bd58-...', course CSCE 3600.
  const exams = [
    { id: "e-exam-1", course_id: "csce-3600", title: "EXAM I", exam_at: "2026-08-21T20:25:00.000Z" },
  ]
  const events = buildCalendarEvents({ assignments: [], exams, studySessions: [], courses, days, today, timezone })
  const event = events.find((entry) => entry.id === "e-exam-1")
  assert.ok(event, "the approved syllabus exam must produce a Calendar event")
  assert.equal(event?.kind, "exam")
  assert.equal(event?.title, "CSCE 3600 — EXAM I")
})

test("a roadmap-only topic never becomes a Calendar commitment", () => {
  // Course Roadmap entries (course_roadmap_entries) are a structurally separate table from
  // assignments/exams -- approve_syllabus_processing only ever writes an assignment/exam row
  // when the item carries a real due_at/exam_at (see the migration's insert statements). A
  // roadmap-only topic like "Week 4 -- UI Design & Accessibility" is never in the
  // assignments/exams arrays Calendar reads at all, so there is nothing here for
  // buildCalendarEvents to exclude by name -- this asserts the absence structurally: an
  // assignment/exam with no due date (the one shape a roadmap-derived row could take if this
  // safety net were ever bypassed) still produces no event.
  const assignments = [
    { id: "a-undated", course_id: "csce-3600", title: "UI Design & Accessibility", due_at: null, status: "not_started", source: "syllabus:9198bd58-a576-4763-a5a7-a1da904c4043" },
  ]
  const exams = [
    { id: "e-undated", course_id: "csce-3600", title: "Midterm", exam_at: null },
  ]
  const events = buildCalendarEvents({ assignments, exams, studySessions: [], courses, days, today, timezone })
  assert.equal(events.length, 0, "an undated item must never appear on the main commitment Calendar")
})

test("commitments from multiple courses appear together on the same Calendar", () => {
  const assignments = [
    { id: "a-csce3600", course_id: "csce-3600", title: "REGEX Practice", due_at: "2026-08-21T17:00:00.000Z", status: "not_started", source: "syllabus:9198bd58-a576-4763-a5a7-a1da904c4043" },
  ]
  const exams = [
    { id: "e-csce4350", course_id: "csce-4350", title: "Midterm Exam", exam_at: "2026-08-22T13:50:00.000Z" },
  ]
  const events = buildCalendarEvents({ assignments, exams, studySessions: [], courses, days, today, timezone })
  assert.deepEqual(
    events.map((entry) => entry.title).sort(),
    ["CSCE 3600 — REGEX Practice", "CSCE 4350 — Midterm Exam"],
    "items from different courses must both be present, each labeled with their own course code",
  )
  assert.notEqual(events.find((entry) => entry.id === "a-csce3600")?.day, -1)
  assert.notEqual(events.find((entry) => entry.id === "e-csce4350")?.day, -1)
})

test("a completed assignment is toned 'done', not 'gold' or 'rose'", () => {
  const assignments = [
    { id: "a-done", course_id: "csce-3600", title: "Lab 1", due_at: "2026-08-10T17:00:00.000Z", status: "completed", source: "manual" },
  ]
  const events = buildCalendarEvents({ assignments, exams: [], studySessions: [], courses, days: weekKeys(timezone, new Date("2026-08-10T18:00:00.000Z")), today, timezone })
  assert.equal(events[0]?.tone, "done")
  assert.equal(events[0]?.eventStatus, "completed")
})

test("a Canvas-sourced assignment is flagged canvasOwned; a syllabus-sourced one is not", () => {
  const assignments = [
    { id: "a-canvas", course_id: "csce-3600", title: "Canvas HW", due_at: "2026-08-21T17:00:00.000Z", status: "not_started", source: "canvas" },
    { id: "a-syllabus", course_id: "csce-3600", title: "Syllabus HW", due_at: "2026-08-21T18:00:00.000Z", status: "not_started", source: "syllabus:9198bd58-a576-4763-a5a7-a1da904c4043" },
  ]
  const events = buildCalendarEvents({ assignments, exams: [], studySessions: [], courses, days, today, timezone })
  assert.equal(events.find((entry) => entry.id === "a-canvas")?.canvasOwned, true)
  assert.equal(events.find((entry) => entry.id === "a-syllabus")?.canvasOwned, false)
})

test("future-week assignments, exams, and study sessions remain available when the window moves", () => {
  const futureDays = weekKeys(timezone, new Date("2026-12-29T18:00:00.000Z"))
  const events = buildCalendarEvents({
    assignments: [{ id: "future-assignment", course_id: "csce-3600", title: "Year-end project", due_at: "2026-12-31T18:00:00.000Z", status: "not_started", source: "manual" }],
    exams: [{ id: "future-exam", course_id: "csce-4350", title: "Final", exam_at: "2027-01-02T16:00:00.000Z" }],
    studySessions: [{ id: "future-session", course_id: "csce-3600", title: "Project review", start_at: "2027-01-01T20:00:00.000Z" }],
    courses,
    days: futureDays,
    today,
    timezone,
  })
  assert.deepEqual(events.map(event => event.id), ["future-assignment", "future-exam", "future-session"])
  assert.ok(events.every(event => event.day >= 0), "every future-week event must land in the selected display window")
})
