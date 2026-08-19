import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { degreeAuditSchema, normalizeDegreeAuditResult } from "../supabase/functions/_shared/processingSchemas.mjs"

// Regression case: University of North Texas 2025-2026 B.S. Computer Science
// degree/transfer guide (ComputerScienceBS2025-2026TransferGuide.pdf). This
// is a program curriculum document -- it names required courses, requirement
// groups, and a minimum credit total for every student in the program, but
// it never shows any specific student's completion status. Before this fix,
// uploading it under the "degree_audit" category forced the model into a
// schema that required a completed/in_progress status on every extracted
// course, which this document never states -- producing "We couldn't review
// this document" for a perfectly valid academic-planning PDF.

function isType(value, type) {
  if (type === "null") return value === null
  if (type === "array") return Array.isArray(value)
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value)
  if (type === "integer") return Number.isInteger(value)
  if (type === "number") return typeof value === "number" && Number.isFinite(value)
  return typeof value === type
}
function validate(schema, value, path = "$") {
  if (schema.anyOf) {
    if (!schema.anyOf.some((branch) => { try { validate(branch, value, path); return true } catch { return false } })) throw new Error(`${path} matches no anyOf branch`)
    return
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (!types.some((type) => isType(value, type))) throw new Error(`${path} has the wrong type`)
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} is outside its enum`)
  if (schema.type === "object") {
    for (const key of schema.required || []) if (!(key in value)) throw new Error(`${path}.${key} is required`)
    for (const [key, child] of Object.entries(schema.properties || {})) if (key in value) validate(child, value[key], `${path}.${key}`)
  }
  if (schema.type === "array") value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`))
}

// A well-behaved extraction of the UNT CS 2025-2026 guide: no personal
// courses, a credit-bearing requirement group per the printed curriculum,
// and every requirement status left "unclear" because the guide shows no
// student's progress.
const untGuideResult = {
  document_type: "program_guide",
  university: "University of North Texas",
  major: "B.S. Computer Science",
  catalog_year: 2025,
  total_credits_required: 120,
  total_credits_completed: null,
  courses: [],
  requirements: [
    {
      requirement_label: "Computer Science Required Courses",
      status: "unclear",
      credits_required: 40,
      credits_completed: null,
      credits_remaining: null,
      required_course_codes: ["CSCE 1010", "CSCE 1015", "CSCE 1030", "CSCE 1040", "CSCE 2100", "CSCE 2110"],
      applied_courses: [],
      choice_requirement_text: null,
      details: "Year 1, Fall: CSCE 1010, CSCE 1015. Transfer equivalent (TCCNS): COSC 1336 = CSCE 1030.",
    },
    {
      requirement_label: "Mathematics Requirements",
      status: "unclear",
      credits_required: 13,
      credits_completed: null,
      credits_remaining: null,
      required_course_codes: ["MATH 1710", "MATH 1720", "MATH 1780", "MATH 2700"],
      applied_courses: [],
      choice_requirement_text: null,
      details: "Year 1, Fall: MATH 1710. Transfer equivalent (TCCNS): MATH 2413 = MATH 1710.",
    },
  ],
}
validate(degreeAuditSchema, untGuideResult, "$")

// document_type is mandatory in the schema itself -- a structured response
// that omits classification entirely must fail validation rather than
// silently default to treating the document as a personal audit.
const missingType = { ...untGuideResult }
delete missingType.document_type
assert.throws(() => validate(degreeAuditSchema, missingType, "$"), /document_type/, "omitting document_type must fail schema validation")

// The core regression guard: even if the model does not comply -- marking
// this as a program_guide but still hallucinating a personal completion
// signal (a real failure mode structured-output models can have) --
// normalizeDegreeAuditResult must strip every trace of it before it ever
// reaches storage or the review UI.
const nonCompliantModelOutput = {
  ...untGuideResult,
  total_credits_completed: 88,
  courses: [
    { course_code: "CSCE 1010", course_title: "Discovering Computer Science", credit_hours: 3, status: "completed", term: "Fall", year: 2024, requirement_label: "Computer Science Required Courses" },
    { course_code: "CSCE 1030", course_title: "Computer Science I", credit_hours: 3, status: "in_progress", term: "Spring", year: 2026, requirement_label: "Computer Science Required Courses" },
  ],
  requirements: untGuideResult.requirements.map((item) => ({
    ...item,
    status: "in_progress",
    applied_courses: [{ course_code: "CSCE 1010", credits_applied: 3 }],
  })),
}
const normalized = normalizeDegreeAuditResult(nonCompliantModelOutput)
assert.equal(normalized.document_type, "program_guide")
assert.deepEqual(normalized.courses, [], "a program guide must never carry personal coursework, even if the model hallucinated some")
assert.equal(normalized.total_credits_completed, null, "a program guide must never carry a completed-credits figure")
assert.ok(normalized.requirements.every((item) => item.status === "unclear"), "every program-guide requirement status must be forced to unclear")
assert.ok(normalized.requirements.every((item) => item.applied_courses.length === 0), "a program guide must never carry applied-course data")
// The actual curriculum facts -- the whole point of extracting a guide --
// must survive normalization untouched.
assert.equal(normalized.university, "University of North Texas")
assert.equal(normalized.catalog_year, 2025)
assert.equal(normalized.total_credits_required, 120)
assert.deepEqual(normalized.requirements[0].required_course_codes, untGuideResult.requirements[0].required_course_codes)
assert.match(normalized.requirements[0].details, /Year 1, Fall/, "recommended-term text explicitly printed in the guide must be preserved")
assert.match(normalized.requirements[1].details, /TCCNS/, "explicit TCCNS transfer-equivalent text must be preserved")

