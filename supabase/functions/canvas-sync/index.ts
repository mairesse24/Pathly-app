import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import {
  authenticate,
  corsHeaders,
  fetchCanvasPages,
  respond,
  setNeedsReauthorization,
  unavailableMessage,
  validAccessToken,
} from "../_shared/canvas.ts"

type CanvasCourse = { id: string | number; name: string; course_code?: string }
type CanvasAssignment = { id: string | number; name: string; due_at?: string | null; unlock_at?: string | null; lock_at?: string | null; updated_at?: string | null; submission_types?: string[] }
type CanvasSubmission = { assignment_id: string | number; workflow_state?: string; late?: boolean; missing?: boolean }
type StoredCourse = { id: string; source: string; course_code: string; course_name: string; canvas_connection_id: string | null; canvas_course_id: string | null; canvas_name: string | null; canvas_course_code: string | null }
type StoredAssignment = { id: string; title: string; due_at: string | null; status: string; canvas_assignment_id: string | null; canvas_title: string | null; canvas_due_at: string | null; canvas_last_applied_status: string | null }
type SyncRequest = { mode?: "preview" | "import"; selected_course_ids?: unknown }

const noCurrentCoursesMessage = "Canvas is connected, but we didn't find any current courses to import."

function normalized(value?: string | null) { return (value || "").trim().toLowerCase().replace(/\s+/g, " ") }
function sameInstant(first?: string | null, second?: string | null) { return (!first && !second) || Boolean(first && second && new Date(first).getTime() === new Date(second).getTime()) }
function submissionStatus(submission?: CanvasSubmission) {
  if (!submission) return "unknown"
  if (submission.missing) return "missing"
  if (submission.late) return "late"
  return submission.workflow_state === "submitted" || submission.workflow_state === "graded" ? "submitted" : "unsubmitted"
}
function assignmentStatus(status: string) { return status === "submitted" || status === "late" ? "completed" : "not_started" }
function currentAssignment(assignment: CanvasAssignment, submission?: CanvasSubmission) {
  if (submission && submissionStatus(submission) !== "submitted" && submissionStatus(submission) !== "late") return true
  if (!assignment.due_at) return true
  return new Date(assignment.due_at).getTime() >= Date.now() - 14 * 24 * 60 * 60 * 1000
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  try {
    const { admin, user } = await authenticate(req)
    const body = await req.json().catch(() => ({})) as SyncRequest
    const mode = body.mode === "import" ? "import" : "preview"
    const { data: connection, error } = await admin.from("canvas_connections")
      .select("id,user_id,canvas_base_url,status,auth_type").eq("user_id", user.id).maybeSingle()
    if (error || !connection || connection.status !== "connected") return respond({ error: "not_connected", message: unavailableMessage }, 409)
    const accessToken = await validAccessToken(admin, connection)
    const [activeCourses, studentCourses, favorites] = await Promise.all([
      fetchCanvasPages<CanvasCourse>(connection.canvas_base_url, "/api/v1/courses?enrollment_type=student&enrollment_state=active&per_page=100", accessToken),
      fetchCanvasPages<CanvasCourse>(connection.canvas_base_url, "/api/v1/courses?enrollment_type=student&per_page=100", accessToken),
      fetchCanvasPages<CanvasCourse>(connection.canvas_base_url, "/api/v1/users/self/favorites/courses?per_page=100", accessToken).catch(() => []),
    ])
    const activeById = new Map(activeCourses.map((course) => [String(course.id), course]))
    const favoriteActive = favorites.filter((course) => activeById.has(String(course.id)))
    const availableCourses = favoriteActive.length ? favoriteActive : activeCourses
    const availableIds = new Set(availableCourses.map((course) => String(course.id)))
    const historicalCoursesExcluded = studentCourses.filter((course) => !activeById.has(String(course.id))).length
    const preview = {
      mode: "preview" as const,
      current_courses: availableCourses.map((course) => ({ id: String(course.id), course_code: course.course_code || null, course_name: course.name })),
      courses_available: availableCourses.length,
      historical_courses_excluded: historicalCoursesExcluded,
    }
    if (mode === "preview" || availableCourses.length === 0) return respond({ ...preview, message: availableCourses.length ? undefined : noCurrentCoursesMessage })

    if (!Array.isArray(body.selected_course_ids)) return respond({ error: "invalid_selection", message: "Choose one or more current Canvas courses to import." }, 400)
    const selectedIds = [...new Set(body.selected_course_ids.filter((id): id is string => typeof id === "string" && id.length > 0))]
    if (!selectedIds.length || selectedIds.some((id) => !availableIds.has(id))) return respond({ error: "invalid_selection", message: "Choose only courses currently available from Canvas." }, 400)
    const selectedCourses = availableCourses.filter((course) => selectedIds.includes(String(course.id)))
    const now = new Date().toISOString()
    const { error: deactivateError } = await admin.from("courses").update({ is_active: false, updated_at: now })
      .eq("user_id", user.id).eq("source", "canvas").eq("canvas_connection_id", connection.id)
    if (deactivateError) throw deactivateError
    const { data: existingCourses = [], error: coursesError } = await admin.from("courses").select("*").eq("user_id", user.id)
    if (coursesError) throw coursesError
    const courseMap = new Map<string, string>()
    let coursesCreated = 0, coursesUpdated = 0, assignmentsSeen = 0, assignmentsCreated = 0, assignmentsUpdated = 0
    for (const canvasCourse of selectedCourses) {
      const externalId = String(canvasCourse.id)
      let existing = (existingCourses as StoredCourse[]).find((course) => course.canvas_connection_id === connection.id && course.canvas_course_id === externalId)
      if (!existing) existing = (existingCourses as StoredCourse[]).find((course) => !course.canvas_course_id && (normalized(course.course_code) === normalized(canvasCourse.course_code) || normalized(course.course_name) === normalized(canvasCourse.name)))
      let pathlyCourseId: string
      if (existing) {
        const updates: Record<string, unknown> = { canvas_connection_id: connection.id, canvas_course_id: externalId, canvas_name: canvasCourse.name, canvas_course_code: canvasCourse.course_code || null, canvas_updated_at: now, is_active: true, updated_at: now }
        if (existing.source === "canvas" && (!existing.canvas_name || existing.course_name === existing.canvas_name)) updates.course_name = canvasCourse.name
        if (existing.source === "canvas" && canvasCourse.course_code && (!existing.canvas_course_code || existing.course_code === existing.canvas_course_code)) updates.course_code = canvasCourse.course_code
        const { data, error: updateError } = await admin.from("courses").update(updates).eq("id", existing.id).eq("user_id", user.id).select("id").single()
        if (updateError) throw updateError
        pathlyCourseId = data.id; coursesUpdated += 1
      } else {
        const { data, error: createError } = await admin.from("courses").insert({ user_id: user.id, semester_id: null, course_code: canvasCourse.course_code || canvasCourse.name, course_name: canvasCourse.name, credits: null, instructor: null, meeting_days: null, meeting_start: null, meeting_end: null, is_active: true, source: "canvas", canvas_connection_id: connection.id, canvas_course_id: externalId, canvas_name: canvasCourse.name, canvas_course_code: canvasCourse.course_code || null, canvas_updated_at: now }).select("id").single()
        if (createError) throw createError
        pathlyCourseId = data.id; coursesCreated += 1
      }
      courseMap.set(externalId, pathlyCourseId)
      const [canvasAssignments, canvasSubmissions] = await Promise.all([
        fetchCanvasPages<CanvasAssignment>(connection.canvas_base_url, `/api/v1/courses/${encodeURIComponent(externalId)}/assignments?per_page=100`, accessToken),
        fetchCanvasPages<CanvasSubmission>(connection.canvas_base_url, `/api/v1/courses/${encodeURIComponent(externalId)}/students/submissions?per_page=100`, accessToken).catch(() => []),
      ])
      const submissionByAssignment = new Map(canvasSubmissions.map((submission) => [String(submission.assignment_id), submission]))
      const relevantAssignments = canvasAssignments.filter((assignment) => currentAssignment(assignment, submissionByAssignment.get(String(assignment.id))))
      assignmentsSeen += relevantAssignments.length
      const { data: existingAssignments = [], error: assignmentsError } = await admin.from("assignments").select("*").eq("user_id", user.id).eq("canvas_connection_id", connection.id).eq("canvas_course_id", externalId)
      if (assignmentsError) throw assignmentsError
      for (const canvasAssignment of relevantAssignments) {
        const assignmentId = String(canvasAssignment.id), canonicalStatus = submissionStatus(submissionByAssignment.get(assignmentId)), appliedStatus = assignmentStatus(canonicalStatus)
        const existingAssignment = (existingAssignments as StoredAssignment[]).find((item) => item.canvas_assignment_id === assignmentId)
        if (existingAssignment) {
          const updates: Record<string, unknown> = { canvas_title: canvasAssignment.name, canvas_due_at: canvasAssignment.due_at || null, canvas_available_from: canvasAssignment.unlock_at || null, canvas_available_until: canvasAssignment.lock_at || null, canvas_submission_status: canonicalStatus, canvas_submission_types: canvasAssignment.submission_types || [], canvas_updated_at: canvasAssignment.updated_at || now, updated_at: now }
          if (!existingAssignment.canvas_title || existingAssignment.title === existingAssignment.canvas_title) updates.title = canvasAssignment.name
          if (sameInstant(existingAssignment.due_at, existingAssignment.canvas_due_at)) updates.due_at = canvasAssignment.due_at || null
          if (canonicalStatus !== "unknown" && (!existingAssignment.canvas_last_applied_status || existingAssignment.status === existingAssignment.canvas_last_applied_status)) { updates.status = appliedStatus; updates.canvas_last_applied_status = appliedStatus }
          const { error: updateError } = await admin.from("assignments").update(updates).eq("id", existingAssignment.id).eq("user_id", user.id)
          if (updateError) throw updateError
          assignmentsUpdated += 1
        } else {
          const { error: insertError } = await admin.from("assignments").insert({ user_id: user.id, course_id: courseMap.get(externalId), title: canvasAssignment.name, description: null, due_at: canvasAssignment.due_at || null, estimated_minutes: null, status: appliedStatus, source: "canvas", canvas_connection_id: connection.id, canvas_assignment_id: assignmentId, canvas_course_id: externalId, canvas_title: canvasAssignment.name, canvas_due_at: canvasAssignment.due_at || null, canvas_available_from: canvasAssignment.unlock_at || null, canvas_available_until: canvasAssignment.lock_at || null, canvas_submission_status: canonicalStatus, canvas_last_applied_status: appliedStatus, canvas_submission_types: canvasAssignment.submission_types || [], canvas_updated_at: canvasAssignment.updated_at || now })
          if (insertError) throw insertError
          assignmentsCreated += 1
        }
      }
    }
    const syncedAt = new Date().toISOString()
    await admin.from("canvas_connections").update({ last_synced_at: syncedAt, updated_at: syncedAt }).eq("id", connection.id).eq("user_id", user.id)
    return respond({ mode: "import", synced_at: syncedAt, courses_available: availableCourses.length, historical_courses_excluded: historicalCoursesExcluded, courses_created: coursesCreated, courses_updated: coursesUpdated, assignments_seen: assignmentsSeen, assignments_created: assignmentsCreated, assignments_updated: assignmentsUpdated })
  } catch (error) {
    console.error("Canvas sync failed", error)
    const code = error instanceof Error ? error.message : "sync_failed"
    if (code === "authentication_required" || code === "invalid_session") return respond({ error: code }, 401)
    if (/reauthorization|required|canvas_api_401/.test(code)) {
      try { const { admin, user } = await authenticate(req); await setNeedsReauthorization(admin, user) } catch { /* the original auth failure is returned below */ }
      return respond({ error: "needs_reauthorization", message: unavailableMessage }, 401)
    }
    return respond({ error: "sync_failed", message: unavailableMessage }, 502)
  }
})
