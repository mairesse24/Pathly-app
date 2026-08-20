import assert from "node:assert/strict"
import test from "node:test"

import { buildRoadmapStudyText, roadmapSessionTitle } from "./roadmapPresentation.ts"

test("a roadmap topic with a period label prefills 'Period — Topic'", () => {
  assert.equal(roadmapSessionTitle({ period_label: "Week 4", topic: "UI Design & Accessibility" }), "Week 4 — UI Design & Accessibility")
})

test("a roadmap topic with no period label prefills just the topic", () => {
  assert.equal(roadmapSessionTitle({ period_label: null, topic: "Requirements Gathering & Analysis" }), "Requirements Gathering & Analysis")
})

test("study text includes the period, description, and deliverable when present", () => {
  const text = buildRoadmapStudyText({ period_label: "Week 5", topic: "Software Design & Best Practices", description: "Covers SOLID principles.", deliverable: "SRS due" })
  assert.match(text, /Course roadmap topic: Software Design & Best Practices/)
  assert.match(text, /Period: Week 5/)
  assert.match(text, /Covers SOLID principles\./)
  assert.match(text, /Related deliverable: SRS due/)
})

test("study text omits period/description/deliverable lines when absent", () => {
  const text = buildRoadmapStudyText({ period_label: null, topic: "Testing & Integration", description: null, deliverable: null })
  assert.equal(text, "Course roadmap topic: Testing & Integration")
})
