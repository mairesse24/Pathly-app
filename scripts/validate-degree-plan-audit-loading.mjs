import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const service = await readFile(new URL("../src/services/degreePlanning.ts", import.meta.url), "utf8")
const page = await readFile(new URL("../src/pages/DegreePlanner/index.tsx", import.meta.url), "utf8")
const migration = await readFile(new URL("../supabase/migrations/20260814110000_user_degree_audit_plans.sql", import.meta.url), "utf8")
const requirementTable = migration.match(/create table public\.user_degree_requirements[\s\S]*?\n\);/)?.[0] || ""

assert.ok(requirementTable, "user_degree_requirements schema must be present")
assert.doesNotMatch(requirementTable, /\bsort_order\b/, "live requirement rows do not have sort_order")
assert.doesNotMatch(service, /from\("user_degree_requirements"\)[\s\S]{0,200}order\("sort_order"\)/,
  "Degree Plan must not order user_degree_requirements by a nonexistent column")
assert.match(service, /from\("user_degree_requirements"\)[\s\S]{0,200}order\("confirmed_at"\)/,
  "Degree Plan should use a schema-backed stable order")
assert.match(service, /from\("uploaded_files"\)[\s\S]{0,250}eq\("category", "degree_audit"\)/,
  "Degree Plan should read the latest Degree Audit upload state")
assert.doesNotMatch(page, /Verified progress remains available/,
  "the supplemental failure must not imply that a verified catalog match exists")
assert.match(page, /degreeAuditNotice\(latestAuditUpload\)/,
  "Degree Plan should distinguish failed uploads from confirmed supplemental data")

console.log("Degree Plan supplemental-audit loading regression checks passed")
