import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"

import { AppShell } from "./layouts/AppShell"

import { AppProvider } from "./context/AppContext"

import { LandingPage } from "./pages/Landing"

import { DashboardPage } from "./pages/Dashboard"

import { StudyHubPage } from "./pages/StudyHub"

import { CalendarPage } from "./pages/Calendar"

import { DegreePlannerPage } from "./pages/DegreePlanner"

import { CompanionPage } from "./pages/Companion"

import { UploadCenterPage } from "./pages/UploadCenter"

import { ProfilePage } from "./pages/Profile"

import { SettingsPage } from "./pages/Settings"

import { AuthProvider } from "./context/AuthContext"

import { ProtectedRoute } from "./components/auth/ProtectedRoute"

import { AuthPage } from "./pages/Auth"

import { OnboardingPage } from "./pages/Onboarding"
import { CourseDetailPage } from "./pages/CourseDetail"
import { AcademicDataProvider } from "./context/AcademicDataContext"
import { ProfileProvider } from "./context/ProfileContext"

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ProfileProvider>
          <AppProvider>
          <AcademicDataProvider>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/onboarding" element={<OnboardingPage />} />
                <Route element={<AppShell />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/study" element={<StudyHubPage />} />
                  <Route
                    path="/study/:courseId"
                    element={<CourseDetailPage />}
                  />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/degree" element={<DegreePlannerPage />} />
                  <Route path="/companion" element={<CompanionPage />} />
                  <Route path="/uploads" element={<UploadCenterPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AcademicDataProvider>
          </AppProvider>
        </ProfileProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
