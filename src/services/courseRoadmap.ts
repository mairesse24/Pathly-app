import { supabase } from "../lib/supabase"
import type { CourseRoadmapEntryRecord } from "../types/academic"

export async function listCourseRoadmap(courseId: string) {
  const { data, error } = await supabase
    .from("course_roadmap_entries")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true })
  if (error) throw error
  return data as CourseRoadmapEntryRecord[]
}

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
