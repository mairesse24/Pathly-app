import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

// Regression guard for two bugs found while auditing why Companion claimed it had no
// CSCE 3600 syllabus even though the syllabus had been reviewed and its Course Roadmap
// extracted. Both bugs live in Supabase-query code that can't run outside a real Postgres
// connection, so -- following the pattern already used by
// scripts/validate-degree-processing-pipeline.mjs -- this asserts against the edge
// function's source text instead of executing it.
const edge = readFileSync(
  new URL("../supabase/functions/pathly-companion/index.ts", import.meta.url),
  "utf8",
)

// Bug 1: uploaded_files.processing_status never actually takes the value "approved" (its
// check constraint only allows pending_upload/uploaded/upload_failed/processing/
// ready_for_review/processed/processing_failed -- "approved" is a status on a different
// table, ai_processing_results). Filtering uploaded_files on "approved" silently excluded
// every file the student had actually reviewed and confirmed.
assert.doesNotMatch(
  edge,
  /uploaded_files[\s\S]{0,400}processing_status["']\s*,\s*\["ready_for_review",\s*"approved"\]/,
  "uploaded_files must not be filtered on the nonexistent 'approved' processing_status",
)
assert.match(
  edge,
  /in\("processing_status",\s*\["ready_for_review",\s*"processed"\]\)/,
  "uploaded_files must accept its real terminal status, 'processed', once reviewed",
)

// Bug 2: Course Roadmap entries (the syllabus-derived week/topic schedule) were never
// fetched by Companion at all, so even a fully processed syllabus had no roadmap source to
// cite for a "what topics are we covering" question.
assert.match(
  edge,
  /\.from\("course_roadmap_entries"\)/,
  "Companion must query course_roadmap_entries so a course's syllabus-derived topic schedule is available context",
)
assert.match(
  edge,
  /wantsRoadmap/,
  "Companion must route 'what topics/what are we covering' questions to the roadmap lookup",
)

console.log("Companion knowledge-routing regression checks passed")
