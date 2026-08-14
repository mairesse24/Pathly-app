import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import {
  authenticate,
  canvasConfig,
  canvasScopes,
  corsHeaders,
  createOAuthState,
  hashState,
  hasCanvasConfig,
  normalizeCanvasBaseUrl,
  respond,
  unavailableMessage,
} from "../_shared/canvas.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  try {
    const { admin, user } = await authenticate(req)
    const body = await req.json()
    const canvasBaseUrl = normalizeCanvasBaseUrl(body.canvas_base_url)
    if (!hasCanvasConfig()) {
      await admin.from("canvas_connections").upsert({
        user_id: user.id,
        canvas_base_url: canvasBaseUrl,
        status: "connection_unavailable",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      return respond({ error: "connection_unavailable", message: unavailableMessage }, 503)
    }
    const state = createOAuthState()
    await admin.from("canvas_oauth_states").delete()
      .eq("user_id", user.id).lt("expires_at", new Date().toISOString())
    const { error: stateError } = await admin.from("canvas_oauth_states").insert({
      state_hash: await hashState(state),
      user_id: user.id,
      canvas_base_url: canvasBaseUrl,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    if (stateError) throw stateError
    const { data: connection, error: connectionError } = await admin
      .from("canvas_connections")
      .upsert({
        user_id: user.id,
        canvas_base_url: canvasBaseUrl,
        status: "connecting",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select("id").single()
    if (connectionError || !connection) throw connectionError || new Error("connection_failed")
    const config = canvasConfig()
    const authorizationUrl = new URL("/login/oauth2/auth", canvasBaseUrl)
    authorizationUrl.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: "code",
      redirect_uri: config.redirectUri,
      state,
      scope: canvasScopes.join(" "),
      purpose: "Pathly Canvas connection",
    }).toString()
    return respond({ authorization_url: authorizationUrl.toString() })
  } catch (error) {
    const code = error instanceof Error ? error.message : "connection_failed"
    if (code === "invalid_domain") return respond({ error: code, message: "Enter a valid HTTPS Canvas school URL." }, 400)
    if (code === "authentication_required" || code === "invalid_session")
      return respond({ error: code }, 401)
    console.error("Canvas OAuth start failed", error)
    return respond({ error: "connection_failed", message: unavailableMessage }, 500)
  }
})
