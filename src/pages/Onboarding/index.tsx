import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { AcademicDetailsFields } from "../../components/profile/AcademicDetailsFields"
import { StudyPreferencesFields } from "../../components/profile/StudyPreferencesFields"
import { Button } from "../../components/ui/Button"
import { useAuth } from "../../context/AuthContext"
import { useProfile } from "../../context/ProfileContext"
import type { AcademicDetailsInput, StudyPreferencesInput } from "../../services/profiles"
import { hasRequiredAcademicDetails } from "../../utils/onboarding"

const emptyDetails: AcademicDetailsInput = { university: "", major: "", catalog_year: null, expected_graduation_term: null, graduation_year: null }
type Preferences = StudyPreferencesInput
const emptyPreferences: Preferences = { preferred_study_time: null, focus_session_minutes: null, prefers_breaks: null, break_duration_minutes: null, non_academic_constraints: null, planning_style: null, primary_support_goal: null }

export function OnboardingPage() {
  const { user } = useAuth()
  const { profile, loading, updateProfile } = useProfile()
  const navigate = useNavigate()
  const [step, setStep] = useState<"core" | "preferences">("core")
  const [displayName, setDisplayName] = useState("")
  const [details, setDetails] = useState<AcademicDetailsInput>(emptyDetails)
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences)
  const [error, setError] = useState(""), [saving, setSaving] = useState(false)

  useEffect(() => { if (profile) { setDisplayName(profile.display_name); setDetails(profile); setPreferences({ preferred_study_time: profile.preferred_study_time, focus_session_minutes: profile.focus_session_minutes, prefers_breaks: profile.prefers_breaks, break_duration_minutes: profile.break_duration_minutes, non_academic_constraints: profile.non_academic_constraints, planning_style: profile.planning_style, primary_support_goal: profile.primary_support_goal }) } }, [profile])
  useEffect(() => { if (profile?.onboarding_completed) navigate("/dashboard", { replace: true }) }, [profile, navigate])

  async function saveCore(event: FormEvent) {
    event.preventDefault(); if (!user) return
    const name = displayName.trim(); if (!name) return setError("Display name is required.")
    if (!hasRequiredAcademicDetails(details)) return setError("University, major, and expected graduation are required.")
    setSaving(true); setError("")
    let saveError: unknown = null
    try { await updateProfile({ display_name: name, ...details }) } catch (reason) { saveError = reason }
    setSaving(false)
    if (saveError) setError(saveError instanceof Error ? saveError.message : "Unable to save your academic details."); else setStep("preferences")
  }

  async function finish(savePreferences: boolean) {
    if (!user) return
    setSaving(true); setError("")
    const values = savePreferences ? preferences : emptyPreferences
    let saveError: unknown = null
    try { await updateProfile({ ...values, onboarding_completed: true }) } catch (reason) { saveError = reason }
    if (saveError) setError(saveError instanceof Error ? saveError.message : "Unable to save your study preferences.")
    else navigate("/dashboard", { replace: true })
    setSaving(false)
  }

  if (loading || !profile) return <main className="auth-state">Loading your setup…</main>

  if (step === "preferences") return <main className="auth-page"><div className="auth-card onboarding-preferences"><p className="eyebrow">Optional · Study preferences</p><h1>How do you like to study?</h1><p>These answers help Pathly shape future study sessions. They do not describe your personality, and you can change them later.</p><form onSubmit={(event) => { event.preventDefault(); void finish(true) }}>
    <StudyPreferencesFields value={preferences} onChange={setPreferences}/>
    {error && <p className="form-message" role="alert">{error}</p>}<Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save preferences"}</Button><Button type="button" variant="quiet" disabled={saving} onClick={() => void finish(false)}>Skip for now</Button>
  </form></div></main>

  return <main className="auth-page"><div className="auth-card"><p className="eyebrow">Basic academic setup</p><h1>Make Pathly yours.</h1><p>Provide the details you know. You can update them later in Settings.</p><form onSubmit={saveCore}><label>Display name<input value={displayName} maxLength={100} onChange={(event) => setDisplayName(event.target.value)} required/></label><AcademicDetailsFields value={details} onChange={setDetails}/>{error && <p className="form-message" role="alert">{error}</p>}<Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save and continue"}</Button></form></div></main>
}
