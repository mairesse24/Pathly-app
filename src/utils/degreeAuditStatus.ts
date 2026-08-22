import type { DegreeAuditUploadState } from "../services/degreePlanning"

export type DegreeAuditNotice = {
  title: string
  message: string
  action: string
} | null

export function degreeAuditNotice(upload: DegreeAuditUploadState | null): DegreeAuditNotice {
  if (!upload) return null
  if (upload.processing_status === "processing_failed") {
    return {
      title: "Your latest degree audit could not be processed.",
      message: upload.processing_error_code === "structured_output_invalid"
        ? "Pathly could not reliably structure the information in this document. Any previously confirmed degree information remains unchanged."
        : "Pathly did not save supplemental degree information from this upload. Any previously confirmed degree information remains unchanged.",
      action: "Review or retry upload",
    }
  }
  if (upload.processing_status === "ready_for_review") {
    return {
      title: "Your latest degree audit is ready for review.",
      message: "Review the extracted information before it becomes part of your supplemental degree plan.",
      action: "Review degree audit",
    }
  }
  if (upload.processing_status === "processing" || upload.processing_status === "uploaded") {
    return {
      title: "Your latest degree audit is still processing.",
      message: "No extracted information will be added to your degree plan until processing finishes and you review it.",
      action: "View upload status",
    }
  }
  return null
}
