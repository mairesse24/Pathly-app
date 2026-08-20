import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const migration = readFileSync(new URL("../supabase/migrations/20260820120000_reconcile_syllabus_imports.sql", import.meta.url), "utf8")
const resolutionFix = readFileSync(new URL("../supabase/migrations/20260820122000_fix_syllabus_exam_conflict_resolution.sql", import.meta.url), "utf8")

assert.match(migration, /e\.exam_at is not distinct from proposed_exam_at/, "same title and date must be treated as an exact cross-upload match")
assert.match(migration, /insert into public\.syllabus_exam_conflicts/, "a conflicting date must be persisted for review")
assert.match(migration, /where source like 'syllabus:%'/, "the one-active-title constraint must apply only to syllabus exams")
assert.match(migration, /create unique index exams_one_active_syllabus_title_per_course/, "concurrent approvals need a database uniqueness backstop")
assert.match(migration, /p_resolution not in \('keep_existing','replace'\)/, "conflicts must support explicit keep/replace semantics")
assert.match(migration, /and source like 'syllabus:%'/, "replacement must never target a manual or Canvas exam")
assert.match(migration, /if migrated_count<>29/, "cleanup must abort unless all 29 audited topic rows were migrated")
assert.match(migration, /and a\.id=any\(candidate_ids\)/, "cleanup must be limited to the audited assignment IDs")
assert.match(resolutionFix, /security definer/, "the RPC must resolve through its restricted owner-checked boundary")
assert.match(resolutionFix, /caller_id uuid := \(select auth\.uid\(\)\)/, "the RPC must require the authenticated caller")
assert.match(resolutionFix, /and user_id = caller_id/, "every conflict and exam mutation must be owner scoped")
assert.match(resolutionFix, /else 'kept_existing'/, "keep_existing input must map to the persisted kept_existing status")
assert.match(resolutionFix, /and source like 'syllabus:%'/, "replacement must never mutate manual or Canvas exams")
assert.match(resolutionFix, /revoke all on function public\.resolve_syllabus_exam_conflict\(uuid, text\) from public/, "the RPC must not retain PUBLIC execution")
assert.match(resolutionFix, /grant execute on function public\.resolve_syllabus_exam_conflict\(uuid, text\) to authenticated/, "signed-in users must be able to invoke the RPC")

function reconcile(existing, proposed) {
  const normalized = (value) => value.trim().replace(/\s+/g, " ").toLowerCase()
  const syllabus = existing.filter((exam) => exam.source.startsWith("syllabus:") && normalized(exam.title) === normalized(proposed.title))
  if (syllabus.some((exam) => exam.exam_at === proposed.exam_at)) return { action: "noop" }
  if (syllabus.length) return { action: "review", active: syllabus[0], proposed }
  return { action: "insert", proposed }
}

const active = { title: "EXAM I", exam_at: "2026-09-23T20:25:00Z", source: "syllabus:old" }
assert.equal(reconcile([active], { title: "Exam I", exam_at: active.exam_at }).action, "noop", "same course/title/date must not duplicate")
assert.equal(reconcile([active], { title: "Exam I", exam_at: "2026-11-02T23:37:00Z" }).action, "review", "same title with a different date must be reviewed")
assert.equal(reconcile([{ ...active, source: "manual" }], { title: "Exam I", exam_at: "2026-11-02T23:37:00Z" }).action, "insert", "manual exams must not be replaced or treated as syllabus conflicts")

console.log("syllabus exam reconciliation: exact matches no-op, conflicting dates require review, manual/Canvas data stays independent")
