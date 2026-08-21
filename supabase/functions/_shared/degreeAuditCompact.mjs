const nullableString = (maxLength) => ({ anyOf: [{ type: "string", maxLength }, { type: "null" }] })
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] }
const nullableInteger = { anyOf: [{ type: "integer" }, { type: "null" }] }
const documentType = { type: "string", enum: ["personal_audit", "program_guide", "unsupported"] }

export const DEGREE_AUDIT_STAGE_MAX_TOKENS = 8000

export const degreeAuditOverviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    document_type: documentType,
    university: nullableString(120),
    major: nullableString(120),
    catalog_year: nullableInteger,
    total_credits_required: nullableNumber,
    total_credits_completed: nullableNumber,
    courses: {
      type: "array",
      maxItems: 180,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          course_code: { type: "string", maxLength: 24 },
          course_title: { type: "string", maxLength: 120 },
          credit_hours: { type: "number" },
          status: { type: "string", enum: ["completed", "in_progress"] },
          term: { anyOf: [{ type: "string", enum: ["Spring", "Summer", "Fall", "Winter"] }, { type: "null" }] },
          year: nullableInteger,
          requirement_label: nullableString(100),
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
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement_label: { type: "string", maxLength: 100 },
          status: { type: "string", enum: ["satisfied", "incomplete", "in_progress", "unclear"] },
          credits_required: nullableNumber,
          credits_completed: nullableNumber,
          credits_remaining: nullableNumber,
          required_course_codes: { type: "array", maxItems: 30, items: { type: "string", maxLength: 24 } },
          notes: nullableString(240),
        },
        required: ["requirement_label", "status", "credits_required", "credits_completed", "credits_remaining", "required_course_codes", "notes"],
      },
    },
  },
  required: ["document_type", "requirements"],
}

const clean = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : null

export function combineDegreeAuditStages(overview, requirementStage) {
  const courses = Array.isArray(overview?.courses) ? overview.courses.slice(0, 180) : []
  const requirements = (Array.isArray(requirementStage?.requirements) ? requirementStage.requirements : []).slice(0, 60).map((item) => {
    const requirementLabel = clean(item.requirement_label, 100) || "Unlabeled requirement"
    const requiredCodes = [...new Set((Array.isArray(item.required_course_codes) ? item.required_course_codes : [])
      .map((code) => clean(code, 24)).filter(Boolean))].slice(0, 30)
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
      details: clean(item.notes, 240),
    }
  })
  return { ...overview, courses, requirements }
}
