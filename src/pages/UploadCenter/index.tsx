import { useEffect, useRef, useState } from "react"

import { useSearchParams } from "react-router-dom"

import { PageHeader } from "../../components/layout/PageHeader"

import { ProcessingReview } from "../../components/uploads/ProcessingReview"

import { Button } from "../../components/ui/Button"

import { Card } from "../../components/ui/Card"

import { Icon } from "../../components/ui/Icon"

import { useAcademicData } from "../../context/AcademicDataContext"

import { useAuth } from "../../context/AuthContext"
import { useProfile } from "../../context/ProfileContext"
import { listProcessingResults, processUpload } from "../../services/processing"

import {
  deleteUpload,
  formatBytes,
  listUploads,
  uploadSourceFile,
  USER_QUOTA_BYTES,
  validateUpload,
} from "../../services/uploads"

import type {
  ProcessingResultRecord,
  ProcessingStage,
  UploadCategory,
  UploadedFileRecord,
} from "../../types/uploads"
import { formatInstant } from "../../utils/dateTime"

const labels: Record<UploadCategory, string> = {
  syllabus: "Syllabus",
  lecture: "Lecture material",
  degree_audit: "Degree audit",
  unofficial_transcript: "Unofficial transcript",
}

const stageLabels: Record<ProcessingStage, string> = {
  preparing: "Preparing material…",
  reading: "Reading material…",
  creating: "Creating study materials…",
  saving: "Saving your results…",
}
function processingStageLabel(stage: ProcessingStage, category: UploadCategory) {
  if ((category === "degree_audit" || category === "unofficial_transcript") && stage === "creating") return "Identifying coursework…"
  return stageLabels[stage]
}

