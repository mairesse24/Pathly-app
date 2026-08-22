import assert from "node:assert/strict"
import test from "node:test"

import { classifyCompanionIntent } from "../../supabase/functions/_shared/companionIntent.ts"
import { buildCompanionSystemPrompt } from "../../supabase/functions/_shared/companionPrompt.ts"

test("a bare greeting requests no stored-data lookups", () => {
  const intent = classifyCompanionIntent("Hello")
  assert.deepEqual(intent, {
    wantsPlanning: false,
    wantsLecture: false,
    wantsSyllabus: false,
    wantsRoadmap: false,
    wantsNotes: false,
    wantsDegree: false,
  })
})

test("an academic planning question requests the planning lookup", () => {
  const intent = classifyCompanionIntent("What should I work on tonight?")
  assert.equal(intent.wantsPlanning, true)
})

test("a general-knowledge question requests no course-scoped retrieval", () => {
  // Nothing here should force a "no source found" refusal -- a tier-1 answer doesn't
  // depend on any of these lookups firing, but confirming none fire (beyond the harmless
  // "Current courses" fallback in index.ts) documents that this question isn't being
  // treated as if it needed the student's syllabus.
  const intent = classifyCompanionIntent("What is systems programming?")
  assert.equal(intent.wantsSyllabus, false)
  assert.equal(intent.wantsRoadmap, false)
})

test("a course-topics question requests the Course Roadmap lookup even without the word syllabus", () => {
  const intent = classifyCompanionIntent(
    "What topics are we covering in my systems programming course?",
  )
  assert.equal(intent.wantsRoadmap, true)
})

test("a syllabus-attributed question requests the syllabus/roadmap lookup", () => {
  const intent = classifyCompanionIntent("According to my syllabus, how much is Exam I worth?")
  assert.equal(intent.wantsSyllabus, true)
})

test("system prompt tells the model not to enumerate stored context for greetings", () => {
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-20",
    timeZone: "America/Chicago",
    allowedLabels: ["Current courses"],
    context: [
      "Current courses: [{\"course_code\":\"CSCE 3600\",\"instructor\":\"Dr. Lee\",\"meeting_days\":\"MWF\"}]",
    ],
  })

  assert.match(system, /greeting or casual small talk/i)
  assert.match(system, /do not list, count, or otherwise enumerate/i)
  assert.match(system, /kinds of things you can help with/i)
})

test("system prompt tells the model to answer general-knowledge questions directly, without requiring an uploaded source", () => {
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-20",
    timeZone: "America/Chicago",
    allowedLabels: [],
    context: [],
  })

  assert.match(system, /General knowledge/)
  assert.match(
    system,
    /Never refuse, and never tell the student to upload material or say you lack their syllabus, just because a general concept overlaps with a course name/,
  )
  assert.match(
    system,
    /it is never a reason to withhold a tier-1 general-knowledge answer to the same message/,
  )
})

test("system prompt tells the model to use available Course Roadmap and other Pathly context for course-specific questions, and to cite it", () => {
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-20",
    timeZone: "America/Chicago",
    allowedLabels: ["CSCE 3600 — Course Roadmap"],
    context: [
      "CSCE 3600 — Course Roadmap: [{\"topic\":\"Processes and threads\",\"period_label\":\"Week 4\"}]",
    ],
  })

  assert.match(system, /Student- or course-specific/)
  assert.match(system, /cite the exact AVAILABLE SOURCES you drew on/)
  assert.match(system, /Course Roadmap source appears in AVAILABLE SOURCES/)
  assert.match(system, /Course Roadmap: /)
  assert.match(system, /Processes and threads/)
})

test("system prompt tells the model a source-specific question is bounded to what that source actually says", () => {
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-20",
    timeZone: "America/Chicago",
    allowedLabels: ["CSCE 3600 — syllabus.pdf"],
    context: ["CSCE 3600 — syllabus.pdf: {\"grading\":\"Homework 20%, Final 30%\"}"],
  })

  assert.match(system, /Source-specific/)
  assert.match(
    system,
    /Do not substitute general knowledge or a different source to fill the gap/,
  )
  assert.match(
    system,
    /say plainly that Pathly doesn't have that information there/,
  )
})

test("a next-semester planning question tied to a graduation target requests the degree lookup", () => {
  const intent = classifyCompanionIntent("I want to graduate in 2028. What should I take next semester?")
  assert.equal(intent.wantsDegree, true)
})

// Regression: this exact real report phrase says neither "degree" nor "graduat[e]" -- before
// the wantsDegree pattern included "next semester", this question fetched only day-to-day
// planning context (assignments/exams due soon), never the Degree Planner's remaining-
// requirement data, so Companion had nothing to plan next semester from except "please
// upload your catalog/prerequisites/offerings/advisor notes".
test("'Help me plan next semester' requests the degree lookup even without the words degree or graduate", () => {
  const intent = classifyCompanionIntent("Help me plan next semester")
  assert.equal(intent.wantsDegree, true)
})

