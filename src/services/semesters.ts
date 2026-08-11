import { supabase } from "../lib/supabase"
import type { Semester } from "../types/academic"
export async function listSemesters() {
  const { data, error } = await supabase
    .from("semesters")
    .select("*")
    .order("start_date", { ascending: false })
  if (error) throw error
  return data as Semester[]
}
export async function createSemester(value: Omit<Semester, "id">) {
  const { data, error } = await supabase
    .from("semesters")
    .insert(value)
    .select()
    .single()
  if (error) throw error
  return data as Semester
}
