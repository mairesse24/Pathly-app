import type { CourseRecord } from "../types/academic"
import { courseCodesMatch, normalizeCourseCode } from "./courseIdentity.ts"

const clean = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ") || ""

export function syllabusCourseDraft(courseCode: string | null | undefined, courseTitle: string | null | undefined) {
  const code = clean(courseCode)
  return { courseCode: code, courseTitle: clean(courseTitle) || code }
}

export function findReusableSyllabusCourse(courses: CourseRecord[], courseCode: string) {
  const normalized = normalizeCourseCode(courseCode)
  if (!normalized) return undefined
  return courses.find((course) => normalizeCourseCode(course.course_code) === normalized || courseCodesMatch(course.course_code, courseCode))
}

// Display cleanup only: stored course data is never rewritten by the selector.
export function formatSyllabusCourseOption(course: Pick<CourseRecord, "course_code" | "course_name">) {
  const code = clean(course.course_code).toUpperCase() || "COURSE"
  const name = clean(course.course_name) || "Untitled course"
  return `${code} — ${name}`
}
