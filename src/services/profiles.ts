import { supabase } from "../lib/supabase"

export type ProfileMetadata = {
  display_name: string

  university: string

  major: string

  graduation_year: number | null

  catalog_year: number | null

  expected_graduation_term: GraduationTerm | null
  timezone: string | null
}

export type GraduationTerm = "Spring" | "Summer" | "Fall" | "Winter"

export type AcademicDetailsInput = Pick<ProfileMetadata, "university" | "major" | "graduation_year" | "catalog_year" | "expected_graduation_term">

const profileColumns =
  "display_name,university,major,graduation_year,catalog_year,expected_graduation_term,timezone"

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
