import { supabase } from "../lib/supabase"

export type GoogleCalendarConnection = {
  id: string
  google_account_email: string | null
  status: "connecting" | "connected" | "needs_reauthorization"
  last_synced_at: string | null
  last_sync_error: string | null
}
export type GoogleCalendarChoice = { id: string; google_calendar_id: string; display_name: string; time_zone: string | null; selected: boolean }
export type BusyPeriod = { id: string; calendar_id: string; starts_at: string; ends_at: string; source: "google_calendar" }

export async function getGoogleCalendarConnection() { const { data, error } = await supabase.from("google_calendar_connections").select("id,google_account_email,status,last_synced_at,last_sync_error").maybeSingle(); if (error) throw error; return data as GoogleCalendarConnection | null }
export async function startGoogleCalendarConnection() { const { data, error } = await supabase.functions.invoke("google-calendar-oauth-start", { body: {} }); if (error || !data?.authorization_url) throw new Error(data?.message || "Google Calendar connection is not configured yet."); return data.authorization_url as string }
export async function loadGoogleCalendars() { const { data, error } = await supabase.functions.invoke("google-calendar-sync", { body: {} }); if (error || data?.error) throw new Error(data?.message || "Unable to load Google calendars."); return data.calendars as GoogleCalendarChoice[] }
export async function syncGoogleCalendar(selectedCalendarIds: string[]) { const { data, error } = await supabase.functions.invoke("google-calendar-sync", { body: { selected_calendar_ids: selectedCalendarIds } }); if (error || data?.error) throw new Error(data?.error === "reauthorization_required" ? "Google authorization expired or was revoked. Reconnect to continue." : "Unable to sync Google Calendar."); return data as { synced_at: string; busy_periods: number } }
export async function disconnectGoogleCalendar() { const { data, error } = await supabase.functions.invoke("google-calendar-disconnect", { body: {} }); if (error || data?.error) throw new Error("Unable to disconnect Google Calendar.") }

/** Privacy-preserving planning boundary: callers receive intervals only, never event metadata. */
export async function listBusyPeriods(startsBefore: string, endsAfter: string) { const { data, error } = await supabase.from("calendar_busy_periods").select("id,calendar_id,starts_at,ends_at,source").lt("starts_at", startsBefore).gt("ends_at", endsAfter).order("starts_at"); if (error) throw error; return data as BusyPeriod[] }
