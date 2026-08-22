import assert from "node:assert/strict"
import test from "node:test"
import { classifyCourseIdentity, courseCodesMatch, normalizeCourseCode } from "./courseIdentity.ts"

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

test("inherits the department prefix when the document omits it and the section identity matches", () => {
  const selectedCode = "CSCE 3600.004"
  const selectedTitle = "Principles of Systems Programming"
  for (const documentCode of ["3600.004", "CSCE3600.004", "csce 3600.004", "  CSCE   3600.004  ", "csce3600.004"]) {
    assert.equal(classifyCourseIdentity({ documentCode, documentTitle: selectedTitle, selectedCode, selectedTitle }), "match", `expected ${documentCode} to match ${selectedCode}`)
  }
})

test("still warns when the numeric identity genuinely differs, even under the same prefix", () => {
  assert.equal(classifyCourseIdentity({ documentCode:"CSCE 3600", documentTitle:"Principles of Systems Programming", selectedCode:"CSCE 3444", selectedTitle:"Software Engineering" }), "mismatch")
  assert.equal(classifyCourseIdentity({ documentCode:"3600.004", documentTitle:"Principles of Systems Programming", selectedCode:"CSCE 3444.004", selectedTitle:"Software Engineering" }), "mismatch")
})

test("warns when an explicit document prefix conflicts with the selected course's prefix", () => {
  assert.equal(classifyCourseIdentity({ documentCode:"MATH 3600.004", documentTitle:"Principles of Systems Programming", selectedCode:"CSCE 3600.004", selectedTitle:"Principles of Systems Programming" }), "mismatch")
})

test("courseCodesMatch mirrors the same prefix-inheritance rule used for the identified-course lookup", () => {
  assert.equal(courseCodesMatch("CSCE 3600.004", "3600.004"), true)
  assert.equal(courseCodesMatch("CSCE 3600.004", "CSCE3600.004"), true)
  assert.equal(courseCodesMatch("CSCE 3600.004", "CSCE 3444.004"), false)
  assert.equal(courseCodesMatch("CSCE 3600.004", "MATH 3600.004"), false)
  assert.equal(courseCodesMatch(null, "3600.004"), false)
})
