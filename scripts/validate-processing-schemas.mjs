import { academicRecordSchema, lectureSchema, syllabusSchema } from "../supabase/functions/_shared/processingSchemas.mjs"

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

validate(syllabusSchema, { course_summary: "Course", assignments: [{ title: "Work", description: null, due_at: null, estimated_minutes: null }], exams: [] })
validate(lectureSchema, { title: "Lecture", summary: "Summary", key_concepts: [], flashcards: [], practice_questions: [], topics_worth_reviewing: [] })
for (const term of ["Spring", "Summer", "Fall", "Winter", null]) validate(academicRecordSchema, { courses: [{ course_code: "CSCE 2100", course_title: "Foundations", credit_hours: 3, status: "completed", term, year: null, requirement_label: null }] })
validate(academicRecordSchema, { courses: [{ course_code: "CSCE 2110", course_title: "Data Structures", credit_hours: 3, status: "in_progress", term: null, year: 2026, requirement_label: "CS core" }] })
console.log("syllabus, lecture, transcript, and degree-audit schemas passed")
