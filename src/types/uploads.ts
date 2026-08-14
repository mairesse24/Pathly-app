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

export type SyllabusResult = {
  course_summary: string
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
export type ProcessingStage = "preparing" | "reading" | "creating" | "saving"
export type ProcessingResultRecord = {
  id: string
  user_id: string
  upload_id: string
  course_id: string
  kind: "syllabus" | "lecture"
  status: "ready_for_review" | "approved"
  model: string
  result: SyllabusResult | LectureResult
  approved_at: string | null
  created_at: string
  updated_at: string
}
