import { supabase } from "../lib/supabase"
import { deleteUpload, uploadSourceFile, validateUpload } from "./uploads"
import type { UploadedFileRecord } from "../types/uploads"

export const NOTE_FILE_ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg"
const NOTE_MIME_TYPES = new Set(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"])

export type OrganizedNoteResult = { title: string; structured_notes: string; key_concepts: string[]; summary: string; flashcards: Array<{ front: string; back: string }>; practice_questions: string[] }
export type OrganizedNoteRecord = { id: string; title: string; source_upload_id: string | null; organized_content: OrganizedNoteResult; created_at: string; source_upload: UploadedFileRecord | null }

export function validateNoteUpload(file: File) {
  validateUpload(file)
  if (!NOTE_MIME_TYPES.has(file.type)) throw new Error("Choose a PDF, DOCX, PNG, JPG, or JPEG note file.")
}

export async function uploadNoteSource(userId: string, courseId: string, file: File) {
  validateNoteUpload(file)
  return uploadSourceFile({ userId, file, category: "lecture", courseId })
}

export async function organizeNotes(input: { courseId: string; title: string; originalText?: string; uploadId?: string }) {
  const { data, error } = await supabase.functions.invoke("organize-course-notes", { body: { course_id: input.courseId, title: input.title, original_text: input.originalText || null, upload_id: input.uploadId || null } })
  if (error || data?.error || !data?.result) throw new Error(data?.message || "Pathly couldn't organize these notes. Try again.")
  return { result: data.result as OrganizedNoteResult, model: data.model as string }
}

export async function saveOrganizedNotes(input: { courseId: string; title: string; originalText?: string; sourceUploadId?: string; result: OrganizedNoteResult; model: string; createFlashcards: boolean }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Your session is no longer valid.")
  const { data: note, error } = await supabase.from("organized_course_notes").insert({ user_id: user.id, course_id: input.courseId, source_upload_id: input.sourceUploadId || null, title: input.title.trim(), original_text: input.originalText?.trim() || null, organized_content: input.result, model: input.model }).select("id,title,source_upload_id,organized_content,created_at").single()
  if (error) throw error
  if (input.createFlashcards && input.result.flashcards.length) {
    const cards = input.result.flashcards.map((card) => ({ user_id: user.id, course_id: input.courseId, organized_note_id: note.id, front: card.front.trim(), back: card.back.trim() })).filter((card) => card.front && card.back)
    if (cards.length) { const { error: cardsError } = await supabase.from("study_flashcards").insert(cards); if (cardsError) throw cardsError }
  }
  return { ...note, source_upload: null } as OrganizedNoteRecord
}

export async function listOrganizedNotes(courseId: string) {
  const { data, error } = await supabase.from("organized_course_notes").select("id,title,source_upload_id,organized_content,created_at,source_upload:uploaded_files(*)").eq("course_id", courseId).order("created_at", { ascending: false })
  if (error) throw error
  return data as unknown as OrganizedNoteRecord[]
}

export async function deleteOrganizedNote(id: string) { const { error } = await supabase.from("organized_course_notes").delete().eq("id", id); if (error) throw error }
export async function deleteOriginalNoteUpload(upload: UploadedFileRecord) { await deleteUpload(upload) }
