import assert from "node:assert/strict"
import test from "node:test"

import { assignmentEventStatus, calendarEventTitle, classMeetingStatus, examEventStatus } from "./calendarEventPresentation.ts"

test("a manually-created assignment shows its actual title, not a generic label", () => {
  assert.equal(calendarEventTitle("CSCE 3444", "Assignment 1"), "CSCE 3444 — Assignment 1")
})

test("a syllabus-imported assignment shows its actual title", () => {
  assert.equal(calendarEventTitle("CSCE 3600.004", "REGEX Practice"), "CSCE 3600.004 — REGEX Practice")
})

test("a Canvas-synced assignment shows its actual title", () => {
  assert.equal(calendarEventTitle("CSCE 3600.004", "Lab 3: Signals"), "CSCE 3600.004 — Lab 3: Signals")
})

test("an exam shows its actual title", () => {
  assert.equal(calendarEventTitle("CSCE 3600.004", "EXAM I"), "CSCE 3600.004 — EXAM I")
})

test("a completed assignment is always completed, even if its due date is in the past", () => {
  assert.equal(assignmentEventStatus("completed", "2026-01-01", "2026-08-18"), "completed")
})

test("an incomplete assignment due before today is overdue", () => {
  assert.equal(assignmentEventStatus("not_started", "2026-08-10", "2026-08-18"), "overdue")
})

test("an incomplete assignment due today or later is upcoming", () => {
  assert.equal(assignmentEventStatus("not_started", "2026-08-18", "2026-08-18"), "upcoming")
  assert.equal(assignmentEventStatus("in_progress", "2026-09-01", "2026-08-18"), "upcoming")
})

test("an assignment with no due date is upcoming, never overdue", () => {
  assert.equal(assignmentEventStatus("not_started", null, "2026-08-18"), "upcoming")
})

test("a class meeting in a past week is past history, not overdue or completed", () => {
  // classMeetingStatus only ever distinguishes past/upcoming -- there is no
  // third "overdue"/"completed" value it could return, so a caller can't
  // accidentally mislabel a class meeting as academic work.
  assert.equal(classMeetingStatus("2026-08-10", "2026-08-18"), "past")
})

test("a class meeting later this week is still upcoming", () => {
  assert.equal(classMeetingStatus("2026-08-20", "2026-08-18"), "upcoming")
})

test("a class meeting today is upcoming, not past", () => {
  assert.equal(classMeetingStatus("2026-08-18", "2026-08-18"), "upcoming")
})

test("a past exam is history, never completed -- exams have no completion state", () => {
  assert.equal(examEventStatus("2026-08-10", "2026-08-18"), "past")
})

test("an exam later this week is upcoming", () => {
  assert.equal(examEventStatus("2026-08-20", "2026-08-18"), "upcoming")
})
