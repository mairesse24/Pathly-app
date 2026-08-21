import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  combineDegreeAuditStages,
  DEGREE_AUDIT_MAX_CODES_PER_REQUIREMENT,
  DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH,
  DEGREE_AUDIT_MAX_COURSE_TITLE_LENGTH,
  DEGREE_AUDIT_MAX_COURSES,
  DEGREE_AUDIT_MAX_INSTITUTION_LENGTH,
  DEGREE_AUDIT_MAX_NOTE_LENGTH,
  DEGREE_AUDIT_MAX_REQUIREMENT_LABEL_LENGTH,
  DEGREE_AUDIT_MAX_REQUIREMENTS,
  DEGREE_AUDIT_STAGE_MAX_TOKENS,
  degreeAuditOverviewSchema,
  degreeAuditRequirementsSchema,
} from "../supabase/functions/_shared/degreeAuditCompact.mjs"

assert.equal(DEGREE_AUDIT_STAGE_MAX_TOKENS, 14000)
assert.equal(DEGREE_AUDIT_MAX_COURSES, 180)
assert.equal(DEGREE_AUDIT_MAX_REQUIREMENTS, 60)
assert.equal(DEGREE_AUDIT_MAX_NOTE_LENGTH, 240)

// Anthropic's structured-output json_schema rejects maxItems/maxLength (and similarly
// unsupported keywords) outright -- the first authenticated version-20 retry failed before
// model generation for exactly this reason. Neither schema may reintroduce them.
assert.doesNotMatch(JSON.stringify(degreeAuditOverviewSchema), /maxItems|maxLength|minItems|minLength/)
assert.doesNotMatch(JSON.stringify(degreeAuditRequirementsSchema), /maxItems|maxLength|minItems|minLength/)
assert.ok(!("applied_courses" in degreeAuditRequirementsSchema.properties.requirements.items.properties))
assert.ok(!("choice_requirement_text" in degreeAuditRequirementsSchema.properties.requirements.items.properties))

// A large audit deliberately exceeding every count and length limit the schema used to
// enforce -- this is the actual regression check that server-side caps still apply now that
// the schema can no longer enforce them itself. Every limit here is chosen to exceed its
// constant by a comfortable margin.
const longCourseCode = "CS" + "9".repeat(DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH + 20)
const longCourseTitle = "Extremely Long Course Title ".repeat(10)
const longRequirementLabel = "Extremely Long Requirement Label ".repeat(10)
const longNote = "This note rambles on with far more advisor commentary than any UI should ever render. ".repeat(10)
const longInstitution = "An Extremely Long University Name That Keeps Going ".repeat(5)

const courses = Array.from({ length: DEGREE_AUDIT_MAX_COURSES + 120 }, (_, index) => ({
  course_code: index === 0 ? longCourseCode : `CS ${1000 + index}`,
  course_title: index === 0 ? longCourseTitle : `Course ${index}`,
  credit_hours: 3,
  status: "completed",
  term: "Fall",
  year: 2025,
  requirement_label: index === 0 ? longRequirementLabel : `Area ${index % 20}`,
}))
const requirementStage = {
  document_type: "personal_audit",
  requirements: Array.from({ length: DEGREE_AUDIT_MAX_REQUIREMENTS + 30 }, (_, index) => ({
    requirement_label: index === 0 ? longRequirementLabel : `Area ${index}`,
    status: index < 20 ? "satisfied" : "incomplete",
    credits_required: 9,
    credits_completed: index < 20 ? 9 : 0,
    credits_remaining: index < 20 ? 0 : 9,
    required_course_codes: Array.from({ length: DEGREE_AUDIT_MAX_CODES_PER_REQUIREMENT + 20 }, (__, code) => index === 0 && code === 0 ? longCourseCode : `CS ${1000 + index * 50 + code}`),
    notes: longNote,
  })),
}
const combined = combineDegreeAuditStages(
  { document_type: "personal_audit", university: longInstitution, major: longInstitution, catalog_year: 2025, total_credits_required: 120, total_credits_completed: 90, courses },
  requirementStage,
)

// Count caps: the combiner truncates the array, it never rejects the whole audit.
assert.equal(combined.courses.length, DEGREE_AUDIT_MAX_COURSES, "courses must be capped even when the model returns more than the budgeted count")
assert.equal(combined.requirements.length, DEGREE_AUDIT_MAX_REQUIREMENTS, "requirements must be capped even when the model returns more than the budgeted count")
assert.ok(combined.requirements.every((item) => item.required_course_codes.length <= DEGREE_AUDIT_MAX_CODES_PER_REQUIREMENT), "required_course_codes must be capped per requirement")

