import { useEffect, useState, type FormEvent } from "react"
import { PageHeader } from "../../components/layout/PageHeader"
import { AcademicDetailsFields } from "../../components/profile/AcademicDetailsFields"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useProfile } from "../../context/ProfileContext"
import {
  canvasUnavailableMessage,
  disconnectCanvas,
  getCanvasConnection,
  normalizeCanvasDomain,
  startCanvasConnection,
  syncCanvas,
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
  const [action, setAction] = useState<"idle" | "connecting" | "syncing" | "disconnecting">("idle")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

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

  async function sync() {
    setAction("syncing")
    setError("")
    setMessage("")
    try {
      const result = await syncCanvas()
      await Promise.all([load(), onSynced()])
      setMessage(
        `Canvas synced. ${result.courses_imported} new course${result.courses_imported === 1 ? "" : "s"} and ${result.assignments_imported} new assignment${result.assignments_imported === 1 ? "" : "s"} imported.`,
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : canvasUnavailableMessage)
      await load()
    } finally {
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
        <div className="canvas-connection-details">
          <strong>{connection.canvas_base_url}</strong>
          <small>
            {connection.last_synced_at
              ? `Last synced ${formatInstant(connection.last_synced_at, timezone, { dateStyle: "medium", timeStyle: "short" })}`
              : "Not synced yet"}
          </small>
        </div>
      )}

      <div className="form-actions">
        {connected ? (
          <>
            <Button onClick={() => void sync()} disabled={action !== "idle"}>
              {action === "syncing" ? "Syncing…" : "Sync now"}
            </Button>
            <Button variant="quiet" onClick={() => void disconnect()} disabled={action !== "idle"}>
              {action === "disconnecting" ? "Disconnecting…" : "Disconnect"}
            </Button>
          </>
        ) : (
          <Button onClick={() => void connect()} disabled={action !== "idle" || !domain.trim()}>
            {action === "connecting" ? "Connecting…" : "Connect Canvas"}
          </Button>
        )}
      </div>

      {message && <p className="save-success" role="status">{message}</p>}
      {error && <p className="form-message" role="alert">{error}</p>}
    </Card>
  )
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
