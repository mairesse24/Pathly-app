import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import {
  authenticate,
  assertCanvasEncryptionConfigured,
  corsHeaders,
  normalizeCanvasBaseUrl,
  respond,
  storeCredentials,
} from "../_shared/canvas.ts"

function safeCanvasMessage(body: unknown, accessToken: string) {
  let message = ""
  if (typeof body === "string") message = body
  else if (body && typeof body === "object") {
    const value = body as { message?: unknown; errors?: Array<{ message?: unknown }> }
    if (typeof value.message === "string") message = value.message
    else if (typeof value.errors?.[0]?.message === "string") message = value.errors[0].message
  }
  return message.replaceAll(accessToken, "[redacted]").replace(/[\r\n\t]+/g, " ").slice(0, 300)
}

function safeFinalUrl(value: string) {
  try { const url = new URL(value); return `${url.origin}${url.pathname}` } catch { return "unavailable" }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  let stage = "authenticate"
  let admin: Awaited<ReturnType<typeof authenticate>>["admin"] | null = null
  let userId: string | null = null
  let connectionId: string | null = null
  try {
    const authenticated = await authenticate(req)
    admin = authenticated.admin
    userId = authenticated.user.id
    const body = await req.json().catch(() => ({}))
    const canvasBaseUrl = normalizeCanvasBaseUrl(body.canvas_base_url)
    const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : ""
    if (!accessToken || accessToken.length > 4096) throw new Error("invalid_token")

    stage = "encryption_configuration"
    await assertCanvasEncryptionConfigured()

    stage = "canvas_verification"
    const verification = await fetch(`${canvasBaseUrl}/api/v1/courses?enrollment_type=student&per_page=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    })
    const contentType = verification.headers.get("content-type") || "unknown"
    const responseBody = contentType.includes("json")
      ? await verification.json().catch(() => null)
      : await verification.text().catch(() => "")
    if (!verification.ok) {
      console.warn("Canvas verification failed", {
        status: verification.status,
        contentType,
        finalUrl: safeFinalUrl(verification.url),
        message: safeCanvasMessage(responseBody, accessToken),
      })
      if (verification.status === 401) throw new Error("canvas_401")
      if (verification.status === 403) throw new Error("canvas_403")
      throw new Error("canvas_response_failed")
    }
    if (!Array.isArray(responseBody)) throw new Error("not_canvas_domain")

    stage = "connection_preparation"
    const now = new Date().toISOString()
    const { data: connection, error: connectionError } = await admin.from("canvas_connections").upsert({
      user_id: userId,
      canvas_base_url: canvasBaseUrl,
      canvas_user_id: null,
      auth_type: "personal_access_token",
      status: "connecting",
      updated_at: now,
    }, { onConflict: "user_id" }).select("id").single()
    if (connectionError) throw connectionError
    connectionId = connection.id
    stage = "credential_storage"
    await storeCredentials(admin, connection.id, userId, { access_token: accessToken })
    stage = "connection_activation"
    const { error: activationError } = await admin.from("canvas_connections").update({ status: "connected", updated_at: new Date().toISOString() })
      .eq("id", connection.id).eq("user_id", userId)
    if (activationError) throw activationError
    return respond({ connected: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : "connection_failed"
    if (admin && userId && connectionId && stage !== "canvas_verification") {
      await admin.from("canvas_credentials").delete().eq("connection_id", connectionId).eq("user_id", userId)
      await admin.from("canvas_connections").update({ status: "connection_unavailable", updated_at: new Date().toISOString() })
        .eq("id", connectionId).eq("user_id", userId)
    }
    if (!code.startsWith("canvas_")) console.error("Canvas token connection failed", { stage, code })
    if (code === "authentication_required" || code === "invalid_session") return respond({ error: code }, 401)
    if (code === "invalid_domain") return respond({ error: code, message: "We couldn't verify this as a Canvas school address." }, 400)
    if (code === "canvas_401") return respond({ error: code, message: "The Canvas access token was not accepted. It may be incomplete, expired, or revoked." }, 401)
    if (code === "canvas_403") return respond({ error: code, message: "Canvas accepted your account but does not allow access to the information Pathly needs." }, 403)
    if (code === "not_canvas_domain") return respond({ error: code, message: "We couldn't verify this as a Canvas school address." }, 400)
    if (code === "TimeoutError" || code === "TypeError") return respond({ error: "canvas_unreachable", message: "Pathly couldn't reach your school's Canvas right now." }, 503)
    if (stage === "encryption_configuration" || stage === "credential_storage" || code.startsWith("canvas_encryption_") || code.startsWith("canvas_credential_storage_"))
      return respond({ error: "secure_storage_unavailable", message: "Pathly couldn't securely save this connection right now." }, 503)
    return respond({ error: "verification_failed", message: "Pathly couldn't verify this Canvas connection. Check the school URL and access token." }, 400)
  }
})