// Regression coverage for: Companion correctly used a confirmed Degree Audit and identified
// remaining requirements, but then stopped at "Pathly needs more information" instead of
// giving a provisional, requirement-category-level plan. Deliberately uses a non-CSCE,
// generic program (a music degree) so a passing test can't be explained by the prompt
// quietly hardcoding a CS-specific category name -- the instruction must work from whatever
// requirement_label/details text a student's own confirmed Degree Audit actually contains.
test("system prompt gives a provisional requirement-category strategy for a next-semester/graduation-target question instead of stopping at a refusal, generically from the student's own Degree Audit", () => {
  const degreePlanner = {
    supported: true,
    requirement_source: "degree_audit",
    provenance_label: "Based on your degree audit",
    university: "State University",
    major: "Bachelor of Music",
    completed_credits_shown_by_audit: 66,
    total_credits_required_shown_by_audit: 120,
    requirement_progress: [
      {
        requirement_label: "Major Core Requirements",
        status: "in_progress",
        credits_required: 40,
        credits_completed: 28,
        credits_remaining: 12,
        applied_course_codes: ["MUS 2100", "MUS 2200"],
        details: null,
      },
      {
        requirement_label: "Senior Capstone Recital",
        status: "incomplete",
        credits_required: 6,
        credits_completed: 0,
        credits_remaining: 6,
        applied_course_codes: [],
        details: "Requires completion of the core performance sequence before enrollment.",
      },
      {
        requirement_label: "Music Electives",
        status: "incomplete",
        credits_required: 9,
        credits_completed: 3,
        credits_remaining: 6,
        applied_course_codes: ["MUS 3050"],
        details: null,
      },
    ],
  }
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-20",
    timeZone: "America/Chicago",
    allowedLabels: ["Degree Planner"],
    context: [`Degree Planner: ${JSON.stringify(degreePlanner)}`],
  })

  // The instruction to keep going instead of stopping at a bare refusal.
  assert.match(system, /do not stop at explaining that Pathly lacks prerequisite or course-offering data/i)
  assert.match(system, /give a provisional, requirement-category-level strategy/i)
  assert.match(system, /rather than ending the answer as a bare request to upload more information/i)

  // The hedged, non-factual language the task requires.
  assert.match(system, /A good planning priority would be/)
  assert.match(system, /If you're eligible for that/)
  assert.match(system, /Pathly still needs prerequisite\/offering information before recommending an exact course/)

  // The explicit verified/needs-verification split.
  assert.match(system, /Verified from Pathly \(the remaining-requirement categories and progress themselves\)/)
  assert.match(system, /Needs verification \(exact course numbers, prerequisites, semester availability, and eligibility/)

  // Generic sequence/capstone reasoning, never a hardcoded course/program name.
  assert.match(system, /sequence or capstone-style requirement/)
  assert.match(system, /never assume it from a fixed list of course numbers or program names/)
  assert.doesNotMatch(system, /CSCE/)

  // The underlying degree-audit data (this student's own, non-CSCE categories) is still
  // present in context for the model to reason from.
  assert.match(system, /Senior Capstone Recital/)
  assert.match(system, /Major Core Requirements/)
})

