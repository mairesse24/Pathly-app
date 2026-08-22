import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const academicDetailsFields = readFileSync(new URL("../src/components/profile/AcademicDetailsFields.tsx", import.meta.url), "utf8")
const profilePage = readFileSync(new URL("../src/pages/Profile/index.tsx", import.meta.url), "utf8")
const graduationYearField = readFileSync(new URL("../src/components/profile/GraduationYearField.tsx", import.meta.url), "utf8")
const profilesService = readFileSync(new URL("../src/services/profiles.ts", import.meta.url), "utf8")

// The reported bug (typing a year snaps the control to 1900) came from a
// bare <input type="number" min="1900" ...> for graduation_year. Neither
// editor -- Settings/Onboarding's shared AcademicDetailsFields, or the
// separate Profile page editor -- may reintroduce that pattern.
assert.doesNotMatch(academicDetailsFields, /graduation_year[\s\S]{0,40}min="1900"/, "AcademicDetailsFields must not use a raw min=1900 number input for graduation_year")
assert.doesNotMatch(profilePage, /graduation_year[\s\S]{0,80}min="1900"/, "the Profile page editor must not use a raw min=1900 number input for graduation_year")
assert.doesNotMatch(graduationYearField, /min="1900"/, "the shared GraduationYearField must never reintroduce a min=1900 number input")

// Both editors must use the one shared, keyboard-navigable year control --
// not a second bespoke implementation that could drift or reintroduce the
// bug independently.
assert.match(academicDetailsFields, /<GraduationYearField/, "AcademicDetailsFields (Onboarding + Settings) must use the shared GraduationYearField")
assert.match(profilePage, /<GraduationYearField/, "the Profile page editor must use the shared GraduationYearField")

// The year control itself must be a real <select> (native keyboard
// navigation: arrow keys and type-ahead, no empty-value spinner to jump
// from) built from the bounded, current-year-relative option list.
assert.match(graduationYearField, /<select/, "GraduationYearField must render a native select, not a number input")
assert.match(graduationYearField, /graduationYearOptions\(new Date\(\)\.getFullYear\(\), value\)/, "the option list must be derived from the current year and the existing saved value")

// Backward compatibility: no schema change was made or is needed here --
// the database already stores graduation_year (integer) and
// expected_graduation_term (text) separately, never an exact date. Confirm
// the read/write column list wasn't touched, so every existing consumer
// (Settings display, Degree Planner, Companion) keeps loading legacy
// values exactly as before.
assert.match(profilesService, /graduation_year,catalog_year,expected_graduation_term/, "the profile column list must still read/write graduation_year and expected_graduation_term as plain fields, not a date")

console.log("graduation year input: no min=1900 regression, both editors share one keyboard-accessible select, storage format unchanged")
