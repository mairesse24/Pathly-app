import { supabase } from "../lib/supabase"
import type { ExamRecord } from "../types/academic"
export async function listExams() {
  const { data, error } = await supabase
    .from("exams")
    .select("*")
    .order("exam_at")
  if (error) throw error
  return data as ExamRecord[]
}
export async function createExam(value: Omit<ExamRecord, "id">) {
  const { data, error } = await supabase
    .from("exams")
    .insert(value)
    .select()
    .single()
  if (error) throw error
  return data as ExamRecord
}
export async function updateExam(id: string, value: Partial<Pick<ExamRecord,"course_id"|"title"|"exam_at"|"location"|"topics_summary">>) { const { data,error }=await supabase.from("exams").update(value).eq("id",id).select().single(); if(error)throw error; return data as ExamRecord }
export async function deleteExam(id: string) { const { error }=await supabase.from("exams").delete().eq("id",id); if(error)throw error }
