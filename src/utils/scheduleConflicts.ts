import type { PlanningConflict } from "../../supabase/functions/_shared/smartPlanning"

export function scheduleConflictKey(conflict: PlanningConflict) {
  return [
    conflict.source,
    conflict.firstSessionId,
    conflict.firstStartAt,
    conflict.firstEndAt,
    conflict.secondSessionId,
    conflict.secondStartAt,
    conflict.secondEndAt,
  ].join("|")
}

export function dismissScheduleConflict(current: ReadonlySet<string>, conflict: PlanningConflict) {
  const next = new Set(current)
  next.add(scheduleConflictKey(conflict))
  return next
}

export function firstUndismissedConflict(conflicts: PlanningConflict[], dismissed: ReadonlySet<string>) {
  return conflicts.find((conflict) => !dismissed.has(scheduleConflictKey(conflict))) ?? null
}

export function scheduleConflictEditPath(conflict: PlanningConflict) {
  return `/calendar?item=${encodeURIComponent(conflict.firstSessionId)}&type=session`
}
