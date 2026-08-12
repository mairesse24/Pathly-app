import { Navigate, useNavigate, useParams } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"

export function CourseDetailPage() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { courses, assignments, exams, studySessions, loading } =
    useAcademicData()
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
                    ? ` · ${new Date(item.due_at).toLocaleString()}`
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
                    ? ` · ${new Date(item.exam_at).toLocaleString()}`
                    : ""
                }`,
            )}
          />
          <ListCard
            title="Upcoming study sessions"
            empty="No upcoming sessions."
            items={sessions.map(
              (item) =>
                `${item.title} · ${new Date(item.start_at).toLocaleString()}`,
            )}
          />
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
