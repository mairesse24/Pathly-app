import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

// delete-account relies on Postgres FK cascades to remove every owner-scoped row once the auth
// user is deleted (storage is handled separately, see validate-delete-account.mjs). This is a
// regression guard, not a substitute for the live check: cascade behavior was also verified
// directly against the deployed schema's pg_constraint via the Supabase MCP tools before this
// feature shipped -- that live query is the authoritative source, since a migration file could
// in principle be written correctly and still not match what actually ran. This test instead
// protects against a *future* table being added without ON DELETE CASCADE back to auth.users.
const migrationsDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url))
const corpus = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n")
  .toLowerCase()

// Tables whose owning-column (user_id, or id for profiles) must carry a direct
// `references auth.users(id) on delete cascade` within their own CREATE TABLE statement.
const directCascadeTables = [
  "profiles",
  "courses",
  "semesters",
  "assignments",
  "exams",
  "study_sessions",
  "uploaded_files",
  "ai_processing_results",
  "companion_conversations",
  "companion_messages",
  "canvas_connections",
  "canvas_oauth_states",
  "notification_read_states",
  "daily_reflections",
  "completed_courses",
  "course_roadmap_entries",
  "organized_course_notes",
  "study_flashcards",
  "user_degree_plans",
  "user_degree_requirement_groups",
  "user_degree_requirements",
]

// A semicolon can only close the CREATE TABLE statement itself -- it can't legally appear
// inside a parenthesized column/check/default expression -- so bounding each table's body at
// the first `);` after its own `create table` keyword precisely isolates that one statement
// from the next table's, however many tables share a migration file.
function tableBody(table) {
  const match = corpus.match(new RegExp(`create table public\\.${table}\\b[\\s\\S]*?\\);`, "i"))
  assert.ok(match, `public.${table} must be created somewhere in the migrations`)
  return match[0]
}

for (const table of directCascadeTables) {
  assert.match(
    tableBody(table),
    /references auth\.users\(id\) on delete cascade/i,
    `public.${table} must cascade-delete from auth.users(id) so account deletion removes it`,
  )
}

// canvas_credentials has no user_id column of its own -- it cascades transitively through
// canvas_connections, which is itself in the direct list above and so is already verified.
assert.match(
  tableBody("canvas_credentials"),
  /references public\.canvas_connections\(id, user_id\) on delete cascade/i,
  "public.canvas_credentials must cascade-delete through canvas_connections, which itself cascades from auth.users",
)

// Catalog/reference tables are shared, not owner-scoped, and must never be wired to cascade
// from an individual user's deletion.
for (const catalogTable of ["degree_programs", "degree_program_aliases", "requirement_groups", "requirement_course_options"])
  assert.doesNotMatch(
    tableBody(catalogTable),
    /references auth\.users/i,
    `public.${catalogTable} is shared catalog data and must not cascade from a single user's account`,
  )

console.log(`account deletion cascade: verified ${directCascadeTables.length} owner-scoped tables + canvas_credentials cascade from auth.users, catalog tables excluded`)
