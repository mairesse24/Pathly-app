import { supabase } from "../lib/supabase"

export type ProfileMetadata = {
  full_name: string
  university: string
  major: string
  graduation_year: number | null
}

export async function getProfileMetadata() {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name,university,major,graduation_year")
    .single()
  if (error) throw error
  return data as ProfileMetadata
}
