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

// A recurring class meeting is neither overdue nor completed -- those are
// assignment states. Once its date has passed it becomes history: still
// visible for context, just visually muted, distinct from "upcoming".
export type ClassMeetingStatus = "past" | "upcoming"
export function classMeetingStatus(meetingDateKey: string, todayKey: string): ClassMeetingStatus {
  return meetingDateKey < todayKey ? "past" : "upcoming"
}

// Exams have no completion state in this product (there's nothing to mark
// "done" the way an assignment can be submitted) -- a past exam is only
// ever "past" history, muted the same way a past class meeting is, never
// "completed".
export type ExamEventStatus = "past" | "upcoming"
export function examEventStatus(examDateKey: string, todayKey: string): ExamEventStatus {
  return examDateKey < todayKey ? "past" : "upcoming"
}
