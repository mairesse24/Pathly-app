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
