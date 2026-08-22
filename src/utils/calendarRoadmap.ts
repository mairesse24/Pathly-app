import type { CourseRoadmapEntryRecord } from "../types/academic.ts"

type RoadmapCourse = { id: string; course_code: string }

export type RoadmapCalendarEvent = {
  id: string
  kind: "roadmap"
  day: number
  title: string
  label: "Course roadmap"
  courseId: string
  record: CourseRoadmapEntryRecord
}

export function hasReliableRoadmapDate(entry: CourseRoadmapEntryRecord) {
  if (!entry.entry_date) return false
  return !entry.roadmap_item_key?.startsWith("reconciled:assignment:")
}

export function buildRoadmapCalendarEvents(input: {
  roadmapEntries: CourseRoadmapEntryRecord[]
  courses: RoadmapCourse[]
  days: string[]
}) {
  const courseCode = (id: string) => input.courses.find((course) => course.id === id)?.course_code ?? "Course"
  const seen = new Set<string>()
  const events: RoadmapCalendarEvent[] = []

  for (const entry of input.roadmapEntries) {
    if (!hasReliableRoadmapDate(entry) || seen.has(entry.id)) continue
    seen.add(entry.id)
    const day = input.days.indexOf(entry.entry_date as string)
    if (day < 0) continue
    events.push({
      id: entry.id,
      kind: "roadmap",
      day,
      title: `${courseCode(entry.course_id)} — ${entry.topic}`,
      label: "Course roadmap",
      courseId: entry.course_id,
      record: entry,
    })
  }

  return events
}
