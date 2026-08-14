import { useEffect, useState } from "react"

import { useNavigate } from "react-router-dom"

import { FocusItem } from "../../components/dashboard/FocusItem"

import { PageHeader } from "../../components/layout/PageHeader"

import { Badge } from "../../components/ui/Badge"

import { Button } from "../../components/ui/Button"

import { Card } from "../../components/ui/Card"

import { Icon } from "../../components/ui/Icon"

import { useAcademicData } from "../../context/AcademicDataContext"

import { useProfile } from "../../context/ProfileContext"
import { dateKey, dayGreeting, formatInstant, todayKey } from "../../utils/dateTime"
export function DashboardPage() {
  const { profile } = useProfile()
  const timezone = profile?.timezone
  const today = todayKey(timezone)
  const sameDay = (value: string | null) =>
    Boolean(value && dateKey(value, timezone) === today)
  const needsConfirmation = (dueAt: string | null) =>
    Boolean(dueAt && dateKey(dueAt, timezone) < today)
  const {
    assignments,

    courses,

    exams,

    studySessions,

    reflection,

    loading,

    error,

    setAssignmentStatus,

    persistReflection,
  } = useAcademicData()

  const navigate = useNavigate()

  const active = assignments.filter((a) => a.status !== "completed")

  const focus = active

    .filter(
      (a) =>
        sameDay(a.due_at) ||
        needsConfirmation(a.due_at) ||
        a.status === "overdue" ||
        a.status === "awaiting_confirmation",
    )

    .slice(0, 3)

  const nextExam = exams.find(
    (e) => e.exam_at && new Date(e.exam_at) >= new Date(),
  )

  const todaySessions = studySessions.filter(
    (s) => sameDay(s.start_at) && s.status === "scheduled",
  )

  const completed = assignments.filter((a) => a.status === "completed").length

  const courseName = (id: string) =>
    courses.find((c) => c.id === id)?.course_code ?? "Course"

  return (
    <>
      <PageHeader
        title={`${dayGreeting(timezone)}, ${profile?.display_name.split(/\s+/)[0] || "student"}.`}
      />
      <main className="page dashboard">
        <div className="welcome">
          <div>
            <p className="calm-line">Let’s make today feel a little lighter.</p>
            <h2>Here’s what matters today.</h2>
          </div>
        </div>
        {error && <p className="form-message">{error}</p>}
        <div className="dashboard-grid">
          <Card className="focus-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">Today’s focus</p>
                <h3>Three things is enough.</h3>
              </div>
              <Badge>{completed} complete</Badge>
            </div>
            <div className="focus-list">
              {loading ? (
                <p>Loading your work…</p>
              ) : focus.length ? (
                focus.map((a, index) => (
                  <FocusItem
                    key={a.id}
                    number={index + 1}
                    completed={false}
                    onToggle={() => void setAssignmentStatus(a.id, "completed")}
                    task={{
                      id: a.id,

                      title: `${courseName(a.course_id)} — ${a.title}`,

                      detail:
                        a.status === "overdue" || needsConfirmation(a.due_at)
                          ? "Overdue — confirm when complete"
                          : (a.description ?? "Due today"),

                      duration: a.estimated_minutes
                        ? `${a.estimated_minutes} min`
                        : "Flexible",
                    }}
                  />
                ))
              ) : (
                <p>No assignments need your attention today.</p>
              )}
            </div>
            <div className="focus-footer">
              <span>Everything else can wait.</span>
            </div>
          </Card>
          <aside className="side-stack">
            <Card className="exam-card">
              <div className="exam-icon">
                <Icon name="file" />
              </div>
              <p className="eyebrow">Upcoming exam</p>
              {nextExam ? (
                <>
                  <h3>
                    {courseName(nextExam.course_id)} — {nextExam.title}
                  </h3>
                  <p>
                    {nextExam.exam_at &&
                      formatInstant(nextExam.exam_at, timezone, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                  </p>
                  <div className="exam-footer">
                    <button
                      onClick={() => navigate("/study")}
                      className="text-button"
                    >
                      Review plan <Icon name="arrow" size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <p>No upcoming exams.</p>
              )}
            </Card>
            <Card className="study-card">
              <p className="eyebrow">Today’s study sessions</p>
              {todaySessions.length ? (
                todaySessions.map((s) => (
                  <div key={s.id}>
                    <h3>{s.title}</h3>
                    <p>
                      {formatInstant(s.start_at, timezone, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))
              ) : (
                <p>No sessions scheduled today.</p>
              )}
            </Card>
          </aside>
        </div>
        <div className="lower-grid">
          <Card>
            <div className="card-heading">
              <div>
                <p className="eyebrow">Coming up</p>
                <h3>Gentle heads-up</h3>
              </div>
              <button
                onClick={() => navigate("/calendar")}
                className="text-button"
              >
                View calendar <Icon name="arrow" size={16} />
              </button>
            </div>
            <div className="schedule-list">
              {active

                .filter((a) => !sameDay(a.due_at))

                .slice(0, 4)

                .map((a) => (
                  <div key={a.id}>
                    <b>
                      {a.due_at
                        ? formatInstant(a.due_at, timezone, {
                            month: "short",
                            day: "numeric",
                          })
                        : "Soon"}
                    </b>
                    <span className="event-dot sage" />
                    <p>
                      <strong>{a.title}</strong>
                      <small>
                        {courseName(a.course_id)} ·{" "}
                        {a.status.replace(/_/g, " ")}
                      </small>
                    </p>
                  </div>
                ))}
              {!active.length && <p>You’re all caught up.</p>}
            </div>
          </Card>
          <ReflectionCard
            initialMood={reflection?.mood ?? ""}
            initialNotes={reflection?.notes ?? ""}
            onSave={persistReflection}
          />
        </div>
      </main>
    </>
  )
}

function ReflectionCard({
  initialMood,

  initialNotes,

  onSave,
}: {
  initialMood: string

  initialNotes: string

  onSave: (m: string, n: string) => Promise<unknown>
}) {
  const [mood, setMood] = useState(initialMood),
    [notes, setNotes] = useState(initialNotes),
    [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
      "idle",
    ),
    [saveError, setSaveError] = useState("")

  useEffect(() => {
    setMood(initialMood)

    setNotes(initialNotes)
  }, [initialMood, initialNotes])

  async function save() {
    setStatus("saving")

    setSaveError("")

    try {
      await onSave(mood, notes)

      setStatus("saved")
    } catch (reason) {
      setStatus("error")

      setSaveError(
        reason instanceof Error ? reason.message : "Unable to save reflection",
      )
    }
  }

  const moods = ["strained", "low", "steady", "good", "rested"]

  return (
    <Card className="reflection">
      <p className="eyebrow">Daily reflection</p>
      <h3>How are you feeling today?</h3>
      <div className="moods">
        {moods.map((m) => (
          <button
            key={m}
            className={mood === m ? "selected" : ""}
            onClick={() => {
              setMood(m)

              setStatus("idle")
            }}
            aria-label={`Mood ${m}`}
          >
            {m.slice(0, 1).toUpperCase()}
          </button>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value)

          setStatus("idle")
        }}
        aria-label="Reflection note"
        placeholder="A small win, or a note for tomorrow?"
      />
      <Button onClick={() => void save()} disabled={status === "saving"}>
        {status === "saving"
          ? "Saving…"
          : status === "saved"
            ? "Saved for today"
            : "Save reflection"}
      </Button>
      {status === "saved" && (
        <p className="save-success" role="status">
          Your reflection is saved.
        </p>
      )}
      {status === "error" && (
        <p className="form-message" role="alert">
          {saveError}
        </p>
      )}
    </Card>
  )
}
