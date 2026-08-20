import type { CourseRoadmapEntryRecord } from "../types/academic"

// Synthesizes free text for the existing organize-course-notes pipeline
// (title + pasted text) from a roadmap entry, so "Study this topic" can
// reuse it as-is instead of the edge function needing a separate
// topic-only input mode.
export function buildRoadmapStudyText(entry: Pick<CourseRoadmapEntryRecord, "period_label" | "topic" | "description" | "deliverable">) {
  const lines = [`Course roadmap topic: ${entry.topic}`]
  if (entry.period_label) lines.push(`Period: ${entry.period_label}`)
  if (entry.description) lines.push(entry.description)
  if (entry.deliverable) lines.push(`Related deliverable: ${entry.deliverable}`)
  return lines.join("\n")
}

// Prefills a study session's title from a roadmap entry -- used both by
// "Plan study session" (Course Detail -> Calendar) and by the optional
// roadmap-topic picker inside the Calendar's own session form. A roadmap
// entry is never itself a calendar item, so this only ever seeds a title a
// student still reviews and saves themselves; it never schedules anything.
export function roadmapSessionTitle(entry: Pick<CourseRoadmapEntryRecord, "period_label" | "topic">) {
  return entry.period_label ? `${entry.period_label} — ${entry.topic}` : entry.topic
}
