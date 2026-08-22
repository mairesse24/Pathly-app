import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const component = read("src/components/study/OrganizeNotes.tsx")
const service = read("src/services/organizedNotes.ts")
const edge = read("supabase/functions/organize-course-notes/index.ts")
const migration = read("supabase/migrations/20260817200000_course_organized_notes.sql").toLowerCase()

assert.match(component, /type="file"/)
assert.doesNotMatch(component, /webkitdirectory|directory=/i)
assert.match(service, /\.pdf,\.docx,\.png,\.jpg,\.jpeg/)
assert.doesNotMatch(service, /pptx|markdown|\.md/)
assert.match(edge, /eq\("user_id", user\.id\).*eq\("course_id", courseId\)/)
assert.match(edge, /eq\("is_active", true\)/)
assert.match(edge, /allowedNoteMimes/)
assert.match(migration, /enable row level security/)
assert.match(migration, /auth\.uid\(\)/)
assert.match(migration, /on delete set null \(source_upload_id\)/)
assert.match(component, /Delete organized note/)
assert.match(component, /Delete original upload/)
assert.match(component, /No organized notes saved yet\./)
console.log("organized-note file, review, ownership, deletion, and empty-state checks passed")
