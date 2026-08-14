import { useEffect, useState, type FormEvent } from "react"
import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useAuth } from "../../context/AuthContext"
import { useProfile } from "../../context/ProfileContext"
import type { ProfileMetadata } from "../../services/profiles"

const emptyProfile: ProfileMetadata = { display_name: "", university: "", major: "", graduation_year: null, catalog_year: null, expected_graduation_term: null }

export function ProfilePage() {
  const { user, signOut } = useAuth()
  const { profile, loading, error, updateProfile } = useProfile()
  const [draft, setDraft] = useState<ProfileMetadata>(emptyProfile)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [saveError, setSaveError] = useState("")
  useEffect(() => { if (profile) setDraft(profile) }, [profile])
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(""); setSaveError("")
    try { await updateProfile(draft); setMessage("Profile saved."); setEditing(false) }
    catch (reason) { setSaveError(reason instanceof Error ? reason.message : "Unable to save your profile.") }
    finally { setSaving(false) }
  }
  const shown = profile ?? draft
  const initials = shown.display_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "P"
  return <><PageHeader title="Your profile"/><main className="page settings-page"><Card>
    {loading && !profile ? <p>Loading your profile…</p> : editing ? <form className="profile-form" onSubmit={save}>
      <label>Display name<input value={draft.display_name} maxLength={100} required onChange={(event) => setDraft({ ...draft, display_name: event.target.value })}/></label>
      <label>University<input value={draft.university} onChange={(event) => setDraft({ ...draft, university: event.target.value })}/></label>
      <label>Major<input value={draft.major} onChange={(event) => setDraft({ ...draft, major: event.target.value })}/></label>
      <label>Graduation year<input type="number" min="1900" max="2200" value={draft.graduation_year ?? ""} onChange={(event) => setDraft({ ...draft, graduation_year: event.target.value ? Number(event.target.value) : null })}/></label>
      {saveError && <p className="form-message" role="alert">{saveError}</p>}
      <div className="form-actions"><Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</Button><Button type="button" variant="quiet" onClick={() => { setDraft(profile ?? emptyProfile); setEditing(false); setSaveError("") }}>Cancel</Button></div>
    </form> : <div className="profile-heading"><div className="avatar large">{initials}</div><div><h2>{shown.display_name || user?.email}</h2><p>{shown.major}{shown.graduation_year ? ` · Class of ${shown.graduation_year}` : ""}</p></div><Button variant="secondary" onClick={() => { setDraft(shown); setEditing(true); setMessage("") }}>Edit profile</Button></div>}
    {message && <p className="save-success" role="status">{message}</p>}{(error || saveError) && !editing && <p className="form-message" role="alert">{saveError || error}</p>}
  </Card><Card><p className="eyebrow">Academic details</p><h3>{shown.university || "University not provided"}</h3><p>{shown.major || "Major not provided"}{shown.graduation_year || shown.expected_graduation_term ? ` · Expected graduation ${[shown.expected_graduation_term, shown.graduation_year].filter(Boolean).join(" ")}` : ""}</p><Button variant="quiet" onClick={() => void signOut()}>Sign out</Button></Card></main></>
}
