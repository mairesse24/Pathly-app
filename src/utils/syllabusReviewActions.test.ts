import assert from "node:assert/strict"
import test from "node:test"

import { buildSyllabusReviewActionLabel } from "./syllabusReviewActions.ts"

test("zero roadmap and zero dated items render no action", () => {
  assert.equal(buildSyllabusReviewActionLabel({ hasCourseDetails: false, roadmapCount: 0, datedItemCount: 0 }), null)
})

test("roadmap-only review names only nonzero roadmap entries", () => {
  assert.equal(buildSyllabusReviewActionLabel({ hasCourseDetails: false, roadmapCount: 2, datedItemCount: 0 }), "Save 2 roadmap entries")
})

test("dated-only review uses a Calendar action", () => {
  assert.equal(buildSyllabusReviewActionLabel({ hasCourseDetails: false, roadmapCount: 0, datedItemCount: 3 }), "Add 3 items to Calendar")
})

test("course-details-only review has its own action", () => {
  assert.equal(buildSyllabusReviewActionLabel({ hasCourseDetails: true, roadmapCount: 0, datedItemCount: 0 }), "Save course details")
})

test("mixed review names each independently savable section", () => {
  assert.equal(buildSyllabusReviewActionLabel({ hasCourseDetails: true, roadmapCount: 2, datedItemCount: 3 }), "Save course details, 2 roadmap entries and 3 items to Calendar")
})

test("no action label can contain a zero-count CTA", () => {
  for (const hasCourseDetails of [false, true]) {
    for (const roadmapCount of [0, 1, 2]) {
      for (const datedItemCount of [0, 1, 2]) {
        const label = buildSyllabusReviewActionLabel({ hasCourseDetails, roadmapCount, datedItemCount })
        assert.doesNotMatch(label ?? "", /(?:Save|Add) 0\b/)
      }
    }
  }
})
