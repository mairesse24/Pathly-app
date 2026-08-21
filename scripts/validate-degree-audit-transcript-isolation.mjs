import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Regression coverage for an audit of why "My Audit.pdf" (a degree_audit upload) could not
// be reviewed, and whether an unofficial transcript uploaded alongside a degree audit can
// affect degree audit processing or degree-plan state. Live Supabase records showed the two
// document types are isolated everywhere except one RPC; this locks that isolation in at the
// database boundary (not just via frontend routing) so it can't silently regress. Following
// the pattern already used by validate-degree-audit-isolation.mjs and
// validate-degree-processing-pipeline.mjs, this asserts against source text rather than
// executing against a live database.

const edge = readFileSync(
  new URL("../supabase/functions/process-academic-file/index.ts", import.meta.url),
  "utf8",
)

// (1) Degree Audit retry must target the exact upload the caller asked for, by id -- never
// "the latest academic document" across categories. There is exactly one upload lookup in
// this function and it must be id-scoped.
assert.match(
  edge,
  /\.from\("uploaded_files"\)\.select\("\*"\)\.eq\("id",\s*uploadId\)\.eq\("user_id",\s*user\.id\)/,
  "processing must look up the exact uploadId supplied by the caller, not the latest upload in any category",
)
assert.doesNotMatch(
  edge,
  /order\(\s*"created_at"[\s\S]{0,80}limit\(1\)/,
  "processing must not select 'the latest' upload/result by recency instead of by id",
)

// (2) The ai_processing_results row this function creates is always tagged with the kind of
// the specific upload being processed -- never inferred from any other document -- so a
// transcript processed in one request can't mislabel a degree audit processed in another.
assert.match(
  edge,
  /\.insert\(\{[^}]*kind:\s*upload\.category/,
  "a processed result's kind must come from this upload's own category, not be assumed or copied from elsewhere",
)

const degreePlanningService = readFileSync(
  new URL("../src/services/degreePlanning.ts", import.meta.url),
  "utf8",
)
// (3) The "latest degree audit upload" lookup that drives the DegreePlanner's retry/upload
// notice must filter by category = degree_audit -- an unfiltered "latest academic document"
// query would let a more recently uploaded unofficial transcript stand in for the degree
// audit's own state (e.g. showing the transcript's processing_failed instead of the audit's).
assert.match(
  degreePlanningService,
  /getLatestDegreeAuditUploadState[\s\S]{0,300}\.eq\("category",\s*"degree_audit"\)/,
  "the degree audit upload-state lookup must filter by category = degree_audit, not return the latest upload of any kind",
)

// (4) confirm_academic_record_processing (the Unofficial Transcript confirmation RPC) must
// accept only kind = 'unofficial_transcript'. It previously accepted
// kind in ('degree_audit', 'unofficial_transcript'), which let a degree_audit processing
// result be confirmed through the transcript path -- silently skipping creation of
// user_degree_plans / user_degree_requirement_groups (this RPC never writes those tables)
// while still marking the audit "approved", so it could never be run through
// confirm_degree_audit_processing (which requires status = 'ready_for_review') again.
const transcriptConfirmRaw = readFileSync(
  new URL(
    "../supabase/migrations/20260821161500_isolate_degree_audit_transcript_confirmation.sql",
    import.meta.url,
  ),
  "utf8",
)
// Strip comment lines before asserting against the SQL itself -- the migration's own
// explanatory comment names the old, now-fixed `kind in ('degree_audit', ...)` clause in
// prose, which would otherwise false-positive against a naive text match.
const transcriptConfirm = transcriptConfirmRaw.replace(/^\s*--.*$/gm, "")
assert.match(
  transcriptConfirm,
  /kind\s*=\s*'unofficial_transcript'/,
  "confirm_academic_record_processing must require kind = 'unofficial_transcript' exactly",
)
assert.doesNotMatch(
  transcriptConfirm,
  /kind\s+in\s*\(\s*'degree_audit'/i,
  "confirm_academic_record_processing must not also accept degree_audit -- that's the mixing bug",
)
assert.doesNotMatch(
  transcriptConfirm,
  /user_degree_plans|user_degree_requirement_groups/,
  "the transcript confirmation path must never write degree-plan tables",
)

// (5) confirm_degree_audit_processing (the Degree Audit confirmation RPC, most recently
// redefined in 20260817160000) must stay scoped to kind = 'degree_audit' only, so an
// unofficial transcript's processing id can never be confirmed through the degree-audit path
// and land in user_degree_plans / user_degree_requirement_groups.
const degreeAuditConfirm = readFileSync(
  new URL("../supabase/migrations/20260817160000_degree_audit_course_applications.sql", import.meta.url),
  "utf8",
)
assert.match(
  degreeAuditConfirm,
  /kind\s*=\s*'degree_audit'/,
  "confirm_degree_audit_processing must require kind = 'degree_audit' exactly",
)
assert.doesNotMatch(
  degreeAuditConfirm,
  /kind\s+in\s*\([^)]*unofficial_transcript/i,
  "confirm_degree_audit_processing must not also accept unofficial_transcript",
)

console.log("degree audit / unofficial transcript retrieval, retry, and confirmation isolation checks passed")
