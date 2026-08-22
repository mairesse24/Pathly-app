export type CourseIdentityState = "match" | "mismatch" | "unknown"

export const normalizeCourseCode = (value: string | null | undefined) =>
  value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || ""

const normalizeTitle = (value: string | null | undefined) =>
  value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") || ""

// Splits a course code into its department prefix (letters) and its
// number/section identity (everything else, alphanumeric only). A document
// code that omits the department prefix (e.g. "3600.004" instead of
// "CSCE 3600.004") can safely inherit it from the selected course, so the
// prefix and the identity are compared separately rather than as one blob.
function splitCourseCode(value: string | null | undefined): { prefix: string; identity: string } {
  const trimmed = (value || "").trim().toUpperCase()
  const match = trimmed.match(/^([A-Z]+)\s*(.*)$/)
  const prefix = match ? match[1] : ""
  const remainder = match ? match[2] : trimmed
  return { prefix, identity: remainder.replace(/[^A-Z0-9]/g, "") }
}

// True when two course codes refer to the same course: identical
// number/section identity, and either the department prefix agrees or one
// side omitted it entirely (safely inheritable). Two explicit, differing
// prefixes (e.g. CSCE vs MATH) are never treated as the same course.
export function courseCodesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = splitCourseCode(a)
  const right = splitCourseCode(b)
  if (!left.identity || !right.identity || left.identity !== right.identity) return false
  if (left.prefix && right.prefix && left.prefix !== right.prefix) return false
  return true
}

export function classifyCourseIdentity(input: {
  documentCode: string | null | undefined
  documentTitle: string | null | undefined
  selectedCode: string | null | undefined
  selectedTitle: string | null | undefined
}): CourseIdentityState {
  const documentSplit = splitCourseCode(input.documentCode)
  const selectedSplit = splitCourseCode(input.selectedCode)
  if (documentSplit.identity && selectedSplit.identity)
    return courseCodesMatch(input.documentCode, input.selectedCode) ? "match" : "mismatch"

  const documentTitle = normalizeTitle(input.documentTitle)
  const selectedTitle = normalizeTitle(input.selectedTitle)
  if (!documentSplit.identity && documentTitle && selectedTitle && documentTitle === selectedTitle) return "match"
  return "unknown"
}
