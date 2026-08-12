export type UploadCategory =
  | "syllabus"
  | "lecture"
  | "degree_audit"
  | "unofficial_transcript"

export type UploadedFileRecord = {
  id: string
  user_id: string
  course_id: string | null
  category: UploadCategory
  original_filename: string
  storage_path: string
  mime_type: string
  size_bytes: number
  processing_status: "pending_upload" | "uploaded" | "upload_failed"
  is_sensitive: boolean
  created_at: string
  updated_at: string
}
