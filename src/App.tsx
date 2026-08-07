import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { AppProvider } from "./context/AppContext";
import { LandingPage } from "./pages/Landing";
import { DashboardPage } from "./pages/Dashboard";
import { StudyHubPage } from "./pages/StudyHub";
import { CalendarPage } from "./pages/Calendar";
import { DegreePlannerPage } from "./pages/DegreePlanner";
import { CompanionPage } from "./pages/Companion";
import { UploadCenterPage } from "./pages/UploadCenter";
import { ProfilePage } from "./pages/Profile";
import { SettingsPage } from "./pages/Settings";

export default function App() {
  return <BrowserRouter><AppProvider><Routes>
    <Route path="/" element={<LandingPage />} />
    <Route element={<AppShell />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/study" element={<StudyHubPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/degree" element={<DegreePlannerPage />} />
      <Route path="/companion" element={<CompanionPage />} />
      <Route path="/uploads" element={<UploadCenterPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppProvider></BrowserRouter>;
}
