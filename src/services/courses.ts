import { supabase } from "../lib/supabase"
import type { CourseRecord } from "../types/academic"
export async function listCourses() {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .order("course_code")
  if (error) throw error
  return data as CourseRecord[]
}
export async function createCourse(value: Omit<CourseRecord, "id">) {
  const { data, error } = await supabase
    .from("courses")
    .insert(value)
    .select()
    .single()
  if (error) throw error
  return data as CourseRecord
}
