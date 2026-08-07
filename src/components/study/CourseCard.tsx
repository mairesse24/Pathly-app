import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import type { CourseSummary } from "../../types/app";
export function CourseCard({ course }: { course: CourseSummary }) { return <Card className="course-card"><div className={`course-mark ${course.color}`}>{course.code}</div><div><Badge tone="gray">{course.code}</Badge><h3>{course.name}</h3><p>{course.next}</p></div><button className="text-button">Open course <Icon name="arrow" size={16}/></button></Card>; }
