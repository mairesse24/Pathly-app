import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useProfile } from "../../context/ProfileContext"
import { needsOnboarding } from "../../utils/onboarding"

export function OnboardingRoute() {
  const { profile, loading, error } = useProfile()
  const location = useLocation()

  if (loading) return <main className="auth-state">Loading your setup…</main>
  if (error || !profile)
    return (
      <main className="auth-state" role="alert">
        We couldn&apos;t load your profile. Refresh the page to try again.
      </main>
    )
  if (needsOnboarding(profile))
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />

  return <Outlet />
}
