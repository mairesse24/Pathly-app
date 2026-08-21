import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  combineDegreeAuditStages,
  DEGREE_AUDIT_STAGE_MAX_TOKENS,
  degreeAuditOverviewSchema,
  degreeAuditRequirementsSchema,
} from "../supabase/functions/_shared/degreeAuditCompact.mjs"

assert.equal(DEGREE_AUDIT_STAGE_MAX_TOKENS, 8000)
assert.equal(degreeAuditOverviewSchema.properties.courses.maxItems, 180)
assert.equal(degreeAuditRequirementsSchema.properties.requirements.maxItems, 60)
assert.equal(degreeAuditRequirementsSchema.properties.requirements.items.properties.notes.anyOf[0].maxLength, 240)
assert.ok(!("applied_courses" in degreeAuditRequirementsSchema.properties.requirements.items.properties))
assert.ok(!("choice_requirement_text" in degreeAuditRequirementsSchema.properties.requirements.items.properties))

const courses = Array.from({ length: 140 }, (_, index) => ({
  course_code: `CS ${1000 + index}`,
  course_title: `Course ${index}`,
  credit_hours: 3,
  status: "completed",
  term: "Fall",
  year: 2025,
  requirement_label: `Area ${index % 20}`,
}))
const requirementStage = {
  document_type: "personal_audit",
  requirements: Array.from({ length: 45 }, (_, index) => ({
    requirement_label: `Area ${index}`,
    status: index < 20 ? "satisfied" : "incomplete",
    credits_required: 9,
    credits_completed: index < 20 ? 9 : 0,
    credits_remaining: index < 20 ? 0 : 9,
    required_course_codes: Array.from({ length: 12 }, (__, code) => `CS ${1000 + index * 12 + code}`),
    notes: "Choose approved courses; see the audit for advisor-specific exceptions.",
  })),
}
const combined = combineDegreeAuditStages({ document_type: "personal_audit", university: "University", major: "Computer Science", catalog_year: 2025, total_credits_required: 120, total_credits_completed: 90, courses }, requirementStage)
const conservativeTokenEstimate = Math.ceil(JSON.stringify(combined).length / 3)
assert.ok(conservativeTokenEstimate < DEGREE_AUDIT_STAGE_MAX_TOKENS * 2, `large audit result estimate ${conservativeTokenEstimate} exceeds combined staged budget`)
assert.ok(combined.requirements.every((item) => item.details.length <= 240))

const edge = await readFile(new URL("../supabase/functions/process-academic-file/index.ts", import.meta.url), "utf8")
assert.match(edge, /Promise\.all\(\[/, "degree-audit stages should run concurrently")
assert.ok(edge.indexOf("anthropicResponseShape(claude)") < edge.indexOf('claude.stop_reason === "max_tokens"'), "safe response metadata must be logged before max-token failure")
assert.match(edge, /normalizeDegreeAuditResult\(structured\)/)
assert.doesNotMatch(edge, /user_degree_(courses|plans|requirement_groups)/)

console.log(`Large degree-audit review estimate ${conservativeTokenEstimate} tokens fits within the ${DEGREE_AUDIT_STAGE_MAX_TOKENS * 2}-token staged budget`)
