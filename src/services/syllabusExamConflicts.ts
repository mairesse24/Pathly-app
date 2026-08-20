import { supabase } from "../lib/supabase"

export type SyllabusExamConflict = {
  id: string
  course_id: string
  existing_exam_id: string
  proposed_title: string
  proposed_exam_at: string | null
  proposed_location: string | null
  status: "pending" | "kept_existing" | "replaced"
  created_at: string
}

export async function listPendingSyllabusExamConflicts() {
  const { data, error } = await supabase
    .from("syllabus_exam_conflicts")
    .select("id,course_id,existing_exam_id,proposed_title,proposed_exam_at,proposed_location,status,created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
  if (error) throw error
  return data as SyllabusExamConflict[]
}

export async function resolveSyllabusExamConflict(id: string, resolution: "keep_existing" | "replace") {
  const { error } = await supabase.rpc("resolve_syllabus_exam_conflict", {
    p_conflict_id: id,
    p_resolution: resolution,
  })
  if (error) throw error
}
