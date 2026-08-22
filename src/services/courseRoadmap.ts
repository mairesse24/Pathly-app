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

export async function listCourseRoadmaps(courseIds: string[]) {
  if (!courseIds.length) return []
  const { data, error } = await supabase
    .from("course_roadmap_entries")
    .select("id,user_id,course_id,period_label,topic,description,deliverable,entry_date,source,sort_order,roadmap_item_key")
    .in("course_id", courseIds)
    .not("entry_date", "is", null)
    .order("entry_date", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
  if (error) throw error
  return data as CourseRoadmapEntryRecord[]
}

// Pure presentation helpers live in utils/roadmapPresentation.ts (no
// Supabase import) so they can run under plain `node --test`; re-exported
// here so existing callers keep importing everything roadmap-related from
// this one service module.
export { buildRoadmapStudyText, roadmapSessionTitle } from "../utils/roadmapPresentation"
