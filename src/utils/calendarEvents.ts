import { assignmentEventStatus, calendarEventTitle, examEventStatus, type CalendarEventStatus } from "./calendarEventPresentation.ts"
import { dateKey, formatInstant } from "./dateTime.ts"

// Structural subsets of AssignmentRecord/ExamRecord/StudySessionRecord/CourseRecord --
// only what this function reads, mirroring the pattern already used in comingUp.ts. Extracted
// from Calendar.tsx's inline events useMemo so the "what actually lands on the main commitment
// Calendar" logic is a plain, testable function instead of only reachable by rendering the page.
export type CalendarSourceAssignment = { id: string; course_id: string; title: string; due_at: string | null; status: string; source: string }
export type CalendarSourceExam = { id: string; course_id: string; title: string; exam_at: string | null }
export type CalendarSourceSession = { id: string; course_id: string | null; title: string; start_at: string }
export type CalendarSourceCourse = { id: string; course_code: string }

export type CalendarEventKind = "assignment" | "exam" | "session"
export type CalendarEvent<A, E, S> = {
  id: string
  kind: CalendarEventKind
  day: number
  title: string
  time: string
  tone: string
  record: A | E | S
  canvasOwned?: boolean
  eventStatus?: CalendarEventStatus
}

// Builds every event the week grid renders, for whichever week `days` describes -- an item
// whose local date isn't in `days` gets day === -1 and is naturally filtered out by the caller
// (Calendar.tsx renders `events.filter(event => event.day === index)` per column), exactly as
// before this extraction. This is a pure relocation of that inline logic, not a rewrite: same
// inputs, same day/tone/status computation, same output shape.
//
// Only assignments/exams that carry a real due_at/exam_at ever produce an event here -- an
// approved syllabus item with no printed date (a roadmap-only topic, lecture, or holiday) was
// never turned into an assignment/exam row in the first place (see
// approve_syllabus_processing), and even if one somehow existed with a null date, the filter
// below excludes it from the main commitment Calendar.
export function buildCalendarEvents<
  A extends CalendarSourceAssignment,
  E extends CalendarSourceExam,
  S extends CalendarSourceSession,
>(input: {
  assignments: A[]
  exams: E[]
  studySessions: S[]
  courses: CalendarSourceCourse[]
  days: string[]
  today: string
  timezone?: string | null
}): CalendarEvent<A, E, S>[] {
  const courseCode = (id: string | null) => input.courses.find((course) => course.id === id)?.course_code ?? "Course"
  const dayIndex = (iso: string) => input.days.indexOf(dateKey(iso, input.timezone))
  const eventTime = (iso: string) => formatInstant(iso, input.timezone, { hour: "numeric", minute: "2-digit" })

  const assignmentEvents: CalendarEvent<A, E, S>[] = input.assignments
    .filter((assignment) => assignment.due_at)
    .map((assignment) => {
      const dueAt = assignment.due_at as string
      const status = assignmentEventStatus(assignment.status, dateKey(dueAt, input.timezone), input.today)
      return {
        id: assignment.id,
        kind: "assignment",
        day: dayIndex(dueAt),
        title: calendarEventTitle(courseCode(assignment.course_id), assignment.title),
        time: eventTime(dueAt),
        tone: status === "completed" ? "done" : status === "overdue" ? "rose" : "gold",
        record: assignment,
        canvasOwned: assignment.source === "canvas",
        eventStatus: status,
      }
    })

  const examEvents: CalendarEvent<A, E, S>[] = input.exams
    .filter((exam) => exam.exam_at)
    .map((exam) => {
      const examAt = exam.exam_at as string
      const past = examEventStatus(dateKey(examAt, input.timezone), input.today) === "past"
      return {
        id: exam.id,
        kind: "exam",
        day: dayIndex(examAt),
        title: calendarEventTitle(courseCode(exam.course_id), exam.title),
        time: eventTime(examAt),
        tone: past ? "history" : "rose",
        record: exam,
      }
    })

  const sessionEvents: CalendarEvent<A, E, S>[] = input.studySessions.map((session) => ({
    id: session.id,
    kind: "session",
    day: dayIndex(session.start_at),
    title: session.title,
    time: eventTime(session.start_at),
    tone: "sage",
    record: session,
  }))

  return [...assignmentEvents, ...examEvents, ...sessionEvents]
}
