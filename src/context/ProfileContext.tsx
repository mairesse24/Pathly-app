import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { useAuth } from "./AuthContext"
import { getProfileMetadata, updateProfile as persistProfile, type ProfileMetadata } from "../services/profiles"

type ProfileValue = {
  profile: ProfileMetadata | null
  loading: boolean
  error: string
  refreshProfile: () => Promise<ProfileMetadata | null>
  updateProfile: (value: Partial<ProfileMetadata>) => Promise<ProfileMetadata>
}
const Context = createContext<ProfileValue | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<ProfileMetadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const refreshProfile = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return null }
    setLoading(true); setError("")
    try { const next = await getProfileMetadata(user.id); setProfile(next); return next }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load your profile"); throw reason }
    finally { setLoading(false) }
  }, [user])
  useEffect(() => { void refreshProfile().catch(() => undefined) }, [refreshProfile])
  async function updateProfile(value: Partial<ProfileMetadata>) {
    if (!user) throw new Error("You must be signed in to update your profile.")
    const displayName = value.display_name?.trim()
    if (value.display_name !== undefined && !displayName) throw new Error("Display name is required.")
    const saved = await persistProfile(user.id, { ...value, ...(displayName ? { display_name: displayName } : {}) })
    setProfile(saved)
    return saved
  }
  return <Context.Provider value={{ profile, loading, error, refreshProfile, updateProfile }}>{children}</Context.Provider>
}
export function useProfile() {
  const value = useContext(Context)
  if (!value) throw new Error("useProfile must be used within ProfileProvider")
  return value
}
