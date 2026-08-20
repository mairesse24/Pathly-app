import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const calendar = readFileSync(new URL("../src/pages/Calendar/index.tsx", import.meta.url), "utf8")
const courseDetail = readFileSync(new URL("../src/pages/CourseDetail/index.tsx", import.meta.url), "utf8")

// Class meetings and exams must use the real past/upcoming helpers, not a
// literal always-blue/always-rose tone, so a past week's meetings and exams
// actually get muted instead of looking identical to future ones.
assert.match(calendar, /classMeetingStatus\(days\[day\],\s*today\)/, "meeting tone must be computed from classMeetingStatus, not a fixed tone")
assert.match(calendar, /examEventStatus\(dateKey\(e\.exam_at!,\s*timezone\),\s*today\)/, "exam tone must be computed from examEventStatus, not a fixed tone")

// Study sessions must never receive an assignment-shaped eventStatus --
// that's the only thing that renders the "✓ Completed"/"Overdue" text, and
// a session is neither.
const sessionMapping = calendar.match(/\.\.\.studySessions\.map\(s=>\(\{[^}]*\}\)\)/)
assert.ok(sessionMapping, "studySessions mapping must exist in the events list")
assert.doesNotMatch(sessionMapping[0], /eventStatus/, "a study session must never carry an eventStatus (no Completed/Overdue text)")

// Sessions must render with their own distinct marker, independent of tone
// color alone (color-blind/contrast-safe distinction).
assert.match(calendar, /study-session-event/, "session events must carry a distinct CSS class")
assert.match(calendar, /event-kind-label/, "session events must carry a distinct visible label")

// The study-session form: date and end time are always required (already
// true for date/exam-time elsewhere); title becomes optional and start
// time becomes required specifically for the session kind, matching
// "optional study goal/title" + "required start time" from the spec.
assert.match(calendar, /required=\{kind!== ?"session"\}/, "title must not be required when creating a study session")
assert.match(calendar, /type="time" required=\{kind===\s*"session"\}/, "start time must be required specifically for study sessions")

// A blank session title must still satisfy the NOT NULL title column with
// a sensible default, never an empty string reaching Supabase.
assert.match(calendar, /title\.trim\(\)\|\|\(courseId\?`\$\{course\(courseId\)\} study session`:"Study session"\)/, "a blank session title must fall back to a sensible default before saving")

// "Plan study session" must only ever prefill and open the dialog -- it
// must never call createStudySession itself, or a session could be
// scheduled without the student choosing/approving a date and time.
const planEffect = calendar.match(/useEffect\(\(\)=>\{\s*const plan=[\s\S]*?\},\[location\.state\]\)/)
assert.ok(planEffect, "Calendar must consume a planSession navigation state")
assert.doesNotMatch(planEffect[0], /createStudySession/, "consuming a planned session must never call createStudySession directly")
assert.match(planEffect[0], /setDialogOpen\(true\)/, "consuming a planned session must open the dialog for the student to confirm")

// Course Detail: the roadmap card must actually load and render real
// entries (no fabricated data), and must offer both actions the spec asks
// for from a roadmap topic -- planning a session and generating materials
// -- without auto-generating anything for every week on page load.
assert.match(courseDetail, /listCourseRoadmap\(courseId\)/, "Course Detail must load real roadmap entries for this course")
assert.match(courseDetail, /roadmap\.map\(\(entry\)/, "Course Detail must render the loaded roadmap entries")
assert.match(courseDetail, /navigate\("\/calendar",\s*\{\s*state:\s*\{\s*planSession:/, "Plan study session must hand off to Calendar via navigation state, not create anything itself")
assert.doesNotMatch(courseDetail, /roadmap\.(forEach|map)\([^)]*generateStudyMaterials/, "study materials must never be auto-generated for every roadmap entry")

console.log("calendar/roadmap/study-session integration: past meetings/exams muted, sessions distinct and never auto-scheduled, roadmap feeds real Plan/Generate actions")
