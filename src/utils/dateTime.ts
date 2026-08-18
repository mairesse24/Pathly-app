1| export function browserTimeZone() {
2|   try {
3|     return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
4|   } catch {
5|     return "UTC"
6|   }
7| }
8| 
9| export function validTimeZone(value?: string | null) {
10|   if (!value) return browserTimeZone()
11|   try {
12|     new Intl.DateTimeFormat("en-US", { timeZone: value }).format()
13|     return value
14|   } catch {
15|     return browserTimeZone()
16|   }
17| }
18| 
19| export function dateKey(value: Date | string, timeZone?: string | null) {
20|   const date = typeof value === "string" ? new Date(value) : value
21|   const parts = new Intl.DateTimeFormat("en-US", {
22|     timeZone: validTimeZone(timeZone),
23|     year: "numeric",
24|     month: "2-digit",
25|     day: "2-digit",
26|   }).formatToParts(date)
27|   const part = (type: Intl.DateTimeFormatPartTypes) =>
28|     parts.find((item) => item.type === type)?.value
29|   return `${part("year")}-${part("month")}-${part("day")}`
30| }
31| 
32| export function todayKey(timeZone?: string | null, now = new Date()) {
33|   return dateKey(now, timeZone)
34| }
35| 
36| export function dayGreeting(timeZone?: string | null, now = new Date()) {
37|   const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: validTimeZone(timeZone), hour: "2-digit", hourCycle: "h23" }).format(now))
38|   if (hour < 12) return "Good morning"
39|   if (hour < 18) return "Good afternoon"
40|   return "Good evening"
41| }
42| 
43| export function addDays(key: string, days: number) {
44|   const date = new Date(`${key}T12:00:00Z`)
45|   date.setUTCDate(date.getUTCDate() + days)
46|   return date.toISOString().slice(0, 10)
47| }
48| 
49| export function weekKeys(timeZone?: string | null, now = new Date()) {
50|   const today = todayKey(timeZone, now)
51|   const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
52|   const monday = addDays(today, -((weekday + 6) % 7))
53|   return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
54| }
55| 
56| export function formatDateKey(
57|   key: string,
58|   options: Intl.DateTimeFormatOptions,
59| ) {
60|   return new Intl.DateTimeFormat(undefined, {
61|     ...options,
62|     timeZone: "UTC",
63|   }).format(new Date(`${key}T12:00:00Z`))
64| }
65| 
66| export function formatInstant(
67|   value: string,
68|   timeZone: string | null | undefined,
69|   options: Intl.DateTimeFormatOptions,
70| ) {
71|   return new Intl.DateTimeFormat(undefined, {
72|     ...options,
73|     timeZone: validTimeZone(timeZone),
74|   }).format(new Date(value))
75| }
76| 
