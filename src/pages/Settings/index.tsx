import { useEffect, useState, type FormEvent } from "react"
import { PageHeader } from "../../components/layout/PageHeader"
import { AcademicDetailsFields } from "../../components/profile/AcademicDetailsFields"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useProfile } from "../../context/ProfileContext"
import {
  canvasUnavailableMessage,
  connectCanvasWithToken,
  disconnectCanvas,
  getCanvasConnection,
  normalizeCanvasDomain,
  previewCanvasCourses,
  startCanvasConnection,
  syncCanvas,
  type CanvasSyncPreview,
  type CanvasConnection,
} from "../../services/canvas"
import { formatBytes, listUploads, USER_QUOTA_BYTES } from "../../services/uploads"
import { formatInstant } from "../../utils/dateTime"
import type { AcademicDetailsInput, ProfileMetadata } from "../../services/profiles"
import { formatCatalogYear } from "../../utils/catalogYear"

const emptyDetails: AcademicDetailsInput = {
  university: "",
  major: "",
  catalog_year: null,
  expected_graduation_term: null,
  graduation_year: null,
}

export function SettingsPage() {
  const { profile, loading, error: profileError, updateProfile } = useProfile()
  const { refreshAcademicData } = useAcademicData()
  const [displayName, setDisplayName] = useState("")
  const [details, setDetails] = useState<AcademicDetailsInput>(emptyDetails)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nameSaving, setNameSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [storageUsed, setStorageUsed] = useState(0)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name)
      setDetails(profile)
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

        <CanvasConnectionCard
          timezone={profile?.timezone}
          onSynced={refreshAcademicData}
        />

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

  async function disconnect() {
    setAction("disconnecting")
    setError("")
    setMessage("")
    try {
      await disconnectCanvas()
      await load()
      setMessage("Canvas disconnected. Imported Pathly items were kept.")
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
            <Button variant="quiet" onClick={() => void disconnect()} disabled={action !== "idle"}>{action === "disconnecting" ? "Disconnecting..." : "Disconnect"}</Button>
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