// A genuine personal degree audit (completion status explicitly printed for
// a specific student) must NOT be touched by this normalizer -- the fix
// must not regress the existing, working personal-audit path.
const personalAudit = {
  document_type: "personal_audit",
  university: "University of North Texas",
  major: "Computer Science",
  catalog_year: 2025,
  total_credits_required: 120,
  total_credits_completed: 45,
  courses: [
    { course_code: "CSCE 1010", course_title: "Discovering Computer Science", credit_hours: 3, status: "completed", term: "Fall", year: 2024, requirement_label: null },
  ],
  requirements: [
    { requirement_label: "Computer Science Required Courses", status: "in_progress", credits_required: 40, credits_completed: 3, credits_remaining: 37, required_course_codes: [], applied_courses: [{ course_code: "CSCE 1010", credits_applied: 3 }], choice_requirement_text: null, details: null },
  ],
}
validate(degreeAuditSchema, personalAudit, "$")
const normalizedPersonal = normalizeDegreeAuditResult(personalAudit)
assert.deepEqual(normalizedPersonal.courses, personalAudit.courses, "a real personal audit's coursework must pass through unchanged")
assert.equal(normalizedPersonal.total_credits_completed, 45)
assert.equal(normalizedPersonal.requirements[0].status, "in_progress")
assert.equal(normalizedPersonal.requirements[0].applied_courses.length, 1)

// A document Pathly cannot recognize as either kind must come back
// completely empty -- no fabricated program facts, no personal data --
// rather than being coerced into looking like a failed personal audit.
const unsupported = normalizeDegreeAuditResult({ document_type: "unsupported", university: "Somewhere State", major: "Undeclared", catalog_year: 1999, total_credits_required: 60, total_credits_completed: 12, courses: [{ course_code: "X", course_title: "Y", credit_hours: 3, status: "completed", term: null, year: null, requirement_label: null }], requirements: [{ requirement_label: "Z", status: "satisfied", credits_required: null, credits_completed: null, credits_remaining: null, required_course_codes: [], applied_courses: [], choice_requirement_text: null, details: null }] })
assert.equal(unsupported.document_type, "unsupported")
assert.deepEqual(unsupported.courses, [])
assert.deepEqual(unsupported.requirements, [])
assert.equal(unsupported.university, null)
assert.equal(unsupported.total_credits_completed, null)

// An unrecognized document_type value (a defensive case -- structured output
// should always match the enum, but the normalizer must not trust that
// blindly) must fall back to the safe personal_audit default rather than
// silently treating unknown input as more permissive than program_guide.
const unknownType = normalizeDegreeAuditResult({ ...personalAudit, document_type: "something_else" })
assert.equal(unknownType.document_type, "personal_audit")

// Structural guard on the extraction instruction itself: the wording that
// drives this whole fix must keep telling the model (a) to classify first,
// (b) that a program guide can never carry completion status, and (c) what
// guide-specific facts to extract (recommended term, transfer/TCCNS
// equivalents). If a future edit strips this, the regression comes back
// even though the schema/normalizer tests above would still pass.
const edgeFunctionSource = readFileSync(new URL("../supabase/functions/process-academic-file/index.ts", import.meta.url), "utf8")
assert.match(edgeFunctionSource, /'personal_audit'/, "the instruction must define the personal_audit classification")
assert.match(edgeFunctionSource, /'program_guide'/, "the instruction must define the program_guide classification")
assert.match(edgeFunctionSource, /'unsupported'/, "the instruction must define the unsupported classification")
assert.match(edgeFunctionSource, /program_guide:[^"]*courses must be an empty array/, "the instruction must forbid personal coursework for a program guide")
assert.match(edgeFunctionSource, /never invent or infer that a course is completed or in progress/, "the instruction must explicitly forbid inferring completion status for a program guide")
assert.match(edgeFunctionSource, /TCCNS/, "the instruction must call out transfer/TCCNS equivalents as an extractable guide fact")
assert.match(edgeFunctionSource, /recommended year\/semester/, "the instruction must call out recommended year/semester as an extractable guide fact")
assert.match(edgeFunctionSource, /normalizeDegreeAuditResult\(JSON\.parse\(text\)\)/, "degree_audit results must be run through the normalization safety net before being saved")

console.log("degree/transfer guide classification never carries personal completion status, and the personal-audit path is unaffected")
