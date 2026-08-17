import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import {
  authenticate,
  corsHeaders,
  respond,
  validAccessToken,
} from "../_shared/canvas.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  try {
    const { admin, user } = await authenticate(req)
    const { data: connection } = await admin.from("canvas_connections")
      .select("id,user_id,canvas_base_url,status,auth_type").eq("user_id", user.id).maybeSingle()
    if (!connection) return respond({ disconnected: true })
    if (connection.auth_type === "oauth") try {
      const accessToken = await validAccessToken(admin, connection)
      await fetch(`${connection.canvas_base_url}/login/oauth2/token`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8_000),
      })
    } catch (error) {
      console.warn("Canvas token revocation could not be confirmed", error)
    }
    const { error: credentialError } = await admin.from("canvas_credentials")
      .delete().eq("connection_id", connection.id).eq("user_id", user.id)
    if (credentialError) throw credentialError
    const { error: connectionError } = await admin.from("canvas_connections").update({
      status: "not_connected",
      canvas_user_id: null,
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id).eq("user_id", user.id)
    if (connectionError) throw connectionError
    return respond({ disconnected: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : "disconnect_failed"
    if (code === "authentication_required" || code === "invalid_session") return respond({ error: code }, 401)
    console.error("Canvas disconnect failed", error)
    return respond({ error: "disconnect_failed" }, 500)
  }
})
