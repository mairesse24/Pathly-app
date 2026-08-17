import { supabase } from "../lib/supabase"

export type CanvasConnectionStatus =
  | "not_connected"
  | "connecting"
  | "connected"
  | "needs_reauthorization"
  | "connection_unavailable"

export type CanvasConnection = {
  id: string
  canvas_base_url: string
  canvas_user_id: string | null
  status: CanvasConnectionStatus
  auth_type: "oauth" | "personal_access_token"
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type CanvasAvailableCourse = {
  id: string
  course_code: string | null
  course_name: string
}

export type CanvasSyncPreview = {
  mode: "preview"
  current_courses: CanvasAvailableCourse[]
  courses_available: number
  historical_courses_excluded: number
  courses_seen?: number
  courses_created?: number
  courses_updated?: number
  assignments_seen?: number
  assignments_created?: number
  assignments_updated?: number
}

export type CanvasSyncResult = {
  mode: "import"
  synced_at: string
  courses_available: number
  historical_courses_excluded: number
  courses_created: number
  courses_updated: number
  assignments_seen: number
  assignments_created: number
  assignments_updated: number
}

export type CanvasCleanupImpact = {
  canvas_courses: number
  assignments: number
  exams: number
  study_sessions: number
  uploads: number
  processing_results: number
}

export const canvasUnavailableMessage =
  "Your school's Canvas setup doesn't currently allow this connection. You can still use Pathly with manual entry and syllabus uploads."

export function normalizeCanvasDomain(value: string) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error("Enter a valid HTTPS Canvas school URL.")
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) throw new Error("Enter a valid HTTPS Canvas school URL.")
  return url.origin
}

export async function getCanvasConnection() {
  const { data, error } = await supabase.from("canvas_connections")
    .select("id,canvas_base_url,canvas_user_id,status,auth_type,last_synced_at,created_at,updated_at")
    .maybeSingle()
  if (error) throw error
  return data as CanvasConnection | null
}

export async function startCanvasConnection(canvasBaseUrl: string) {
  const normalized = normalizeCanvasDomain(canvasBaseUrl)
  const { data, error } = await supabase.functions.invoke("canvas-oauth-start", {
    body: { canvas_base_url: normalized },
  })
  if (error || !data?.authorization_url) throw new Error(canvasUnavailableMessage)
  return data.authorization_url as string
}

export async function previewCanvasCourses() {
  const { data, error } = await supabase.functions.invoke("canvas-sync", { body: { mode: "preview" } })
  if (error || data?.error) throw new Error(data?.message || canvasUnavailableMessage)
  return data as CanvasSyncPreview
}

export async function syncCanvas(selectedCourseIds: string[]) {
  const { data, error } = await supabase.functions.invoke("canvas-sync", {
    body: { mode: "import", selected_course_ids: selectedCourseIds },
  })
  if (error || data?.error) throw new Error(data?.message || canvasUnavailableMessage)
  return data as CanvasSyncResult
}

export async function connectCanvasWithToken(canvasBaseUrl: string, accessToken: string) {
  const normalized = normalizeCanvasDomain(canvasBaseUrl)
  const { data, error } = await supabase.functions.invoke("canvas-token-connect", {
    body: { canvas_base_url: normalized, access_token: accessToken },
  })
  if (data?.error) throw new Error(data.message || "Pathly couldn't verify this Canvas connection. Check the school URL and access token.")
  if (error) {
    const response = (error as { context?: Response }).context
    const payload = response ? await response.clone().json().catch(() => null) as { message?: string } | null : null
    throw new Error(payload?.message || "Pathly couldn't verify this Canvas connection. Check the school URL and access token.")
  }
}

export async function getCanvasCleanupImpact() {
  const { data, error } = await supabase.functions.invoke("canvas-disconnect", { body: { action: "preview_cleanup" } })
  if (error || data?.error) throw new Error("Pathly couldn't inspect imported Canvas courses right now.")
  return data.impact as CanvasCleanupImpact
}

export async function disconnectCanvas(removeCourses = false) {
  const { data, error } = await supabase.functions.invoke("canvas-disconnect", {
    body: { action: "disconnect", remove_courses: removeCourses },
  })
  if (error || data?.error) throw new Error("Pathly couldn't disconnect Canvas right now. Try again.")
}

export async function removeOldCanvasCourses() {
  const { data, error } = await supabase.functions.invoke("canvas-disconnect", { body: { action: "remove_old_courses" } })
  if (error || data?.error) throw new Error("Pathly couldn't remove old Canvas courses right now. Try again.")
}

