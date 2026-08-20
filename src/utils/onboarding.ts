import type { AcademicDetailsInput, ProfileMetadata } from "../services/profiles"

export function hasRequiredAcademicDetails(value: AcademicDetailsInput) {
  return Boolean(
    value.university.trim() &&
      value.major.trim() &&
      value.expected_graduation_term &&
      value.graduation_year,
  )
}

export function needsOnboarding(profile: Pick<ProfileMetadata, "onboarding_completed">) {
  return !profile.onboarding_completed
}
