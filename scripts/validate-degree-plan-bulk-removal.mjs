import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Regression coverage for the two Degree Plan bulk-removal actions: "Remove imported
// coursework" (scoped to one academic_record_imports row) and "Remove confirmed guide"
// (scoped to the one active user_degree_plans row). Both are provenance-scoped deletes, not
// user-wide ones, and must never reach into each other's tables. These are RPC/RLS behaviors
// that need a live Postgres connection to execute, so -- following the pattern already used by
// validate-degree-audit-isolation.mjs and validate-degree-audit-transcript-isolation.mjs --
// this asserts against the migration SQL text rather than executing it.

const transcriptRaw = readFileSync(
  new URL("../supabase/migrations/20260821170000_transcript_import_provenance_and_removal.sql", import.meta.url),
  "utf8",
)
const transcript = transcriptRaw.replace(/^\s*--.*$/gm, "")
const guideRaw = readFileSync(
  new URL("../supabase/migrations/20260821180000_remove_confirmed_guide.sql", import.meta.url),
  "utf8",
)
const guide = guideRaw.replace(/^\s*--.*$/gm, "")

// (1) Removing coursework does not remove the guide: remove_transcript_import's body must
// never reference the degree-plan tables at all.
const removeTranscriptFn = transcript.slice(
  transcript.indexOf("create or replace function public.remove_transcript_import"),
  transcript.indexOf("create or replace function public.remove_transcript_import") +
    transcript.slice(transcript.indexOf("create or replace function public.remove_transcript_import")).indexOf("$$;") + 3,
)
assert.doesNotMatch(
  removeTranscriptFn,
  /user_degree_plans|user_degree_requirement_groups|user_degree_requirements/,
  "remove_transcript_import must never touch user_degree_plans or its requirement tables",
)

// (2) Removing the guide does not remove coursework: remove_confirmed_guide's body must never
// reference completed_courses -- the student's actual completed/in-progress coursework lives
// there, with no foreign-key path from user_degree_plans.
assert.doesNotMatch(
  guide,
  /completed_courses/,
  "remove_confirmed_guide must never touch completed_courses",
)
// It must also never touch uploaded_files -- the source upload is only deleted if the student
// separately chooses to delete it elsewhere.
assert.doesNotMatch(
  guide,
  /uploaded_files/,
  "remove_confirmed_guide must never touch uploaded_files",
)
// It must be scoped to exactly one plan by id, not every plan the user has ever had.
assert.match(
  guide,
  /where id=p_plan_id and user_id=\(select auth\.uid\(\)\) and status='active'/,
  "remove_confirmed_guide must be scoped to the one plan id passed in, not a broad user-wide delete",
)
// It must refuse to run against a personal degree audit -- only a guide (no completed-credits
// figure) may be removed by this action.
assert.match(
  guide,
  /if owned\.total_credits_completed is not null then\s*\n\s*raise exception/,
  "remove_confirmed_guide must refuse to remove a personal degree audit, only a program guide",
)
// The delete itself must be scoped by the plan's own id (and its owner) -- cascade to
// user_degree_requirement_groups/user_degree_requirements happens via the existing
// "on delete cascade" foreign keys, not a second broad statement here.
assert.match(
  guide,
  /delete from public\.user_degree_plans where id=owned\.id and user_id=owned\.user_id/,
  "the guide delete must be scoped to the owned plan's own id",
)
assert.doesNotMatch(
  guide,
  /delete from public\.user_degree_requirement_groups|delete from public\.user_degree_requirements/,
  "removal of requirement groups/requirements must happen via the existing on-delete-cascade foreign keys, not a separate broad delete statement",
)

