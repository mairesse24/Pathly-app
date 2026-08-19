export type CalendarEventStatus = "completed" | "overdue" | "upcoming"

// Calendar events must always show the real, specific title a student (or
// Canvas, or a syllabus import) gave the item -- never a generic label
// like "Assignment" -- prefixed with the course code so events from
// different courses stay distinguishable on a shared week grid. This is
// intentionally source-agnostic: manual, Canvas, and syllabus-imported
// items are formatted identically.
export function calendarEventTitle(courseCode: string, itemTitle: string): string {
  return `${courseCode} — ${itemTitle}`
}

// Pure date-key comparison, mirroring classifySavedDate: a completed
// assignment is always "completed" regardless of its due date, an
// incomplete assignment due before today is "overdue", and everything
// else (including a null due date, which the calendar filters out before
// calling this) is "upcoming".
export function assignmentEventStatus(status: string, dueDateKey: string | null, todayKey: string): CalendarEventStatus {
  if (status === "completed") return "completed"
  if (dueDateKey && dueDateKey < todayKey) return "overdue"
  return "upcoming"
}
