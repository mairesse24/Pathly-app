import { Card } from "../ui/Card"
import { Icon } from "../ui/Icon"
import type { CourseSummary } from "../../types/app"
export function CourseCard({
  course,
  onOpen,
  onEdit,
  onDelete,
}: {
  course: CourseSummary
  onOpen: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <Card className="course-card">
      <div className="course-card-heading"><div className={`course-mark ${course.color}`}>{course.code}</div><details className="course-menu"><summary aria-label={`Actions for ${course.code}`}>⋯</summary><div><button onClick={onEdit}>Edit course</button><button onClick={onDelete}>Delete course</button></div></details></div>
      <div className="course-card-copy">
        <h3>{course.name}</h3>
        <p>{course.next}</p>
      </div>
      <button className="text-button" onClick={onOpen}>
        Open course <Icon name="arrow" size={16} />
      </button>
    </Card>
  )
}
