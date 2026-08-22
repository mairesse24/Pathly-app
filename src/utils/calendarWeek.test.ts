import assert from "node:assert/strict"
import test from "node:test"

import { calendarWeekDays, shiftCalendarWeek } from "./calendarWeek.ts"

const timezone = "America/Chicago"

test("current, next, previous, and Today-reset weeks are stable date windows", () => {
  const today = "2026-08-21"
  const current = calendarWeekDays(today, timezone)
  const nextAnchor = shiftCalendarWeek(today, 1, timezone)
  const previousAnchor = shiftCalendarWeek(nextAnchor, -1, timezone)
  assert.deepEqual(current, ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"])
  assert.deepEqual(calendarWeekDays(nextAnchor, timezone), ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"])
  assert.deepEqual(calendarWeekDays(previousAnchor, timezone), current)
  assert.deepEqual(calendarWeekDays(today, timezone), current, "Today resets to the week containing today")
})

test("week navigation crosses month and year boundaries", () => {
  assert.deepEqual(calendarWeekDays(shiftCalendarWeek("2026-08-31", -1, timezone), timezone), ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"])
  assert.deepEqual(calendarWeekDays(shiftCalendarWeek("2026-12-28", 1, timezone), timezone), ["2027-01-04", "2027-01-05", "2027-01-06", "2027-01-07", "2027-01-08", "2027-01-09", "2027-01-10"])
  assert.deepEqual(calendarWeekDays(shiftCalendarWeek("2027-01-04", -1, timezone), timezone), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"])
})
