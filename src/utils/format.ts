export function pluralize(value: number, singular: string) { return `${value} ${singular}${value === 1 ? "" : "s"}`; }
