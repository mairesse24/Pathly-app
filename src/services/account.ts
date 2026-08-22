import { supabase } from "../lib/supabase"

export async function deleteAccount() {
  const { data, error } = await supabase.functions.invoke("delete-account", { method: "POST" })
  if (error || data?.error) throw new Error("Pathly couldn't delete your account right now. Try again.")
}
