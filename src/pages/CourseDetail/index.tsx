import { useEffect, useState } from "react"

import { Navigate, useNavigate, useParams } from "react-router-dom"

import { PageHeader } from "../../components/layout/PageHeader"

import { Button } from "../../components/ui/Button"

import { Card } from "../../components/ui/Card"

import { useAcademicData } from "../../context/AcademicDataContext"
import { useProfile } from "../../context/ProfileContext"
import {
  downloadUpload,
  formatBytes,
  listUploads,
} from "../../services/uploads"

import type { UploadedFileRecord } from "../../types/uploads"
import { formatInstant } from "../../utils/dateTime"

export function CourseDetailPage() {
  const { profile } = useProfile()
  const { courseId } = useParams()

  const navigate = useNavigate()

  const { courses, assignments, exams, studySessions, loading } =
    useAcademicData()

  const [files, setFiles] = useState<UploadedFileRecord[]>([])

  const [fileError, setFileError] = useState("")

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
      <PageHeader title={course.course_code} />
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
                {files.map((file) => (
                  <li key={file.id}>
                    <button
                      className="text-button"
                      onClick={() => void downloadUpload(file)}
                    >
                      {file.original_filename}
                    </button>
                    <small>
                      {formatBytes(file.size_bytes)} · Uploaded — AI processing
                      not yet enabled
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No files associated with this course.</p>
            )}
            <Button
              variant="secondary"
              onClick={() => navigate("/uploads?category=syllabus")}
            >
              Upload course material
            </Button>
          </Card>
        </div>
      </main>
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
