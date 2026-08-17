export const syllabusSchema = {
  type: "object", additionalProperties: false,
  properties: {
    course_code: { anyOf: [{ type: "string" }, { type: "null" }] },
    course_title: { anyOf: [{ type: "string" }, { type: "null" }] },
    course_summary: { type: "string" },
    assignments: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, description: { type: ["string", "null"] }, due_at: { type: ["string", "null"] }, estimated_minutes: { type: ["integer", "null"] },
    }, required: ["title", "description", "due_at", "estimated_minutes"] } },
    exams: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, exam_at: { type: ["string", "null"] }, location: { type: ["string", "null"] }, topics_summary: { type: ["string", "null"] },
    }, required: ["title", "exam_at", "location", "topics_summary"] } },
  }, required: ["course_code", "course_title", "course_summary", "assignments", "exams"],
}

export const lectureSchema = {
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string" }, summary: { type: "string" },
    key_concepts: { type: "array", items: { type: "string" } },
    flashcards: { type: "array", items: { type: "object", additionalProperties: false, properties: { front: { type: "string" }, back: { type: "string" } }, required: ["front", "back"] } },
    practice_questions: { type: "array", items: { type: "string" } },
    topics_worth_reviewing: { type: "array", items: { type: "string" } },
  }, required: ["title", "summary", "key_concepts", "flashcards", "practice_questions", "topics_worth_reviewing"],
}

export const academicRecordSchema = {
  type: "object", additionalProperties: false,
  properties: { courses: { type: "array", items: { type: "object", additionalProperties: false, properties: {
    course_code: { type: "string" }, course_title: { type: "string" }, credit_hours: { type: "number" },
    status: { type: "string", enum: ["completed", "in_progress"] },
    term: { anyOf: [{ type: "string", enum: ["Spring", "Summer", "Fall", "Winter"] }, { type: "null" }] },
    year: { anyOf: [{ type: "integer" }, { type: "null" }] },
    requirement_label: { anyOf: [{ type: "string" }, { type: "null" }] },
  }, required: ["course_code", "course_title", "credit_hours", "status", "term", "year", "requirement_label"] } } },
  required: ["courses"],
}

export const degreeAuditSchema = {
  type: "object", additionalProperties: false,
  properties: {
    university: { anyOf: [{ type: "string" }, { type: "null" }] },
    major: { anyOf: [{ type: "string" }, { type: "null" }] },
    catalog_year: { anyOf: [{ type: "integer" }, { type: "null" }] },
    total_credits_required: { anyOf: [{ type: "number" }, { type: "null" }] },
    total_credits_completed: { anyOf: [{ type: "number" }, { type: "null" }] },
    courses: academicRecordSchema.properties.courses,
    requirements: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      requirement_label: { type: "string" },
      status: { type: "string", enum: ["satisfied", "incomplete", "in_progress", "unclear"] },
      credits_required: { anyOf: [{ type: "number" }, { type: "null" }] },
      credits_completed: { anyOf: [{ type: "number" }, { type: "null" }] },
      credits_remaining: { anyOf: [{ type: "number" }, { type: "null" }] },
      required_course_codes: { type: "array", items: { type: "string" } },
      applied_courses: { type: "array", items: { type: "object", additionalProperties: false, properties: {
        course_code: { type: "string" }, credits_applied: { type: "number" },
      }, required: ["course_code", "credits_applied"] } },
      choice_requirement_text: { anyOf: [{ type: "string" }, { type: "null" }] },
      details: { anyOf: [{ type: "string" }, { type: "null" }] },
    }, required: ["requirement_label", "status", "credits_required", "credits_completed", "credits_remaining", "required_course_codes", "applied_courses", "choice_requirement_text", "details"] } },
  },
  required: ["university", "major", "catalog_year", "total_credits_required", "total_credits_completed", "courses", "requirements"],
}
