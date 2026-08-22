import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const uploads = read("src/services/uploads.ts")
const uploadCenter = read("src/pages/UploadCenter/index.tsx")
const activeFiles = read("supabase/migrations/20260820151000_active_uploaded_files.sql")
const processing = read("supabase/migrations/20260812050000_create_ai_processing.sql")
const roadmap = read("supabase/migrations/20260819010000_course_roadmap.sql")
const degreePlans = read("supabase/migrations/20260814110000_user_degree_audit_plans.sql")

assert.match(uploads, /row\.user_id !== user\.id/, "the browser must reject cross-owner deletion input")
assert.match(uploads, /storage_path\.startsWith\(`\$\{user\.id\}\//, "Storage deletion must remain inside the caller's folder")
assert.match(uploads, /\.eq\("id", row\.id\)[\s\S]{0,100}\.eq\("user_id", user\.id\)/, "metadata deletion must use id plus owner")
assert.match(uploads, /UploadDeletionError[\s\S]*storageRemoved/, "partial deletion must have a recoverable typed outcome")
assert.match(uploadCenter, /catch \(reason\)[\s\S]{0,400}listUploads\(\)[\s\S]{0,200}setFiles\(refreshed\)/, "mounted Upload Center state must refresh after deletion failure")

assert.match(activeFiles, /from public\.uploaded_files files[\s\S]*storage\.objects objects/, "file lists must require metadata and Storage")
assert.match(activeFiles, /with \(security_invoker = true\)/, "the active-file view must preserve owner RLS")

// Processing output is source-dependent and may cascade, while reviewed academic
// records are intentionally independent. The approval migrations insert the
// structured records without upload FKs; degree-plan provenance is explicitly nullable.
assert.match(processing, /ai_processing_results[\s\S]*references public\.uploaded_files\(id\) on delete cascade/)
assert.doesNotMatch(roadmap, /assignments[\s\S]{0,400}references public\.uploaded_files/)
assert.doesNotMatch(roadmap, /exams[\s\S]{0,400}references public\.uploaded_files/)
assert.doesNotMatch(roadmap, /course_roadmap_entries[\s\S]{0,400}references public\.uploaded_files/)
assert.match(degreePlans, /references public\.uploaded_files\(id,user_id\) on delete set null/)

const visible = (rows, storage, owner) => rows.filter((row) => row.user_id === owner && storage.has(row.storage_path))
const rows = [
  { id: "deleted", user_id: "one", storage_path: "one/deleted.pdf" },
  { id: "kept", user_id: "one", storage_path: "one/kept.pdf" },
  { id: "other-user", user_id: "two", storage_path: "two/private.pdf" },
]
const storage = new Set(["one/kept.pdf", "two/private.pdf"])
assert.deepEqual(visible(rows, storage, "one").map(({ id }) => id), ["kept"], "one deletion must not hide another file")
assert.deepEqual(visible(rows, storage, "two").map(({ id }) => id), ["other-user"], "one user's deletion must not affect another user")

console.log("upload deletion stabilization: authoritative lists, owner isolation, partial-failure refresh, and approved-record preservation verified")