export function UploadCenterPage() {
  const { profile } = useProfile()
  const { user } = useAuth()

  const { courses } = useAcademicData()

  const [params] = useSearchParams()

  const requested = params.get("category") as UploadCategory | null

  const [category, setCategory] = useState<UploadCategory>(
    requested && labels[requested] ? requested : "syllabus",
  )

  const [courseId, setCourseId] = useState("")

  const [file, setFile] = useState<File | null>(null)

  const [files, setFiles] = useState<UploadedFileRecord[]>([])

  const [results, setResults] = useState<ProcessingResultRecord[]>([])

  const [processingId, setProcessingId] = useState("")

  const [state, setState] =
    useState<"idle" | "validating" | "uploading" | "success" | "error">("idle")

  const [message, setMessage] = useState("")

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([listUploads(), listProcessingResults()])
      .then(([uploads, processing]) => {
        setFiles(uploads)
        setResults(processing)
      })
      .catch((reason: unknown) => {
        setState("error")
        setMessage(
          reason instanceof Error ? reason.message : "Unable to load uploads.",
        )
      })
  }, [])

  const sensitive =
    category === "degree_audit" || category === "unofficial_transcript"

  const used = files.reduce((sum, item) => sum + item.size_bytes, 0)

  function openFilePicker() {
    inputRef.current?.click()
  }

  function choose(selected: File | null) {
    setState("validating")
    setMessage("")

    try {
      if (!selected) throw new Error("Choose a file to continue.")
      validateUpload(selected)
      setFile(selected)
      setState("idle")
    } catch (reason) {
      setFile(null)
      setState("error")
      setMessage(
        reason instanceof Error
          ? reason.message
          : "That file cannot be uploaded.",
      )
    }
  }

  async function upload() {
    if (!user || !file) return

    setState("uploading")
    setMessage("Uploading securely…")

    try {
      const row = await uploadSourceFile({
        userId: user.id,
        file,
        category,
        courseId: courseId || null,
      })

      setFiles((current) => [row, ...current])
      setFile(null)

      if (inputRef.current) inputRef.current.value = ""

      setState("success")

      setMessage(
        category === "syllabus"
          ? "Upload complete. You can now review the syllabus."
          : category === "lecture"
            ? "Upload complete. You can now create study materials."
            : "Upload complete.",
      )
    } catch (reason) {
      setState("error")
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Upload failed. Please try again.",
      )
    }
  }

  async function process(row: UploadedFileRecord) {
    setProcessingId(row.id)
    setMessage("")

    setFiles((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              processing_status: "processing",
              processing_stage: "preparing",
              processing_error_code: null,
              error_message: null,
            }
          : item,
      ),
    )

    try {
      const result = await processUpload(row.id, (stage) =>
        setFiles((current) =>
          current.map((item) =>
            item.id === row.id ? { ...item, processing_stage: stage } : item,
          ),
        ),
      )

      setResults((current) => [
        result,
        ...current.filter((item) => item.upload_id !== row.id),
      ])

      setFiles((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                processing_status: "ready_for_review",
                processing_stage: null,
              }
            : item,
        ),
      )

      setState("success")
      setMessage(
        row.category === "syllabus"
          ? "Your syllabus is ready to review."
          : row.category === "lecture"
            ? "Your study materials are ready."
            : "Your candidate coursework is ready to review.",
      )
    } catch {
      setFiles((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                processing_status: "processing_failed",
                processing_stage: null,
              }
            : item,
        ),
      )

      setState("idle")
      setMessage("")
    } finally {
      setProcessingId("")
    }
  }

  async function remove(row: UploadedFileRecord) {
    if (
      !window.confirm(`Delete ${row.original_filename}? This cannot be undone.`)
    )
      return

    try {
      await deleteUpload(row)
      setFiles((current) => current.filter((item) => item.id !== row.id))
      setResults((current) =>
        current.filter((item) => item.upload_id !== row.id),
      )
      setState("success")
      setMessage("File deleted and storage space reclaimed.")
    } catch (reason) {
      setState("error")
      setMessage(
        reason instanceof Error ? reason.message : "Unable to delete the file.",
      )
    }
  }

  return (
    <>
      <PageHeader title="Upload center" />
      <main className="page">
        <div className="intro-row">
          <div>
            <h2>Add your source materials.</h2>
            <p>
              Turn lecture materials into study support and review syllabus
              details before anything is added to your coursework.
            </p>
          </div>
        </div>
        <Card
          className="upload-zone"
          onClick={(event) => {
            if (
              !(event.target as HTMLElement).closest(
                "button, input, select, label",
              )
            )
              openFilePicker()
          }}
        >
          <div className="upload-graphic">
            <Icon name="upload" size={32} />
          </div>
          <h3>Upload a file</h3>
          <p>PDF, PPTX, DOCX, PNG, JPG, or JPEG · 25 MB maximum</p>
          <div className="upload-fields">
            <label>
              File category
              <select
                value={category}
                onChange={(event) => {
                  setCategory(event.target.value as UploadCategory)
                  setCourseId("")
                }}
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(category === "syllabus" || category === "lecture") && (
              <label>
                Course
                <select
                  value={courseId}
                  onChange={(event) => setCourseId(event.target.value)}
                >
                  <option value="">Select a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.course_code} — {course.course_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <input
              ref={inputRef}
              className="visually-hidden-file"
              type="file"
              aria-label="Choose a source file"
              accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg"
              onChange={(event) => choose(event.target.files?.[0] ?? null)}
            />
          </div>
          <Button type="button" variant="secondary" onClick={openFilePicker}>
            Choose file
          </Button>
          {file && (
            <p>
              <strong>Selected:</strong> {file.name} · {formatBytes(file.size)}
            </p>
          )}
          {sensitive && (
            <p className="privacy-notice">
              <strong>Sensitive academic record.</strong> Only you can access
              this source file. Before uploading, remove information you don&apos;t
              want Pathly to process, including Social Security numbers,
              financial information, and addresses.
            </p>
          )}
          <Button onClick={upload} disabled={!file || state === "uploading"}>
            {state === "uploading" ? "Uploading…" : "Upload file"}
          </Button>
          {message && (
            <p
              className={state === "error" ? "form-message" : "save-success"}
              role={state === "error" ? "alert" : "status"}
            >
              {message}
            </p>
          )}
        </Card>
        <div className="storage-summary">
          <strong>{formatBytes(used)} of 500 MB used</strong>
          <span>Source-file quota</span>
          <div className="mini-progress">
            <i
              style={{
                width: `${Math.min(100, (used / USER_QUOTA_BYTES) * 100)}%`,
              }}
            />
          </div>
        </div>
        {files.length ? (
          <div className="uploaded-file-list">
            {files.map((row) => {
              const result = results.find((item) => item.upload_id === row.id)

              const processable = true

              const isProcessing =
                processingId === row.id ||
                row.processing_status === "processing"

              const actionLabel =
                row.processing_status === "processing_failed"
                  ? "Try again"
                  : row.category === "syllabus"
                    ? "Review syllabus"
                    : row.category === "lecture"
                      ? "Create study materials"
                      : "Review academic record"

              const supportingCopy =
                row.category === "syllabus"
                  ? "Pathly can identify important dates, assignments, exams, and course information for you to review."
                  : row.category === "lecture"
                    ? "Pathly can turn this material into a summary, key concepts, flashcards, and practice questions."
                    : "Pathly can identify candidate coursework for you to review. Nothing is added until you confirm it."

              return (
                <div key={row.id} className="upload-with-review">
                  <Card className="uploaded-file-row">
                    <div>
                      <p className="eyebrow">{labels[row.category]}</p>
                      <h3>{row.original_filename}</h3>
                      <p>
                        {formatBytes(row.size_bytes)} · Uploaded{" "}
                        {formatInstant(row.created_at, profile?.timezone, {
                          dateStyle: "medium",
                        })}
                      </p>
                      {isProcessing && (
                        <p className="upload-status" role="status">
                          {processingStageLabel(row.processing_stage ?? "preparing", row.category)}
                        </p>
                      )}
                      {row.processing_status === "processing_failed" && (
                        <p className="processing-failure" role="alert">
                          We couldn&apos;t process this file. Your original file
                          is still safely stored.
                        </p>
                      )}
                      {processable && !result && !isProcessing && (
                        <p className="processing-support">{supportingCopy}</p>
                      )}
                    </div>
                    <div className="upload-row-actions">
                      {processable && !result && (
                        <Button
                          onClick={() => void process(row)}
                          disabled={isProcessing}
                        >
                          {isProcessing
                            ? processingStageLabel(row.processing_stage ?? "preparing", row.category)
                            : actionLabel}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        onClick={() => void remove(row)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                  {result && (
                    <ProcessingReview
                      record={result}
                      onApproved={(approved, sourceDeleted) => {
                        if (sourceDeleted) {
                          setResults((current) => current.filter((item) => item.id !== approved.id))
                          setFiles((current) => current.filter((item) => item.id !== row.id))
                          setMessage("Courses confirmed and the original document was deleted.")
                          return
                        }
                        setResults((current) =>
                          current.map((item) =>
                            item.id === approved.id ? approved : item,
                          ),
                        )
                        setFiles((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? { ...item, processing_status: "processed" }
                              : item,
                          ),
                        )
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty-materials">
            <Icon name="file" size={28} />
            <h3>No uploads yet</h3>
            <p>Files you upload will appear here.</p>
          </div>
        )}
      </main>
    </>
  )
}
