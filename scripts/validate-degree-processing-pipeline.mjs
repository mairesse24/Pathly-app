import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { degreeAuditSchema, normalizeDegreeAuditResult } from "../supabase/functions/_shared/processingSchemas.mjs"

function accepts(schema, value) {
  if (schema.anyOf) return schema.anyOf.some((branch) => accepts(branch, value))
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  const matches = types.some((type) => type === "null" ? value === null : type === "array" ? Array.isArray(value) : type === "integer" ? Number.isInteger(value) : type === "number" ? Number.isFinite(value) : type === "object" ? value !== null && typeof value === "object" && !Array.isArray(value) : typeof value === type)
  if (!matches || schema.enum && !schema.enum.includes(value)) return false
  if (schema.type === "object") return (schema.required || []).every((key) => key in value) && Object.entries(schema.properties || {}).every(([key, child]) => !(key in value) || accepts(child, value[key]))
  if (schema.type === "array") return value.every((item) => accepts(schema.items, item))
  return true
}

const emptyRequirement = { requirement_label: "Major requirements", status: "unclear", credits_required: null, credits_completed: null, credits_remaining: null, required_course_codes: [], applied_courses: [], choice_requirement_text: null, details: null }
const personal = { document_type: "personal_audit", university: "University", major: "Major", catalog_year: null, total_credits_required: 120, total_credits_completed: 60, courses: [{ course_code: "CS 101", course_title: "Intro", credit_hours: 3, status: "completed", term: null, year: null, requirement_label: null }], requirements: [emptyRequirement] }
assert.ok(accepts(degreeAuditSchema, personal), "a personal audit with incomplete optional fields stays reviewable")
assert.equal(normalizeDegreeAuditResult(personal).courses[0].status, "completed")

const guide = normalizeDegreeAuditResult({ ...personal, document_type: "program_guide", total_credits_completed: 60, requirements: [{ ...emptyRequirement, status: "satisfied", applied_courses: [{ course_code: "CS 101", credits_applied: 3 }] }] })
assert.deepEqual(guide.courses, [], "a guide cannot become personal history")
assert.equal(guide.total_credits_completed, null)
assert.deepEqual(guide.requirements[0].applied_courses, [])

const edge = readFileSync(new URL("../supabase/functions/process-academic-file/index.ts", import.meta.url), "utf8")
assert.match(edge, /no extractable text[^]*code: "no_extractable_text"|code: "no_extractable_text"/, "unreadable PDFs need a stable diagnostic")
assert.match(edge, /stop_reason === "max_tokens"/, "truncated structured output must fail explicitly")
assert.match(edge, /extractAnthropicStructuredOutput\(claude\)/, "Anthropic output must be extracted before persistence")
assert.ok(edge.indexOf("extractAnthropicStructuredOutput(claude)") < edge.indexOf('.from("ai_processing_results").insert'), "malformed output must not be stored as reviewable")
assert.ok(edge.indexOf('.from("ai_processing_results").select("*")') < edge.indexOf('processing_status: "processing"'), "retry must reuse an existing processing result before claiming work")

const confirmation = readFileSync(new URL("../supabase/migrations/20260817160000_degree_audit_course_applications.sql", import.meta.url), "utf8")
assert.match(confirmation, /status='ready_for_review'/i, "degree progress can only be committed from explicit review state")
assert.match(confirmation, /on conflict[^;]+do nothing/is, "approval retries must not duplicate course records")
assert.doesNotMatch(edge, /user_degree_(courses|plans|requirement_groups)/, "AI processing must not commit degree progress")

console.log("degree processing classification, failures, retry isolation, and review-before-save checks passed")
