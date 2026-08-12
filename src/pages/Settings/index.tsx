import { useEffect, useState } from "react"
import { PageHeader } from "../../components/layout/PageHeader"
import { Card } from "../../components/ui/Card"
import {
  getProfileMetadata,
  type ProfileMetadata,
} from "../../services/profiles"

export function SettingsPage() {
  const [profile, setProfile] = useState<ProfileMetadata | null>(null)
  const [error, setError] = useState("")
  useEffect(() => {
    getProfileMetadata()
      .then(setProfile)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load academic details",
        ),
      )
  }, [])
  return (
    <>
      <PageHeader title="Settings" />
      <main className="page settings-page">
        <Card>
          <p className="eyebrow">Academic details</p>
          <h3>Information you provided</h3>
          {error ? (
            <p className="form-message">{error}</p>
          ) : profile ? (
            <div className="facts-list">
              <Fact
                label="Your university"
                value={profile.university || "Not provided"}
              />
              <Fact label="Major" value={profile.major || "Not provided"} />
              <Fact
                label="Expected graduation"
                value={profile.graduation_year?.toString() || "Not provided"}
              />
              <Fact label="Catalog year" value="Not provided" />
            </div>
          ) : (
            <p>Loading your details…</p>
          )}
          <p>Academic details help Pathly personalize your experience.</p>
        </Card>
      </main>
    </>
  )
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  )
}
