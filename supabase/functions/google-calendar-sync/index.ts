import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import { accessToken, authenticate, corsHeaders, googleJson, respond } from "../_shared/googleCalendar.ts"
import { chunkSyncWindow, resolveSyncWindow } from "../_shared/googleCalendarSyncWindow.mjs"

type Calendar = { id: string; summary?: string; primary?: boolean; timeZone?: string }
type SelectedCalendar = { id: string; google_calendar_id: string }
type FreeBusyResponse = { calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: { reason?: string }[] }> }

const errorCategory = (error: unknown) => {
  const value = error instanceof Error ? error.message : "sync_failed"
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 120) || "sync_failed"
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)

  let phase = "authenticate"
  try {
    const { admin, user } = await authenticate(req)
    const body = await req.json().catch(() => ({})) as { selected_calendar_ids?: unknown; time_min?: string; time_max?: string }

    phase = "load_connection"
    const { data: connection, error: connectionError } = await admin.from("google_calendar_connections")
      .select("id,user_id,status").eq("user_id", user.id).maybeSingle()
    if (connectionError) throw new Error("connection_read_failed")
    if (!connection || connection.status !== "connected") return respond({ error: "not_connected" }, 409)

    phase = "decrypt_or_refresh_token"
    const token = await accessToken(admin, connection)

    phase = "list_calendars"
    const list = await googleJson<{ items?: Calendar[] }>(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=freeBusyReader",
      token,
    )
    const selectedIds = Array.isArray(body.selected_calendar_ids)
      ? [...new Set(body.selected_calendar_ids.filter((value): value is string => typeof value === "string" && value.length > 0))]
      : null
    const discoveredIds = new Set((list.items || []).map(calendar => calendar.id))
    if (selectedIds?.some(id => !discoveredIds.has(id))) return respond({ error: "invalid_calendar_selection" }, 400)

    phase = "save_calendar_selection"
    const calendarRows = (list.items || []).map(calendar => ({
      connection_id: connection.id,
      user_id: user.id,
      google_calendar_id: calendar.id,
      display_name: calendar.summary || (calendar.primary ? "Primary calendar" : "Calendar"),
      time_zone: calendar.timeZone || null,
      selected: selectedIds ? selectedIds.includes(calendar.id) : calendar.primary === true,
      updated_at: new Date().toISOString(),
    }))
    if (calendarRows.length) {
      const { error } = await admin.from("google_calendars").upsert(calendarRows, { onConflict: "connection_id,google_calendar_id" })
      if (error) throw new Error("calendar_selection_write_failed")
    }

    if (selectedIds === null) {
      const { data: calendars, error } = await admin.from("google_calendars")
        .select("id,google_calendar_id,display_name,time_zone,selected").eq("connection_id", connection.id).order("display_name")
      if (error) throw new Error("calendar_selection_read_failed")
      return respond({ mode: "choose", calendars })
    }

    const syncWindow = resolveSyncWindow(body)
    if (!syncWindow) return respond({ error: "invalid_sync_window" }, 400)
    const { timeMin, timeMax } = syncWindow

    phase = "load_selected_calendars"
    const { data: selected, error: selectedError } = await admin.from("google_calendars")
      .select("id,google_calendar_id").eq("connection_id", connection.id).eq("selected", true)
    if (selectedError) throw new Error("selected_calendars_read_failed")
    const selectedCalendars = (selected || []) as SelectedCalendar[]

    phase = "google_freebusy"
    const busyResponses: FreeBusyResponse[] = []
    for (const window of chunkSyncWindow(timeMin, timeMax)) {
      busyResponses.push(await googleJson<FreeBusyResponse>("https://www.googleapis.com/calendar/v3/freeBusy", token, {
        method: "POST",
        body: JSON.stringify({
          timeMin: window.timeMin.toISOString(),
          timeMax: window.timeMax.toISOString(),
          items: selectedCalendars.map(row => ({ id: row.google_calendar_id })),
        }),
      }))
    }
    const providerReasons = selectedCalendars.flatMap(calendar =>
      busyResponses.flatMap(busy => (busy.calendars?.[calendar.google_calendar_id]?.errors || []).map(error => error.reason))
        .filter((reason): reason is string => typeof reason === "string")
    )
    if (providerReasons.length) {
      console.error("Google Calendar FreeBusy returned calendar errors", {
        errorCount: providerReasons.length,
        reasons: [...new Set(providerReasons)].slice(0, 10),
      })
      throw new Error("google_freebusy_calendar_error")
    }

    phase = "normalize_busy_periods"
    const rows = selectedCalendars.flatMap(calendar =>
      busyResponses.flatMap(busy => (busy.calendars?.[calendar.google_calendar_id]?.busy || []).map(period => {
        const start = new Date(period.start)
        const end = new Date(period.end)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new Error("google_freebusy_invalid_interval")
        return { connection_id: connection.id, calendar_id: calendar.id, user_id: user.id, starts_at: start.toISOString(), ends_at: end.toISOString() }
      }))
    )

    phase = "replace_busy_periods"
    const { error: deleteError } = await admin.from("calendar_busy_periods").delete().eq("connection_id", connection.id)
      .lt("starts_at", timeMax.toISOString()).gt("ends_at", timeMin.toISOString())
    if (deleteError) throw new Error("busy_period_delete_failed")
    if (rows.length) {
      const { error } = await admin.from("calendar_busy_periods").upsert(rows, { onConflict: "connection_id,calendar_id,starts_at,ends_at" })
      if (error) throw new Error("busy_period_upsert_failed")
    }

    phase = "mark_sync_complete"
    const syncedAt = new Date().toISOString()
    const { error: updateError } = await admin.from("google_calendar_connections")
      .update({ last_synced_at: syncedAt, last_sync_error: null, updated_at: syncedAt }).eq("id", connection.id)
    if (updateError) throw new Error("connection_sync_status_update_failed")

    return respond({ mode: "synced", synced_at: syncedAt, busy_periods: rows.length })
  } catch (error) {
    const code = errorCategory(error)
    console.error("Google Calendar sync failed", { phase, category: code })
    try {
      const { admin, user } = await authenticate(req)
      await admin.from("google_calendar_connections").update({
        status: code === "reauthorization_required" ? "needs_reauthorization" : "connected",
        last_sync_error: code === "reauthorization_required"
          ? "Google authorization was revoked or expired."
          : `Sync failed (${phase}: ${code}).`,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id)
    } catch { /* The original response takes precedence. Never log credentials or request headers. */ }
    return respond(
      { error: code === "reauthorization_required" ? code : "sync_failed" },
      code === "authentication_required" || code === "invalid_session" || code === "reauthorization_required" ? 401 : 500,
    )
  }
})
