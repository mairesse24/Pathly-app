import { supabase } from "../lib/supabase"
import type { UploadCategory, UploadedFileRecord } from "../types/uploads"
import { createId } from "../utils/createId"

export const SOURCE_BUCKET = "source-uploads"
export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const USER_QUOTA_BYTES = 500 * 1024 * 1024

export class UploadDeletionError extends Error {
  storageRemoved: boolean

  constructor(message: string, storageRemoved: boolean) {
    super(message)
    this.name = "UploadDeletionError"
    this.storageRemoved = storageRemoved
  }
}

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
  let query = supabase.from("active_uploaded_files").select("*").order("created_at", { ascending: false })
  if (courseId) query = query.eq("course_id", courseId)
  const { data, error } = await query
  if (error) {
    console.error("Upload status update failed", error)
    throw new Error("The file was uploaded, but Pathly couldn't finish preparing it. Refresh Upload Center before trying again.")
  }
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
  const path = `${input.userId}/${folder}/${createId()}.${extension}`
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
  if (reserveError) {
    console.error("Upload reservation failed", reserveError)
    throw new Error("We couldn't start this upload. Check your connection and try again.")
  }
  const { error: uploadError } = await supabase.storage
    .from(SOURCE_BUCKET)
    .upload(path, input.file, { contentType: input.file.type, upsert: false })
  if (uploadError) {
    await supabase.from("uploaded_files").delete().eq("id", row.id)
    console.error("Source file upload failed", uploadError)
    throw new Error("We couldn't upload this file. Check your connection and try again.")
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
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) throw new UploadDeletionError("Your session is no longer valid. Sign in and try again.", false)
  if (row.user_id !== user.id || !row.storage_path.startsWith(`${user.id}/`)) {
    throw new UploadDeletionError("Pathly cannot delete a file that does not belong to your account.", false)
  }
  const { error: storageError } = await supabase.storage
    .from(SOURCE_BUCKET)
    .remove([row.storage_path])
  if (storageError) {
    throw new UploadDeletionError("The source file could not be removed. Nothing else was deleted; please try again.", false)
  }
  const { data, error } = await supabase
    .from("uploaded_files")
    .delete()
    .eq("id", row.id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle()
  if (error) {
    throw new UploadDeletionError("The source file was removed, but Pathly could not finish cleaning up its file record. Refresh and retry the deletion.", true)
  }

  // A missing row is already the desired final state. This also makes a retry safe
  // after Storage succeeded but a prior response was interrupted.
  return data?.id ?? row.id
}

export async function reassociateSyllabusCourse(processingId: string, courseId: string) {
  const { error } = await supabase.rpc("reassociate_syllabus_processing_course", {
    p_processing_id: processingId,
    p_course_id: courseId,
  })
  if (error) {
    console.error("Syllabus course reassociation failed", error)
    throw new Error("We couldn't move this syllabus review to that course. Please try again.")
  }
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
