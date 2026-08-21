const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] }
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] }
const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] }
const documentType = { type: "string", enum: ["personal_audit", "program_guide", "unsupported"] }

export const DEGREE_AUDIT_STAGE_MAX_TOKENS = 8000
export const DEGREE_AUDIT_MAX_COURSES = 180
export const DEGREE_AUDIT_MAX_REQUIREMENTS = 60
export const DEGREE_AUDIT_MAX_CODES_PER_REQUIREMENT = 30
export const DEGREE_AUDIT_MAX_NOTE_LENGTH = 240
// Anthropic's structured-output json_schema does not support maxLength either, so these
// string caps -- previously enforced in the model-facing schema itself -- now exist only as
// prompt guidance plus the deterministic clamps applied in combineDegreeAuditStages below.
export const DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH = 24
export const DEGREE_AUDIT_MAX_COURSE_TITLE_LENGTH = 120
export const DEGREE_AUDIT_MAX_REQUIREMENT_LABEL_LENGTH = 100
export const DEGREE_AUDIT_MAX_INSTITUTION_LENGTH = 120

export const degreeAuditOverviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_type: documentType,
    university: nullableString,
    major: nullableString,
    catalog_year: nullableInteger,
    total_credits_required: nullableNumber,
    total_credits_completed: nullableNumber,
    courses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          course_code: { type: "string" },
          course_title: { type: "string" },
          credit_hours: { type: "number" },
          status: { type: "string", enum: ["completed", "in_progress"] },
          term: { anyOf: [{ type: "string", enum: ["Spring", "Summer", "Fall", "Winter"] }, { type: "null" }] },
          year: nullableInteger,
          requirement_label: nullableString,
        },
        required: ["course_code", "course_title", "credit_hours", "status", "term", "year", "requirement_label"],
      },
    },
  },
  required: ["document_type", "university", "major", "catalog_year", "total_credits_required", "total_credits_completed", "courses"],
}

export const degreeAuditRequirementsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_type: documentType,
    requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement_label: { type: "string" },
          status: { type: "string", enum: ["satisfied", "incomplete", "in_progress", "unclear"] },
          credits_required: nullableNumber,
          credits_completed: nullableNumber,
          credits_remaining: nullableNumber,
          required_course_codes: { type: "array", items: { type: "string" } },
          notes: nullableString,
        },
        required: ["requirement_label", "status", "credits_required", "credits_completed", "credits_remaining", "required_course_codes", "notes"],
      },
    },
  },
  required: ["document_type", "requirements"],
}

const clean = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : null
// course_code/course_title are required, non-nullable fields downstream (the review UI and
// completed_courses both expect a string) -- unlike the optional fields above, malformed
// input clamps to "" rather than null so the required-string contract never breaks.
const cleanRequired = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : ""

export function combineDegreeAuditStages(overview, requirementStage) {
  // Every string field the model can return unbounded length for now (courses code/title/
  // requirement_label, and university/major below) is clamped here, since the schema itself
  // can no longer enforce maxLength -- this is what keeps the previous size guarantees intact
  // now that the length limits live only in the prompt and this deterministic combiner.
  const courses = (Array.isArray(overview?.courses) ? overview.courses : []).slice(0, DEGREE_AUDIT_MAX_COURSES).map((course) => ({
    ...course,
    course_code: cleanRequired(course?.course_code, DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH),
    course_title: cleanRequired(course?.course_title, DEGREE_AUDIT_MAX_COURSE_TITLE_LENGTH),
    requirement_label: clean(course?.requirement_label, DEGREE_AUDIT_MAX_REQUIREMENT_LABEL_LENGTH),
  }))
  const requirements = (Array.isArray(requirementStage?.requirements) ? requirementStage.requirements : []).slice(0, DEGREE_AUDIT_MAX_REQUIREMENTS).map((item) => {
    const requirementLabel = clean(item.requirement_label, DEGREE_AUDIT_MAX_REQUIREMENT_LABEL_LENGTH) || "Unlabeled requirement"
    const requiredCodes = [...new Set((Array.isArray(item.required_course_codes) ? item.required_course_codes : [])
      .map((code) => clean(code, DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH)).filter(Boolean))].slice(0, DEGREE_AUDIT_MAX_CODES_PER_REQUIREMENT)
    const appliedCourses = courses
      .filter((course) => course.requirement_label === requirementLabel)
      .map((course) => ({ course_code: course.course_code, credits_applied: course.credit_hours }))
    return {
      requirement_label: requirementLabel,
      status: item.status,
      credits_required: item.credits_required,
      credits_completed: item.credits_completed,
      credits_remaining: item.credits_remaining,
      required_course_codes: requiredCodes,
      applied_courses: appliedCourses,
      choice_requirement_text: null,
      details: clean(item.notes, DEGREE_AUDIT_MAX_NOTE_LENGTH),
    }
  })
  return {
    ...overview,
    university: clean(overview?.university, DEGREE_AUDIT_MAX_INSTITUTION_LENGTH),
    major: clean(overview?.major, DEGREE_AUDIT_MAX_INSTITUTION_LENGTH),
    courses,
    requirements,
  }
}