// Second real Companion example for the same fix: "Help me plan next semester" against a
// verified_catalog Degree Planner source (the shape pathly-companion/index.ts actually builds
// for a matched program), 19 total credits remaining, and a real two-course capstone sequence
// expressed the way the live system actually expresses it -- not as a distinct top-level
// requirement group, but as a prerequisite on one remaining_courses entry naming another. The
// instruction must recognize that shape generically (it names no course codes itself) and must
// order a still-open required category ahead of an elective-style one, never lead with an
// upload-list, and close by inviting more detail rather than demanding it up front.
test("system prompt gives a credits-remaining-anchored, priority-ordered plan for 'Help me plan next semester' against a real verified-catalog Degree Planner shape", () => {
  const degreePlanner = {
    supported: true,
    requirement_source: "verified_catalog",
    provenance_label: "Verified program requirements",
    program: { university: "University of North Texas", major: "Computer Science", catalog_year: 2025, total_credits_required: 120 },
    catalog_label: "2025–2026",
    completed_credits: 101,
    percent_complete: 84,
    target_graduation_term: null,
    requirement_progress: [
      {
        name: "Computer Science Required Courses",
        description: "Explicitly required CSCE courses in the official 2025-2026 guidebook.",
        completed_credits: 34,
        required_credits: 40,
        remaining_credits: 6,
        remaining_courses: [
          { course_code: "CSCE 4901", course_title: "Capstone I", prerequisite: "Prerequisites: TECM 2700 and CSCE 3444." },
          { course_code: "CSCE 4902", course_title: "Capstone II", prerequisite: "Prerequisite: CSCE 4901." },
        ],
        satisfied_courses: ["CSCE 1010", "CSCE 2100", "CSCE 2110"],
        requires_degree_audit_review: false,
      },
      {
        name: "Science with Lab",
        description: "Two lab-science selections. Eligible options must be confirmed in the student degree audit.",
        completed_credits: 0,
        required_credits: 6,
        remaining_credits: 6,
        remaining_courses: [],
        satisfied_courses: [],
        requires_degree_audit_review: true,
      },
      {
        name: "CSCE Option Courses",
        description: "Choose 6 hours from CSCE Options shown in the student degree audit.",
        completed_credits: 0,
        required_credits: 6,
        remaining_credits: 6,
        remaining_courses: [],
        satisfied_courses: [],
        requires_degree_audit_review: true,
      },
    ],
    degree_audit_supplement: null,
  }
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-21",
    timeZone: "America/Chicago",
    allowedLabels: ["Degree Planner"],
    context: [`Degree Planner: ${JSON.stringify(degreePlanner)}`],
  })

  // Opens from a concrete remaining-credits anchor, not a bare refusal or an upload list.
  assert.match(system, /state total remaining_credits.*when it is known/i)
  assert.match(system, /You have N credits remaining after this semester, so we can already start shaping next semester/)
  assert.match(system, /never open this kind of answer with a list of things to upload/i)

  // Explicit, generic priority ordering: sequence/capstone first, other required categories
  // next, electives last -- described structurally, with no hardcoded course/category name.
  assert.match(system, /Sequential or capstone-style requirements first/)
  assert.match(system, /remaining_courses entry's own prerequisite text naming another remaining_courses entry/)
  assert.match(system, /Other remaining required \(non-elective\) categories next/)
  assert.match(system, /prioritized ahead of filling the semester with electives/)
  assert.match(system, /Remaining advanced\/elective requirements last/)
  assert.match(system, /only make that dual-credit claim when the data actually shows it/)

  // Closes by inviting more detail to build an exact schedule, not by demanding it upfront.
  assert.match(system, /so Pathly can turn these priorities into a specific schedule/)

  // This student's own real data -- including the capstone sequence expressed only via one
  // remaining course's prerequisite text naming the other, exactly as pathly-companion/index.ts
  // actually shapes it -- is present for the model to reason from.
  assert.match(system, /Capstone I/)
  assert.match(system, /Capstone II/)
  assert.match(system, /Prerequisite: CSCE 4901/)
  assert.match(system, /Science with Lab/)
  assert.match(system, /CSCE Option Courses/)
})

// Regression coverage for: Pathly correctly refused to invent prerequisites/offerings, but
// asked for more information too early -- before showing what it already knew or could help
// with. The two prior tests above cover the *content* each stage must produce for both real
// example questions ("Help me plan next semester" and "I want to graduate in 2028. What
// should I take next semester?"); this test covers the *structure* itself, asserting the
// named Know -> Help -> Identify uncertainty -> Ask order is explicit and appears in that
// order in the rendered prompt, and that asking is explicitly forbidden as the first move.
test("system prompt states the Know, Help, Identify uncertainty, Ask order explicitly and forbids asking first", () => {
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-20",
    timeZone: "America/Chicago",
    allowedLabels: [],
    context: [],
  })

  assert.match(system, /follow this order and never invert it: Know, then Help, then Identify uncertainty, then Ask/)
  assert.match(system, /Do not skip straight to Ask -- asking for more information before Know and Help have run/)
  assert.match(system, /^Know: /m)
  assert.match(system, /^Help: /m)
  assert.match(system, /^Identify uncertainty: /m)
  assert.match(system, /^Ask: only now, after Know, Help, and Identify uncertainty have already given the student something useful/m)

  // The four stage labels must appear in this exact order, not just be present somewhere.
  const order = ["Know:", "Help:", "Identify uncertainty:", "Ask:"].map((label) => system.indexOf(label))
  assert.ok(order.every((index) => index !== -1), "all four stage labels must be present")
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "stages must appear in Know, Help, Identify uncertainty, Ask order")
})

test("system prompt still tells the model to use stored context once it is relevant, and keeps the data available", () => {
  const system = buildCompanionSystemPrompt({
    localToday: "2026-08-20",
    timeZone: "America/Chicago",
    allowedLabels: ["Today's focus"],
    context: ["Today's focus: {\"priorities\":[{\"title\":\"Lab 4\"}]}"],
  })

  assert.match(system, /answer with the real specifics from PATHLY CONTEXT/i)
  assert.match(system, /do not go generic once personalization is actually useful/i)
  // The underlying data is never stripped out of the prompt -- only the instructions
  // change how it's used -- so a planning question can still be answered from it.
  assert.match(system, /Today's focus: /)
  assert.match(system, /Lab 4/)
})
