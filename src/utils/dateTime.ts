export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function validTimeZone(value?: string | null) {
  if (!value) return browserTimeZone()
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
    return value
  } catch {
    return browserTimeZone()
  }
}

export function dateKey(value: Date | string, timeZone?: string | null) {
  const date = typeof value === "string" ? new Date(value) : value
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: validTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function todayKey(timeZone?: string | null, now = new Date()) {
  return dateKey(now, timeZone)
}

export function dayGreeting(timeZone?: string | null, now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: validTimeZone(timeZone), hour: "2-digit", hourCycle: "h23" }).format(now))
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export function addDays(key: string, days: number) {
  const date = new Date(`${key}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function weekKeys(timeZone?: string | null, now = new Date()) {
  const today = todayKey(timeZone, now)
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
  const monday = addDays(today, -((weekday + 6) % 7))
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export function formatDateKey(
  key: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`))
}

export function formatInstant(
  value: string,
  timeZone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: validTimeZone(timeZone),
  }).format(new Date(value))
}
