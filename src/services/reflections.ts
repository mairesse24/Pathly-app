import { supabase } from "../lib/supabase"
import type { ReflectionRecord } from "../types/academic"
export async function getReflection(date: string) {
  const { data, error } = await supabase
    .from("daily_reflections")
    .select("*")
    .eq("reflection_date", date)
    .maybeSingle()
  if (error) throw error
  return data as ReflectionRecord | null
}
export async function saveReflection(value: Omit<ReflectionRecord, "id">) {
  const { data, error } = await supabase
    .from("daily_reflections")
    .upsert(value, { onConflict: "user_id,reflection_date" })
    .select()
    .single()
  if (error) throw error
  return data as ReflectionRecord
}
