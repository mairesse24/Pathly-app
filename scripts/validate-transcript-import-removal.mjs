import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const migration=await readFile(new URL("../supabase/migrations/20260821170000_transcript_import_provenance_and_removal.sql",import.meta.url),"utf8")
const service=await readFile(new URL("../src/services/transcriptImports.ts",import.meta.url),"utf8")
const page=await readFile(new URL("../src/pages/UploadCenter/index.tsx",import.meta.url),"utf8")

assert.match(migration,/create table public\.academic_record_imports/)
assert.match(migration,/create table public\.academic_record_import_courses/)
assert.match(migration,/where import_id=p_import_id/,
  "removal must select records from one import only")
assert.match(migration,/oc\.import_id<>p_import_id and oi\.removed_at is null/,
  "another active transcript must preserve shared coursework")
assert.match(migration,/delete from public\.completed_courses[\s\S]*?source='transcript'/,
  "only transcript-derived completed-course rows may be deleted")
assert.doesNotMatch(migration,/delete from public\.(courses|assignments|exams|course_roadmap_entries|uploaded_files)/,
  "transcript removal must not delete active courses or their related records")
assert.match(migration,/existing_source<>'manual'/,
  "transcript confirmation must not overwrite manual coursework")
assert.match(migration,/and kind='unofficial_transcript' and status='ready_for_review'/,
  "the transcript RPC must reject degree-audit processing records")
assert.match(service,/preview_transcript_import_removal/)
assert.match(page,/Remove imported courses/)
assert.match(page,/This can only be reversed by re-importing the transcript/)

console.log("Transcript import removal provenance and isolation checks passed")
