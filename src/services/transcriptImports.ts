import { supabase } from "../lib/supabase"

export type TranscriptImport = {
  id: string
  created_at: string
  removed_at: string | null
  course_count: number
}
export type TranscriptRemovalPreview = { imported_records:number;completed_course_rows_deleted:number;completed_course_rows_restored:number;manual_rows_preserved:number }

export async function listTranscriptImports() {
  const { data: imports, error: importError } = await supabase
    .from("academic_record_imports")
    .select("id,created_at,removed_at")
    .is("removed_at", null)
    .order("created_at", { ascending: false })
  if (importError) throw importError
  if (!imports?.length) return []

  const ids = imports.map((item) => item.id)
  const { data: courses, error: courseError } = await supabase
    .from("academic_record_import_courses")
    .select("import_id")
    .in("import_id", ids)
  if (courseError) throw courseError

  const counts = new Map<string, number>()
  for (const course of courses || []) {
    counts.set(course.import_id, (counts.get(course.import_id) || 0) + 1)
  }
  return imports.map((item) => ({
    ...item,
    course_count: counts.get(item.id) || 0,
  })) as TranscriptImport[]
}
export async function previewTranscriptImportRemoval(id:string){const {data,error}=await supabase.rpc("preview_transcript_import_removal",{p_import_id:id});if(error)throw error;return data as TranscriptRemovalPreview}
export async function removeTranscriptImport(id:string){const {data,error}=await supabase.rpc("remove_transcript_import",{p_import_id:id});if(error)throw error;return data as TranscriptRemovalPreview}
