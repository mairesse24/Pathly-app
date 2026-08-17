import { supabase } from "../lib/supabase"
import type { CourseRecord } from "../types/academic"
export type CourseRemovalMode = "preserve" | "delete_empty" | "delete_with_content"
export type CourseRemovalImpact = {source:"manual"|"canvas";assignments:number;exams:number;studySessions:number;processedMaterials:number;uploads:number;savedNotes:number}
export async function listCourses() {
  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .eq("is_active", true)
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
  const {data,error}=await supabase.rpc("get_course_removal_impact",{p_course_id:id})
  if(error)throw error
  const value=data as {source:"manual"|"canvas";assignments:number;exams:number;study_sessions:number;processed_materials:number;uploads:number;saved_notes:number}
  return {source:value.source,assignments:value.assignments,exams:value.exams,studySessions:value.study_sessions,processedMaterials:value.processed_materials,uploads:value.uploads,savedNotes:value.saved_notes} satisfies CourseRemovalImpact
}
export async function removeCourseSafely(id:string,mode:CourseRemovalMode){
  const {data,error}=await supabase.rpc("delete_course_safely",{p_course_id:id,p_mode:mode})
  if(error)throw error
  const storagePaths=(data as {storage_paths?:string[]} | null)?.storage_paths ?? []
  if(storagePaths.length){
    const {error:storageError}=await supabase.storage.from("source-uploads").remove(storagePaths)
    if(storageError)throw new Error("The course was removed, but Pathly could not finish deleting its stored source files. Please contact support.")
  }
}
