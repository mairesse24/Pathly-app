import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import "./courseRemoval.css"
import { PageHeader } from "../../components/layout/PageHeader"
import { CourseCard } from "../../components/study/CourseCard"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { Dialog } from "../../components/ui/Dialog"
import { useAcademicData } from "../../context/AcademicDataContext"
import {
  getCourseDeletionImpact,
  type CourseRemovalImpact,
  type CourseRemovalMode,
} from "../../services/courses"
import type { CourseRecord } from "../../types/academic"

type RemovalTarget = {
  course: CourseRecord
  impact: CourseRemovalImpact
}

const countLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

export function StudyHubPage() {
  const navigate = useNavigate()
  const tones = ["sage", "gold", "clay"] as const
  const { courses, assignments, loading, addCourse, updateCourse, removeCourse } = useAcademicData()
  const [adding, setAdding] = useState(false)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<CourseRecord | null>(null)
  const [removal, setRemoval] = useState<RemovalTarget | null>(null)
  const [removing, setRemoving] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      if (editing) {
        await updateCourse(editing.id, { course_code: code, course_name: name })
      } else {
        await addCourse({ course_code: code, course_name: name })
      }
      setCode("")
      setName("")
      setAdding(false)
      setEditing(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add course")
    }
  }

  function beginEdit(course: CourseRecord) {
    setEditing(course)
    setCode(course.course_code)
    setName(course.course_name)
    setAdding(true)
    setError("")
  }

  async function inspectRemoval(course: CourseRecord) {
    try {
      setError("")
      setRemoval(null)
      setRemoval({ course, impact: await getCourseDeletionImpact(course.id) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to inspect this course.")
    }
  }

  async function confirmRemoval(mode: CourseRemovalMode) {
    if (!removal) return
    setRemoving(true)
    setError("")
    try {
      await removeCourse(removal.course.id, mode)
      setRemoval(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove this course.")
    } finally {
      setRemoving(false)
    }
  }

  const linkedCount = removal
    ? removal.impact.assignments +
      removal.impact.exams +
      removal.impact.studySessions +
      removal.impact.uploads +
      removal.impact.processedMaterials +
      removal.impact.savedNotes
    : 0
  const requiresPreservation = Boolean(removal && (linkedCount > 0 || removal.impact.source === "canvas"))

  return (
    <>
      <PageHeader title="Study hub" materialContext={{ origin: "study" }} />
      <main className="page">
        <div className="intro-row">
          <div>
            <h2>Learn in the way that helps it stick.</h2>
            <p>Your current courses, saved securely to your account.</p>
          </div>
          <Button onClick={() => {
            setAdding(!adding)
            setEditing(null)
            setCode("")
            setName("")
          }}>+ Add course</Button>
        </div>
        {adding && (
          <Card>
            <form className="inline-form" onSubmit={submit}>
              <input aria-label="Course code" placeholder="CSCE 1030" value={code} onChange={(event) => setCode(event.target.value)} required />
              <input aria-label="Course name" placeholder="Programming Fundamentals" value={name} onChange={(event) => setName(event.target.value)} required />
              <Button type="submit">{editing ? "Save changes" : "Save course"}</Button>
            </form>
            {error && <p className="form-message" role="alert">{error}</p>}
          </Card>
        )}
        {!adding && error && <p className="form-message" role="alert">{error}</p>}
        <div className="course-grid academic-course-grid">
          {loading ? (
            <p>Loading courses…</p>
          ) : courses.length ? (
            courses.map((course, index) => (
              <CourseCard
                onOpen={() => navigate(`/study/${course.id}`)}
                onEdit={() => beginEdit(course)}
                onDelete={() => void inspectRemoval(course)}
                course={{
                  code: course.course_code,
                  name: course.course_name,
                  color: tones[index % 3],
                  next: assignments.find((assignment) => assignment.course_id === course.id && assignment.status !== "completed")?.title ?? "Nothing due soon",
                }}
                key={course.id}
              />
            ))
          ) : (
            <Card><h3>No courses yet</h3><p>Add your first course to start building your study hub.</p></Card>
          )}
        </div>
      </main>

      <Dialog
        open={Boolean(removal)}
        onClose={() => { if (!removing) setRemoval(null) }}
        title={removal ? `${requiresPreservation ? "Remove" : "Delete"} ${removal.course.course_code.toUpperCase()}${requiresPreservation ? " from Study Hub" : ""}?` : "Remove course"}
      >
        {removal && (
          <div className="course-removal-dialog">
            {requiresPreservation ? (
              <>
                <p>This course has linked academic content:</p>
                <ul className="course-removal-summary">
                  <li>{countLabel(removal.impact.assignments, "assignment")}</li>
                  <li>{countLabel(removal.impact.exams, "exam")}</li>
                  <li>{countLabel(removal.impact.studySessions, "study session")}</li>
                  <li>{countLabel(removal.impact.uploads, "uploaded file")}</li>
                  <li>{countLabel(removal.impact.processedMaterials, "processed study material")}</li>
                  <li>{countLabel(removal.impact.savedNotes, "saved note")}</li>
                </ul>
                <p className="course-removal-safety">Keeping materials removes the course from active planning while preserving its academic content. Degree Planner and transcript history are always preserved.</p>
                <div className="dialog-actions course-removal-actions">
                  <Button type="button" variant="secondary" disabled={removing} onClick={() => setRemoval(null)}>Cancel</Button>
                  {removal.impact.source === "manual" && (
                    <Button type="button" variant="quiet" className="btn-destructive" disabled={removing} onClick={() => void confirmRemoval("delete_with_content")}>Delete course and associated materials</Button>
                  )}
                  <Button type="button" disabled={removing} onClick={() => void confirmRemoval("preserve")}>{removing ? "Removing…" : "Keep materials and remove course"}</Button>
                </div>
              </>
            ) : (
              <>
                <p>This manual course has no linked assignments, exams, study sessions, uploaded files, processed materials, or saved notes.</p>
                <div className="dialog-actions">
                  <Button type="button" variant="secondary" disabled={removing} onClick={() => setRemoval(null)}>Cancel</Button>
                  <Button type="button" className="btn-destructive" disabled={removing} onClick={() => void confirmRemoval("delete_empty")}>{removing ? "Deleting…" : "Delete course"}</Button>
                </div>
              </>
            )}
            {error && <p className="form-message" role="alert">{error}</p>}
          </div>
        )}
      </Dialog>
    </>
  )
}
