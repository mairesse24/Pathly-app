import { addDays, weekKeys } from "./dateTime.ts"

export function calendarWeekDays(anchor: string, timezone?: string | null) {
  return weekKeys(timezone, new Date(`${anchor}T12:00:00Z`))
}

export function shiftCalendarWeek(anchor: string, amount: number, timezone?: string | null) {
  const [monday] = calendarWeekDays(anchor, timezone)
  return addDays(monday, amount * 7)
}
