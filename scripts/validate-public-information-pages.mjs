import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const app = read("src/App.tsx")
const footer = read("src/components/layout/PublicFooter.tsx")
const legal = read("src/pages/Legal/index.tsx")
const landing = read("src/pages/Landing/index.tsx")
const settings = read("src/pages/Settings/index.tsx")
const storage = read("supabase/migrations/20260812040000_create_file_storage.sql")
const google = read("supabase/migrations/20260820150000_google_calendar_integration.sql")

for (const route of ["/privacy", "/terms", "/about"]) {
  const publicRoute = new RegExp(`<Route path="${route}" element=\\{<[^>]+ />\\} />`)
  assert.match(app, publicRoute, `${route} must be a direct public route outside ProtectedRoute`)
  assert.ok(app.indexOf(`path="${route}"`) < app.indexOf("<Route element={<ProtectedRoute />}>") , `${route} must not require authentication`)
}
for (const label of ["Privacy", "Terms", "About Pathly", "GitHub", "© 2026 Pathly", "Built by Mairesse N."]) assert.match(footer, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
assert.match(landing, /<PublicFooter \/>/, "Landing must show the public footer")
assert.match(app, /<AuthPage \/><PublicFooter \/>/, "Auth must show the public footer")
assert.match(settings, /to="\/privacy"[\s\S]{0,100}to="\/terms"/, "authenticated Settings must expose legal links")

assert.match(storage, /'source-uploads', 'source-uploads', false/, "private-upload claim must remain true")
assert.match(storage, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)\)::text/, "owner-scoped storage claim must remain true")
assert.match(google, /starts_at timestamptz[\s\S]{0,100}ends_at timestamptz/, "Google busy-time claim must match storage")
assert.doesNotMatch(google, /event_title|description|attendees|meeting_link/, "Google integration must not store event metadata")
assert.doesNotMatch(legal, /(?:FERPA|HIPAA)[ -]compliant|is certified/i, "unsupported compliance and certification claims must not appear")
assert.match(legal, /do not guarantee absolute security/i, "the policy must avoid an absolute security promise")
assert.match(legal, /explicit approval first/, "review-before-write must be disclosed")
assert.match(legal, /not affiliated with or endorsed by/, "third-party non-endorsement must be explicit")

console.log("public information pages: routing, footer access, factual privacy boundaries, and non-endorsement verified")
