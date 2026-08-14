export type CompanionSource = {
  label: string
  type: "assignment" | "exam" | "calendar" | "lecture" | "syllabus" | "course" | "reflection"
}
export type CompanionMessage = {
  id: string
  conversation_id: string
  user_id: string
  request_id: string
  role: "user" | "assistant"
  content: string
  sources: CompanionSource[]
  metadata: { things_to_double_check?: string[] }
  created_at: string
}
export type CompanionConversation = {
  id: string
  user_id: string
  title: string
  created_at: string
  updated_at: string
}
