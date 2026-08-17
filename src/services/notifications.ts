import { supabase } from "../lib/supabase"

export async function listReadNotificationKeys() {
  const { data, error } = await supabase.from("notification_read_states").select("notification_key")
  if (error) throw error
  return new Set((data || []).map(item => item.notification_key as string))
}
export async function markNotificationRead(key: string) {
  const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("Your session is no longer valid.")
  const { error } = await supabase.from("notification_read_states").upsert({ user_id: user.id, notification_key: key, read_at: new Date().toISOString() }, { onConflict: "user_id,notification_key" })
  if (error) throw error
}
export async function markNotificationsRead(keys: string[]) { await Promise.all(keys.map(markNotificationRead)) }