// (3) Manual coursework remains: the transcript-removal path must only ever delete/update
// completed_courses rows whose source is 'transcript' -- a manually added row (source='manual')
// is structurally unreachable by either statement.
assert.match(
  transcript,
  /delete from public\.completed_courses where user_id=owned\.user_id and course_code=item\.course_code and source='transcript'/,
  "the delete path must filter on source='transcript', never touching a manually added row",
)
assert.match(
  transcript,
  /update public\.completed_courses set[\s\S]{0,300}where user_id=owned\.user_id and course_code=item\.course_code and source='transcript'/,
  "the restore-from-another-import path must also filter on source='transcript'",
)
// The preview function reports manual rows as explicitly preserved, never counted as affected.
assert.match(
  transcript,
  /'manual_rows_preserved',count\(\*\) filter\(where source='manual'\)/,
  "the removal preview must report manual rows as preserved, not as part of what will be deleted",
)

// (4) Unrelated imports remain: every mutating statement in remove_transcript_import must be
// scoped to the one target import (p_import_id) or to course codes drawn from it -- an import
// this user made from a different transcript upload is never referenced.
const removeTranscriptBody = removeTranscriptFn
assert.match(
  removeTranscriptBody,
  /select \* into owned from public\.academic_record_imports where id=p_import_id and user_id=\(select auth\.uid\(\)\) and removed_at is null for update/,
  "the target import must be looked up and locked by its own id",
)
assert.match(
  removeTranscriptBody,
  /for item in select \* from public\.academic_record_import_courses where import_id=p_import_id loop/,
  "only course rows belonging to the target import are iterated",
)
assert.match(
  removeTranscriptBody,
  /update public\.academic_record_imports set removed_at=now\(\) where id=p_import_id/,
  "only the target import row itself is marked removed",
)
// No statement may soft- or hard-delete another import's own academic_record_imports row, and
// no statement deletes from academic_record_import_courses at all -- a removed import's course
// rows stay in place (marked removed via their parent import's removed_at), so another active
// import's rows are never touched by this function.
assert.doesNotMatch(
  removeTranscriptBody,
  /delete from public\.academic_record_import_courses|delete from public\.academic_record_imports/,
  "remove_transcript_import must not hard-delete import or import-course rows -- only the target import is soft-removed via removed_at",
)
assert.doesNotMatch(
  removeTranscriptBody,
  /update public\.academic_record_imports set[\s\S]*where user_id=owned\.user_id\s*;/,
  "the removed_at update must never be scoped by user_id alone -- that would mark every import removed, not just the target one",
)

// (5) Both actions require explicit confirmation before mutating, at the UI boundary.
const degreePlanner = readFileSync(
  new URL("../src/pages/DegreePlanner/index.tsx", import.meta.url),
  "utf8",
)
const removeGuideFn = degreePlanner.slice(degreePlanner.indexOf("async function removeGuide"), degreePlanner.indexOf("async function removeGuide") + 700)
assert.match(removeGuideFn, /window\.confirm\(/, "removing the confirmed guide must be gated behind a confirmation prompt")
const removeImportedFn = degreePlanner.slice(degreePlanner.indexOf("async function removeImportedCourses"), degreePlanner.indexOf("async function removeImportedCourses") + 1600)
assert.match(removeImportedFn, /window\.confirm\(/, "removing imported coursework must be gated behind a confirmation prompt")
// The confirmation for imported-coursework removal must show the count first (the preview
// call happens, and its numbers are read into the confirm message, before removeTranscriptImport
// is ever called).
const confirmIndex = removeImportedFn.indexOf("window.confirm(")
const previewIndex = removeImportedFn.indexOf("previewTranscriptImportRemoval(")
const removeCallIndex = removeImportedFn.indexOf("await removeTranscriptImport(")
assert.ok(previewIndex >= 0 && previewIndex < confirmIndex, "the removal count must be fetched before the confirmation prompt")
assert.ok(confirmIndex < removeCallIndex, "the confirmation prompt must happen before the actual removal call")

// (6) Both actions are wired into the Degree Plan page, not just Upload Center.
assert.match(degreePlanner, /removeConfirmedGuide/, "Degree Plan must call the remove_confirmed_guide service")
assert.match(degreePlanner, /removeTranscriptImport/, "Degree Plan must call the remove_transcript_import service")

console.log("Degree Plan bulk-removal actions: guide/coursework isolation, manual-row and unrelated-import preservation, and confirm-before-remove checks passed")
