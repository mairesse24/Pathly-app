type CourseScope = {
  id: string
  is_active?: boolean | null
}

type CourseScopedItem = {
  course_id: string | null
}

/**
 * Keeps current-planning data constrained to the active Study Hub courses.
 * A missing `is_active` is treated as active for compatibility with callers
 * that have already filtered at the database boundary.
 */
export function activeCourseIds(courses: CourseScope[]) {
  return new Set(
    courses
      .filter((course) => course.is_active !== false)
      .map((course) => course.id),
  )
}

export function filterActiveCourseItems<T extends CourseScopedItem>(
  items: T[],
  courseIds: Set<string>,
  includeUnscoped = false,
) {
  return items.filter(
    (item) =>
      (includeUnscoped && item.course_id === null) ||
      (item.course_id !== null && courseIds.has(item.course_id)),
  )
}
