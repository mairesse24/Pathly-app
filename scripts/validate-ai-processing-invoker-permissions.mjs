import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").toLowerCase()
const migration = read("supabase/migrations/20260822050000_restore_ai_processing_rpc_update_columns.sql")
const reassociation = read("supabase/migrations/20260817180000_reassociate_syllabus_processing_course.sql")
const policy = read("supabase/migrations/20260817181000_consolidate_processing_update_policy.sql")
const approval = read("supabase/migrations/20260822020000_require_dated_syllabus_commitments.sql")
const transcript = read("supabase/migrations/20260821161500_isolate_degree_audit_transcript_confirmation.sql")
const degreeAudit = read("supabase/migrations/20260817160000_degree_audit_course_applications.sql")

// Restore only the columns written by the four current authenticated invoker RPCs.
assert.match(migration, /grant update\(course_id,status,approved_at\)\s+on table public\.ai_processing_results\s+to authenticated/)
assert.doesNotMatch(migration, /grant (?:all|update) on table public\.ai_processing_results/)
assert.match(migration, /grant insert\(user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key\)\s+on table public\.course_roadmap_entries\s+to authenticated/)
assert.doesNotMatch(migration, /grant (?:all|insert|update|delete) on table public\.course_roadmap_entries/)
assert.doesNotMatch(migration, /\btruncate\b|\breferences\b|\btrigger\b/)

for (const [name, sql] of [
  ["reassociation", reassociation],
  ["syllabus approval", approval],
  ["transcript confirmation", transcript],
  ["Degree Audit confirmation", degreeAudit],
]) {
  assert.match(sql, /security invoker set search_path\s*=\s*''|security invoker set search_path=''/, `${name} must remain SECURITY INVOKER with a pinned search_path`)
  assert.match(sql, /user_id\s*=\s*\(select auth\.uid\(\)\)/, `${name} must select only the caller's processing result`)
  assert.match(sql, /status\s*=\s*'ready_for_review'/, `${name} must refuse finalized reviews`)
  assert.match(sql, /update public\.ai_processing_results/, `${name} must be covered as an ai_processing_results writer`)
}

assert.match(reassociation, /kind\s*=\s*'syllabus'/)
assert.match(reassociation, /select 1 from public\.courses where id\s*=\s*p_course_id and user_id\s*=\s*processing\.user_id/)
assert.match(reassociation, /update public\.uploaded_files set course_id\s*=\s*p_course_id[\s\S]*update public\.ai_processing_results set course_id\s*=\s*p_course_id/)
assert.match(reassociation, /revoke all on function public\.reassociate_syllabus_processing_course\(uuid,uuid\) from public, anon/)
assert.match(reassociation, /grant execute on function public\.reassociate_syllabus_processing_course\(uuid,uuid\) to authenticated/)

// RLS and the immutable-content trigger remain the column/row boundary for the narrow grant.
assert.match(policy, /using \(\(select auth\.uid\(\)\) = user_id\)/)
assert.match(policy, /with check \([\s\S]*\(select auth\.uid\(\)\) = user_id/)
assert.match(reassociation, /old\.result <> new\.result/)
assert.match(reassociation, /only ready syllabus results can be reassociated or approved/)
assert.match(approval, /insert into public\.course_roadmap_entries \(user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key\)/)

console.log("AI processing invoker permissions: narrow columns, owner RLS, immutable review content, and all four transition RPCs verified")
