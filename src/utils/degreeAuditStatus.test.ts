import assert from "node:assert/strict"
import test from "node:test"
import { degreeAuditNotice } from "./degreeAuditStatus.ts"

test("failed structured audit offers review or retry without replacing confirmed progress", () => {
  const notice = degreeAuditNotice({
    id: "upload-id",
    processing_status: "processing_failed",
    processing_error_code: "structured_output_invalid",
    created_at: "2026-08-21T00:01:48.000Z",
  })
  assert.deepEqual(notice, {
    title: "Your latest degree audit could not be processed.",
    message: "Pathly could not reliably structure the information in this document. Any previously confirmed degree information remains unchanged.",
    action: "Review or retry upload",
  })
})

test("processed audits do not produce a contradictory upload warning", () => {
  assert.equal(degreeAuditNotice({
    id: "upload-id",
    processing_status: "processed",
    processing_error_code: null,
    created_at: "2026-08-21T00:01:48.000Z",
  }), null)
})
