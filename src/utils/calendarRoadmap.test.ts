import assert from "node:assert/strict"
import test from "node:test"

import type { CourseRoadmapEntryRecord } from "../types/academic.ts"
import { buildRoadmapCalendarEvents, hasReliableRoadmapDate } from "./calendarRoadmap.ts"

const entry = (values: Partial<CourseRoadmapEntryRecord> & Pick<CourseRoadmapEntryRecord, "id" | "course_id" | "topic" | "entry_date">): CourseRoadmapEntryRecord => ({
  user_id: "user",
  period_label: null,
  description: null,
  deliverable: null,
  source: "manual",
  sort_order: 0,
  roadmap_item_key: null,
  ...values,
})

const courses = [{ id: "one", course_code: "CSCE 3600" }, { id: "two", course_code: "CSCE 4350" }]
const days = ["2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30"]

test("dated roadmap context remains separate, course-associated, and multi-course", () => {
  const events = buildRoadmapCalendarEvents({
    courses,
    days,
    roadmapEntries: [
      entry({ id: "regex", course_id: "one", topic: "REGEX", entry_date: "2026-08-25" }),
      entry({ id: "review", course_id: "two", topic: "Review", entry_date: "2026-08-27" }),
    ],
  })
  assert.deepEqual(events.map(event => event.kind), ["roadmap", "roadmap"])
  assert.deepEqual(events.map(event => event.title), ["CSCE 3600 — REGEX", "CSCE 4350 — Review"])
  assert.ok(events.every(event => event.label === "Course roadmap"))
  assert.ok(events.every(event => !/due/i.test(event.label)), "roadmap context must never be described as due")
})

test("uncertain reconciled AI dates and out-of-window rows stay hidden", () => {
  const uncertain = entry({ id: "holiday", course_id: "one", topic: "Labor Day Holiday", entry_date: "2026-08-25", roadmap_item_key: "reconciled:assignment:old-id" })
  const later = entry({ id: "threads", course_id: "one", topic: "Threads", entry_date: "2026-09-12" })
  assert.equal(hasReliableRoadmapDate(uncertain), false)
  assert.deepEqual(buildRoadmapCalendarEvents({ courses, days, roadmapEntries: [uncertain, later] }), [])
})

test("duplicate roadmap rows do not produce duplicate calendar context", () => {
  const regex = entry({ id: "regex", course_id: "one", topic: "REGEX", entry_date: "2026-08-25" })
  const events = buildRoadmapCalendarEvents({ courses, days, roadmapEntries: [regex, regex] })
  assert.equal(events.length, 1)
})
