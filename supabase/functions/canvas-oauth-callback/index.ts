import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import {
  canvasConfig,
  exchangeToken,
  hashState,
  hasCanvasConfig,
  storeCredentials,
  supabaseClients,
  unavailableMessage,
} from "../_shared/canvas.ts"

function redirect(status: "connected" | "error") {
  const appUrl = canvasConfig().appUrl
  if (!appUrl) return new Response(unavailableMessage, { status: 503 })
  const target = new URL("/settings", appUrl)
  target.searchParams.set("canvas", status)
  return Response.redirect(target, 302)
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 })
  let stateRow: { state_hash: string; user_id: string; canvas_base_url: string; expires_at: string } | null = null
  try {
    if (!hasCanvasConfig()) return redirect("error")
    const url = new URL(req.url)
    const state = url.searchParams.get("state") || ""
    const code = url.searchParams.get("code") || ""
    if (!state || !code || url.searchParams.has("error")) return redirect("error")
    const { admin } = supabaseClients()
    const stateHash = await hashState(state)
    const { data, error } = await admin.from("canvas_oauth_states")
      .select("state_hash,user_id,canvas_base_url,expires_at")
      .eq("state_hash", stateHash).maybeSingle()
    stateRow = data
    await admin.from("canvas_oauth_states").delete().eq("state_hash", stateHash)
    if (error || !stateRow || new Date(stateRow.expires_at) <= new Date())
      throw new Error("invalid_oauth_state")
    const token = await exchangeToken(stateRow.canvas_base_url, {
      grant_type: "authorization_code",
      code,
    })
    if (!token.access_token || !token.refresh_token) throw new Error("invalid_token_response")
    const { data: connection, error: connectionError } = await admin.from("canvas_connections")
      .update({
        canvas_base_url: stateRow.canvas_base_url,
        auth_type: "oauth",
        canvas_user_id: token.user?.id != null ? String(token.user.id) : null,
        status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", stateRow.user_id)
      .select("id").single()
    if (connectionError || !connection) throw connectionError || new Error("connection_missing")
    await storeCredentials(admin, connection.id, stateRow.user_id, token)
    return redirect("connected")
  } catch (error) {
    console.error("Canvas OAuth callback failed", error)
    if (stateRow) {
      const { admin } = supabaseClients()
      await admin.from("canvas_connections").update({
        status: "connection_unavailable",
        updated_at: new Date().toISOString(),
      }).eq("user_id", stateRow.user_id)
    }
    return redirect("error")
  }
})

