export function formatCatalogYear(value?: number | null) {
  return value ? `${value}–${value + 1}` : "Not provided"
}

