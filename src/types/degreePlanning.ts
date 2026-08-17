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
export type RequirementOption = { id: string; group_id: string; course_code: string; course_title: string | null; credit_hours: number; prerequisite_text?: string | null; source_note?: string | null }
export type RequirementGroup = {
  id: string; program_id: string; name: string; description: string | null
  requirement_type: "all_courses" | "minimum_credits" | "total_degree"
  matching_strategy: "course_options" | "degree_total" | "degree_audit_review"
  minimum_credits: number; sort_order: number; requirement_course_options: RequirementOption[]
}
export type UserDegreeRequirement = { id:string; requirement_type:"course"|"choice"|"other"; course_code:string|null; requirement_text:string; status:"satisfied"|"incomplete"|"in_progress"|"unclear"; credits_applied:number|null; application_source:"degree_audit"|null }
export type UserDegreeRequirementGroup = { id:string; requirement_label:string; status:"satisfied"|"incomplete"|"in_progress"|"unclear"; credits_required:number|null; credits_completed:number|null; credits_remaining:number|null; details:string|null; sort_order:number; user_degree_requirements:UserDegreeRequirement[] }
export type UserDegreePlan = { id:string; source_upload_id:string|null; university:string|null; major:string|null; catalog_year:number|null; total_credits_required:number|null; total_credits_completed:number|null; requirement_source:"degree_audit"; status:"active"|"replaced"; confirmed_at:string; user_degree_requirement_groups:UserDegreeRequirementGroup[] }
