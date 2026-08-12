import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { AcademicDetailsFields } from "../../components/profile/AcademicDetailsFields"
import { Button } from "../../components/ui/Button"
import { useAuth } from "../../context/AuthContext"
import { useProfile } from "../../context/ProfileContext"
import { supabase } from "../../lib/supabase"
import type { AcademicDetailsInput } from "../../services/profiles"

const emptyDetails: AcademicDetailsInput = { university: "", major: "", catalog_year: null, expected_graduation_term: null, graduation_year: null }
export function OnboardingPage() {
  const { user } = useAuth()
  const { profile, refreshProfile } = useProfile()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState("")
  const [details, setDetails] = useState<AcademicDetailsInput>(emptyDetails)
  const [error, setError] = useState(""), [saving, setSaving] = useState(false)
  useEffect(() => { if (profile) { setDisplayName(profile.display_name); setDetails(profile) } }, [profile])
  useEffect(() => {
    if (!user) return
    supabase.from("profiles").select("onboarding_completed").eq("id", user.id).single().then(({ data, error: loadError }) => {
      if (loadError) setError(loadError.message)
      else if (data?.onboarding_completed) navigate("/dashboard", { replace: true })
    })
  }, [user, navigate])
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!user) return
    const name = displayName.trim(); if (!name) { setError("Display name is required."); return }
    setSaving(true); setError("")
    const { error: saveError } = await supabase.from("profiles").upsert({ id: user.id, email: user.email, display_name: name, full_name: name, ...details, onboarding_completed: true, updated_at: new Date().toISOString() })
    if (saveError) setError(saveError.message)
    else { await refreshProfile(); navigate("/dashboard", { replace: true }) }
    setSaving(false)
  }
  return <main className="auth-page"><div className="auth-card"><p className="eyebrow">Basic academic setup</p><h1>Make Pathly yours.</h1><p>Provide the details you know. You can update them later in Settings.</p><form onSubmit={submit}><label>Display name<input value={displayName} maxLength={100} onChange={(event) => setDisplayName(event.target.value)} required/></label><AcademicDetailsFields value={details} onChange={setDetails}/>{error && <p className="form-message" role="alert">{error}</p>}<Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save and continue"}</Button></form></div></main>
}
