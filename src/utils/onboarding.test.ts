import assert from "node:assert/strict"
import test from "node:test"
import { hasRequiredAcademicDetails, needsOnboarding } from "./onboarding.ts"

test("a new profile must complete onboarding", () => {
  assert.equal(needsOnboarding({ onboarding_completed: false }), true)
})

test("an existing completed profile is not sent through onboarding again", () => {
  assert.equal(needsOnboarding({ onboarding_completed: true }), false)
})

test("required academic details cannot be blank", () => {
  assert.equal(
    hasRequiredAcademicDetails({
      university: " ",
      major: "Computer Science",
      catalog_year: 2025,
      expected_graduation_term: "Spring",
      graduation_year: 2027,
    }),
    false,
  )
})

test("catalog year remains supported without blocking users who do not know it", () => {
  assert.equal(
    hasRequiredAcademicDetails({
      university: "University of North Texas",
      major: "Computer Science",
      catalog_year: null,
      expected_graduation_term: "Spring",
      graduation_year: 2027,
    }),
    true,
  )
})
