import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const migration = read("supabase/migrations/20260822025219_harden_canvas_owner_foreign_keys.sql")
const config = read("supabase/config.toml")
const processing = read("supabase/functions/process-academic-file/index.ts")

for (const table of ["courses", "assignments"]) assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]{0,220}foreign key \\(canvas_connection_id, user_id\\)[\\s\\S]{0,120}references public\\.canvas_connections\\(id, user_id\\)`), `${table} must use the owner-aware Canvas FK`)
assert.match(migration, /on delete set null \(canvas_connection_id\)/, "disconnect must preserve the child owner")
assert.match(migration, /revoke all privileges on table public\.course_roadmap_entries from anon/, "roadmap data must not be anonymous")
assert.match(migration, /grant select on table public\.course_roadmap_entries to authenticated/, "roadmap reads must remain available")
assert.match(migration, /grant select on table public\.ai_processing_results to authenticated/, "review reads must remain available")
assert.doesNotMatch(migration, /grant[^;]*(?:truncate|trigger|references)/i, "broad table privileges must not be restored")

const expectedJwt = {
  "google-calendar-oauth-callback": false,
  "canvas-oauth-callback": false,
  "google-calendar-oauth-start": true,
  "google-calendar-disconnect": true,
  "google-calendar-sync": true,
  "canvas-oauth-start": true,
  "canvas-token-connect": true,
  "canvas-sync": true,
  "canvas-disconnect": true,
  "process-academic-file": true,
  "pathly-companion": true,
  "organize-course-notes": true,
  "delete-account": true,
}
for (const [name, value] of Object.entries(expectedJwt)) {
  assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\s+verify_jwt = ${value}`), `${name} JWT configuration must be reproducible`)
}
assert.doesNotMatch(config, /(?:client_secret|encryption_key|api_key)\s*=/i, "function config must not contain secrets")
assert.doesNotMatch(processing, /console\.(?:info|error)\([^\n]*(?:upload_id|user_id)/, "processing logs must not emit user or upload identifiers")
assert.doesNotMatch(processing, /console\.(?:info|error)\([^\n]*(?:document|content|token|credential|secret)/i, "processing logs must not emit document content or credentials")

console.log("release security hardening: Canvas owner FKs, least privilege, JWT config, and identifier-safe processing logs verified")
