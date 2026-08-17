import assert from "node:assert/strict"
import test from "node:test"
import { classifyCourseIdentity, normalizeCourseCode } from "./courseIdentity.ts"

test("normalizes explicit course codes before comparison", () => {
  assert.equal(normalizeCourseCode(" csce-3600 "), "CSCE3600")
  assert.equal(classifyCourseIdentity({ documentCode:"CSCE 3600", documentTitle:"Different printed title", selectedCode:"csce-3600", selectedTitle:"Principles of Systems Programming" }), "match")
})

test("classifies two different explicit codes as mismatch", () => {
  assert.equal(classifyCourseIdentity({ documentCode:"CSCE 3600", documentTitle:"Principles of Systems Programming", selectedCode:"CSCE 3444", selectedTitle:"Software Engineering" }), "mismatch")
})

test("uses unknown only when document identity is insufficient", () => {
  assert.equal(classifyCourseIdentity({ documentCode:null, documentTitle:null, selectedCode:"CSCE 3444", selectedTitle:"Software Engineering" }), "unknown")
  assert.equal(classifyCourseIdentity({ documentCode:null, documentTitle:"Unrecognized Seminar", selectedCode:"CSCE 3444", selectedTitle:"Software Engineering" }), "unknown")
})

test("matches an exact title only when the document has no code", () => {
  assert.equal(classifyCourseIdentity({ documentCode:null, documentTitle:"  Software   Engineering ", selectedCode:"CSCE 3444", selectedTitle:"Software Engineering" }), "match")
})
