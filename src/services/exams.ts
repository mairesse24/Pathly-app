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
