import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const service = await readFile(
  new URL("../src/services/transcriptImports.ts", import.meta.url),
  "utf8",
)
const page = await readFile(
  new URL("../src/pages/UploadCenter/index.tsx", import.meta.url),
  "utf8",
)

assert.doesNotMatch(
  service,
  /academic_record_import_courses\(count\)/,
  "the transcript-import query must not use the ambiguous embedded relationship",
)
assert.match(service, /\.from\("academic_record_imports"\)[\s\S]*?\.select\("id,created_at,removed_at"\)/)
assert.match(service, /\.from\("academic_record_import_courses"\)[\s\S]*?\.select\("import_id"\)/)
assert.match(
  page,
  /Promise\.allSettled\(\[[\s\S]*?listUploads\(\)[\s\S]*?listTranscriptImports\(\)/,
  "supporting metadata failures must not discard successfully loaded uploads",
)
assert.doesNotMatch(
  page,
  /Promise\.all\(\[listUploads\(\)/,
  "the Upload Center must not fail atomically when optional related data is malformed",
)
assert.match(page, /Retry loading uploads/)
assert.match(page, /Your files are still shown below/)

console.log("Upload Center query and partial-load resilience checks passed")
