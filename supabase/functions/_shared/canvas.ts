import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
}

export const canvasScopes = [
  "url:GET|/api/v1/courses",
  "url:GET|/api/v1/courses/:course_id/assignments",
  "url:GET|/api/v1/courses/:course_id/students/submissions",
]

export const unavailableMessage =
  "Your school's Canvas setup doesn't currently allow this connection. You can still use Pathly with manual entry and syllabus uploads."

export function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function readNamedKey(name: string, legacyName: string) {
  const legacy = Deno.env.get(legacyName)
  if (legacy) return legacy
  const encoded = Deno.env.get(name)
  if (!encoded) return ""
  try {
    return JSON.parse(encoded).default || ""
  } catch {
    return ""
  }
}

export function canvasConfig() {
  return {
    clientId: Deno.env.get("CANVAS_CLIENT_ID") || "",
    clientSecret: Deno.env.get("CANVAS_CLIENT_SECRET") || "",
    redirectUri: Deno.env.get("CANVAS_REDIRECT_URI") || "",
    appUrl: Deno.env.get("PATHLY_APP_URL") || "",
    encryptionKey: Deno.env.get("CANVAS_TOKEN_ENCRYPTION_KEY") || "",
  }
}

export function hasCanvasConfig() {
  return Object.values(canvasConfig()).every(Boolean)
}

export function normalizeCanvasBaseUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 300) throw new Error("invalid_domain")
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error("invalid_domain")
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) throw new Error("invalid_domain")
  return url.origin
}

export function supabaseClients(authorization?: string | null) {
  const url = Deno.env.get("SUPABASE_URL") || ""
  const publishableKey = readNamedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY")
  const secretKey = readNamedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !publishableKey || !secretKey) throw new Error("server_configuration")
  const admin = createClient(url, secretKey, { auth: { persistSession: false } })
  const userClient = createClient(url, publishableKey, {
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
    auth: { persistSession: false },
  })
  return { admin, userClient }
}

export async function authenticate(req: Request) {
  const authorization = req.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer ")) throw new Error("authentication_required")
  const clients = supabaseClients(authorization)
  const { data: { user }, error } = await clients.userClient.auth.getUser(authorization.slice(7))
  if (error || !user) throw new Error("invalid_session")
  return { ...clients, user }
}

function bytesToBase64(bytes: Uint8Array) {
  let value = ""
  for (const byte of bytes) value += String.fromCharCode(byte)
  return btoa(value)
}

function base64ToBytes(value: string) {
  const decoded = atob(value)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

function base64Url(bytes: Uint8Array) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function encryptionKey() {
  const bytes = base64ToBytes(canvasConfig().encryptionKey)
  if (bytes.length !== 32) throw new Error("server_configuration")
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"])
}

export async function encryptSecret(value: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await encryptionKey(),
    new TextEncoder().encode(value),
  )
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    nonce: bytesToBase64(nonce),
  }
}

export async function decryptSecret(ciphertext: string, nonce: string) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(nonce) },
    await encryptionKey(),
    base64ToBytes(ciphertext),
  )
  return new TextDecoder().decode(plaintext)
}

export function createOAuthState() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashState(state: string) {
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state))))
}

export type CanvasToken = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  user?: { id?: string | number }
}

export async function exchangeToken(
  baseUrl: string,
  values: Record<string, string>,
) {
  const config = canvasConfig()
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    ...values,
  })
  const response = await fetch(`${baseUrl}/login/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`canvas_token_${response.status}`)
  return await response.json() as CanvasToken
}

type CredentialRow = {
  connection_id: string
  user_id: string
  access_token_ciphertext: string
  access_token_nonce: string
  refresh_token_ciphertext: string | null
  refresh_token_nonce: string | null
  expires_at: string | null
}

export async function storeCredentials(
  admin: SupabaseClient,
  connectionId: string,
  userId: string,
  token: CanvasToken,
  priorRefresh?: string | null,
) {
  const access = await encryptSecret(token.access_token)
  const refreshValue = token.refresh_token || priorRefresh || null
  const refresh = refreshValue ? await encryptSecret(refreshValue) : null
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null
  const { error } = await admin.from("canvas_credentials").upsert({
    connection_id: connectionId,
    user_id: userId,
    access_token_ciphertext: access.ciphertext,
    access_token_nonce: access.nonce,
    refresh_token_ciphertext: refresh?.ciphertext || null,
    refresh_token_nonce: refresh?.nonce || null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id" })
  if (error) throw error
  return token.access_token
}

export async function validAccessToken(
  admin: SupabaseClient,
  connection: { id: string; user_id: string; canvas_base_url: string },
) {
  const { data, error } = await admin.from("canvas_credentials")
    .select("*").eq("connection_id", connection.id).eq("user_id", connection.user_id).single()
  if (error || !data) throw new Error("reauthorization_required")
  const credential = data as CredentialRow
  const access = await decryptSecret(credential.access_token_ciphertext, credential.access_token_nonce)
  if (!credential.expires_at || new Date(credential.expires_at).getTime() > Date.now() + 60_000) return access
  if (!credential.refresh_token_ciphertext || !credential.refresh_token_nonce)
    throw new Error("reauthorization_required")
  const refresh = await decryptSecret(credential.refresh_token_ciphertext, credential.refresh_token_nonce)
  const token = await exchangeToken(connection.canvas_base_url, {
    grant_type: "refresh_token",
    refresh_token: refresh,
  })
  return storeCredentials(admin, connection.id, connection.user_id, token, refresh)
}

function nextLink(header: string | null) {
  if (!header) return null
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/i)
    if (match) return match[1]
  }
  return null
}

export async function fetchCanvasPages<T>(
  baseUrl: string,
  initialPath: string,
  accessToken: string,
) {
  const values: T[] = []
  let next: string | null = new URL(initialPath, baseUrl).toString()
  let pageCount = 0
  while (next && pageCount < 100) {
    const url = new URL(next)
    if (url.origin !== baseUrl) throw new Error("canvas_pagination_origin")
    let response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 429) {
      const retryAfter = Math.min(5, Number(response.headers.get("retry-after") || 1))
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      })
    }
    if (!response.ok) throw new Error(`canvas_api_${response.status}`)
    const page = await response.json()
    if (!Array.isArray(page)) throw new Error("canvas_api_shape")
    values.push(...page as T[])
    next = nextLink(response.headers.get("link"))
    pageCount += 1
  }
  if (next) throw new Error("canvas_pagination_limit")
  return values
}

export async function setNeedsReauthorization(
  admin: SupabaseClient,
  user: Pick<User, "id">,
) {
  await admin.from("canvas_connections")
    .update({ status: "needs_reauthorization", updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
}
