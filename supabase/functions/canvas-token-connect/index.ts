import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import {
  authenticate,
  corsHeaders,
  normalizeCanvasBaseUrl,
  respond,
  storeCredentials,
} from "../_shared/canvas.ts"

type CanvasProfile = { id?: string | number }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  try {
    const { admin, user } = await authenticate(req)
    const body = await req.json().catch(() => ({}))
    const canvasBaseUrl = normalizeCanvasBaseUrl(body.canvas_base_url)
    const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : ""
    if (!accessToken || accessToken.length > 4096) throw new Error("invalid_token")

    const verification = await fetch(`${canvasBaseUrl}/api/v1/users/self/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!verification.ok) throw new Error("verification_failed")
    const profile = await verification.json() as CanvasProfile
    if (profile.id == null) throw new Error("verification_failed")

    const now = new Date().toISOString()
    const { data: connection, error: connectionError } = await admin.from("canvas_connections").upsert({
      user_id: user.id,
      canvas_base_url: canvasBaseUrl,
      canvas_user_id: String(profile.id),
      auth_type: "personal_access_token",
      status: "connected",
      updated_at: now,
    }, { onConflict: "user_id" }).select("id").single()
    if (connectionError) throw connectionError
    await storeCredentials(admin, connection.id, user.id, { access_token: accessToken })
    return respond({ connected: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : "connection_failed"
    if (code === "authentication_required" || code === "invalid_session") return respond({ error: code }, 401)
    if (code === "invalid_domain") return respond({ error: code, message: "Enter a valid HTTPS Canvas school URL." }, 400)
    return respond({ error: "verification_failed", message: "Pathly couldn't verify this Canvas connection. Check the school URL and access token." }, 400)
  }
})
