import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const migration = read("supabase/migrations/20260820151000_active_uploaded_files.sql")
const uploads = read("src/services/uploads.ts")

assert.match(migration, /create or replace view public\.active_uploaded_files/)
assert.match(migration, /with \(security_invoker = true\)/, "the active-source view must preserve underlying RLS")
assert.match(migration, /objects\.bucket_id = 'source-uploads'/)
assert.match(migration, /objects\.name = files\.storage_path/, "only metadata backed by a live Storage object is active")
assert.match(migration, /old\.source_upload_id is not null and new\.source_upload_id is not null/, "organized notes may lose a deleted source but may not be reassigned")
assert.match(uploads, /from\("active_uploaded_files"\)/, "Course files must query authoritative active sources")
assert.doesNotMatch(uploads, /from\("ai_processing_results"\).*listUploads/s, "Course files must not be derived from processing results")
assert.match(uploads, /delete\(\)[\s\S]*select\("id"\)[\s\S]*maybeSingle\(\)/, "deletion must detect a zero-row metadata delete")

const activeFiles = (uploads, storagePaths, courseId) => uploads.filter((file) => file.course_id === courseId && storagePaths.has(file.storage_path))
const rows = [
  { id: "syllabus", course_id: "csce-4110", storage_path: "live/syllabus.pdf" },
  { id: "deleted", course_id: "csce-4110", storage_path: "gone/lecture.pdf" },
  { id: "other", course_id: "csce-3600", storage_path: "live/other.pdf" },
]
assert.deepEqual(activeFiles(rows, new Set(["live/syllabus.pdf", "live/other.pdf"]), "csce-4110").map((row) => row.id), ["syllabus"])
assert.deepEqual(activeFiles(rows, new Set(["live/syllabus.pdf", "live/other.pdf"]), "csce-3600").map((row) => row.id), ["other"])

console.log("active Course files: live sources appear, deleted sources disappear, unrelated course files remain")
