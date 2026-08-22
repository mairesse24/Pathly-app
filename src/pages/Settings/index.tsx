import { useEffect, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { GoogleCalendarConnectionCard } from "../../components/settings/GoogleCalendarConnectionCard"
import { AcademicDetailsFields } from "../../components/profile/AcademicDetailsFields"
import { StudyPreferencesFields } from "../../components/profile/StudyPreferencesFields"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useProfile } from "../../context/ProfileContext"
import { useTheme, type ThemePreference } from "../../context/ThemeContext"
import { supabase } from "../../lib/supabase"
import { deleteAccount } from "../../services/account"
import {
  canvasUnavailableMessage,
  connectCanvasWithToken,
  disconnectCanvas,
  getCanvasCleanupImpact,
  getCanvasConnection,
  normalizeCanvasDomain,
  previewCanvasCourses,
  startCanvasConnection,
  removeOldCanvasCourses,
  syncCanvas,
  type CanvasSyncPreview,
  type CanvasConnection,
} from "../../services/canvas"
import { formatBytes, listUploads, USER_QUOTA_BYTES } from "../../services/uploads"
import { formatInstant } from "../../utils/dateTime"
import type { AcademicDetailsInput, ProfileMetadata, StudyPreferencesInput } from "../../services/profiles"
import { formatCatalogYear } from "../../utils/catalogYear"

const emptyDetails: AcademicDetailsInput = {
  university: "",
  major: "",
  catalog_year: null,
  expected_graduation_term: null,
  graduation_year: null,
}

const emptyPreferences: StudyPreferencesInput = {
  preferred_study_time: null,
  focus_session_minutes: null,
  prefers_breaks: null,
  break_duration_minutes: null,
  non_academic_constraints: null,
  planning_style: null,
  primary_support_goal: null,
}

const studyTimeLabels: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", late_night: "Late night", no_preference: "Varies" }
const planningStyleLabels: Record<string, string> = { structured: "Structured", flexible: "Flexible", balanced: "Balanced" }
const supportGoalLabels: Record<string, string> = { deadlines: "Deadlines", study_planning: "Study planning", degree_progress: "Degree progress", balance: "Balance" }
const constraintLabels: Record<string, string> = { work: "Work", commute: "Commute", family: "Family", extracurriculars: "Extracurriculars", varies: "Varies" }

function formatBreakPreference(profile: ProfileMetadata | null) {
  if (!profile || profile.prefers_breaks === null) return "Not set"
  if (!profile.prefers_breaks) return "Studies straight through"
  return profile.break_duration_minutes ? `Short breaks (~${profile.break_duration_minutes} min)` : "Prefers breaks"
}

