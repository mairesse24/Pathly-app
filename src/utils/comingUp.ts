import { dateKey } from "./dateTime.ts"

export type ComingUpKind = "assignment" | "exam" | "session"
export type ComingUpItem = {
  kind: ComingUpKind
  id: string
  title: string
  courseCode: string | null
  at: string
  detail: string | null
}

// Structural subsets of AssignmentRecord/ExamRecord/StudySessionRecord/
// CourseRecord -- only what this function reads. The full records already
// satisfy these (extra properties are fine), and tests don't need to pad
// fixtures with unrelated required fields.
type ComingUpAssignment = { id: string; course_id: string; title: string; due_at: string | null; status: string; source?: string }
type ComingUpExam = { id: string; course_id: string; title: string; exam_at: string | null }
type ComingUpSession = { id: string; course_id: string | null; title: string; start_at: string; status: string }
type ComingUpCourse = { id: string; course_code: string }

// "Coming up" is a forward-looking list across assignments, exams, and study
// sessions. Today's own items and anything overdue belong to the Today/
// overdue-attention surfaces instead (the smart-plan "Today's focus" card
// and Calendar's overdue review), so this only includes items strictly
// after today. Active-course scoping is expected to already be applied by
// the caller (AcademicDataContext already filters assignments/exams/
// studySessions to active courses before exposing them).
export function buildComingUpItems(input: {
  assignments: ComingUpAssignment[]
  exams: ComingUpExam[]
  studySessions: ComingUpSession[]
  courses: ComingUpCourse[]
  timezone?: string | null
  now?: Date
}): ComingUpItem[] {
  const today = dateKey(input.now ?? new Date(), input.timezone)
  const courseCode = (id: string | null) =>
    input.courses.find((course) => course.id === id)?.course_code ?? null

  const items: ComingUpItem[] = []

  for (const assignment of input.assignments) {
    if (assignment.status === "completed") continue
    if (!assignment.due_at) continue
    if (dateKey(assignment.due_at, input.timezone) <= today) continue
    items.push({
      kind: "assignment",
      id: assignment.id,
      title: assignment.title,
      courseCode: courseCode(assignment.course_id),
      at: assignment.due_at,
      detail: assignment.status.replace(/_/g, " "),
    })
  }

  for (const exam of input.exams) {
    if (!exam.exam_at) continue
    if (dateKey(exam.exam_at, input.timezone) <= today) continue
    items.push({
      kind: "exam",
      id: exam.id,
      title: exam.title,
      courseCode: courseCode(exam.course_id),
      at: exam.exam_at,
      detail: null,
    })
  }

  for (const session of input.studySessions) {
    if (session.status !== "scheduled") continue
    if (dateKey(session.start_at, input.timezone) <= today) continue
    items.push({
      kind: "session",
      id: session.id,
      title: session.title,
      courseCode: courseCode(session.course_id),
      at: session.start_at,
      detail: null,
    })
  }

  return items.sort((a, b) => a.at.localeCompare(b.at))
}
