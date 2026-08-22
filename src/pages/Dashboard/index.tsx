import { useEffect, useMemo, useState } from "react"

import { useNavigate } from "react-router-dom"

import { FocusItem } from "../../components/dashboard/FocusItem"

import { PageHeader } from "../../components/layout/PageHeader"

import { Badge } from "../../components/ui/Badge"

import { Button } from "../../components/ui/Button"

import { Card } from "../../components/ui/Card"

import { Icon } from "../../components/ui/Icon"

import { useAcademicData } from "../../context/AcademicDataContext"

import { useProfile } from "../../context/ProfileContext"
import { buildComingUpItems } from "../../utils/comingUp"
import { dateKey, dayGreeting, formatInstant, todayKey } from "../../utils/dateTime"
import { buildSmartPlan } from "../../utils/smartPlanning"
import { listBusyPeriods, type BusyPeriod } from "../../services/googleCalendar"
import {
  dismissScheduleConflict,
  firstUndismissedConflict,
  scheduleConflictEditPath,
} from "../../utils/scheduleConflicts"
export function DashboardPage() {
  const { profile } = useProfile()
  const timezone = profile?.timezone
  const today = todayKey(timezone)
  const sameDay = (value: string | null) =>
    Boolean(value && dateKey(value, timezone) === today)
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
  const [busyPeriods, setBusyPeriods] = useState<BusyPeriod[]>([])
  const [dismissedConflicts, setDismissedConflicts] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const scheduled = studySessions.filter((session) => session.status === "scheduled")
    if (!scheduled.length) {
      setBusyPeriods([])
      return
    }
    let active = true
    const starts = scheduled.map((session) => new Date(session.start_at).getTime())
    const ends = scheduled.map((session) => new Date(session.end_at).getTime())
    const startsBefore = new Date(Math.max(...ends)).toISOString()
    const endsAfter = new Date(Math.min(...starts)).toISOString()
    listBusyPeriods(startsBefore, endsAfter)
      .then((rows) => { if (active) setBusyPeriods(rows) })
      .catch(() => { if (active) setBusyPeriods([]) })
    return () => { active = false }
  }, [studySessions])

  const comingUpItems = useMemo(
    () => buildComingUpItems({ assignments, exams, studySessions, courses, timezone }),
    [assignments, exams, studySessions, courses, timezone],
  )

  const plan = useMemo(
    () => buildSmartPlan({
      assignments,
      exams,
      studySessions,
      busyPeriods,
      courses,
      reflection,
      preferences: profile,
      timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    [assignments, busyPeriods, courses, exams, profile, reflection, studySessions, timezone],
  )
  const visibleConflict = firstUndismissedConflict(plan.conflicts, dismissedConflicts)

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
        materialContext={{origin:"dashboard"}}
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
              ) : plan.priorities.length ? (
                plan.priorities.map((priority, index) => (
                  <FocusItem
                    key={`${priority.kind}-${priority.id}`}
                    number={index + 1}
                    actionLabel={priority.kind === "exam"
                      ? "Review plan"
                      : priority.needsStatusConfirmation
                        ? "I submitted it"
                        : "Mark complete"}
                    onAction={() => priority.kind === "exam"
                      ? navigate("/study")
                      : void setAssignmentStatus(priority.id, "completed")}
                    task={{
                      id: priority.id,
                      title: `${priority.courseCode} — ${priority.title}`,
                      detail: priority.reason,
                      duration: `${priority.suggestedMinutes} min`,
                    }}
                  />
                ))
              ) : (
                <p>Nothing urgent right now.</p>
              )}
            </div>
            {plan.energyAdjustment === "low" && plan.priorities.length > 0 && (
              <p className="planning-note">Keeping today lighter while protecting urgent deadlines.</p>
            )}
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
              {visibleConflict && (
                <div className="planning-warning" role="status">
                  <strong>Schedule conflict</strong>
                  <p>{visibleConflict.message}</p>
                  <div className="planning-actions">
                    <Button variant="secondary" onClick={() => navigate(scheduleConflictEditPath(visibleConflict))}>Edit</Button>
                    <Button variant="quiet" onClick={() => setDismissedConflicts((current) => dismissScheduleConflict(current, visibleConflict))}>Dismiss</Button>
                  </div>
                </div>
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
              {comingUpItems.slice(0, 5).map((item) => (
                <div key={`${item.kind}-${item.id}`}>
                  <b>
                    {formatInstant(item.at, timezone, {
                      month: "short",
                      day: "numeric",
                    })}
                  </b>
                  <span className={`event-dot ${item.kind === "exam" ? "rose" : item.kind === "session" ? "blue" : "sage"}`} />
                  <p>
                    <strong>{item.title}</strong>
                    <small>
                      {item.courseCode ?? "Study session"}
                      {item.detail ? ` · ${item.detail}` : ""}
                    </small>
                  </p>
                </div>
              ))}
              {comingUpItems.length === 0 && <p>Nothing coming up yet.</p>}
            </div>
          </Card>
          <ReflectionCard
            initialMood={reflection?.mood ?? ""}
            initialEnergy={reflection?.energy ?? ""}
            initialNotes={reflection?.notes ?? ""}
            questionDate={today}
            onSave={persistReflection}
          />
        </div>
      </main>
    </>
  )
}

