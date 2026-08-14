import { PageHeader } from "../../components/layout/PageHeader"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useProfile } from "../../context/ProfileContext"
import {
  dateKey,
  formatDateKey,
  formatInstant,
  todayKey,
  weekKeys,
} from "../../utils/dateTime"
type Event = { day: number; title: string; time: string; tone: string }
export function CalendarPage() {
  const { courses, assignments, exams, studySessions, loading } =
    useAcademicData()
  const { profile } = useProfile()
  const timezone = profile?.timezone
  const today = todayKey(timezone)
  const days = weekKeys(timezone)
  const dayIndex = (iso: string) => days.indexOf(dateKey(iso, timezone))
  const course = (id: string | null) =>
    courses.find((c) => c.id === id)?.course_code ?? "Course"
  const eventTime = (value: string) =>
    formatInstant(value, timezone, { hour: "numeric", minute: "2-digit" })
  const events: Event[] = [
    ...assignments
      .filter((a) => a.due_at && a.status !== "completed")
      .map((a) => ({
        day: dayIndex(a.due_at!),
        title: `${course(a.course_id)} — ${a.title}`,
        time: eventTime(a.due_at!),
        tone: a.status === "overdue" ? "rose" : "gold",
      })),
    ...exams
      .filter((e) => e.exam_at)
      .map((e) => ({
        day: dayIndex(e.exam_at!),
        title: `${course(e.course_id)} — ${e.title}`,
        time: eventTime(e.exam_at!),
        tone: "rose",
      })),
    ...studySessions.map((s) => ({
      day: dayIndex(s.start_at),
      title: s.title,
      time: eventTime(s.start_at),
      tone: "sage",
    })),
  ]
  const labels = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]
  courses.forEach((c) =>
    (c.meeting_days ?? []).forEach((name) => {
      const day = labels.findIndex((label) =>
        label.toLowerCase().startsWith(name.toLowerCase().slice(0, 3)),
      )
      if (day >= 0)
        events.push({
          day,
          title: `${c.course_code} — ${c.course_name}`,
          time: c.meeting_start?.slice(0, 5) ?? "Class",
          tone: "blue",
        })
    }),
  )
  return (
    <>
      <PageHeader title="Your week" />
      <main className="page">
        <div className="calendar-toolbar">
          <div>
            <h2>A week with room to breathe.</h2>
            <p>
              {formatDateKey(days[0], { month: "long", day: "numeric" })} –{" "}
              {formatDateKey(days[6], {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <Card className="week-card">
          <div className="week-grid">
            {days.map((day, index) => (
              <div className={`day ${day === today ? "today" : ""}`} key={day}>
                <b>
                  {formatDateKey(day, { weekday: "short", day: "numeric" })}
                </b>
                <div className="time-label">Schedule</div>
                {events
                  .filter((event) => event.day === index)
                  .map((event, eventIndex) => (
                    <div
                      className={`calendar-event ${event.tone}`}
                      key={`${event.title}-${eventIndex}`}
                    >
                      {event.title}
                      <br />
                      <small>{event.time}</small>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </Card>
        <div className="calendar-bottom">
          <Card>
            <p className="eyebrow">This week</p>
            <h3>
              {loading
                ? "Loading…"
                : `${events.filter((event) => event.day >= 0 && event.day < 7).length} academic commitments`}
            </h3>
            <p>
              Assignments, exams, course meetings, and study sessions stay
              together here.
            </p>
          </Card>
          <Card>
            <p className="eyebrow">In-app check-ins</p>
            <h3>Nothing disappears when it’s late.</h3>
            <p>
              Overdue work remains visible until you confirm it is complete.
            </p>
          </Card>
        </div>
      </main>
    </>
  )
}
