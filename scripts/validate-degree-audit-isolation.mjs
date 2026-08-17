import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const sql=readFileSync(new URL("../supabase/migrations/20260817160000_degree_audit_course_applications.sql",import.meta.url),"utf8").toLowerCase()
assert.doesNotMatch(sql,/alter\s+table\s+public\.(degree_programs|requirement_groups|requirement_course_options)/,"student mappings must not mutate verified catalog tables")
assert.match(sql,/application_source\s+text/)
assert.match(sql,/credits_applied\s+numeric/)
assert.match(sql,/unique index[\s\S]+group_id[\s\S]+course_code/)
assert.match(sql,/security invoker/)
assert.match(sql,/user_id=\(select auth\.uid\(\)\)/,"confirmation must stay scoped to the authenticated owner")
assert.doesNotMatch(sql,/grant\s+[^;]+\s+to\s+anon/,"audit mappings must not be exposed to anonymous users")
console.log("catalog isolation, duplicate prevention, and RLS ownership checks passed")
