export type CompletedCourseStatus = "completed" | "in_progress"
export type CompletedCourse = {
  id: string; user_id: string; course_code: string; course_title: string
  credit_hours: number; term: "Spring" | "Summer" | "Fall" | "Winter" | null
  year: number | null; source: "manual" | "degree_audit" | "transcript"
  status: CompletedCourseStatus; source_upload_id: string | null
  created_at: string; updated_at: string
}
export type DegreeProgram = {
  id: string; university: string; degree: string; major: string; catalog_year: number
  total_credits_required: number; source_url: string; source_title: string; verified_at: string
}
export type DegreeProgramMatchStatus = "missing_academic_details" | "missing_catalog_year" | "unsupported_catalog_year" | "program_unavailable" | "matched"
export type DegreeProgramMatch = {
  status: DegreeProgramMatchStatus
  program: DegreeProgram | null
  canonical_university?: string
  canonical_major?: string
  missing_fields: string[]
  supported_catalog_years: number[]
  message: string
}
export type RequirementOption = { id: string; group_id: string; course_code: string; course_title: string | null; credit_hours: number }
export type RequirementGroup = {
  id: string; program_id: string; name: string; description: string | null
  requirement_type: "all_courses" | "minimum_credits" | "total_degree"
  minimum_credits: number; sort_order: number; requirement_course_options: RequirementOption[]
}
