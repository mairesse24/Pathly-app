import { NavLink, Outlet } from "react-router-dom"
import { Brand } from "../components/layout/Brand"
import { Icon, type IconName } from "../components/ui/Icon"
import { demoStudent } from "../data/appData"
const links: { to: string; label: string; icon: IconName }[] = [
  { to: "/dashboard", label: "Today", icon: "home" },
  { to: "/study", label: "Study hub", icon: "book" },
  { to: "/calendar", label: "Calendar", icon: "calendar" },
  { to: "/degree", label: "Degree plan", icon: "chart" },
  { to: "/companion", label: "Companion", icon: "sparkle" },
  { to: "/uploads", label: "Uploads", icon: "upload" },
]
export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand />
          <p>
            Because students carry
            <br />
            more than deadlines.
          </p>
        </div>
        <nav aria-label="Main navigation">
          {links.map((link) => (
            <NavLink to={link.to} key={link.to} className="nav-item">
              <Icon name={link.icon} />
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/settings" className="nav-item">
            <Icon name="settings" />
            <span>Settings</span>
          </NavLink>
          <NavLink to="/profile" className="user-card">
            <div className="avatar">MN</div>
            <div>
              <strong>{demoStudent.name}</strong>
              <small>
                {demoStudent.major}, Class of ’
                {String(demoStudent.graduationYear).slice(-2)}
              </small>
            </div>
          </NavLink>
        </div>
      </aside>
      <div className="app-content">
        <Outlet />
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.slice(0, 4).map((link) => (
          <NavLink to={link.to} key={link.to}>
            <Icon name={link.icon} />
            <span>
              {link.label === "Study hub"
                ? "Study"
                : link.label === "Companion"
                  ? "Ask"
                  : link.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
