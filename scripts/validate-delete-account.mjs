import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const src = readFileSync(new URL("../supabase/functions/delete-account/index.ts", import.meta.url), "utf8")

// Unauthenticated deletion rejected: the function must authenticate every request through the
// shared authenticate() helper (verifies the bearer JWT against Supabase Auth) and map its
// authentication_required / invalid_session errors to 401, before any deletion happens.
assert.match(src, /await authenticate\(req\)/, "must authenticate the request via the shared authenticate() helper")
assert.match(
  src,
  /code === "authentication_required" \|\| code === "invalid_session"\)\s*return respond\(\{ error: code \}, 401\)/,
  "authentication failures must be rejected with 401 before any deletion runs",
)

// A user can never delete another user: the account is derived solely from the authenticated
// user object returned by authenticate(), never from a client-supplied id. The request body is
// never parsed at all, so there is no id parameter for a caller to substitute.
assert.doesNotMatch(src, /req\.json\(\)/, "must never read a request body -- there must be no id parameter a caller could substitute")
assert.doesNotMatch(src, /user_id\s*:\s*(body|params|query)/i, "must never source a user id from client input")
const deleteUserCalls = [...src.matchAll(/auth\.admin\.deleteUser\(([^)]+)\)/g)].map((match) => match[1].trim())
assert.ok(deleteUserCalls.length > 0, "must call auth.admin.deleteUser to actually remove the auth user")
for (const argument of deleteUserCalls)
  assert.equal(argument, "user.id", "deleteUser must only ever be called with the authenticated caller's own id")

// Storage cleanup: user-owned storage objects (which have no FK to auth.users and so are not
// removed by the Postgres cascade) must be listed and removed before the auth user is deleted.
assert.match(src, /admin\.storage\.from\(BUCKET\)\.list\(/, "must enumerate the user's storage objects")
assert.match(src, /admin\.storage\.from\(BUCKET\)\.remove\(storagePaths\)/, "must remove the user's storage objects")
const removeIndex = src.indexOf("admin.storage.from(BUCKET).remove(storagePaths)")
const deleteUserIndex = src.indexOf("admin.auth.admin.deleteUser(user.id)")
assert.ok(removeIndex > -1 && deleteUserIndex > -1 && removeIndex < deleteUserIndex, "storage objects must be removed before the auth user is deleted")

// Storage discovery must be scoped to this user's own folder, not a global listing.
assert.match(src, /walk\(userId\)/, "storage listing must start from the caller's own folder")
assert.match(src, /\.eq\("user_id", userId\)/, "the uploaded_files cross-check must be scoped to this user's own rows")

console.log("delete-account: rejects unauthenticated calls, only ever acts on the caller's own id, and clears storage before the auth user")
