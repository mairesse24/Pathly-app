import { supabase } from "../lib/supabase"

export type ProfileMetadata = {
  display_name: string

  university: string

  major: string

  graduation_year: number | null

  catalog_year: number | null

  expected_graduation_term: GraduationTerm | null
  timezone: string | null
  preferred_study_time: "morning" | "afternoon" | "evening" | "late_night" | "no_preference" | null
  focus_session_minutes: number | null
  prefers_breaks: boolean | null
  break_duration_minutes: number | null
  non_academic_constraints: NonAcademicConstraint[] | null
  planning_style: "structured" | "flexible" | "balanced" | null
  primary_support_goal: "deadlines" | "study_planning" | "degree_progress" | "balance" | null
}

export type NonAcademicConstraint = "work" | "commute" | "family" | "extracurriculars" | "varies"

export type GraduationTerm = "Spring" | "Summer" | "Fall" | "Winter"

export type AcademicDetailsInput = Pick<ProfileMetadata, "university" | "major" | "graduation_year" | "catalog_year" | "expected_graduation_term">

export type StudyPreferencesInput = Pick<ProfileMetadata, "preferred_study_time" | "focus_session_minutes" | "prefers_breaks" | "break_duration_minutes" | "non_academic_constraints" | "planning_style" | "primary_support_goal">

const profileColumns =
  "display_name,university,major,graduation_year,catalog_year,expected_graduation_term,timezone,preferred_study_time,focus_session_minutes,prefers_breaks,break_duration_minutes,non_academic_constraints,planning_style,primary_support_goal"

export async function getProfileMetadata(userId: string) {
  const { data, error } = await supabase

    .from("profiles")

    .select(profileColumns)

    .eq("id", userId)

    .single()

  if (error) throw error

  return data as ProfileMetadata
}

export async function updateProfile(
  userId: string,
  value: Partial<ProfileMetadata>,
) {
  const updates = {
    ...value,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>

  if (typeof value.display_name === "string")
    updates.full_name = value.display_name

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select(profileColumns)
    .single()

  if (error) throw error

  return data as ProfileMetadata
}
