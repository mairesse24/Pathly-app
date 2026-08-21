export type CompanionIntent = {
  wantsPlanning: boolean
  wantsLecture: boolean
  wantsSyllabus: boolean
  wantsRoadmap: boolean
  wantsNotes: boolean
  wantsDegree: boolean
}

/**
 * Detects which stored-context lookups a Companion message actually calls for. A bare
 * greeting or other small talk matches none of these, so the request-scoped fetches below
 * (assignments, exams, notes, degree audit, etc.) are skipped for it. Note that none of
 * these gate whether a *general-knowledge* question gets answered -- that's a system-prompt
 * concern (see companionPrompt.ts's tier-1 handling), not a retrieval concern: a question can
 * be answered from the model's own knowledge whether or not any of these match.
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
    // Course Roadmap entries are the syllabus-derived week/topic schedule for a course, so
    // "what topics/what are we covering/what's on the schedule" questions need that source
    // even though they don't mention "syllabus" by name.
    wantsRoadmap:
      /topic|covering|roadmap|course schedule|schedule of the course|week.?by.?week/.test(
        lower,
      ),
    wantsNotes:
      /note|summary|key concept|flashcard|practice question|study material|explain|quiz/.test(
        lower,
      ),
    // "Help me plan next semester" mentions neither "degree" nor "graduat[e]" -- without this,
    // that exact question never fetched Degree Planner context at all, so Companion had no
    // remaining-requirement data to plan from and fell back to asking the student to upload
    // catalogs/prerequisites/offerings, even when a confirmed Degree Audit already existed.
    wantsDegree:
      /degree|graduat|requirement.*left|credits.*completed|academic progress|next semester|semester.*plan|plan.*semester/.test(
        lower,
      ),
  }
}
