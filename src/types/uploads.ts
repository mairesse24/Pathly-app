export type UploadCategory =
  | "syllabus"
  | "lecture"
  | "degree_audit"
  | "unofficial_transcript"

export type UploadedFileRecord = {
  id: string
  user_id: string
  course_id: string | null
  category: UploadCategory
  original_filename: string
  storage_path: string
  mime_type: string
  size_bytes: number
  processing_status: "pending_upload" | "uploaded" | "upload_failed" | "processing" | "ready_for_review" | "processed" | "processing_failed"
  processing_stage: ProcessingStage | null
  processing_error_code: string | null
  error_message: string | null
  is_sensitive: boolean
  created_at: string
  updated_at: string
}

// A week/period row from a syllabus schedule table (e.g. "Week 4 -- UI
// Design & Accessibility; Assignment 1 due"). This is never itself a
// calendar item -- it's the course roadmap's raw material. `deliverable`
// carries any assignment/milestone text mentioned for that period verbatim;
// it does not imply that item also exists as a dated `assignments` row.
// `date` is only ever set from a concrete date actually printed next to
// this row, never inferred from the week number.
export type SyllabusRoadmapEntry = {
  period_label: string | null
  topic: string
  description: string | null
  deliverable: string | null
  date: string | null
}
export type SyllabusResult = {
  course_code: string | null
  course_title: string | null
  instructor: string | null
  credits: number | null
  meeting_days: string[] | null
  meeting_start: string | null
  meeting_end: string | null
  location: string | null
  course_summary: string
  topics?: string[] | null
  grading_breakdown?: Array<{
    label: string
    value: string
  }> | null
  roadmap: SyllabusRoadmapEntry[]
  assignments: Array<{ title: string; description: string | null; due_at: string | null; estimated_minutes: number | null }>
  exams: Array<{ title: string; exam_at: string | null; location: string | null; topics_summary: string | null }>
}
export type LectureResult = {
  title: string
  summary: string
  key_concepts: string[]
  flashcards: Array<{ front: string; back: string }>
  practice_questions: string[]
  topics_worth_reviewing: string[]
}
export type AcademicRecordCourse = {
  course_code: string
  course_title: string
  credit_hours: number
  term: "Spring" | "Summer" | "Fall" | "Winter" | null
  year: number | null
  status: "completed" | "in_progress"
  requirement_label: string | null
}
export type AcademicRecordResult = { courses: AcademicRecordCourse[] }
export type DegreeAuditRequirement = {
  requirement_label: string
  status: "satisfied" | "incomplete" | "in_progress" | "unclear"
  credits_required: number | null
  credits_completed: number | null
  credits_remaining: number | null
  required_course_codes: string[]
  applied_courses: Array<{
    course_code: string
    credits_applied: number
  }>
  choice_requirement_text: string | null
  details: string | null
}
// document_type distinguishes a personal degree audit (a specific
// student's own completed/in-progress coursework) from a degree/transfer
// guide (a program's curriculum with no student's completion status) and
// from a document Pathly can't recognize as either. Only "personal_audit"
// may ever carry a completed/in_progress course status -- see
// normalizeDegreeAuditResult in supabase/functions/_shared/processingSchemas.mjs,
// which enforces this server-side regardless of model output.
export type DegreeAuditDocumentType = "personal_audit" | "program_guide" | "unsupported"
export type DegreeAuditResult = AcademicRecordResult & {
  document_type: DegreeAuditDocumentType
  university: string | null
  major: string | null
  catalog_year: number | null
  total_credits_required: number | null
  total_credits_completed: number | null
  requirements: DegreeAuditRequirement[]
}
export type ProcessingStage = "preparing" | "reading" | "creating" | "saving"
export type ProcessingResultRecord = {
  id: string
  user_id: string
  upload_id: string
  course_id: string | null
  kind: "syllabus" | "lecture" | "degree_audit" | "unofficial_transcript"
  status: "ready_for_review" | "approved"
  model: string
  result: SyllabusResult | LectureResult | AcademicRecordResult | DegreeAuditResult
  approved_at: string | null
  created_at: string
  updated_at: string
}
