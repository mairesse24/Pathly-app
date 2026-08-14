export type PlanningAssignment = {
  id: string
  course_id: string
  title: string
  due_at: string | null
  estimated_minutes: number | null
  status: string
}

export type PlanningExam = {
  id: string
  course_id: string
  title: string
  exam_at: string | null
}

export type PlanningSession = {
  id: string
  course_id: string | null
  assignment_id: string | null
  title: string
  start_at: string
  end_at: string
  status: string
}

export type PlanningReflection = {
  mood: string | null
  energy: string | null
}

export type PlanningPreferences = {
  preferred_study_time?: string | null
  focus_session_minutes?: number | null
  prefers_breaks?: boolean | null
  break_duration_minutes?: number | null
}

export type PlanningCourse = {
  id: string
  course_code: string
  course_name?: string
}

export type PlanningPriority = {
  id: string
  kind: "assignment" | "exam"
  courseId: string
  courseCode: string
  title: string
  reason: string
  suggestedMinutes: number
  overdue: boolean
  needsStatusConfirmation: boolean
  score: number
}

export type PlanningConflict = {
  firstSessionId: string
  secondSessionId: string
  message: string
}

export type SmartPlan = {
  priorities: PlanningPriority[]
  conflicts: PlanningConflict[]
  energyAdjustment: "low" | "high" | "none"
}

export type SmartPlanInput = {
  assignments: PlanningAssignment[]
  exams: PlanningExam[]
  studySessions: PlanningSession[]
  courses: PlanningCourse[]
  reflection?: PlanningReflection | null
  preferences?: PlanningPreferences | null
  timeZone: string
  now?: Date
}

const DAY_MS = 86_400_000

function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
    return value
  } catch {
    return "UTC"
  }
}

function localDateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

function calendarDaysBetween(from: Date, to: Date, timeZone: string) {
  const start = new Date(`${localDateKey(from, timeZone)}T12:00:00Z`)
  const end = new Date(`${localDateKey(to, timeZone)}T12:00:00Z`)
  return Math.round((end.getTime() - start.getTime()) / DAY_MS)
}

function energyAdjustment(reflection?: PlanningReflection | null) {
  const value = `${reflection?.energy || ""} ${reflection?.mood || ""}`.toLowerCase()
  if (/low|strained|drained|tired/.test(value)) return "low" as const
  if (/high|rested|energized|good/.test(value)) return "high" as const
  return "none" as const
}

function sessionLength(preferences?: PlanningPreferences | null) {
  const value = preferences?.focus_session_minutes
  return value && value >= 10 && value <= 240 ? value : 45
}

function courseCode(courses: PlanningCourse[], courseId: string) {
  return courses.find((course) => course.id === courseId)?.course_code || "Course"
}

function scheduledMinutes(
  sessions: PlanningSession[],
  item: { course_id: string; assignment_id?: string },
  now: Date,
) {
  return sessions
    .filter((session) => {
      if (session.status !== "scheduled" || new Date(session.end_at) < now) return false
      return session.assignment_id === item.assignment_id || session.course_id === item.course_id
    })
    .reduce(
      (total, session) =>
        total + Math.max(0, (new Date(session.end_at).getTime() - new Date(session.start_at).getTime()) / 60_000),
      0,
    )
}

export function buildSmartPlan(input: SmartPlanInput): SmartPlan {
  const now = input.now || new Date()
  const energy = energyAdjustment(input.reflection)
  const preferredMinutes = sessionLength(input.preferences)
  const candidates: PlanningPriority[] = []

  for (const assignment of input.assignments) {
    if (assignment.status === "completed" || !assignment.due_at) continue
    const due = new Date(assignment.due_at)
    if (Number.isNaN(due.getTime())) continue
    const hours = (due.getTime() - now.getTime()) / 3_600_000
    const days = calendarDaysBetween(now, due, input.timeZone)
    if (hours > 7 * 24) continue
    const overdue = hours < 0
    let score = assignment.status === "in_progress" ? 10 : 5
    let reason = "Due this week"
    if (overdue) {
      score += 130
      reason = "Past due — did you submit it?"
    } else if (hours <= 24) {
      score += 115
      reason = days === 0 ? "Due today" : "Due within 24 hours"
    } else if (days <= 3) {
      score += 80 - days * 5
      reason = `Due in ${days} days`
    } else {
      score += 35
    }
    if (assignment.status === "not_started") {
      score += 8
      if (!overdue && hours > 24) reason += " · You haven't started this yet"
    }
    const planned = scheduledMinutes(
      input.studySessions,
      { course_id: assignment.course_id, assignment_id: assignment.id },
      now,
    )
    if (planned > 0 && !overdue) reason += " · Study time is already planned"
    const estimate = assignment.estimated_minutes || preferredMinutes
    const suggested = energy === "low" && !overdue
      ? Math.min(estimate, 30)
      : Math.min(estimate, preferredMinutes)
    if (estimate <= 30 && hours > 24) score += 8
    candidates.push({
      id: assignment.id,
      kind: "assignment",
      courseId: assignment.course_id,
      courseCode: courseCode(input.courses, assignment.course_id),
      title: assignment.title,
      reason,
      suggestedMinutes: Math.max(10, suggested),
      overdue,
      needsStatusConfirmation: overdue || assignment.status === "overdue" || assignment.status === "awaiting_confirmation",
      score,
    })
  }

  for (const exam of input.exams) {
    if (!exam.exam_at) continue
    const examAt = new Date(exam.exam_at)
    if (Number.isNaN(examAt.getTime()) || examAt < now) continue
    const days = calendarDaysBetween(now, examAt, input.timeZone)
    if (days > 14) continue
    let score = days <= 3 ? 95 - days * 5 : 55 - days
    const planned = scheduledMinutes(input.studySessions, { course_id: exam.course_id }, now)
    const reason = days === 0
      ? "Exam today"
      : `Exam in ${days} day${days === 1 ? "" : "s"}${planned > 0 ? " · Study time is already planned" : ""}`
    candidates.push({
      id: exam.id,
      kind: "exam",
      courseId: exam.course_id,
      courseCode: courseCode(input.courses, exam.course_id),
      title: `${exam.title} review`,
      reason,
      suggestedMinutes: energy === "low" && days > 0 ? Math.min(30, preferredMinutes) : preferredMinutes,
      overdue: false,
      needsStatusConfirmation: false,
      score,
    })
  }

  const conflicts: PlanningConflict[] = []
  const scheduled = input.studySessions
    .filter((session) => session.status === "scheduled")
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  for (let index = 0; index < scheduled.length; index += 1) {
    for (let next = index + 1; next < scheduled.length; next += 1) {
      if (new Date(scheduled[next].start_at) >= new Date(scheduled[index].end_at)) break
      conflicts.push({
        firstSessionId: scheduled[index].id,
        secondSessionId: scheduled[next].id,
        message: "You already have something planned during this time.",
      })
    }
  }
  for (const session of scheduled) {
    const start = new Date(session.start_at).getTime()
    const end = new Date(session.end_at).getTime()
    for (const exam of input.exams) {
      if (!exam.exam_at) continue
      const examTime = new Date(exam.exam_at).getTime()
      if (examTime >= start && examTime < end) {
        conflicts.push({
          firstSessionId: session.id,
          secondSessionId: exam.id,
          message: "You already have something planned during this time.",
        })
      }
    }
  }

  return {
    priorities: candidates
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, energy === "low" ? 2 : 3),
    conflicts,
    energyAdjustment: energy,
  }
}
