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
export async function updateCourse(id: string, value: Pick<CourseRecord,"course_code"|"course_name">) {
  const { data,error }=await supabase.from("courses").update({course_code:value.course_code.trim().toUpperCase(),course_name:value.course_name.trim()}).eq("id",id).select().single()
  if(error)throw error
  return data as CourseRecord
}
export async function getCourseDeletionImpact(id:string){
  const count=async(table:"assignments"|"exams"|"study_sessions"|"ai_processing_results"|"uploaded_files")=>{const {count,error}=await supabase.from(table).select("id",{count:"exact",head:true}).eq("course_id",id);if(error)throw error;return count||0}
  const [assignments,exams,studySessions,processedMaterials,uploads]=await Promise.all([count("assignments"),count("exams"),count("study_sessions"),count("ai_processing_results"),count("uploaded_files")])
  return {assignments,exams,studySessions,processedMaterials,uploads}
}
export async function deleteCourseSafely(id:string){const {error}=await supabase.rpc("delete_course_safely",{p_course_id:id});if(error)throw error}
