import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const migration = readFileSync(new URL("../supabase/migrations/20260819010000_course_roadmap.sql", import.meta.url), "utf8").toLowerCase()

// Table shape: owner-scoped, course-scoped, provenance-carrying, and a
// week/period dedup key so re-approving the same syllabus never duplicates
// roadmap rows (mirrors the assignments/exams syllabus_item_key pattern).
assert.match(migration, /create table public\.course_roadmap_entries/)
assert.match(migration, /period_label text/)
assert.match(migration, /topic text not null/)
assert.match(migration, /deliverable text/)
assert.match(migration, /entry_date date/)
assert.match(migration, /foreign key \(course_id, user_id\) references public\.courses\(id, user_id\) on delete cascade/)
assert.match(migration, /course_roadmap_entries_item_key_unique/)

// RLS: owner-scoped access only, no security definer anywhere in this file.
assert.match(migration, /alter table public\.course_roadmap_entries enable row level security/)
assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\) with check \(\(select auth\.uid\(\)\) = user_id\)/)
assert.doesNotMatch(migration, /security definer/)

// The RPC must be security invoker with a locked-down search_path, exactly
// like every other function in this codebase.
assert.match(migration, /language plpgsql security invoker set search_path = ''/)

// approving syllabus metadata must still persist course-level instructor
// (the CSCE 3444 regression case: instructor "Hadiseh Gooran" must reach
// public.courses.instructor once approved). This line must survive
// unchanged from the prior migration -- only additive changes are safe here.
assert.match(migration, /instructor=case when p_course_metadata \? 'instructor' then nullif\(trim\(p_course_metadata->>'instructor'\),''\) else instructor end/)

// The new roadmap param and insert must exist, and the two stale
// approve_syllabus_processing overloads must be dropped so PostgREST can
// never resolve to dead logic again.
assert.match(migration, /p_roadmap jsonb default '\[\]'::jsonb/)
assert.match(migration, /insert into public\.course_roadmap_entries/)
assert.match(migration, /drop function if exists public\.approve_syllabus_processing\(uuid,jsonb,jsonb,uuid\);/)
assert.match(migration, /drop function if exists public\.approve_syllabus_processing\(uuid,jsonb,jsonb,uuid,jsonb\);/)
assert.match(migration, /grant execute on function public\.approve_syllabus_processing\(uuid,jsonb,jsonb,uuid,jsonb,jsonb\) to authenticated/)

console.log("course_roadmap_entries migration: RLS, security-invoker, instructor persistence, and roadmap insert all present")
