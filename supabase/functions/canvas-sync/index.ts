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

type CanvasCourse = { id: string | number; name: string; course_code?: string; workflow_state?: string }
type CanvasAssignment = {
  id: string | number
  name: string
  due_at?: string | null
  unlock_at?: string | null
  lock_at?: string | null
  updated_at?: string | null
  submission_types?: string[]
}
type CanvasSubmission = {
  assignment_id: string | number
  workflow_state?: string
  late?: boolean
  missing?: boolean
}

function normalized(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ")
}

function sameInstant(first?: string | null, second?: string | null) {
  if (!first && !second) return true
  if (!first || !second) return false
  return new Date(first).getTime() === new Date(second).getTime()
}

function submissionStatus(submission?: CanvasSubmission) {
  if (!submission) return "unknown"
  if (submission.missing) return "missing"
  if (submission.late) return "late"
  if (submission.workflow_state === "submitted" || submission.workflow_state === "graded") return "submitted"
  return "unsubmitted"
}

function assignmentStatus(status: string) {
  return status === "submitted" || status === "late" ? "completed" : "not_started"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  try {
    const { admin, user } = await authenticate(req)
    const { data: connection, error } = await admin.from("canvas_connections")
      .select("id,user_id,canvas_base_url,status,auth_type")
      .eq("user_id", user.id).maybeSingle()
    if (error || !connection || connection.status !== "connected")
      return respond({ error: "not_connected", message: unavailableMessage }, 409)
    const accessToken = await validAccessToken(admin, connection)
    const canvasCourses = await fetchCanvasPages<CanvasCourse>(
      connection.canvas_base_url,
      "/api/v1/courses?enrollment_type=student&per_page=100",
      accessToken,
    )
    const { data: existingCourses = [], error: coursesError } = await admin.from("courses")
      .select("*").eq("user_id", user.id)
    if (coursesError) throw coursesError
    const courseMap = new Map<string, string>()
    let coursesImported = 0
    let assignmentsImported = 0
    for (const canvasCourse of canvasCourses) {
      const externalId = String(canvasCourse.id)
      let existing = existingCourses.find((course: any) =>
        course.canvas_connection_id === connection.id && course.canvas_course_id === externalId)
      if (!existing) {
        existing = existingCourses.find((course: any) =>
          !course.canvas_course_id && (
            normalized(course.course_code) === normalized(canvasCourse.course_code) ||
            normalized(course.course_name) === normalized(canvasCourse.name)
          ))
      }
      let pathlyCourseId: string
      if (existing) {
        const updates: Record<string, unknown> = {
          canvas_connection_id: connection.id,
          canvas_course_id: externalId,
          canvas_name: canvasCourse.name,
          canvas_course_code: canvasCourse.course_code || null,
          canvas_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        if (existing.source === "canvas" && (!existing.canvas_name || existing.course_name === existing.canvas_name))
          updates.course_name = canvasCourse.name
        if (existing.source === "canvas" && canvasCourse.course_code && (!existing.canvas_course_code || existing.course_code === existing.canvas_course_code))
          updates.course_code = canvasCourse.course_code
        const { data: updated, error: updateError } = await admin.from("courses")
          .update(updates).eq("id", existing.id).eq("user_id", user.id).select("id").single()
        if (updateError) throw updateError
        pathlyCourseId = updated.id
      } else {
        const { data: created, error: createError } = await admin.from("courses").insert({
          user_id: user.id,
          semester_id: null,
          course_code: canvasCourse.course_code || canvasCourse.name,
          course_name: canvasCourse.name,
          credits: null,
          instructor: null,
          meeting_days: null,
          meeting_start: null,
          meeting_end: null,
          source: "canvas",
          canvas_connection_id: connection.id,
          canvas_course_id: externalId,
          canvas_name: canvasCourse.name,
          canvas_course_code: canvasCourse.course_code || null,
          canvas_updated_at: new Date().toISOString(),
        }).select("id").single()
        if (createError) throw createError
        pathlyCourseId = created.id
        coursesImported += 1
      }
      courseMap.set(externalId, pathlyCourseId)
      const [canvasAssignments, canvasSubmissions] = await Promise.all([
        fetchCanvasPages<CanvasAssignment>(
          connection.canvas_base_url,
          `/api/v1/courses/${encodeURIComponent(externalId)}/assignments?per_page=100`,
          accessToken,
        ),
        (async () => {
          try {
            return await fetchCanvasPages<CanvasSubmission>(
              connection.canvas_base_url,
              `/api/v1/courses/${encodeURIComponent(externalId)}/students/submissions?per_page=100`,
              accessToken,
            )
          } catch (error) {
            const code = error instanceof Error ? error.message : ""
            if (code === "canvas_api_403" || code === "canvas_api_404") return []
            throw error
          }
        })(),
      ])
      const submissionByAssignment = new Map(
        canvasSubmissions.map((submission) => [String(submission.assignment_id), submission]),
      )
      const { data: existingAssignments = [], error: assignmentsError } = await admin.from("assignments")
        .select("*").eq("user_id", user.id).eq("canvas_connection_id", connection.id)
        .eq("canvas_course_id", externalId)
      if (assignmentsError) throw assignmentsError
      for (const canvasAssignment of canvasAssignments) {
        const assignmentId = String(canvasAssignment.id)
        const canonicalStatus = submissionStatus(submissionByAssignment.get(assignmentId))
        const appliedStatus = assignmentStatus(canonicalStatus)
        const existingAssignment = existingAssignments.find((item: any) => item.canvas_assignment_id === assignmentId)
        if (existingAssignment) {
          const updates: Record<string, unknown> = {
            canvas_title: canvasAssignment.name,
            canvas_due_at: canvasAssignment.due_at || null,
            canvas_available_from: canvasAssignment.unlock_at || null,
            canvas_available_until: canvasAssignment.lock_at || null,
            canvas_submission_status: canonicalStatus,
            canvas_submission_types: canvasAssignment.submission_types || [],
            canvas_updated_at: canvasAssignment.updated_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          if (!existingAssignment.canvas_title || existingAssignment.title === existingAssignment.canvas_title)
            updates.title = canvasAssignment.name
          if (sameInstant(existingAssignment.due_at, existingAssignment.canvas_due_at))
            updates.due_at = canvasAssignment.due_at || null
          if (canonicalStatus !== "unknown" && (!existingAssignment.canvas_last_applied_status || existingAssignment.status === existingAssignment.canvas_last_applied_status)) {
            updates.status = appliedStatus
            updates.canvas_last_applied_status = appliedStatus
          }
          const { error: updateError } = await admin.from("assignments").update(updates)
            .eq("id", existingAssignment.id).eq("user_id", user.id)
          if (updateError) throw updateError
        } else {
          const { error: insertError } = await admin.from("assignments").insert({
            user_id: user.id,
            course_id: pathlyCourseId,
            title: canvasAssignment.name,
            description: null,
            due_at: canvasAssignment.due_at || null,
            estimated_minutes: null,
            status: appliedStatus,
            source: "canvas",
            canvas_connection_id: connection.id,
            canvas_assignment_id: assignmentId,
            canvas_course_id: externalId,
            canvas_title: canvasAssignment.name,
            canvas_due_at: canvasAssignment.due_at || null,
            canvas_available_from: canvasAssignment.unlock_at || null,
            canvas_available_until: canvasAssignment.lock_at || null,
            canvas_submission_status: canonicalStatus,
            canvas_last_applied_status: appliedStatus,
            canvas_submission_types: canvasAssignment.submission_types || [],
            canvas_updated_at: canvasAssignment.updated_at || new Date().toISOString(),
          })
          if (insertError) throw insertError
          assignmentsImported += 1
        }
      }
    }
    const syncedAt = new Date().toISOString()
    await admin.from("canvas_connections").update({ last_synced_at: syncedAt, updated_at: syncedAt })
      .eq("id", connection.id).eq("user_id", user.id)
    return respond({ synced_at: syncedAt, courses_imported: coursesImported, assignments_imported: assignmentsImported })
  } catch (error) {
    console.error("Canvas sync failed", error)
    const code = error instanceof Error ? error.message : "sync_failed"
    if (code === "authentication_required" || code === "invalid_session") return respond({ error: code }, 401)
    if (/reauthorization|required|canvas_api_401/.test(code)) {
      let authType: "oauth" | "personal_access_token" = "oauth"
      try {
        const { admin, user } = await authenticate(req)
        const { data: connection } = await admin.from("canvas_connections")
          .select("auth_type").eq("user_id", user.id).maybeSingle()
        if (connection?.auth_type === "personal_access_token") authType = "personal_access_token"
        await setNeedsReauthorization(admin, user)
      } catch { /* authentication response already handled below */ }
      return respond({
        error: "needs_reauthorization",
        message: authType === "personal_access_token"
          ? "Your Canvas access token is no longer valid. Create a new token in Canvas to reconnect."
          : unavailableMessage,
      }, 401)
    }
    return respond({ error: "sync_failed", message: unavailableMessage }, 502)
  }
})
