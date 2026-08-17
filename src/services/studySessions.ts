import { supabase } from "../lib/supabase"
import type { StudySessionRecord } from "../types/academic"
export async function listStudySessions() {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("*")
    .order("start_at")
  if (error) throw error
  return data as StudySessionRecord[]
}
export async function createStudySession(
  value: Omit<StudySessionRecord, "id">,
) {
  const { data, error } = await supabase
    .from("study_sessions")
    .insert(value)
    .select()
    .single()
  if (error) throw error
  return data as StudySessionRecord
}
export async function updateStudySession(id: string, value: Partial<Pick<StudySessionRecord,"course_id"|"title"|"start_at"|"end_at"|"status">>) { const { data,error }=await supabase.from("study_sessions").update(value).eq("id",id).select().single(); if(error)throw error; return data as StudySessionRecord }
export async function deleteStudySession(id: string) { const { error }=await supabase.from("study_sessions").delete().eq("id",id); if(error)throw error }