export function SettingsPage() {
  const { profile, loading, error: profileError, updateProfile } = useProfile()
  const { refreshAcademicData } = useAcademicData()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState("")
  const [details, setDetails] = useState<AcademicDetailsInput>(emptyDetails)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preferences, setPreferences] = useState<StudyPreferencesInput>(emptyPreferences)
  const [editingPreferences, setEditingPreferences] = useState(false)
  const [preferencesSaving, setPreferencesSaving] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [storageUsed, setStorageUsed] = useState(0)
  const [deleteConfirming, setDeleteConfirming] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const { preference, setPreference } = useTheme()

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name)
      setDetails(profile)
      setPreferences(profile)
    }
  }, [profile])

  useEffect(() => {
    listUploads()
      .then((rows) => setStorageUsed(rows.reduce((sum, row) => sum + row.size_bytes, 0)))
      .catch(() => undefined)
  }, [])

  const hasDetails = Boolean(
    profile &&
      (profile.university ||
        profile.major ||
        profile.graduation_year ||
        profile.expected_graduation_term ||
        profile.catalog_year),
  )

  const hasPreferences = Boolean(
    profile &&
      (profile.preferred_study_time ||
        profile.focus_session_minutes ||
        profile.prefers_breaks !== null ||
        profile.non_academic_constraints?.length ||
        profile.planning_style ||
        profile.primary_support_goal),
  )

  async function saveName(event: FormEvent) {
    event.preventDefault()
    setNameSaving(true)
    setError("")
    setMessage("")
    try {
      await updateProfile({ display_name: displayName })
      setMessage("Display name saved.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save your display name")
    } finally {
      setNameSaving(false)
    }
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const saved = await updateProfile(details)
      setDetails(saved)
      setEditing(false)
      setMessage("Academic details saved.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save academic details")
    } finally {
      setSaving(false)
    }
  }

  async function savePreferences(event: FormEvent) {
    event.preventDefault()
    setPreferencesSaving(true)
    setError("")
    setMessage("")
    try {
      const saved = await updateProfile(preferences)
      setPreferences(saved)
      setEditingPreferences(false)
      setMessage("Study preferences saved.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save study preferences")
    } finally {
      setPreferencesSaving(false)
    }
  }

  async function confirmDeleteAccount() {
    setDeleting(true)
    setDeleteError("")
    try {
      await deleteAccount()
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : "Unable to delete your account right now.")
      setDeleting(false)
      return
    }
    // The account no longer exists server-side at this point, so this sign-out is only
    // clearing the local session -- its own outcome must not block returning to a signed-out
    // screen, which is why failures here are swallowed rather than surfaced as an error.
    await supabase.auth.signOut().catch(() => undefined)
    navigate("/auth", { replace: true, state: { accountDeleted: true } })
  }

  return (
    <>
      <PageHeader title="Settings" />
      <main className="page settings-page">
        <Card>
          <p className="eyebrow">Your name</p>
          <h3>How Pathly addresses you</h3>
          {loading && !profile ? (
            <p>Loading your profile…</p>
          ) : (
            <form className="profile-form" onSubmit={saveName}>
              <label>
                Display name
                <input
                  value={displayName}
                  maxLength={100}
                  required
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <Button
                type="submit"
                disabled={nameSaving || displayName.trim() === profile?.display_name}
              >
                {nameSaving ? "Saving…" : "Save display name"}
              </Button>
            </form>
          )}
        </Card>

        <Card>
          <p className="eyebrow">Appearance</p>
          <h3>Choose how Pathly looks</h3>
          <div className="theme-options" role="radiogroup" aria-label="Appearance preference">
            {(["system", "light", "dark"] as ThemePreference[]).map((option) => (
              <label key={option}>
                <input type="radio" name="appearance" value={option} checked={preference === option} onChange={() => setPreference(option)} />
                {option.slice(0, 1).toUpperCase() + option.slice(1)}
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <p className="eyebrow">Academic details</p>
          <h3>{editing ? "Update your academic details" : "Information you provided"}</h3>
          {loading ? (
            <p>Loading your details…</p>
          ) : editing ? (
            <form className="academic-details-form" onSubmit={saveDetails}>
              <AcademicDetailsFields value={details} onChange={setDetails} />
              <div className="form-actions">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save academic details"}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    setDetails(profile ?? emptyDetails)
                    setEditing(false)
                    setError("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="facts-list">
                <Fact label="Your university" value={profile?.university || "Not provided"} />
                <Fact label="Major" value={profile?.major || "Not provided"} />
                <Fact label="Expected graduation" value={formatGraduation(profile)} />
                <Fact label="Catalog year" value={formatCatalogYear(profile?.catalog_year)} />
              </div>
              {!hasDetails && (
                <p>Complete your academic details to help Pathly personalize your experience.</p>
              )}
              <Button onClick={() => { setEditing(true); setMessage("") }}>
                {hasDetails ? "Edit academic details" : "Add academic details"}
              </Button>
            </>
          )}
        </Card>

        <Card>
          <p className="eyebrow">Study preferences</p>
          <h3>{editingPreferences ? "Update your study preferences" : "How you like to study"}</h3>
          {loading ? (
            <p>Loading your preferences…</p>
          ) : editingPreferences ? (
            <form className="academic-details-form" onSubmit={savePreferences}>
              <StudyPreferencesFields value={preferences} onChange={setPreferences} />
              <div className="form-actions">
                <Button type="submit" disabled={preferencesSaving}>
                  {preferencesSaving ? "Saving…" : "Save study preferences"}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => {
                    setPreferences(profile ?? emptyPreferences)
                    setEditingPreferences(false)
                    setError("")
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="facts-list">
                <Fact label="Preferred study time" value={profile?.preferred_study_time ? studyTimeLabels[profile.preferred_study_time] : "Not set"} />
                <Fact label="Typical focus session" value={profile?.focus_session_minutes ? `${profile.focus_session_minutes} minutes` : "Not set"} />
                <Fact label="Break preference" value={formatBreakPreference(profile)} />
                <Fact label="Non-academic constraints" value={profile?.non_academic_constraints?.length ? profile.non_academic_constraints.map((value) => constraintLabels[value]).join(", ") : "Not set"} />
                <Fact label="Planning style" value={profile?.planning_style ? planningStyleLabels[profile.planning_style] : "Not set"} />
                <Fact label="What would help most" value={profile?.primary_support_goal ? supportGoalLabels[profile.primary_support_goal] : "Not set"} />
              </div>
              {!hasPreferences && (
                <p>These are optional. Sharing them helps Pathly's Companion tailor its advice.</p>
              )}
              <Button onClick={() => { setEditingPreferences(true); setMessage("") }}>
                {hasPreferences ? "Edit study preferences" : "Add study preferences"}
              </Button>
            </>
          )}
        </Card>

        <CanvasConnectionCard
          timezone={profile?.timezone}
          onSynced={refreshAcademicData}
        />
        <GoogleCalendarConnectionCard timezone={profile?.timezone} />

        {message && <p className="save-success" role="status">{message}</p>}
        {(error || profileError) && (
          <p className="form-message" role="alert">{error || profileError}</p>
        )}

        <Card>
          <p className="eyebrow">Private file storage</p>
          <h3>{formatBytes(storageUsed)} of 500 MB used</h3>
          <div className="storage">
            <div className="mini-progress">
              <i style={{ width: `${Math.min(100, (storageUsed / USER_QUOTA_BYTES) * 100)}%` }} />
            </div>
          </div>
          <p>
            Only source files uploaded to your account count toward this limit.
            Deleting a file reclaims its space.
          </p>
        </Card>
        <Card><p className="eyebrow">Policies and guidance</p><h3>Understand how Pathly handles your information</h3><p>Pathly supports academic organization; it does not replace official university records or an academic advisor. Review AI-generated summaries and extracted dates before relying on them.</p><div className="form-actions legal-links"><Link to="/privacy">Privacy Policy</Link><Link to="/terms">Terms of Use</Link></div></Card>

        <Card className="danger-zone">
          <p className="eyebrow">Account</p>
          <h3>Delete your Pathly account</h3>
          <p>
            This permanently deletes your Pathly account and everything tied to it: your
            profile and study preferences, courses, assignments, exams, study sessions,
            reflections, uploaded files, organized notes and flashcards, degree-planning data,
            and any connected Canvas account. This cannot be undone.
          </p>
          {!deleteConfirming ? (
            <Button
              type="button"
              variant="secondary"
              className="btn-danger"
              onClick={() => { setDeleteConfirming(true); setDeleteConfirmText(""); setDeleteError("") }}
            >
              Delete my account
            </Button>
          ) : (
            <div className="canvas-token-panel" role="dialog" aria-modal="true" aria-label="Confirm account deletion">
              <h4>Are you sure you want to delete your account?</h4>
              <p>This is permanent. Type <strong>DELETE</strong> below to confirm.</p>
              <label className="canvas-domain-field">
                Type DELETE to confirm
                <input
                  value={deleteConfirmText}
                  onChange={(event) => setDeleteConfirmText(event.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                  disabled={deleting}
                />
              </label>
              {deleteError && <p className="form-message" role="alert">{deleteError}</p>}
              <div className="form-actions">
                <Button
                  type="button"
                  className="btn-danger"
                  disabled={deleteConfirmText.trim() !== "DELETE" || deleting}
                  onClick={() => void confirmDeleteAccount()}
                >
                  {deleting ? "Deleting…" : "Permanently delete my account"}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  disabled={deleting}
                  onClick={() => { setDeleteConfirming(false); setDeleteConfirmText(""); setDeleteError("") }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>
    </>
  )
}

function CanvasConnectionCard({
  timezone,
  onSynced,
}: {
  timezone?: string | null
  onSynced: () => Promise<void>
}) {
  const [connection, setConnection] = useState<CanvasConnection | null>(null)
  const [domain, setDomain] = useState("")
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<"idle" | "connecting" | "token-connecting" | "syncing" | "disconnecting">("idle")
  const [showTokenConnection, setShowTokenConnection] = useState(false)
  const [accessToken, setAccessToken] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [preview, setPreview] = useState<CanvasSyncPreview | null>(null)
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [cleanup, setCleanup] = useState<{ mode: "disconnect" | "old"; impact: Awaited<ReturnType<typeof getCanvasCleanupImpact>> } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const value = await getCanvasConnection()
      setConnection(value)
      if (value?.canvas_base_url) setDomain(value.canvas_base_url)
    } catch {
      setError("Pathly couldn't load your Canvas connection right now.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const callbackStatus = new URLSearchParams(window.location.search).get("canvas")
    if (callbackStatus === "connected") setMessage("Canvas connected. Sync when you're ready.")
    if (callbackStatus === "error") setError(canvasUnavailableMessage)
  }, [])

  async function connect() {
    setAction("connecting")
    setError("")
    setMessage("")
    try {
      const normalized = normalizeCanvasDomain(domain)
      setDomain(normalized)
      const authorizationUrl = await startCanvasConnection(normalized)
      window.location.assign(authorizationUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : canvasUnavailableMessage)
      await load()
      setAction("idle")
    }
  }

  async function previewCourses() {
    setAction("syncing")
    setError("")
    setMessage("")
    try {
      const result = await previewCanvasCourses()
      if (!result.courses_available) {
        setPreview(null)
        setMessage("Canvas is connected, but we didn't find any current courses to import.")
        return
      }
      setPreview(result)
      setSelectedCourseIds(result.current_courses.map((course) => course.id))
      return
      await Promise.all([load(), onSynced()])
      setMessage(
        `Canvas synced successfully. ${result.courses_seen} course${result.courses_seen === 1 ? "" : "s"} · ${result.assignments_seen} assignment${result.assignments_seen === 1 ? "" : "s"} updated. ${result.courses_created} new course${result.courses_created === 1 ? "" : "s"} and ${result.assignments_created} new assignment${result.assignments_created === 1 ? "" : "s"} added.`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : canvasUnavailableMessage)
      await load()
    } finally {
      setAction("idle")
    }
  }

  async function importSelectedCourses() {
    setAction("syncing")
    setError("")
    setMessage("")
    try {
      const result = await syncCanvas(selectedCourseIds)
      await Promise.all([load(), onSynced()])
      setPreview(null)
      setMessage(`Canvas synced successfully. ${result.assignments_seen} current assignment${result.assignments_seen === 1 ? "" : "s"} reviewed. ${result.courses_created} new course${result.courses_created === 1 ? "" : "s"} and ${result.assignments_created} new assignment${result.assignments_created === 1 ? "" : "s"} added.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : canvasUnavailableMessage)
    } finally {
      setAction("idle")
    }
  }

  function toggleCourse(courseId: string) {
    setSelectedCourseIds((current) => current.includes(courseId)
      ? current.filter((id) => id !== courseId)
      : [...current, courseId])
  }

  async function connectWithToken(event: FormEvent) {
    event.preventDefault()
    setAction("token-connecting")
    setError("")
    setMessage("")
    try {
      const normalized = normalizeCanvasDomain(domain)
      setDomain(normalized)
      await connectCanvasWithToken(normalized, accessToken)
      setAccessToken("")
      await load()
      setMessage("Canvas connected. Sync when you're ready.")
      setShowTokenConnection(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pathly couldn't verify this Canvas connection. Check the school URL and access token.")
    } finally {
      setAccessToken("")
      setAction("idle")
    }
  }

  async function requestCleanup(mode: "disconnect" | "old") {
    setError("")
    setMessage("")
    try {
      const impact = await getCanvasCleanupImpact()
      setCleanup({ mode, impact })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to inspect imported Canvas courses.")
    }
  }

  async function confirmCleanup(removeCourses: boolean) {
    if (!cleanup) return
    setAction("disconnecting")
    setError("")
    setMessage("")
    try {
      if (cleanup.mode === "disconnect") await disconnectCanvas(removeCourses)
      else if (removeCourses) await removeOldCanvasCourses()
      await load()
      await onSynced()
      setCleanup(null)
      setMessage(removeCourses
        ? "Canvas-imported courses were removed from Study Hub. Attached Pathly data was preserved."
        : "Canvas disconnected. Imported Pathly items were kept.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to disconnect Canvas.")
    } finally {
      setAction("idle")
    }
  }

  const status = connection?.status || "not_connected"
  const connected = status === "connected"
  const statusLabel = loading
    ? "Loading"
    : status === "needs_reauthorization"
      ? "Needs reauthorization"
      : status === "connection_unavailable"
        ? "Connection unavailable"
        : status === "connecting"
          ? "Connecting"
          : connected
            ? "Connected"
            : "Not connected"

  return (
    <Card className="connected-account-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Connected accounts</p>
          <h3>Canvas LMS</h3>
        </div>
        <span className={`badge ${connected ? "" : "badge-gray"}`}>{statusLabel}</span>
      </div>
      <p>
        Connect Canvas to import your courses, assignments, and available
        submission information into Pathly.
      </p>

      {!connected && (
        <label className="canvas-domain-field">
          Canvas school URL
          <input
            type="url"
            inputMode="url"
            placeholder="https://unt.instructure.com"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            disabled={action !== "idle"}
          />
          <small>Use the HTTPS address your school uses for Canvas.</small>
        </label>
      )}

      {connected && connection && (
        <div className="canvas-connected-state">
          <div className="canvas-connection-details">
          <strong>Connected to {canvasDisplayName(connection.canvas_base_url)}</strong>
          <small>{connection.canvas_base_url}</small>
          <small>
            {connection.auth_type === "personal_access_token" ? "Connected with an access token · " : ""}
            {connection.last_synced_at
              ? `Last synced: ${formatInstant(connection.last_synced_at, timezone, { dateStyle: "medium", timeStyle: "short" })}`
              : "Last synced: Never"}
          </small>
          </div>
          <div className="form-actions canvas-sync-actions">
            <Button onClick={() => void previewCourses()} disabled={action !== "idle"}>{action === "syncing" ? "Syncing..." : "Sync now"}</Button>
            <Button variant="quiet" onClick={() => void requestCleanup("disconnect")} disabled={action !== "idle"}>{action === "disconnecting" ? "Disconnecting..." : "Disconnect"}</Button>
          </div>
        </div>
      )}

      {cleanup && (
        <div className="canvas-token-panel" role="dialog" aria-modal="true" aria-label="Canvas course cleanup">
          <h4>{cleanup.mode === "disconnect" ? "Keep Canvas-imported courses in Pathly?" : "Remove old Canvas courses from Study Hub?"}</h4>
          <p>{cleanup.mode === "disconnect" ? "You can disconnect Canvas and keep the imported courses, or remove them from active Pathly views." : "This hides Canvas-imported courses from active Pathly views."}</p>
          {cleanup.impact.canvas_courses > 0 && <p className="review-note">{cleanup.impact.canvas_courses} Canvas course{cleanup.impact.canvas_courses === 1 ? "" : "s"} found. {cleanup.impact.assignments + cleanup.impact.exams + cleanup.impact.study_sessions + cleanup.impact.uploads + cleanup.impact.processing_results > 0 && "Attached assignments, sessions, files, and processing records will be preserved, not deleted."}</p>}
          <div className="form-actions">
            {cleanup.mode === "disconnect" && <Button variant="secondary" onClick={() => void confirmCleanup(false)} disabled={action !== "idle"}>Keep courses</Button>}
            <Button onClick={() => void confirmCleanup(true)} disabled={action !== "idle"}>{cleanup.mode === "disconnect" ? "Remove Canvas-imported courses" : "Remove old Canvas courses"}</Button>
            <Button variant="quiet" onClick={() => setCleanup(null)} disabled={action !== "idle"}>Cancel</Button>
          </div>
        </div>
      )}

      {connected && preview && (
        <div className="canvas-token-panel">
          <p className="eyebrow">Courses available from Canvas</p>
          <p>Choose the current courses you want Pathly to use. Historical Canvas courses stay excluded from Study Hub, Today, planning, and notifications.</p>
          {preview.historical_courses_excluded > 0 && <small>{preview.historical_courses_excluded} past course{preview.historical_courses_excluded === 1 ? "" : "s"} excluded.</small>}
          {preview.current_courses.map((course) => (
            <label key={course.id} className="canvas-domain-field">
              <input type="checkbox" checked={selectedCourseIds.includes(course.id)} onChange={() => toggleCourse(course.id)} disabled={action !== "idle"} />
              {course.course_code ? `${course.course_code} — ` : ""}{course.course_name}
            </label>
          ))}
          <div className="form-actions">
            <Button onClick={() => void importSelectedCourses()} disabled={action !== "idle" || !selectedCourseIds.length}>{action === "syncing" ? "Importing..." : "Import selected courses"}</Button>
            <Button variant="quiet" onClick={() => setPreview(null)} disabled={action !== "idle"}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="form-actions">
        {!connected && <>
          <Button onClick={() => void connect()} disabled={action !== "idle" || !domain.trim()}>
            {action === "connecting" ? "Connecting…" : "Connect Canvas"}
          </Button>
          <Button variant="quiet" onClick={() => setShowTokenConnection((value) => !value)} disabled={action !== "idle"} aria-expanded={showTokenConnection}>Having trouble connecting?</Button>
        </>}
      </div>

      {!connected && connection && (
        <Button variant="secondary" onClick={() => void requestCleanup("old")} disabled={action !== "idle"}>
          Remove old Canvas courses from Study Hub
        </Button>
      )}

      {!connected && showTokenConnection && (
        <form className="canvas-token-panel" onSubmit={connectWithToken}>
          <p className="eyebrow">Developer/test connection</p>
          <h4>Connect with Canvas access token</h4>
          <p>Some schools allow students to create a personal Canvas access token. Only use this option if your Canvas account provides that feature.</p>
          <ol><li>Open Canvas.</li><li>Go to Account → Settings.</li><li>Find Approved Integrations.</li><li>Select New Access Token.</li><li>Create a token for Pathly.</li><li>Copy it once and return to Pathly.</li></ol>
          <label className="canvas-domain-field">Canvas access token
            <input type="password" autoComplete="new-password" spellCheck={false} value={accessToken} onChange={(event) => setAccessToken(event.target.value)} disabled={action !== "idle"}/>
            <small>Treat this token like a password. Pathly sends it directly to its secure server and never shows it again.</small>
          </label>
          <Button disabled={action !== "idle" || !domain.trim() || !accessToken.trim()}>{action === "token-connecting" ? "Verifying…" : "Connect with access token"}</Button>
        </form>
      )}

      {connected && <p className="review-note">Pathly currently supports one Canvas connection. Keep this connection, or disconnect it before connecting another school.</p>}
      {connected && connection?.auth_type === "personal_access_token" && <p className="review-note">Disconnecting removes the stored token from Pathly. You can also revoke it from Canvas Account Settings.</p>}
      {message && <p className="save-success" role="status">{message}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
    </Card>
  )
}

function canvasDisplayName(value: string) {
  try {
    const school = new URL(value).hostname.split(".")[0]
    return `${school.toUpperCase()} Canvas`
  } catch { return "Canvas" }
}

function formatGraduation(profile: ProfileMetadata | null) {
  if (!profile?.graduation_year && !profile?.expected_graduation_term) return "Not provided"
  return [profile.expected_graduation_term, profile.graduation_year].filter(Boolean).join(" ")
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}
