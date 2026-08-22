import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import type { SupabaseClient } from "@supabase/supabase-js"
import { authenticate, corsHeaders, respond } from "../_shared/canvas.ts"

const BUCKET = "source-uploads"

// storage.objects has no foreign key to auth.users, so deleting the auth user does not
// remove a user's uploaded files from the bucket -- they'd be orphaned indefinitely. This
// walks the user's own storage folder (recursively, since uploads nest under
// {userId}/{syllabus|lecture|academic-progress}/{fileId}) and cross-checks it against the
// uploaded_files table, so cleanup doesn't depend on either source alone staying in sync.
async function collectStorageObjects(admin: SupabaseClient, userId: string) {
  const paths = new Set<string>()

  async function walk(prefix: string) {
    const limit = 100
    let offset = 0
    for (;;) {
      const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit, offset })
      if (error) throw error
      if (!data || data.length === 0) break
      for (const entry of data) {
        const full = `${prefix}/${entry.name}`
        if (entry.id) paths.add(full)
        else await walk(full)
      }
      if (data.length < limit) break
      offset += limit
    }
  }
  await walk(userId)

  const { data: rows, error: rowsError } = await admin
    .from("uploaded_files")
    .select("storage_path")
    .eq("user_id", userId)
  if (rowsError) throw rowsError
  for (const row of rows || []) paths.add((row as { storage_path: string }).storage_path)

  return Array.from(paths)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return respond({ error: "method_not_allowed" }, 405)
  try {
    // The account to delete is always the caller's own -- authenticate() derives it from the
    // verified JWT, and the request body (if any) is never read, so there is no id parameter
    // for a client to substitute another user's id into.
    const { admin, user } = await authenticate(req)

    const storagePaths = await collectStorageObjects(admin, user.id)
    if (storagePaths.length) {
      const { error: removeError } = await admin.storage.from(BUCKET).remove(storagePaths)
      if (removeError) throw removeError
    }

    // Every owner-scoped table's user_id (or profiles.id) carries `references auth.users(id)
    // on delete cascade`, so removing the auth user cascades courses, assignments, exams,
    // study sessions, reflections, uploaded_files rows, organized notes/flashcards,
    // degree-planning data, course roadmap entries, Canvas connections/credentials, and the
    // profile itself in one statement. Storage objects are handled separately above because
    // that cascade doesn't reach the storage backend.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return respond({ deleted: true })
  } catch (error) {
    const code = error instanceof Error ? error.message : "delete_account_failed"
    if (code === "authentication_required" || code === "invalid_session") return respond({ error: code }, 401)
    console.error("Account deletion failed", error)
    return respond({ error: "delete_account_failed" }, 500)
  }
})
