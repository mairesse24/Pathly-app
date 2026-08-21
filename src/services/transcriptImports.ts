import { supabase } from "../lib/supabase"

export type TranscriptImport = { id:string;created_at:string;removed_at:string|null;academic_record_import_courses:{count:number}[] }
export type TranscriptRemovalPreview = { imported_records:number;completed_course_rows_deleted:number;completed_course_rows_restored:number;manual_rows_preserved:number }

export async function listTranscriptImports() {
  const { data,error }=await supabase.from("academic_record_imports").select("id,created_at,removed_at,academic_record_import_courses(count)").is("removed_at",null).order("created_at",{ascending:false})
  if(error)throw error
  return data as TranscriptImport[]
}
export async function previewTranscriptImportRemoval(id:string){const {data,error}=await supabase.rpc("preview_transcript_import_removal",{p_import_id:id});if(error)throw error;return data as TranscriptRemovalPreview}
export async function removeTranscriptImport(id:string){const {data,error}=await supabase.rpc("remove_transcript_import",{p_import_id:id});if(error)throw error;return data as TranscriptRemovalPreview}
