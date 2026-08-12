import { supabase } from "../lib/supabase"
import type { AssignmentRecord } from "../types/academic"
export async function listAssignments() {
  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .order("due_at", { ascending: true })
  if (error) throw error
  return data as AssignmentRecord[]
}
export async function createAssignment(value: Omit<AssignmentRecord, "id">) {
  const { data, error } = await supabase
    .from("assignments")
    .insert(value)
    .select()
    .single()
  if (error) throw error
  return data as AssignmentRecord
}
export async function updateAssignment(
  id: string,
  value: Partial<Pick<AssignmentRecord, "title" | "description" | "due_at" | "estimated_minutes" | "status">>,
) {
  const { data, error } = await supabase
    .from("assignments")
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return data as AssignmentRecord
}
