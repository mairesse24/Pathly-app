export type CompanionIntent = {
  wantsPlanning: boolean
  wantsLecture: boolean
  wantsSyllabus: boolean
  wantsNotes: boolean
  wantsDegree: boolean
}

/**
 * Detects which stored-context lookups a Companion message actually calls for. A bare
 * greeting or other small talk matches none of these, so the request-scoped fetches below
 * (assignments, exams, notes, degree audit, etc.) are skipped for it.
 */
export function classifyCompanionIntent(message: string): CompanionIntent {
  const lower = message.toLowerCase()
  return {
    wantsPlanning:
      /today|tonight|plan|focus|week|coming up|assignment|exam|schedule|energy/.test(
        lower,
      ),
    wantsLecture:
      /lecture|quiz|explain|concept|material|oscilloscope|waveform|uav|hardware/.test(
        lower,
      ),
    wantsSyllabus: /syllabus|deadline|requirement|course info|grading/.test(lower),
    wantsNotes:
      /note|summary|key concept|flashcard|practice question|study material|explain|quiz/.test(
        lower,
      ),
    wantsDegree:
      /degree|graduat|requirement.*left|credits.*completed|academic progress/.test(
        lower,
      ),
  }
}
