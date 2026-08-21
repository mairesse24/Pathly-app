import assert from "node:assert/strict"
import {
  academicRecordSchema,
  degreeAuditSchema,
  lectureSchema,
  syllabusSchema,
} from "../supabase/functions/_shared/processingSchemas.mjs"

// Regression guard for the live syllabus-processing failure: "CSCE3444 - Google Docs.pdf"
// failed process-academic-file with `Anthropic request failed (400): Schemas contains too
// many parameters with union types (18 parameters with type arrays or anyOf) ... limit: 16
// parameters with unions.` -- unconditional for every syllabus upload, independent of the
// document's content, since Anthropic rejects an over-limit schema before generation starts.
//
// Anthropic counts a "parameter with a union type" as any schema node using `anyOf`, or a
// `type` array like ["string","null"] -- this walker mirrors that rule across the whole
// schema tree (including nested array-item properties), so it catches a future regression
// anywhere in these schemas, not just at the top level.
const ANTHROPIC_MAX_UNION_PARAMETERS = 16

function countUnionParameters(schema, seen = new Set()) {
  if (!schema || typeof schema !== "object" || seen.has(schema)) return 0
  seen.add(schema)
  let count = 0
  if (schema.anyOf || Array.isArray(schema.type)) count += 1
  if (schema.anyOf) for (const branch of schema.anyOf) count += countUnionParameters(branch, seen)
  if (schema.items) count += countUnionParameters(schema.items, seen)
  if (schema.properties) for (const child of Object.values(schema.properties)) count += countUnionParameters(child, seen)
  return count
}

// Pinned exact counts, not just the <=16 bound: a future edit that silently adds or removes
// a union-typed field should fail loudly here rather than only being caught if it happens to
// cross the limit.
assert.equal(countUnionParameters(syllabusSchema), 14, "syllabusSchema's union-parameter count drifted -- update this pin if the change was intentional, but first confirm it stays <=16")
assert.ok(countUnionParameters(syllabusSchema) <= ANTHROPIC_MAX_UNION_PARAMETERS, `syllabusSchema has more union-typed parameters than Anthropic's structured-output limit of ${ANTHROPIC_MAX_UNION_PARAMETERS}`)

// The four fields that were converted from required-and-nullable to optional-and-omittable
// to get under the limit must actually be optional now (not required), and must be plain
// single-typed properties (no anyOf/null union) -- both are required for them to not count
// against the limit at all.
const roadmapItem = syllabusSchema.properties.roadmap.items
assert.ok(!roadmapItem.required.includes("deliverable"), "roadmap.deliverable must be optional, not required")
assert.deepEqual(roadmapItem.properties.deliverable, { type: "string" }, "roadmap.deliverable must be a plain non-nullable optional string")

const assignmentItem = syllabusSchema.properties.assignments.items
assert.ok(!assignmentItem.required.includes("estimated_minutes"), "assignments.estimated_minutes must be optional, not required")
assert.deepEqual(assignmentItem.properties.estimated_minutes, { type: "integer" }, "assignments.estimated_minutes must be a plain non-nullable optional integer")

const examItem = syllabusSchema.properties.exams.items
assert.ok(!examItem.required.includes("location"), "exams.location must be optional, not required")
assert.deepEqual(examItem.properties.location, { type: "string" }, "exams.location must be a plain non-nullable optional string")
assert.ok(!examItem.required.includes("topics_summary"), "exams.topics_summary must be optional, not required")
assert.deepEqual(examItem.properties.topics_summary, { type: "string" }, "exams.topics_summary must be a plain non-nullable optional string")

// Course metadata, roadmap, assignment, and exam extraction must still be fully present --
// this fix must not have dropped a field from the schema, only changed how the four fields
// above express optionality.
for (const field of ["course_code", "course_title", "instructor", "credits", "meeting_days", "meeting_start", "meeting_end", "location", "course_summary", "roadmap", "assignments", "exams"]) {
  assert.ok(field in syllabusSchema.properties, `syllabusSchema must still extract ${field}`)
}
assert.deepEqual(new Set(Object.keys(roadmapItem.properties)), new Set(["period_label", "topic", "description", "deliverable", "date"]), "roadmap item must still carry all five fields")
assert.deepEqual(new Set(Object.keys(assignmentItem.properties)), new Set(["title", "description", "due_at", "estimated_minutes"]), "assignment item must still carry all four fields")
assert.deepEqual(new Set(Object.keys(examItem.properties)), new Set(["title", "exam_at", "location", "topics_summary"]), "exam item must still carry all four fields")

// Validation was narrowed for exactly four named fields, not weakened globally: every other
// schema in this file, and every other property on syllabusSchema itself, keeps its original
// strictness (additionalProperties:false throughout, and no other field moved out of
// required).
assert.equal(syllabusSchema.additionalProperties, false)
assert.equal(roadmapItem.additionalProperties, false)
assert.equal(assignmentItem.additionalProperties, false)
assert.equal(examItem.additionalProperties, false)
assert.deepEqual(syllabusSchema.required, ["course_code", "course_title", "instructor", "credits", "meeting_days", "meeting_start", "meeting_end", "location", "course_summary", "roadmap", "assignments", "exams"], "no top-level syllabus field may become optional -- only the four named nested fields")
assert.deepEqual(roadmapItem.required, ["period_label", "topic", "description", "date"])
assert.deepEqual(assignmentItem.required, ["title", "description", "due_at"])
assert.deepEqual(examItem.required, ["title", "exam_at"])

// Degree Audit v22 (separate two-stage schemas in degreeAuditCompact.mjs, not this file)
// must be untouched by this change, and the other schemas here must stay comfortably under
// the same Anthropic limit.
assert.ok(countUnionParameters(lectureSchema) <= ANTHROPIC_MAX_UNION_PARAMETERS)
assert.ok(countUnionParameters(academicRecordSchema) <= ANTHROPIC_MAX_UNION_PARAMETERS)
assert.ok(countUnionParameters(degreeAuditSchema) <= ANTHROPIC_MAX_UNION_PARAMETERS)

console.log("syllabus schema Anthropic union-parameter compatibility checks passed")
