import { supabase } from "../lib/supabase"

export type ProfileMetadata = {
  full_name: string
  university: string
  major: string
  graduation_year: number | null
  catalog_year: number | null
  expected_graduation_term: GraduationTerm | null
}
export type GraduationTerm = "Spring" | "Summer" | "Fall" | "Winter"
export type AcademicDetailsInput = Pick<ProfileMetadata,"university"|"major"|"graduation_year"|"catalog_year"|"expected_graduation_term">

export async function getProfileMetadata() {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name,university,major,graduation_year,catalog_year,expected_graduation_term")
    .single()
  if (error) throw error
  return data as ProfileMetadata
}
export async function updateAcademicDetails(value: AcademicDetailsInput) {
  const { data, error } = await supabase.from("profiles").update({ ...value, updated_at:new Date().toISOString() }).select("full_name,university,major,graduation_year,catalog_year,expected_graduation_term").single()
  if (error) throw error
  return data as ProfileMetadata
}
