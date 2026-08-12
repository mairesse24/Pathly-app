const universitySuggestions = [
  "Arizona State University",
  "Ohio State University",
  "Texas A&M University",
  "University of Florida",
  "University of North Texas",
  "University of Texas at Austin",
];

export function searchUniversitySuggestions(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return universitySuggestions;
  return universitySuggestions.filter((name) =>
    name.toLowerCase().includes(normalized),
  );
}
