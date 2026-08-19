// A holiday or no-class notice is never a deliverable or exam no matter
// what the model did with it or whether it carries a date -- this is a
// narrow, high-precision safety net (not a general topic-vs-deliverable
// classifier, which needs the model's judgment plus human review in
// ProcessingReview) that only fires on unambiguous "there is no class"
// language, so it can't false-positive on a real assignment title.
const NON_DELIVERABLE_PATTERN = /\b(holiday|no class(es)?|classes? (cancell?ed|suspended)|campus closed|university closed|spring break|winter break|fall break|reading day|reading period)\b/i
function isNonDeliverable(title) {
  return NON_DELIVERABLE_PATTERN.test(title)
}

// Safety net independent of how well the model followed instructions: a
// syllabus schedule item is only ever "calendar-ready" (an assignment or
// exam) when it (a) carries a concrete date and (b) isn't an obvious
// holiday/no-class notice. Anything still placed in assignments/exams
// without a date, an "exam" that isn't actually dated, or a holiday-shaped
// title, is demoted to a roadmap entry instead of silently becoming a
// calendar item that isn't really a student deliverable. Roadmap entries
// themselves are never calendar items -- they're the course's week/period
// structure (topic + optional deliverable text), reviewed and persisted
// separately from assignments/exams.
export function normalizeSyllabusResult(value) {
  const roadmap = (Array.isArray(value.roadmap) ? value.roadmap : []).filter((item) => item && typeof item.topic === "string" && item.topic.trim())
  const assignments = []
  for (const item of Array.isArray(value.assignments) ? value.assignments : []) {
    if (!item || typeof item.title !== "string" || !item.title.trim()) continue
    if (typeof item.due_at === "string" && item.due_at && !isNonDeliverable(item.title)) assignments.push(item)
    else roadmap.push({ period_label: null, topic: item.title, description: typeof item.description === "string" ? item.description : null, deliverable: null, date: null })
  }
  const exams = []
  for (const item of Array.isArray(value.exams) ? value.exams : []) {
    if (!item || typeof item.title !== "string" || !item.title.trim()) continue
    if (typeof item.exam_at === "string" && item.exam_at && !isNonDeliverable(item.title)) exams.push(item)
    else roadmap.push({ period_label: null, topic: item.title, description: typeof item.topics_summary === "string" ? item.topics_summary : null, deliverable: null, date: null })
  }
  return { ...value, roadmap, assignments, exams }
}

export const syllabusSchema = {
  type: "object", additionalProperties: false,
  properties: {
    course_code: { anyOf: [{ type: "string" }, { type: "null" }] },
    course_title: { anyOf: [{ type: "string" }, { type: "null" }] },
    instructor: { anyOf: [{ type: "string" }, { type: "null" }] },
    credits: { anyOf: [{ type: "number" }, { type: "null" }] },
    meeting_days: { anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }] },
    meeting_start: { anyOf: [{ type: "string" }, { type: "null" }] },
    meeting_end: { anyOf: [{ type: "string" }, { type: "null" }] },
    location: { anyOf: [{ type: "string" }, { type: "null" }] },
    course_summary: { type: "string" },
    roadmap: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      period_label: { type: ["string", "null"] }, topic: { type: "string" }, description: { type: ["string", "null"] }, deliverable: { type: ["string", "null"] }, date: { type: ["string", "null"] },
    }, required: ["period_label", "topic", "description", "deliverable", "date"] } },
    assignments: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, description: { type: ["string", "null"] }, due_at: { type: ["string", "null"] }, estimated_minutes: { type: ["integer", "null"] },
    }, required: ["title", "description", "due_at", "estimated_minutes"] } },
    exams: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      title: { type: "string" }, exam_at: { type: ["string", "null"] }, location: { type: ["string", "null"] }, topics_summary: { type: ["string", "null"] },
    }, required: ["title", "exam_at", "location", "topics_summary"] } },
  }, required: ["course_code", "course_title", "instructor", "credits", "meeting_days", "meeting_start", "meeting_end", "location", "course_summary", "roadmap", "assignments", "exams"],
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
