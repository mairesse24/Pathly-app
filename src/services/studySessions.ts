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
