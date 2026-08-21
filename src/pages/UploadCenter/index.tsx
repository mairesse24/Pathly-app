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
import { listTranscriptImports, previewTranscriptImportRemoval, removeTranscriptImport, type TranscriptImport } from "../../services/transcriptImports"
import { listPendingSyllabusExamConflicts, resolveSyllabusExamConflict, type SyllabusExamConflict } from "../../services/syllabusExamConflicts"

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

  const { courses, exams, refreshAcademicData } = useAcademicData()

  const [params] = useSearchParams()

  const requested = params.get("category") as UploadCategory | null
  const requestedFile = params.get("file")

  const [category, setCategory] = useState<UploadCategory>(
    requested && labels[requested] ? requested : "syllabus",
  )

  const [courseId, setCourseId] = useState("")

  const [file, setFile] = useState<File | null>(null)

  const [files, setFiles] = useState<UploadedFileRecord[]>([])

  const [results, setResults] = useState<ProcessingResultRecord[]>([])
  const [transcriptImports, setTranscriptImports] = useState<TranscriptImport[]>([])
  const [examConflicts, setExamConflicts] = useState<SyllabusExamConflict[]>([])
  const [resolvingConflict, setResolvingConflict] = useState<{ id: string; resolution: "keep_existing" | "replace" } | null>(null)
  const [conflictMessage, setConflictMessage] = useState("")
  const [conflictError, setConflictError] = useState("")
  const [uploadLoadError, setUploadLoadError] = useState("")
  const [supportingLoadError, setSupportingLoadError] = useState("")

  const [processingId, setProcessingId] = useState("")
  const [latestUploadedId, setLatestUploadedId] = useState("")

  const [state, setState] =
    useState<"idle" | "validating" | "uploading" | "success" | "error">("idle")

  const [message, setMessage] = useState("")

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadUploadCenter()
  }, [])

  async function loadUploadCenter() {
    setUploadLoadError("")
    setSupportingLoadError("")
    const [uploads, processing, conflicts, imports] = await Promise.allSettled([
      listUploads(),
      listProcessingResults(),
      listPendingSyllabusExamConflicts(),
      listTranscriptImports(),
    ])
    if (uploads.status === "fulfilled") {
      setFiles(uploads.value)
    } else {
      setUploadLoadError(
        "Your uploaded files could not be loaded. Check your connection and try again.",
      )
    }
    if (processing.status === "fulfilled") setResults(processing.value)
    if (conflicts.status === "fulfilled") setExamConflicts(conflicts.value)
    if (imports.status === "fulfilled") setTranscriptImports(imports.value)
    if ([processing, conflicts, imports].some((result) => result.status === "rejected")) {
      setSupportingLoadError(
        "Some upload review tools are temporarily unavailable. Your files are still shown below.",
      )
    }
  }

  useEffect(() => {
    if (!latestUploadedId) return
    document.getElementById(`upload-${latestUploadedId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    })
  }, [latestUploadedId])

  useEffect(() => {
    if (!requestedFile || !files.some((item) => item.id === requestedFile)) return
    document.getElementById(`upload-${requestedFile}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [files, requestedFile])

  const sensitive =
    category === "degree_audit" || category === "unofficial_transcript"

  const used = files.reduce((sum, item) => sum + item.size_bytes, 0)

  async function resolveExamConflict(conflict: SyllabusExamConflict, resolution: "keep_existing" | "replace") {
    if (resolvingConflict) return
    setResolvingConflict({ id: conflict.id, resolution })
    setConflictMessage("")
    setConflictError("")
    try {
      await resolveSyllabusExamConflict(conflict.id, resolution)
      setExamConflicts((current) => current.filter((item) => item.id !== conflict.id))
      await refreshAcademicData()
      setConflictMessage(resolution === "replace" ? "The proposed syllabus exam date replaced the prior syllabus date." : "The existing syllabus exam date was kept.")
    } catch (reason) {
      setConflictError(reason instanceof Error ? reason.message : "Unable to resolve the exam conflict.")
    } finally {
      setResolvingConflict(null)
    }
  }

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
      setLatestUploadedId(row.id)
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
      const refreshed = await listUploads().catch(() => null)
      const failed = refreshed?.find((item) => item.id === row.id)
      setFiles((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                processing_status: "processing_failed",
                processing_stage: null,
                processing_error_code: failed?.processing_error_code ?? item.processing_error_code,
                error_message: failed?.error_message ?? item.error_message,
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

  async function removeImportedCourses(item: TranscriptImport) {
    try {
      const preview = await previewTranscriptImportRemoval(item.id)
      const details = [
        `${preview.imported_records} imported course record${preview.imported_records === 1 ? "" : "s"}`,
        `${preview.completed_course_rows_deleted} completed-course row${preview.completed_course_rows_deleted === 1 ? "" : "s"} removed`,
        preview.completed_course_rows_restored ? `${preview.completed_course_rows_restored} restored from another transcript` : "",
        preview.manual_rows_preserved ? `${preview.manual_rows_preserved} manual course${preview.manual_rows_preserved === 1 ? "" : "s"} preserved` : "",
      ].filter(Boolean).join("; ")
      if (!window.confirm(`Remove this transcript import? ${details}. This can only be reversed by re-importing the transcript.`)) return
      await removeTranscriptImport(item.id)
      setTranscriptImports(current => current.filter(value => value.id !== item.id))
      await refreshAcademicData()
      setState("success")
      setMessage("Transcript-imported course history removed. Other uploads and manually added coursework were preserved.")
    } catch (reason) {
      setState("error")
      setMessage(reason instanceof Error ? reason.message : "Unable to remove imported courses.")
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
        <p className="academic-disclaimer">AI-generated summaries and extracted dates can make mistakes. Review important information before relying on it.</p>
        {uploadLoadError && <Card className="section-error"><p role="alert">{uploadLoadError}</p><Button variant="secondary" onClick={() => void loadUploadCenter()}>Retry loading uploads</Button></Card>}
        {supportingLoadError && <p className="form-message section-error" role="status">{supportingLoadError}</p>}
        {examConflicts.length > 0 && <Card className="processing-review"><p className="eyebrow">Exam dates need review</p><h3>Two syllabi disagree</h3><p>Pathly kept the existing syllabus exam on Dashboard and Calendar. Choose whether to keep it or replace it with the proposed date.</p>{examConflicts.map((conflict) => { const existing=exams.find((exam)=>exam.id===conflict.existing_exam_id);const course=courses.find((item)=>item.id===conflict.course_id);const isResolving=resolvingConflict?.id===conflict.id;return <div className="review-row" key={conflict.id}><div><strong>{course?.course_code??"Course"} — {conflict.proposed_title}</strong><p>Existing: {existing?.exam_at?formatInstant(existing.exam_at,profile?.timezone,{dateStyle:"medium",timeStyle:"short"}):"No date"}<br/>Proposed: {conflict.proposed_exam_at?formatInstant(conflict.proposed_exam_at,profile?.timezone,{dateStyle:"medium",timeStyle:"short"}):"No date"}</p></div><div className="form-actions"><Button variant="secondary" onClick={()=>void resolveExamConflict(conflict,"keep_existing")} disabled={resolvingConflict!==null}>{isResolving&&resolvingConflict.resolution==="keep_existing"?"Keeping…":"Keep existing"}</Button><Button onClick={()=>void resolveExamConflict(conflict,"replace")} disabled={resolvingConflict!==null}>{isResolving&&resolvingConflict.resolution==="replace"?"Applying…":"Use proposed"}</Button></div></div>})}{conflictError&&<p className="form-message" role="alert">{conflictError}</p>}{conflictMessage&&<p className="save-success" role="status">{conflictMessage}</p>}</Card>}
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
          <p className="privacy-notice"><strong>{sensitive?"Sensitive academic record. ":"Review before uploading. "}</strong>Before uploading, review your file and remove information Pathly doesn&apos;t need. Do not upload Social Security numbers, passwords, financial details, medical records, or other unnecessary sensitive personal information.</p>
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
        {transcriptImports.length > 0 && <Card className="processing-review"><p className="eyebrow">Transcript imports</p><h3>Imported course history</h3><p>Removing an import affects only coursework recorded from that specific transcript. Source files, manual coursework, assignments, exams, and roadmap entries are not removed.</p>{transcriptImports.map(item => { const count=item.course_count;return <div className="review-row" key={item.id}><div><strong>{count} imported course record{count===1?"":"s"}</strong><p>Imported {formatInstant(item.created_at,profile?.timezone,{dateStyle:"medium"})}</p></div><Button variant="secondary" onClick={()=>void removeImportedCourses(item)}>Remove imported courses</Button></div>})}</Card>}
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
                      : row.category === "unofficial_transcript"
                        ? "Review transcript"
                        : "Review degree audit"

              const supportingCopy =
                row.category === "syllabus"
                  ? "Pathly can identify important dates, assignments, exams, and course information for you to review."
                  : row.category === "lecture"
                    ? "Pathly can turn this material into a summary, key concepts, flashcards, and practice questions."
                    : row.category === "unofficial_transcript"
                      ? "Pathly can identify completed and in-progress courses from this document. You'll review everything before it is added."
                      : "Pathly will check whether this is your personal degree audit or a degree/transfer guide, then show you what it found either way. You'll review everything before anything is added."

              return (
                <div key={row.id} id={`upload-${row.id}`} className="upload-with-review">
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
                          {row.category === "degree_audit" || row.category === "unofficial_transcript"
                            ? "We couldn't review this document. Your original file is still safely stored."
                            : "We couldn't process this file. Your original file is still safely stored."}
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
                      upload={row}
                      onCourseChanged={(courseId)=>setFiles(current=>current.map(item=>item.id===row.id?{...item,course_id:courseId}:item))}
                      onApproved={(approved, sourceDeleted) => {
                        if (approved.kind === "unofficial_transcript") void listTranscriptImports().then(setTranscriptImports)
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
