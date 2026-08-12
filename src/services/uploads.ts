import { supabase } from "../lib/supabase"
import type { UploadCategory, UploadedFileRecord } from "../types/uploads"

export const SOURCE_BUCKET = "source-uploads"
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const USER_QUOTA_BYTES = 500 * 1024 * 1024

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
}

export function validateUpload(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || ""
  const expectedMime = MIME_BY_EXTENSION[extension]
  if (!expectedMime) throw new Error("Choose a PDF, PPTX, DOCX, PNG, JPG, or JPEG file.")
  if (file.type !== expectedMime)
    throw new Error("The file extension and content type do not match.")
  if (file.size <= 0) throw new Error("The selected file is empty.")
  if (file.size > MAX_FILE_BYTES) throw new Error("Files must be 25 MB or smaller.")
}

export async function listUploads(courseId?: string) {
  let query = supabase.from("uploaded_files").select("*").order("created_at", { ascending: false })
  if (courseId) query = query.eq("course_id", courseId)
  const { data, error } = await query
  if (error) throw error
  return data as UploadedFileRecord[]
}

export async function uploadSourceFile(input: {
  userId: string
  file: File
  category: UploadCategory
  courseId: string | null
}) {
  validateUpload(input.file)
  if (["syllabus", "lecture"].includes(input.category) && !input.courseId)
    throw new Error("Select a course for syllabus and lecture files.")
  const folder = ["syllabus", "lecture"].includes(input.category)
    ? input.category
    : "academic-progress"
  const extension = input.file.name.split(".").pop()!.toLowerCase()
  const path = `${input.userId}/${folder}/${crypto.randomUUID()}.${extension}`
  const reservation = {
    user_id: input.userId,
    course_id: input.courseId,
    category: input.category,
    original_filename: input.file.name,
    storage_path: path,
    mime_type: input.file.type,
    size_bytes: input.file.size,
  }
  const { data: row, error: reserveError } = await supabase
    .from("uploaded_files")
    .insert(reservation)
    .select()
    .single()
  if (reserveError) throw reserveError
  const { error: uploadError } = await supabase.storage
    .from(SOURCE_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false })
  if (uploadError) {
    await supabase.from("uploaded_files").delete().eq("id", row.id)
    throw uploadError
  }
  const { data, error } = await supabase
    .from("uploaded_files")
    .update({ processing_status: "uploaded" })
    .eq("id", row.id)
    .select()
    .single()
  if (error) throw error
  return data as UploadedFileRecord
}

export async function deleteUpload(row: UploadedFileRecord) {
  const { error: storageError } = await supabase.storage
    .from(SOURCE_BUCKET)
    .remove([row.storage_path])
  if (storageError) throw storageError
  const { error } = await supabase.from("uploaded_files").delete().eq("id", row.id)
  if (error) throw error
}

export async function downloadUpload(row: UploadedFileRecord) {
  const { data, error } = await supabase.storage.from(SOURCE_BUCKET).download(row.storage_path)
  if (error) throw error
  const url = URL.createObjectURL(data)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = row.original_filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
