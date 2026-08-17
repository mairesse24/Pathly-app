import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { CourseCard } from "../../components/study/CourseCard"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"
import { getCourseDeletionImpact } from "../../services/courses"
import type { CourseRecord } from "../../types/academic"
export function StudyHubPage() {
  const navigate = useNavigate()
  const tones = ["sage", "gold", "clay"] as const
  const { courses, assignments, loading, addCourse, updateCourse, removeCourse } = useAcademicData()
  const [adding, setAdding] = useState(false),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),[editing,setEditing]=useState<CourseRecord|null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      if(editing)await updateCourse(editing.id,{course_code:code,course_name:name});else await addCourse({ course_code: code, course_name: name })
      setCode("")
      setName("")
      setAdding(false)
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to add course")
    }
  }
  function beginEdit(course:CourseRecord){setEditing(course);setCode(course.course_code);setName(course.course_name);setAdding(true);setError("")}
  async function remove(course:CourseRecord){try{const impact=await getCourseDeletionImpact(course.id);const linked=impact.assignments+impact.exams+impact.studySessions+impact.processedMaterials;const detail=linked?`Pathly found ${impact.assignments} assignment(s), ${impact.exams} exam(s), ${impact.studySessions} study session(s), and ${impact.processedMaterials} processed material result(s). The course cannot be deleted until those linked records are moved or removed.`:`Uploaded source files (${impact.uploads}) will remain safely stored but become unassigned. Completed coursework and degree-plan history are not deleted.`;if(!window.confirm(`Delete ${course.course_code}?\n\n${detail}`))return;if(linked)throw new Error("Move or remove linked academic items before deleting this course.");await removeCourse(course.id)}catch(reason){setError(reason instanceof Error?reason.message:"Unable to delete this course.")}}
  return (
    <>
      <PageHeader title="Study hub" materialContext={{origin:"study"}} />
      <main className="page">
        <div className="intro-row">
          <div>
            <h2>Learn in the way that helps it stick.</h2>
            <p>Your current courses, saved securely to your account.</p>
          </div>
          <Button onClick={() => {setAdding(!adding);setEditing(null);setCode("");setName("")}}>+ Add course</Button>
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
              <Button type="submit">{editing?"Save changes":"Save course"}</Button>
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
                onEdit={()=>beginEdit(course)}
                onDelete={()=>void remove(course)}
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
