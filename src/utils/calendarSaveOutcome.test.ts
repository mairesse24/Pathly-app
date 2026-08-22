import assert from "node:assert/strict"
import test from "node:test"

import { classifySavedDate } from "./calendarSaveOutcome.ts"

test("a date before today classifies as past", () => {
  assert.equal(classifySavedDate("2026-08-10", "2026-08-18"), "past")
})

test("today's own date classifies as today", () => {
  assert.equal(classifySavedDate("2026-08-18", "2026-08-18"), "today")
})

test("a date after today classifies as future", () => {
  assert.equal(classifySavedDate("2026-08-25", "2026-08-18"), "future")
})

test("comparison is lexicographic on YYYY-MM-DD, correct across month/year boundaries", () => {
  assert.equal(classifySavedDate("2026-09-01", "2026-08-31"), "future")
  assert.equal(classifySavedDate("2026-08-31", "2026-09-01"), "past")
  assert.equal(classifySavedDate("2027-01-01", "2026-12-31"), "future")
})