// Length caps: previously enforced by the schema's maxLength, now only by this combiner.
assert.ok(combined.courses.every((course) => course.course_code.length <= DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH), "course_code must be clamped now that the schema can't enforce maxLength")
assert.ok(combined.courses.every((course) => course.course_title.length <= DEGREE_AUDIT_MAX_COURSE_TITLE_LENGTH), "course_title must be clamped now that the schema can't enforce maxLength")
assert.ok(combined.courses.every((course) => course.requirement_label === null || course.requirement_label.length <= DEGREE_AUDIT_MAX_REQUIREMENT_LABEL_LENGTH), "a course's requirement_label must be clamped to the same limit as the requirement group's own label")
assert.ok(combined.requirements.every((item) => item.requirement_label.length <= DEGREE_AUDIT_MAX_REQUIREMENT_LABEL_LENGTH), "requirement_label must be clamped now that the schema can't enforce maxLength")
assert.ok(combined.requirements.every((item) => item.required_course_codes.every((code) => code.length <= DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH)), "required_course_codes entries must be clamped now that the schema can't enforce maxLength")
assert.ok(combined.requirements.every((item) => item.details.length <= DEGREE_AUDIT_MAX_NOTE_LENGTH), "notes/details must be clamped now that the schema can't enforce maxLength")
assert.ok(combined.university.length <= DEGREE_AUDIT_MAX_INSTITUTION_LENGTH, "university must be clamped now that the schema can't enforce maxLength")
assert.ok(combined.major.length <= DEGREE_AUDIT_MAX_INSTITUTION_LENGTH, "major must be clamped now that the schema can't enforce maxLength")

// The applied_courses matcher joins on requirement_label string equality -- if a course's
// clamped label and its requirement group's clamped label used different limits, an
// over-length label would silently stop matching. They must use the same limit.
const clampedFirstLabel = longRequirementLabel.trim().slice(0, DEGREE_AUDIT_MAX_REQUIREMENT_LABEL_LENGTH)
const firstRequirement = combined.requirements.find((item) => item.requirement_label === clampedFirstLabel)
assert.ok(firstRequirement, "a requirement whose label was clamped must still be findable by its clamped label")
assert.ok(firstRequirement.applied_courses.some((course) => course.course_code === longCourseCode.trim().slice(0, DEGREE_AUDIT_MAX_COURSE_CODE_LENGTH)), "a course with a clamped requirement_label must still be matched to its (identically clamped) requirement group")

// Token-budget check: a large, realistic (not maximum-length) audit's own per-stage output
// must fit in that stage's own 14000-token budget. This is deliberately measured per stage,
// not on the post-combine result -- combineDegreeAuditStages adds applied_courses by
// cross-referencing the overview stage's own course data onto each requirement, so the merged
// artifact is legitimately larger than anything either Claude call alone ever has to generate;
// comparing the merged size against a per-stage budget would conflate "can Claude produce this
// in one call" with "how big is the derived review payload."
// Field values are realistic-but-generous (a real course title is ~30-60 characters, a real
// course code ~7-12) rather than saturated to their hard DEGREE_AUDIT_MAX_*_LENGTH caps: those
// per-field caps are a defensive ceiling against one pathological value (tested separately
// above via combineDegreeAuditStages, which clamps regardless of stage size), not a promise
// that every one of DEGREE_AUDIT_MAX_COURSES courses simultaneously reaches its own length
// ceiling too -- real audits vary, and the prompt (process-academic-file/index.ts) explicitly
// asks Claude to keep titles and labels concise. Unlike the pre-fix budget, this benchmark is
// pushed all the way to DEGREE_AUDIT_MAX_COURSES/DEGREE_AUDIT_MAX_REQUIREMENTS themselves
// (see degreeAuditCompact.mjs for the exact token math the 14000 figure was chosen from) --
// that hard cap is what combineDegreeAuditStages will ever retain regardless of how many items
// Claude returns, so this is the real worst case at realistic field lengths, not an
// arbitrarily-smaller "large" sample. A document that also saturates every field to its
// individual DEGREE_AUDIT_MAX_*_LENGTH ceiling at the same time remains an accepted
// pathological edge case that still fails with the existing ai_output_truncated diagnostic.
const tokenEstimate = (value) => Math.ceil(JSON.stringify(value).length / 3)
// Deliberately pushed all the way to each hard cap (not just "a large audit" below it): the
// 14000-token budget was sized specifically to cover DEGREE_AUDIT_MAX_COURSES courses and
// DEGREE_AUDIT_MAX_REQUIREMENTS requirements at realistic (non-maximal-length) field values --
// see the reasoning in degreeAuditCompact.mjs. This is the regression check for that math.
const largeRealisticCourseCount = DEGREE_AUDIT_MAX_COURSES
const largeRealisticRequirementCount = DEGREE_AUDIT_MAX_REQUIREMENTS
const largeRealisticCodesPerRequirement = 10
assert.ok(largeRealisticCodesPerRequirement < DEGREE_AUDIT_MAX_CODES_PER_REQUIREMENT)
const largeRealisticOverview = {
  document_type: "personal_audit",
  university: "State University of Technology and Applied Sciences",
  major: "Bachelor of Science in Computer Science",
  catalog_year: 2025,
  total_credits_required: 120,
  total_credits_completed: 90,
  courses: Array.from({ length: largeRealisticCourseCount }, (_, index) => ({
    course_code: `CSCE ${1000 + index}`,
    course_title: `Foundations of Applied Computing Topics ${index}`,
    credit_hours: 3,
    status: "completed",
    term: "Fall",
    year: 2025,
    requirement_label: `Computer Science Core Requirement Area ${index % 20}`,
  })),
}
const largeRealisticRequirementStage = {
  document_type: "personal_audit",
  requirements: Array.from({ length: largeRealisticRequirementCount }, (_, index) => ({
    requirement_label: `Computer Science Core Requirement Area ${index}`,
    status: "incomplete",
    credits_required: 9,
    credits_completed: 0,
    credits_remaining: 9,
    required_course_codes: Array.from({ length: largeRealisticCodesPerRequirement }, (__, code) => `CSCE ${1000 + index * 50 + code}`),
    notes: "Choose approved courses from the department list; see the audit for advisor-specific exceptions and substitutions.",
  })),
}
const overviewEstimate = tokenEstimate(largeRealisticOverview)
const requirementsEstimate = tokenEstimate(largeRealisticRequirementStage)
assert.ok(overviewEstimate < DEGREE_AUDIT_STAGE_MAX_TOKENS, `large realistic overview stage estimate ${overviewEstimate} exceeds its ${DEGREE_AUDIT_STAGE_MAX_TOKENS}-token budget`)
assert.ok(requirementsEstimate < DEGREE_AUDIT_STAGE_MAX_TOKENS, `large realistic requirements stage estimate ${requirementsEstimate} exceeds its ${DEGREE_AUDIT_STAGE_MAX_TOKENS}-token budget`)

