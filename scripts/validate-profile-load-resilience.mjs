import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Regression case: "Unable to load your profile" appeared for a real
// authenticated user whose optional academic/preference fields were blank.
// Live investigation (2026-08-19) found the public.profiles table already
// carries every column the client selects -- the failure was a stale
// PostgREST schema cache after the extend_study_preferences migration
// (fixed live via `NOTIFY pgrst, 'reload schema'`), surfaced through a
// client-side fragility this script guards against: the profile read
// unconditionally chained a best-effort timezone backfill UPDATE onto the
// already-successful SELECT, so any transient failure in that backfill
// (network blip, a momentary schema-cache hiccup, an RLS timing edge case)
// discarded a perfectly good, already-fetched profile and surfaced a hard
// error instead -- even though every field on it, blank or not, was valid.

const contextSource = readFileSync(new URL("../src/context/ProfileContext.tsx", import.meta.url), "utf8")

// The initial profile read must be captured on its own, not immediately
// reassigned by the backfill step -- so a backfill failure has a known-good
// value to fall back to.
assert.match(contextSource, /const loaded\s*=\s*await getProfileMetadata\(user\.id\)/, "the initial profile read must be captured separately from the timezone backfill")

// The timezone-backfill UPDATE must never be able to throw past this point --
// a `.catch` (or equivalent) must recover to the already-loaded profile
// rather than letting the backfill's failure propagate as the load's own
// failure.
assert.match(contextSource, /persistProfile\(user\.id,\s*\{\s*timezone:\s*browserTimeZone\(\)\s*\}\)\.catch\(\(\)\s*=>\s*loaded\)/, "a failed timezone backfill must fall back to the already-successful profile read, not throw")

// setProfile must be reachable via a path that only depends on the initial
// read succeeding -- i.e. it must not sit inside a branch that only runs
// when the backfill itself succeeds.
const tryBlock = contextSource.slice(contextSource.indexOf("const loaded"), contextSource.indexOf("} catch (reason) {"))
assert.match(tryBlock, /setProfile\(next\)/, "setProfile must run once per refresh, fed by data that survives a backfill failure")
assert.equal((tryBlock.match(/setProfile\(/g) || []).length, 1, "setProfile must be called exactly once in the success path -- no separate call gated behind the backfill succeeding")

// Guard against silently re-introducing a hard failure: persistProfile must
// be called exactly once (the guarded backfill above) -- a second,
// unguarded call anywhere in the try block would reopen the original bug.
assert.equal((tryBlock.match(/persistProfile\(/g) || []).length, 1, "persistProfile must only be called once in the refresh path -- as the .catch-guarded backfill")

// Column-drift guard: the columns the client selects/updates must stay in
// sync with what was verified live against the Supabase project
// (qyteadrlrsjuhtwggayk) on 2026-08-19, right after the extend_study_preferences
// migration. If this list and the live schema ever diverge again, profile
// loading breaks the same way -- this test can't see the live database, but
// it pins the client's expectation so a future column rename/removal in
// services/profiles.ts is a deliberate, visible change.
const profilesSource = readFileSync(new URL("../src/services/profiles.ts", import.meta.url), "utf8")
const verifiedLiveColumns = [
  "display_name", "university", "major", "graduation_year", "catalog_year",
  "expected_graduation_term", "timezone", "preferred_study_time",
  "focus_session_minutes", "prefers_breaks", "break_duration_minutes",
  "non_academic_constraints", "planning_style", "primary_support_goal",
]
const match = profilesSource.match(/const profileColumns\s*=\s*\n?\s*"([^"]+)"/)
assert.ok(match, "profileColumns must be a single quoted column list in services/profiles.ts")
const selectedColumns = match[1].split(",")
assert.deepEqual([...selectedColumns].sort(), [...verifiedLiveColumns].sort(), "profileColumns must match the columns verified live on public.profiles -- if this fails, either the live schema changed or this list drifted; re-verify against the live project before updating either side")

console.log("profile load survives a failed timezone backfill, and profileColumns stays pinned to the verified live schema")
