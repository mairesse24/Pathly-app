import { supabase } from "../lib/supabase"
import type { ProcessingResultRecord, SyllabusResult } from "../types/uploads"

export async function listProcessingResults() {
  const { data, error } = await supabase.from("ai_processing_results").select("*").order("created_at", { ascending: false })
  if (error) throw error
  return data as ProcessingResultRecord[]
}

export async function processUpload(uploadId: string) {
  const { data, error } = await supabase.functions.invoke("process-academic-file", { body: { upload_id: uploadId } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.processing as ProcessingResultRecord
}

export async function approveSyllabus(input: {
  processing: ProcessingResultRecord
  result: SyllabusResult
  assignmentIndexes: number[]
  examIndexes: number[]
}) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== input.processing.user_id) throw new Error("Your session is no longer valid.")
  const assignments = input.assignmentIndexes.map((index) => input.result.assignments[index]).filter(Boolean)
  const exams = input.examIndexes.map((index) => input.result.exams[index]).filter(Boolean)
  if (assignments.some((item) => !item.title) || exams.some((item) => !item.title)) throw new Error("Every selected item needs a title.")

  const { error } = await supabase.rpc("approve_syllabus_processing", {
    p_processing_id: input.processing.id, p_assignments: assignments, p_exams: exams,
  })
  if (error) throw error
  return { ...input.processing, status: "approved", approved_at: new Date().toISOString() } as ProcessingResultRecord
}