function ReflectionCard({
  initialMood,

  initialEnergy,

  initialNotes,

  questionDate,

  onSave,
}: {
  initialMood: string

  initialNotes: string

  initialEnergy: string

  questionDate: string

  onSave: (m: string, e: string, n: string) => Promise<unknown>
}) {
  const [mood, setMood] = useState(initialMood),
    [energy, setEnergy] = useState(initialEnergy),
    [notes, setNotes] = useState(initialNotes),
    [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
      "idle",
    ),
    [saveError, setSaveError] = useState("")

  useEffect(() => {
    setMood(initialMood)

    setEnergy(initialEnergy)

    setNotes(initialNotes)
  }, [initialEnergy, initialMood, initialNotes])

  async function save() {
    setStatus("saving")

    setSaveError("")

    try {
      await onSave(mood, energy, notes)

      setStatus("saved")
    } catch (reason) {
      setStatus("error")

      setSaveError(
        reason instanceof Error ? reason.message : "Unable to save reflection",
      )
    }
  }

  const moods = [
    { value: "struggling", label: "😣 Struggling", legacy: ["strained"] },
    { value: "overwhelmed", label: "😕 Overwhelmed", legacy: ["low"] },
    { value: "steady", label: "😐 Steady", legacy: [] },
    { value: "good", label: "🙂 Good", legacy: [] },
    { value: "rested", label: "🌟 Rested", legacy: [] },
  ]
  const selectedMood = moods.find((option) => option.value === mood || option.legacy.includes(mood))?.value ?? mood
  const questions = [
    "How are you feeling today?",
    "What would make today feel more manageable?",
    "How is your energy holding up today?",
    "What do you need most from today?",
    "What is one thing you can give yourself credit for today?",
  ]
  const question = questions[Number.parseInt(questionDate.replace(/-/g, ""), 10) % questions.length]

  return (
    <Card className="reflection">
      <p className="eyebrow">Daily reflection</p>
      <h3>{question}</h3>
      <div className="moods">
        {moods.map((option) => (
          <button
            key={option.value}
            className={selectedMood === option.value ? "selected" : ""}
            onClick={() => {
              setMood(option.value)

              setStatus("idle")
            }}
            aria-pressed={selectedMood === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="reflection-energy">
        Energy today
        <select
          value={energy}
          onChange={(event) => {
            setEnergy(event.target.value)
            setStatus("idle")
          }}
        >
          <option value="">Not specified</option>
          <option value="low">Low</option>
          <option value="steady">Steady</option>
          <option value="high">High</option>
        </select>
      </label>
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
