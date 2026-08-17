import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import { authenticate, corsHeaders, respond, validAccessToken } from "../_shared/canvas.ts"

async function cleanupImpact(admin: Awaited<ReturnType<typeof authenticate>>["admin"], userId: string, connectionId: string) {
  const { data: courses, error } = await admin.from("courses")
    .select("id").eq("user_id", userId).eq("source", "canvas").eq("canvas_connection_id", connectionId).eq("is_active", true)
  if (error) throw error
  const ids = (courses || []).map((course) => course.id)
  if (!ids.length) return { canvas_courses: 0, assignments: 0, exams: 0, study_sessions: 0, uploads: 0, processing_results: 0 }
  const count = async (table: "assignments" | "exams" | "study_sessions" | "uploaded_files" | "ai_processing_results") => {
    const { count, error: countError } = await admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).in("course_id", ids)
    if (countError) throw countError
    return count || 0
  }
  const [assignments, exams, study_sessions, uploads, processing_results] = await Promise.all([
    count("assignments"), count("exams"), count("study_sessions"), count("uploaded_files"), count("ai_processing_results"),
  ])
  return { canvas_courses: ids.length, assignments, exams, study_sessions, uploads, processing_results }
}

async function hideCanvasCourses(admin: Awaited<ReturnType<typeof authenticate>>["admin"], userId: string, connectionId: string) {
  const { error } = await admin.from("courses").update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId).eq("source", "canvas").eq("canvas_connection_id", connectionId)
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  try {
    const { admin, user } = await authenticate(req)
    const body = await req.json().catch(() => ({})) as { action?: string; remove_courses?: boolean }
    const { data: connection } = await admin.from("canvas_connections")
      .select("id,user_id,canvas_base_url,status,auth_type").eq("user_id", user.id).maybeSingle()
    if (!connection) return respond({ disconnected: true, impact: { canvas_courses: 0, assignments: 0, exams: 0, study_sessions: 0, uploads: 0, processing_results: 0 } })
    const impact = await cleanupImpact(admin, user.id, connection.id)
    if (body.action === "preview_cleanup") return respond({ impact })
    if (body.action === "remove_old_courses") {
      await hideCanvasCourses(admin, user.id, connection.id)
      return respond({ removed: true, impact })
    }
    if (connection.auth_type === "oauth" && connection.status === "connected") try {
      const accessToken = await validAccessToken(admin, connection)
      await fetch(`${connection.canvas_base_url}/login/oauth2/token`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8_000) })
    } catch (error) { console.warn("Canvas token revocation could not be confirmed", error) }
    const { error: credentialError } = await admin.from("canvas_credentials").delete().eq("connection_id", connection.id).eq("user_id", user.id)
    if (credentialError) throw credentialError
    if (body.remove_courses) await hideCanvasCourses(admin, user.id, connection.id)
    const { error: connectionError } = await admin.from("canvas_connections").update({ status: "not_connected", canvas_user_id: null, updated_at: new Date().toISOString() }).eq("id", connection.id).eq("user_id", user.id)
    if (connectionError) throw connectionError
    return respond({ disconnected: true, removed: Boolean(body.remove_courses), impact })
  } catch (error) {
    const code = error instanceof Error ? error.message : "disconnect_failed"
    if (code === "authentication_required" || code === "invalid_session") return respond({ error: code }, 401)
    console.error("Canvas disconnect failed", error)
    return respond({ error: "disconnect_failed" }, 500)
  }
})
