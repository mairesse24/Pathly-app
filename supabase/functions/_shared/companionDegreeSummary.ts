export type AuditRequirementGroupSummary = {
  requirement_label: string | null
  status: string | null
  credits_required: unknown
  credits_completed: unknown
  credits_remaining: unknown
  applied_course_codes: string[]
  details: string | null
}

/**
 * A confirmed degree audit's requirement groups carry a full nested
 * user_degree_requirements row per applied course (requirement_type, course_code,
 * requirement_text, status, credits_applied, application_source repeated on every row) --
 * raw, that's the same shape the extraction schema itself was recently found to over-produce
 * with (see the Degree Audit extraction fix), and dumping it straight into the prompt repeats
 * requirement_text verbatim once per applied course and blows past compact()'s per-item
 * budget with noise rather than signal on a large audit. Collapse each group to the figures
 * and course codes Companion actually needs to answer a progress/next-semester question --
 * this is presentation-only, never used for the deterministic matching logic in index.ts,
 * which still reads the raw auditPlan.user_degree_requirement_groups it was given.
 */
export function summarizeAuditRequirementGroups(groups: unknown): AuditRequirementGroupSummary[] {
  return (Array.isArray(groups) ? groups : []).slice(0, 40).map((group: any) => {
    const applications = Array.isArray(group?.user_degree_requirements) ? group.user_degree_requirements : []
    const appliedCourseCodes = [...new Set(
      applications
        .filter((item: any) => item?.application_source === "degree_audit" && item?.course_code)
        .map((item: any) => item.course_code),
    )].slice(0, 15) as string[]
    return {
      requirement_label: group?.requirement_label ?? null,
      status: group?.status ?? null,
      credits_required: group?.credits_required ?? null,
      credits_completed: group?.credits_completed ?? null,
      credits_remaining: group?.credits_remaining ?? null,
      applied_course_codes: appliedCourseCodes,
      details: typeof group?.details === "string" ? group.details.slice(0, 160) : null,
    }
  })
}
