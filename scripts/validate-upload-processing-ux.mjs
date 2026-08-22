import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
const uploadCenter = read("src/pages/UploadCenter/index.tsx")
const uploads = read("src/services/uploads.ts")

assert.match(uploadCenter, /processingInFlight\.current\.has\(row\.id\)/, "the same file cannot be submitted for processing twice")
assert.match(uploadCenter, /catch \{[\s\S]{0,300}Promise\.allSettled\(\[listUploads\(\), listProcessingResults\(\)\]\)/, "failure must reconcile upload and review state from the backend")
assert.doesNotMatch(uploadCenter, /const failed = refreshed\?\.find[\s\S]{0,350}processing_status: "processing_failed"/, "backend state must not be overwritten with an assumed failure")
assert.match(uploadCenter, /processingInFlight\.current\.has\(row\.id\) \|\| row\.processing_status === "processing"/, "deletion must be guarded while processing")
assert.match(uploads, /Upload reservation failed[\s\S]{0,180}We couldn't start this upload/, "database diagnostics must stay internal")
assert.match(uploads, /Source file upload failed[\s\S]{0,180}We couldn't upload this file/, "storage diagnostics must stay internal")
assert.match(uploadCenter, /<ProcessingReview[\s\S]{0,500}onApproved=/, "processed output remains behind explicit review and approval")

console.log("upload processing UX: reconciliation, safe errors, in-flight guards, and review-before-write verified")
