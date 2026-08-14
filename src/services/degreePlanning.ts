import { supabase } from "../lib/supabase"
import type { CompletedCourse, DegreeProgram, DegreeProgramMatch, RequirementGroup } from "../types/degreePlanning"

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
export function calculateDegreeProgress(program: DegreeProgram, groups: RequirementGroup[], courses: CompletedCourse[]) {
  const unique = new Map<string, CompletedCourse>()
  for (const course of courses) unique.set(normalize(course.course_code), course)
  const completed = [...unique.values()].filter((course) => course.status === "completed")
  const inProgress = [...unique.values()].filter((course) => course.status === "in_progress")
  const completedCredits = completed.reduce((sum, course) => sum + Number(course.credit_hours), 0)
  const inProgressCredits = inProgress.reduce((sum, course) => sum + Number(course.credit_hours), 0)
  const completeCodes = new Set(completed.map((course) => normalize(course.course_code)))
  const groupProgress = groups.map((group) => {
    if (group.requirement_type === "total_degree") return { ...group, completedCredits: Math.min(completedCredits, Number(group.minimum_credits)), remaining: [] as string[] }
    const matched = group.requirement_course_options.filter((option) => completeCodes.has(normalize(option.course_code)))
    const credits = matched.reduce((sum, option) => sum + Number(option.credit_hours), 0)
    return { ...group, completedCredits: Math.min(credits, Number(group.minimum_credits)), remaining: group.requirement_type === "all_courses" ? group.requirement_course_options.filter((option) => !completeCodes.has(normalize(option.course_code))).map((option) => option.course_code) : [] }
  })
  return { completedCredits, inProgressCredits, percent: Math.min(100, Math.round(completedCredits / Number(program.total_credits_required) * 100)), groupProgress }
}
