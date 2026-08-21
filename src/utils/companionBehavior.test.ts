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
    wantsNotes: false,
    wantsDegree: false,
  })
})

test("an academic planning question requests the planning lookup", () => {
  const intent = classifyCompanionIntent("What should I work on tonight?")
  assert.equal(intent.wantsPlanning, true)
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
