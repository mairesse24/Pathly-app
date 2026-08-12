import { PageHeader } from "../../components/layout/PageHeader"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"
type Event = { day: number; title: string; time: string; tone: string }
export function CalendarPage() {
  const { courses, assignments, exams, studySessions, loading } =
    useAcademicData()
  const monday = new Date()
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })
  const dayIndex = (iso: string) => {
    const d = new Date(iso)
    return Math.floor(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        monday.getTime()) /
        86400000,
    )
  }
  const course = (id: string | null) =>
    courses.find((c) => c.id === id)?.course_code ?? "Course"
  const events: Event[] = [
    ...assignments
      .filter((a) => a.due_at && a.status !== "completed")
      .map((a) => ({
        day: dayIndex(a.due_at!),
        title: `${course(a.course_id)} — ${a.title}`,
        time: new Date(a.due_at!).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        tone: a.status === "overdue" ? "rose" : "gold",
      })),
    ...exams
      .filter((e) => e.exam_at)
      .map((e) => ({
        day: dayIndex(e.exam_at!),
        title: `${course(e.course_id)} — ${e.title}`,
        time: new Date(e.exam_at!).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        }),
        tone: "rose",
      })),
    ...studySessions.map((s) => ({
      day: dayIndex(s.start_at),
      title: s.title,
      time: new Date(s.start_at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      }),
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
      const day = labels.findIndex((d) =>
        d.toLowerCase().startsWith(name.toLowerCase().slice(0, 3)),
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
              {days[0].toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
              })}{" "}
              –{" "}
              {days[6].toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
        <Card className="week-card">
          <div className="week-grid">
            {days.map((date, index) => (
              <div
                className={`day ${
                  date.toDateString() === new Date().toDateString()
                    ? "today"
                    : ""
                }`}
                key={date.toISOString()}
              >
                <b>
                  {date.toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                  })}
                </b>
                <div className="time-label">Schedule</div>
                {events
                  .filter((e) => e.day === index)
                  .map((event, i) => (
                    <div
                      className={`calendar-event ${event.tone}`}
                      key={`${event.title}-${i}`}
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
                : `${events.filter((e) => e.day >= 0 && e.day < 7).length} academic commitments`}
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
