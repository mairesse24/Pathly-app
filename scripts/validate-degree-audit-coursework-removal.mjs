import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const migration = readFileSync(new URL("../supabase/migrations/20260822040000_remove_degree_audit_coursework.sql", import.meta.url), "utf8")
  .replace(/^\s*--.*$/gm, "")
const page = readFileSync(new URL("../src/pages/DegreePlanner/index.tsx", import.meta.url), "utf8")
const service = readFileSync(new URL("../src/services/degreePlanning.ts", import.meta.url), "utf8")

assert.match(migration, /security invoker/)
assert.match(migration, /caller_id uuid := \(select auth\.uid\(\)\)/)
assert.match(migration, /delete from public\.completed_courses\s+where user_id=caller_id and source='degree_audit'/)
assert.doesNotMatch(migration, /delete from public\.uploaded_files|delete from public\.ai_processing_results/)
assert.doesNotMatch(migration, /source='transcript'|source='manual'/)

// A personal-audit plan is coupled progress data and must not survive the coursework reset.
// The null-total discriminator is the existing model's confirmed program-guide marker.
assert.match(migration, /delete from public\.user_degree_plans[\s\S]*user_id=caller_id[\s\S]*status='active'[\s\S]*total_credits_completed is not null/)
assert.doesNotMatch(migration, /delete from public\.user_degree_requirement_groups|delete from public\.user_degree_requirements/)
assert.match(migration, /revoke all on function public\.remove_degree_audit_coursework\(\) from public,anon/)
assert.match(migration, /grant execute on function public\.remove_degree_audit_coursework\(\) to authenticated/)

assert.match(service, /supabase\.rpc\("remove_degree_audit_coursework"\)/)
assert.match(page, /courses\.some\(\(course\) => course\.source === "degree_audit"\)/)
assert.match(page, /"Remove Degree Audit coursework"/)
const action = page.slice(page.indexOf("async function removeAuditCoursework"), page.indexOf("async function removeAuditCoursework") + 2200)
assert.match(action, /if \(!window\.confirm\([\s\S]*\)\) return/)
assert.ok(action.indexOf("window.confirm") < action.indexOf("setRemovingDegreeAudit(true)"), "cancellation must return before busy state or mutation")
assert.ok(action.indexOf("window.confirm") < action.indexOf("await removeDegreeAuditCoursework()"), "confirmation must precede the RPC")
assert.match(action, /await load\(\)/)
assert.match(page, /disabled=\{removingDegreeAudit\}/)

console.log("Degree Audit coursework removal: provenance, owner scope, guide/upload/manual/transcript preservation, confirmation, and refresh checks passed")