const edge = await readFile(new URL("../supabase/functions/process-academic-file/index.ts", import.meta.url), "utf8")
assert.match(edge, /Promise\.all\(\[/, "degree-audit stages should run concurrently")
assert.ok(edge.indexOf("anthropicResponseShape(claude)") < edge.indexOf('claude.stop_reason === "max_tokens"'), "safe response metadata must be logged before max-token failure")
// The only per-call logging must be the shape-metadata helper -- document contents (claude.content,
// or the raw claude/claudeResponse payload) must never reach console.info/console.error.
assert.doesNotMatch(edge, /console\.(info|error)\([^)]*claude\.content/, "raw response content must never be logged")
assert.doesNotMatch(edge, /console\.(info|error)\(JSON\.stringify\(claude\)/, "the raw Anthropic response must never be logged wholesale")
assert.match(edge, /normalizeDegreeAuditResult\(structured\)/)
// Nothing about degree-audit processing may create degree-plan rows or an unreviewed
// completed_courses entry -- the insert below is always status: "ready_for_review", and
// there is no write to any user_degree_* table anywhere in this function.
assert.doesNotMatch(edge, /user_degree_(courses|plans|requirement_groups)/, "processing must never create degree-plan rows before review")
assert.match(edge, /status:\s*"ready_for_review"/, "a processed degree audit must land in ready_for_review, never auto-approved")
// Degree Audit and Unofficial Transcript stay on separate extraction paths: only
// upload.category === "degree_audit" reaches the two-stage schemas/combiner.
assert.match(edge, /upload\.category === "degree_audit"\)\s*\{/, "the two-stage path must stay gated to degree_audit uploads only")

// The actual root-cause fix: extended/adaptive thinking consumed the entire 8000-token budget
// on a real large audit (thinking block ahead of the text block, stop_reason max_tokens, 0
// result rows). Both degree-audit stages must explicitly disable it.
assert.match(edge, /if \(options\.disableThinking\) body\.thinking = \{ type: "disabled" \}/, "callClaude must support explicitly disabling thinking")
const overviewCall = edge.match(/callClaude\("degree_audit_overview"[\s\S]*?disableThinking: true \}\)/)
const requirementsCall = edge.match(/callClaude\("degree_audit_requirements"[\s\S]*?disableThinking: true \}\)/)
assert.ok(overviewCall, "the degree_audit_overview call must pass disableThinking: true")
assert.ok(requirementsCall, "the degree_audit_requirements call must pass disableThinking: true")
// Scoped fix, not a global one: the single syllabus/lecture/unofficial_transcript callClaude
// call (the `else` branch) must be untouched -- it still calls with exactly 4 positional
// arguments, no options object, so thinking behavior for those categories is unchanged.
assert.match(edge, /callClaude\(upload\.category, instruction, upload\.category === "syllabus" \? syllabusSchema : upload\.category === "lecture" \? lectureSchema : academicRecordSchema, 5000\)/, "syllabus/lecture/unofficial_transcript extraction must not pass a thinking option -- this fix is scoped to Degree Audit only")
// pathly-companion is a separate function entirely and must never be touched by this fix.
const companion = await readFile(new URL("../supabase/functions/pathly-companion/index.ts", import.meta.url), "utf8")
assert.doesNotMatch(companion, /disableThinking|thinking:\s*\{\s*type:\s*"disabled"/, "Companion must not be touched by the Degree Audit thinking fix")

console.log(`Large realistic overview/requirements stage estimates (${overviewEstimate}/${requirementsEstimate} tokens) each fit within the ${DEGREE_AUDIT_STAGE_MAX_TOKENS}-token per-stage budget`)
