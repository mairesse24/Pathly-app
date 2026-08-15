import { supabase } from "../lib/supabase"
import type { AcademicRecordCourse, DegreeAuditRequirement, DegreeAuditResult, ProcessingResultRecord, ProcessingStage, SyllabusResult } from "../types/uploads"
import { deleteUpload } from "./uploads"

export async function listProcessingResults() {
  const { data, error } = await supabase.from("ai_processing_results").select("*").order("created_at", { ascending: false })
  if (error) throw error
  return data as ProcessingResultRecord[]
}

export async function confirmAcademicRecord(processing: ProcessingResultRecord, courses: AcademicRecordCourse[], deleteOriginal: boolean) {
  const { error } = await supabase.rpc("confirm_academic_record_processing", { p_processing_id: processing.id, p_courses: courses })
  if (error) throw error
  if (deleteOriginal) {
    const { data: upload, error: uploadError } = await supabase.from("uploaded_files").select("*").eq("id", processing.upload_id).single()
    if (uploadError) throw uploadError
    await deleteUpload(upload)
  }
  return { ...processing, status: "approved", approved_at: new Date().toISOString() } as ProcessingResultRecord
}

export async function confirmDegreeAudit(processing: ProcessingResultRecord, result: DegreeAuditResult, courses: AcademicRecordCourse[], requirements: DegreeAuditRequirement[], deleteOriginal: boolean) {
  const { error } = await supabase.rpc("confirm_degree_audit_processing", {
    p_processing_id: processing.id,
    p_courses: courses,
    p_requirements: requirements.map((item,index)=>({...item,sort_order:index})),
    p_plan_metadata: { university: result.university, major: result.major, catalog_year: result.catalog_year, total_credits_required: result.total_credits_required, total_credits_completed: result.total_credits_completed },
  })
  if (error) throw error
  if (deleteOriginal) {
    const { data: upload, error: uploadError } = await supabase.from("uploaded_files").select("*").eq("id", processing.upload_id).single()
    if (uploadError) throw uploadError
    await deleteUpload(upload)
  }
  return { ...processing, status: "approved", approved_at: new Date().toISOString() } as ProcessingResultRecord
}

export async function processUpload(uploadId: string, onStage?: (stage: ProcessingStage) => void) {
  let polling = false
  const poll = async () => {
    if (polling) return
    polling = true
    const { data } = await supabase.from("uploaded_files").select("processing_stage").eq("id", uploadId).single()
    if (data?.processing_stage) onStage?.(data.processing_stage as ProcessingStage)
    polling = false
  }
  onStage?.("preparing")
  const timer = window.setInterval(() => void poll(), 800)
  try {
    const { data, error } = await supabase.functions.invoke("process-academic-file", { body: { upload_id: uploadId } })
    if (error || data?.error || !data?.processing) throw new Error("processing_failed")
    return data.processing as ProcessingResultRecord
  } finally {
    window.clearInterval(timer)
  }
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
