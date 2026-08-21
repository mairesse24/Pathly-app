export type SyllabusReviewActionState = {
  hasCourseDetails: boolean
  roadmapCount: number
  datedItemCount: number
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function buildSyllabusReviewActionLabel({
  hasCourseDetails,
  roadmapCount,
  datedItemCount,
}: SyllabusReviewActionState) {
  const actions: string[] = []

  if (hasCourseDetails) actions.push("course details")
  if (roadmapCount > 0)
    actions.push(countLabel(roadmapCount, "roadmap entry", "roadmap entries"))
  if (datedItemCount > 0)
    actions.push(`${countLabel(datedItemCount, "item", "items")} to Calendar`)

  if (!actions.length) return null
  if (actions.length === 1) {
    if (hasCourseDetails) return "Save course details"
    if (roadmapCount > 0) return `Save ${actions[0]}`
    return `Add ${actions[0]}`
  }

  const last = actions.pop()
  return `Save ${actions.join(", ")} and ${last}`
}
