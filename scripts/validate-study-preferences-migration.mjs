import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const migration = readFileSync(new URL("../supabase/migrations/20260819020000_extend_study_preferences.sql", import.meta.url), "utf8").toLowerCase()

// Column-only change on an existing RLS-protected table: no new table, no
// new grants/policies needed since row level security on public.profiles
// already scopes every column (old and new) to auth.uid() = id.
assert.match(migration, /alter table public\.profiles/)
assert.match(migration, /add column non_academic_constraints text\[\]/)
assert.match(migration, /add column planning_style text/)
assert.match(migration, /add column primary_support_goal text/)
assert.doesNotMatch(migration, /create table/)
assert.doesNotMatch(migration, /alter table public\.profiles.*disable row level security/s)
assert.doesNotMatch(migration, /security definer/)

// Every new column is validated by an allow-list check constraint so a
// malformed value can't reach the database even from a trusted client.
assert.match(migration, /profiles_non_academic_constraints_check[\s\S]*<@ array\['work','commute','family','extracurriculars','varies'\]::text\[\]/)
assert.match(migration, /profiles_planning_style_check[\s\S]*in \('structured','flexible','balanced'\)/)
assert.match(migration, /profiles_primary_support_goal_check[\s\S]*in \('deadlines','study_planning','degree_progress','balance'\)/)

// All three columns are nullable with no default, so every existing row
// (and any row inserted without them) safely backfills to null rather than
// forcing already-onboarded users through the new questionnaire again.
assert.doesNotMatch(migration, /not null/)
assert.doesNotMatch(migration, /default/)

console.log("study preferences migration: additive-only, RLS-covered, allow-list constraints, safe null backfill")
