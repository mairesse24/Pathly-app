import assert from "node:assert/strict"
import test from "node:test"

import { summarizeAuditRequirementGroups } from "../../supabase/functions/_shared/companionDegreeSummary.ts"

// Regression coverage for the Companion 500 traced to a confirmed Degree Audit: the raw
// nested user_degree_requirement_groups/user_degree_requirements structure repeats
// requirement_type/requirement_text/application_source once per applied course, which blows
// past the prompt's per-item character budget with noise rather than signal on a large audit.
// summarizeAuditRequirementGroups() is what replaces that raw dump wherever the audit feeds
// the Anthropic prompt (see pathly-companion/index.ts).

test("collapses a requirement group to the figures Companion needs, dropping raw requirement rows", () => {
  const summary = summarizeAuditRequirementGroups([
    {
      requirement_label: "Core Computer Science",
      status: "in_progress",
      credits_required: 30,
      credits_completed: 18,
      credits_remaining: 12,
      details: "Requires CSCE 3600 and CSCE 4600 or equivalent transfer credit.",
      user_degree_requirements: [
        {
          requirement_type: "core",
          course_code: "CSCE 3600",
          requirement_text: "Systems Programming",
          status: "completed",
          credits_applied: 3,
          application_source: "degree_audit",
        },
      ],
    },
  ])

  assert.deepEqual(summary, [
    {
      requirement_label: "Core Computer Science",
      status: "in_progress",
      credits_required: 30,
      credits_completed: 18,
      credits_remaining: 12,
      applied_course_codes: ["CSCE 3600"],
      details: "Requires CSCE 3600 and CSCE 4600 or equivalent transfer credit.",
    },
  ])
  // The raw requirement_type/requirement_text/application_source fields must not leak
  // through -- only the applied course code survives.
  assert.equal("user_degree_requirements" in summary[0], false)
  assert.equal("requirement_type" in summary[0], false)
})

test("deduplicates and caps applied course codes at 15", () => {
  const applications = Array.from({ length: 20 }, (_, index) => ({
    course_code: `CSCE ${3000 + index}`,
    application_source: "degree_audit",
    credits_applied: 3,
  }))
  applications.push({ course_code: "CSCE 3000", application_source: "degree_audit", credits_applied: 3 })

  const [summary] = summarizeAuditRequirementGroups([
    { requirement_label: "Electives", user_degree_requirements: applications },
  ])

  assert.equal(summary.applied_course_codes.length, 15)
  assert.equal(summary.applied_course_codes.filter((code) => code === "CSCE 3000").length, 1)
})

test("excludes applications not sourced from the degree audit", () => {
  const [summary] = summarizeAuditRequirementGroups([
    {
      requirement_label: "Core Computer Science",
      user_degree_requirements: [
        { course_code: "CSCE 3600", application_source: "degree_audit", credits_applied: 3 },
        { course_code: "CSCE 4600", application_source: "catalog_match", credits_applied: 3 },
      ],
    },
  ])

  assert.deepEqual(summary.applied_course_codes, ["CSCE 3600"])
})

test("truncates a long details string to 160 characters", () => {
  const details = "x".repeat(500)
  const [summary] = summarizeAuditRequirementGroups([{ requirement_label: "Core", details }])

  assert.equal(summary.details?.length, 160)
})

test("caps the number of groups at 40 and tolerates missing/malformed input", () => {
  const groups = Array.from({ length: 50 }, (_, index) => ({ requirement_label: `Group ${index}` }))
  assert.equal(summarizeAuditRequirementGroups(groups).length, 40)
  assert.deepEqual(summarizeAuditRequirementGroups(null), [])
  assert.deepEqual(summarizeAuditRequirementGroups(undefined), [])
  assert.deepEqual(summarizeAuditRequirementGroups("not an array"), [])
})
