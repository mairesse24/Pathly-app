import { supabase } from "../lib/supabase"
import type { CompletedCourse, DegreeProgram, DegreeProgramMatch, RequirementGroup, UserDegreePlan } from "../types/degreePlanning"
import { calculateDegreeProgress as calculateDeterministicProgress } from "../utils/degreeProgress"
import type { UploadedFileRecord } from "../types/uploads"

export type CourseInput = Pick<CompletedCourse, "course_code" | "course_title" | "credit_hours" | "term" | "year" | "status">
const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ")

export async function listCompletedCourses() {
  const { data, error } = await supabase.from("completed_courses").select("*").order("year", { ascending: false }).order("course_code")
  if (error) throw error
  return data as CompletedCourse[]
}
export async function saveCompletedCourse(input: CourseInput, id?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Your session is no longer valid.")
  const row = { ...input, course_code: normalize(input.course_code), course_title: input.course_title.trim(), user_id: user.id, source: "manual" }
  const query = id ? supabase.from("completed_courses").update(row).eq("id", id) : supabase.from("completed_courses").insert(row)
  const { data, error } = await query.select().single()
  if (error) throw new Error(error.code === "23505" ? "That course is already in your academic record." : error.message)
  return data as CompletedCourse
}
export async function deleteCompletedCourse(id: string) {
  const { error } = await supabase.from("completed_courses").delete().eq("id", id)
  if (error) throw error
}
export async function matchVerifiedProgram(university?: string | null, major?: string | null, catalogYear?: number | null) {
  const { data, error } = await supabase.rpc("match_degree_program", {
    p_university: university ?? null,
    p_major: major ?? null,
    p_catalog_year: catalogYear ?? null,
  })
  if (error) throw error
  return data as DegreeProgramMatch
}
export async function getRequirementGroups(programId: string) {
  const { data, error } = await supabase.from("requirement_groups")
    .select("*,requirement_course_options(*)").eq("program_id", programId).order("sort_order")
  if (error) throw error
  return data as RequirementGroup[]
}
export async function getActiveUserDegreePlan() {
  const { data: plan, error: planError } = await supabase.from("user_degree_plans").select("*").eq("status", "active").maybeSingle()
  if (planError) throw planError
  if (!plan) return null
  const { data: groups, error: groupError } = await supabase.from("user_degree_requirement_groups").select("*").eq("plan_id", plan.id).order("sort_order")
  if (groupError) throw groupError
  const groupIds = (groups || []).map((group) => group.id)
  const { data: requirements, error: requirementError } = groupIds.length
    ? await supabase.from("user_degree_requirements").select("*").in("group_id", groupIds).order("confirmed_at").order("id")
    : { data: [], error: null }
  if (requirementError) throw requirementError
  return {
    ...plan,
    user_degree_requirement_groups: (groups || []).map((group) => ({
      ...group,
      user_degree_requirements: (requirements || []).filter((item) => item.group_id === group.id),
    })),
  } as UserDegreePlan
}
export type ConfirmedGuideRemoval = { requirement_groups_removed: number; requirements_removed: number }
export async function removeConfirmedGuide(planId: string) {
  const { data, error } = await supabase.rpc("remove_confirmed_guide", { p_plan_id: planId })
  if (error) throw error
  return data as ConfirmedGuideRemoval
}
export type DegreeAuditUploadState = Pick<UploadedFileRecord, "id" | "processing_status" | "processing_error_code" | "created_at">
export async function getLatestDegreeAuditUploadState() {
  const { data, error } = await supabase.from("uploaded_files")
    .select("id,processing_status,processing_error_code,created_at")
    .eq("category", "degree_audit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as DegreeAuditUploadState | null
}
export function calculateDegreeProgress(program: DegreeProgram, groups: RequirementGroup[], courses: CompletedCourse[], auditPlan: UserDegreePlan | null = null) {
  return calculateDeterministicProgress(program, groups, courses, auditPlan)
}
