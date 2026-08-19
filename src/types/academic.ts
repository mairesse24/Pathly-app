export type AssignmentStatus = "not_started" | "in_progress" | "completed" | "overdue" | "awaiting_confirmation"
export type Semester = {
  id: string
  user_id: string
  name: string
  start_date: string | null
  end_date: string | null
  is_current: boolean
}
export type CourseRecord = {
  id: string
  user_id: string
  semester_id: string | null
  course_code: string
  course_name: string
  credits: number | null
  instructor: string | null
  meeting_days: string[] | null
  meeting_start: string | null
  meeting_end: string | null
  is_active: boolean
  source?: "manual" | "canvas"
  canvas_connection_id?: string | null
  canvas_course_id?: string | null
}
export type AssignmentRecord = {
  id: string
  user_id: string
  course_id: string
  title: string
  description: string | null
  due_at: string | null
  estimated_minutes: number | null
  status: AssignmentStatus
  source: string
  canvas_connection_id?: string | null
  canvas_assignment_id?: string | null
  canvas_course_id?: string | null
  canvas_due_at?: string | null
  canvas_available_from?: string | null
  canvas_available_until?: string | null
  canvas_submission_status?: "submitted" | "unsubmitted" | "late" | "missing" | "unknown" | null
}
export type ExamRecord = {
  id: string
  user_id: string
  course_id: string
  title: string
  exam_at: string | null
  location: string | null
  topics_summary: string | null
  source: string
}
export type StudySessionRecord = {
  id: string
  user_id: string
  course_id: string | null
  assignment_id: string | null
  title: string
  start_at: string
  end_at: string
  status: "scheduled" | "completed" | "skipped" | "rescheduled"
}
export type ReflectionRecord = {
  id: string
  user_id: string
  reflection_date: string
  mood: string | null
  energy: string | null
  notes: string | null
}
