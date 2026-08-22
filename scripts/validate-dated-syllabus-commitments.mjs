import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Regression coverage for: an approved syllabus item with no real date (a roadmap-only topic,
// lecture, or holiday) must never become a Calendar commitment. The review UI already disables
// the checkbox for an undated assignment/exam, but approve_syllabus_processing is the
// authoritative last line of defense -- this locks in that it actually requires a due_at/exam_at
// before inserting, at the database boundary, not just in the client.
const migration = readFileSync(
  new URL("../supabase/migrations/20260822020000_require_dated_syllabus_commitments.sql", import.meta.url),
  "utf8",
)

assert.match(
  migration,
  /where btrim\(coalesce\(assignment_item\.value->>'title',''\)\) <> ''\s*\n\s*and nullif\(assignment_item\.value->>'due_at',''\) is not null/,
  "the assignments insert must require a non-empty due_at, not just a non-empty title",
)
assert.match(
  migration,
  /proposed_exam_at := nullif\(exam_item->>'exam_at',''\)::timestamptz;\s*\n[\s\S]{0,200}if proposed_exam_at is null then continue; end if;/,
  "the exam loop must skip an item with no exam_at before it can reach either the conflict table or the exams table",
)

console.log("approve_syllabus_processing requires a real date before writing an assignment/exam row")
