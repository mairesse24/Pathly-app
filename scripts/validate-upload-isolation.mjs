import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// P0 regression: two uploads can legitimately share an original_filename
// (a student re-uploads the same syllabus, or two students upload files
// with the same name). Processing must key strictly by the immutable
// upload id / storage path / user id -- never by filename -- so Upload B
// can never inherit Upload A's extracted dates or course identity.
const src = readFileSync(new URL("../supabase/functions/process-academic-file/index.ts", import.meta.url), "utf8")

// The row that drives everything below is looked up by id + user_id only.
assert.match(src, /\.from\("uploaded_files"\)\.select\("\*"\)\.eq\("id",\s*uploadId\)\.eq\("user_id",\s*user\.id\)/, "the upload row must be fetched by id + user_id, not by filename")

// Storage download must use the row's own storage_path, never original_filename.
assert.match(src, /storage\.from\("source-uploads"\)\.download\(upload\.storage_path\)/, "the source file must be downloaded using this upload's own storage_path")
assert.doesNotMatch(src, /download\([^)]*original_filename/, "storage download must never be keyed by filename")

// A prior processing result may only be reused for this exact upload_id --
// never a cross-upload/filename-based lookup that could hand Upload B
// Upload A's already-extracted (and possibly differently-dated) result.
assert.match(src, /\.from\("ai_processing_results"\)\.select\("\*"\)\.eq\("upload_id",\s*upload\.id\)\.maybeSingle\(\)/, "the reuse check must filter strictly by this upload's own id")
assert.doesNotMatch(src, /ai_processing_results[^\n]*original_filename/, "processing-result reuse must never filter by filename")

// The freshly-inserted result must also be tagged with this exact upload_id,
// and content only ever flows from source -> claude request in this one call
// (no filename-derived or cross-upload cache lookup feeds the model).
assert.match(src, /\.from\("ai_processing_results"\)\.insert\(\{[^}]*upload_id:\s*upload\.id/, "saved results must be tagged with this upload's own id")
assert.doesNotMatch(src, /original_filename/, "process-academic-file must never reference original_filename -- filename must have zero influence on processing, reuse, or course identity")

// Course identity must be extracted from the document alone: the selected
// destination course's code/title must never be interpolated into the
// Claude request, or the model could copy/infer it instead of reading the
// actual uploaded document.
assert.doesNotMatch(src, /upload\.course_id[\s\S]{0,200}(messages|content|instruction)/, "the destination course must not be threaded into the extraction request")
assert.doesNotMatch(src, /course_code[\s\S]{0,40}instruction|instruction[\s\S]{0,200}course_code\s*:/, "course identity must not be seeded into the extraction instruction")

console.log("upload processing keys strictly by upload_id/storage_path/user_id, never filename or selected course")
