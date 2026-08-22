export type SavedDateTiming = "past" | "today" | "future"

// Pure date-key comparison (YYYY-MM-DD strings sort correctly
// lexicographically), kept separate from the save flow so the
// past/today/future decision behind the Calendar save confirmation is
// independently testable.
export function classifySavedDate(savedDate: string, today: string): SavedDateTiming {
  if (savedDate < today) return "past"
  if (savedDate === today) return "today"
  return "future"
}
