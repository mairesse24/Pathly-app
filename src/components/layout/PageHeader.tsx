import { useNavigate } from "react-router-dom"
import { Button } from "../ui/Button"
import { Icon } from "../ui/Icon"
import { useProfile } from "../../context/ProfileContext"
import { formatDateKey, todayKey } from "../../utils/dateTime"
export function PageHeader({ title }: { title: string }) {
  const navigate = useNavigate()
  const { profile } = useProfile()
  const today = todayKey(profile?.timezone)
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">
          {formatDateKey(today, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <button className="icon-button" aria-label="Notifications">
          <Icon name="bell" />
        </button>
        <Button variant="secondary" onClick={() => navigate("/uploads")}>
          <Icon name="upload" size={17} /> Add material
        </Button>
      </div>
    </header>
  )
}
