import { useEffect, useState } from "react"

import { Navigate, useNavigate, useParams } from "react-router-dom"

import { PageHeader } from "../../components/layout/PageHeader"

import { Button } from "../../components/ui/Button"

import { Card } from "../../components/ui/Card"

import { Dialog } from "../../components/ui/Dialog"

import { useAcademicData } from "../../context/AcademicDataContext"
import { useProfile } from "../../context/ProfileContext"
import {
  downloadUpload,
  formatBytes,
  listUploads,
} from "../../services/uploads"
import { processUpload } from "../../services/processing"

import type { ProcessingResultRecord, ProcessingStage, UploadedFileRecord } from "../../types/uploads"
import { formatInstant } from "../../utils/dateTime"
import { AddMaterialDialog } from "../../components/uploads/AddMaterialDialog"
import { ProcessingReview } from "../../components/uploads/ProcessingReview"
import { OrganizeNotes } from "../../components/study/OrganizeNotes"

const reviewStageLabel: Record<ProcessingStage, string> = {
  preparing: "Preparing material…",
  reading: "Reading material…",
  creating: "Creating study materials…",
  saving: "Saving your results…",
}

export function CourseDetailPage() {
  const { profile } = useProfile()
  const { courseId } = useParams()

  const navigate = useNavigate()

  const { courses, assignments, exams, studySessions, loading, refreshAcademicData } =
    useAcademicData()

  const [files, setFiles] = useState<UploadedFileRecord[]>([])

  const [fileError, setFileError] = useState("")
  const [materialOpen, setMaterialOpen] = useState(false)

  const [reviewUpload, setReviewUpload] = useState<UploadedFileRecord | null>(null)
  const [reviewResult, setReviewResult] = useState<ProcessingResultRecord | null>(null)
  const [reviewStage, setReviewStage] = useState<ProcessingStage | null>(null)
  const [reviewError, setReviewError] = useState("")

  useEffect(() => {
    if (!courseId) return

    listUploads(courseId)
      .then(setFiles)
      .catch((reason: unknown) =>
        setFileError(
          reason instanceof Error
            ? reason.message
            : "Unable to load course files.",
        ),
      )
  }, [courseId])

  async function startReview(row: UploadedFileRecord) {
    if (row.category !== "syllabus" && row.category !== "lecture") return
    setReviewUpload(row)
    setReviewResult(null)
    setReviewError("")
    setReviewStage("preparing")
    setFiles((current) => current.map((item) => item.id === row.id ? { ...item, processing_status: "processing", processing_stage: "preparing", processing_error_code: null, error_message: null } : item))
    try {
      const result = await processUpload(row.id, (stage) => setReviewStage(stage))
      setReviewResult(result)
      setFiles((current) => current.map((item) => item.id === row.id ? { ...item, processing_status: "ready_for_review", processing_stage: null } : item))
    } catch {
      setReviewError("We couldn't process this file. Your original file is still safely stored.")
      setFiles((current) => current.map((item) => item.id === row.id ? { ...item, processing_status: "processing_failed", processing_stage: null } : item))
    } finally {
      setReviewStage(null)
    }
  }

  function closeReview() {
    setReviewUpload(null)
    setReviewResult(null)
    setReviewStage(null)
    setReviewError("")
  }

  if (loading)
    return (
      <>
        <PageHeader title="Course" />
        <main className="page">
          <p>Loading course…</p>
        </main>
      </>
    )

  const course = courses.find((item) => item.id === courseId)

  if (!course) return <Navigate to="/study" replace />

  const courseAssignments = assignments.filter(
    (item) => item.course_id === course.id,
  )

  const courseExams = exams.filter((item) => item.course_id === course.id)

  const sessions = studySessions.filter(
    (item) =>
      item.course_id === course.id && new Date(item.start_at) >= new Date(),
  )

  const meeting =
    course.meeting_days?.length || course.meeting_start
      ? `${course.meeting_days?.join(", ") || "Day not provided"}${
          course.meeting_start
            ? ` · ${course.meeting_start.slice(0, 5)}${
                course.meeting_end ? `–${course.meeting_end.slice(0, 5)}` : ""
              }`
            : ""
        }`
      : "Not provided"

  return (
    <>
      <PageHeader title={course.course_code} materialContext={{ origin: "course", courseId: course.id }} closeOnUpload onMaterialUploaded={(row) => { setFiles((current) => [row, ...current]); void startReview(row) }} />
      <main className="page">
        <div className="intro-row">
          <div>
            <p className="eyebrow">{course.course_code}</p>
            <h2>{course.course_name}</h2>
          </div>
          <Button variant="secondary" onClick={() => navigate("/study")}>
            Back to courses
          </Button>
        </div>
        <div className="course-detail-grid">
          <Card>
            <p className="eyebrow">Course details</p>
            <Detail
              label="Instructor"
              value={course.instructor || "Not provided"}
            />
            <Detail
              label="Credits"
              value={course.credits?.toString() || "Not provided"}
            />
            <Detail label="Meeting" value={meeting} />
          </Card>
          <ListCard
            title="Assignments"
            empty="No assignments added."
            items={courseAssignments.map(
              (item) =>
                `${item.title}${
                  item.due_at
                    ? ` · ${formatInstant(item.due_at, profile?.timezone, { dateStyle: "medium", timeStyle: "short" })}`
                    : ""
                }`,
            )}
          />
          <ListCard
            title="Exams"
            empty="No exams added."
            items={courseExams.map(
              (item) =>
                `${item.title}${
                  item.exam_at
                    ? ` · ${formatInstant(item.exam_at, profile?.timezone, { dateStyle: "medium", timeStyle: "short" })}`
                    : ""
                }`,
            )}
          />
          <ListCard
            title="Upcoming study sessions"
            empty="No upcoming sessions."
            items={sessions.map(
              (item) =>
                `${item.title} · ${formatInstant(item.start_at, profile?.timezone, { dateStyle: "medium", timeStyle: "short" })}`,
            )}
          />
          <Card>
            <p className="eyebrow">Course files</p>
            {fileError ? (
              <p className="form-message">{fileError}</p>
            ) : files.length ? (
              <ul className="plain-list file-links">
                {files.map((file) => {
                  const reviewable = file.category === "syllabus" || file.category === "lecture"
                  const isReviewing = reviewUpload?.id === file.id
                  const busy = isReviewing && reviewStage !== null
                  return (
                  <li key={file.id}>
                    <button
                      className="text-button"
                      onClick={() => void downloadUpload(file)}
                    >
                      {file.original_filename}
                    </button>
                    <small>
                      {formatBytes(file.size_bytes)} · Uploaded
                      {file.processing_status === "processed" ? " · Reviewed" : ""}
                    </small>
                    {reviewable && file.processing_status !== "processed" && (
                      <Button variant="secondary" disabled={busy} onClick={() => void startReview(file)}>
                        {busy
                          ? reviewStageLabel[reviewStage ?? "preparing"]
                          : file.processing_status === "processing_failed"
                            ? "Try again"
                            : file.category === "syllabus" ? "Review syllabus" : "Create study materials"}
                      </Button>
                    )}
                  </li>
                  )
                })}
              </ul>
            ) : (
              <p>No files associated with this course.</p>
            )}
            <Button
              variant="secondary"
              onClick={() => setMaterialOpen(true)}
            >
              Upload course material
            </Button>
          </Card>
          <OrganizeNotes courseId={course.id} />
        </div>
      </main>
      <AddMaterialDialog open={materialOpen} onClose={() => setMaterialOpen(false)} context={{ origin: "course", courseId: course.id }} onUploaded={(row) => { setMaterialOpen(false); setFiles((current) => [row, ...current]); void startReview(row) }} />
      <Dialog open={!!reviewUpload} onClose={closeReview} title={reviewUpload?.category === "lecture" ? "Study materials" : "Syllabus review"}>
        {reviewError ? (
          <>
            <p className="form-message" role="alert">{reviewError}</p>
            <div className="dialog-actions">
              <Button variant="secondary" onClick={closeReview}>Close</Button>
              {reviewUpload && <Button onClick={() => void startReview(reviewUpload)}>Try again</Button>}
            </div>
          </>
        ) : reviewResult && reviewUpload ? (
          <ProcessingReview
            record={reviewResult}
            upload={reviewUpload}
            onCourseChanged={(changedCourseId) => setFiles((current) => current.map((item) => item.id === reviewUpload.id ? { ...item, course_id: changedCourseId } : item))}
            onApproved={(approved, sourceDeleted) => {
              void refreshAcademicData()
              void listUploads(course.id).then(setFiles)
              if (sourceDeleted) { closeReview(); return }
              setReviewResult(approved)
            }}
          />
        ) : (
          <p role="status">{reviewStageLabel[reviewStage ?? "preparing"]}</p>
        )}
      </Dialog>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}

function ListCard({
  title,

  empty,

  items,
}: {
  title: string

  empty: string

  items: string[]
}) {
  return (
    <Card>
      <p className="eyebrow">{title}</p>
      {items.length ? (
        <ul className="plain-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </Card>
  )
}
