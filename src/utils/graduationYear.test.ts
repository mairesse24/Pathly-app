import assert from "node:assert/strict"
import test from "node:test"

import { graduationYearOptions } from "./graduationYear.ts"

test("a new user picking Fall 2027 finds 2027 in range from the current year", () => {
  const years = graduationYearOptions(2026)
  assert.ok(years.includes(2027), "2027 must be a selectable option when the current year is 2026")
})

test("the default range runs current year through +10 years, eleven options total", () => {
  const years = graduationYearOptions(2026)
  assert.deepEqual(years, [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036])
})

test("editing an existing value already inside the default range doesn't duplicate it", () => {
  const years = graduationYearOptions(2026, 2028)
  assert.deepEqual(years, [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036])
})

test("a legacy saved value outside the default window is appended, not dropped", () => {
  // e.g. an account that set this in a much earlier year, or a value now in
  // the past relative to "today" -- it must still render as a real,
  // selected option rather than silently vanishing from the dropdown.
  const years = graduationYearOptions(2026, 2019)
  assert.ok(years.includes(2019), "the legacy value must still be a selectable/shown option")
  assert.deepEqual(years, [2019, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036])
})

test("a null or undefined existing value never adds anything beyond the default range", () => {
  assert.deepEqual(graduationYearOptions(2026, null), graduationYearOptions(2026))
  assert.deepEqual(graduationYearOptions(2026, undefined), graduationYearOptions(2026))
})

test("1900 never appears in the options for any realistic current year", () => {
  assert.ok(!graduationYearOptions(2026).includes(1900))
  assert.ok(!graduationYearOptions(2026, null).includes(1900))
})
