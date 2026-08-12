import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { CourseCard } from "../../components/study/CourseCard"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"
export function StudyHubPage() {
  const navigate = useNavigate()
  const tones = ["sage", "gold", "clay"] as const
  const { courses, assignments, loading, addCourse } = useAcademicData()
  const [adding, setAdding] = useState(false),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState("")
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await addCourse({ course_code: code, course_name: name })
      setCode("")
      setName("")
      setAdding(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add course")
    }
  }
  return (
    <>
      <PageHeader title="Study hub" />
      <main className="page">
        <div className="intro-row">
          <div>
            <h2>Learn in the way that helps it stick.</h2>
            <p>Your current courses, saved securely to your account.</p>
          </div>
          <Button onClick={() => setAdding(!adding)}>+ Add course</Button>
        </div>
        {adding && (
          <Card>
            <form className="inline-form" onSubmit={submit}>
              <input
                aria-label="Course code"
                placeholder="CSCE 1030"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
              <input
                aria-label="Course name"
                placeholder="Programming Fundamentals"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Button type="submit">Save course</Button>
            </form>
            {error && <p className="form-message">{error}</p>}
          </Card>
        )}
        <div className="course-grid academic-course-grid">
          {loading ? (
            <p>Loading courses…</p>
          ) : courses.length ? (
            courses.map((course, index) => (
              <CourseCard
                onOpen={() => navigate(`/study/${course.id}`)}
                course={{
                  code: course.course_code,
                  name: course.course_name,
                  color: tones[index % 3],
                  next:
                    assignments.find(
                      (a) =>
                        a.course_id === course.id && a.status !== "completed",
                    )?.title ?? "Nothing due soon",
                }}
                key={course.id}
              />
            ))
          ) : (
            <Card>
              <h3>No courses yet</h3>
              <p>Add your first course to start building your study hub.</p>
            </Card>
          )}
        </div>
      </main>
    </>
  )
}
