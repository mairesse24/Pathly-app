export type CourseIdentityState = "match" | "mismatch" | "unknown"

export const normalizeCourseCode = (value: string | null | undefined) =>
  value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || ""

const normalizeTitle = (value: string | null | undefined) =>
  value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") || ""

export function classifyCourseIdentity(input: {
  documentCode: string | null | undefined
  documentTitle: string | null | undefined
  selectedCode: string | null | undefined
  selectedTitle: string | null | undefined
}): CourseIdentityState {
  const documentCode = normalizeCourseCode(input.documentCode)
  const selectedCode = normalizeCourseCode(input.selectedCode)
  if (documentCode && selectedCode) return documentCode === selectedCode ? "match" : "mismatch"

  const documentTitle = normalizeTitle(input.documentTitle)
  const selectedTitle = normalizeTitle(input.selectedTitle)
  if (!documentCode && documentTitle && selectedTitle && documentTitle === selectedTitle) return "match"
  return "unknown"
}
