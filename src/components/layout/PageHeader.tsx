import { useState } from "react"
import { Button } from "../ui/Button"
import { Icon } from "../ui/Icon"
import { useProfile } from "../../context/ProfileContext"
import { formatDateKey, todayKey } from "../../utils/dateTime"
import { AddMaterialDialog, type MaterialContext } from "../uploads/AddMaterialDialog"
import { NotificationPanel } from "../notifications/NotificationPanel"
import type { UploadedFileRecord } from "../../types/uploads"
export function PageHeader({ title, materialContext, onMaterialUploaded, closeOnUpload }: { title: string; materialContext?: MaterialContext; onMaterialUploaded?: (row: UploadedFileRecord) => void; closeOnUpload?: boolean }) {
  const [materialsOpen, setMaterialsOpen] = useState(false)
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
        <NotificationPanel />
        <Button variant="secondary" onClick={() => setMaterialsOpen(true)}>
          <Icon name="upload" size={17} /> Add material
        </Button>
      </div>
      <AddMaterialDialog open={materialsOpen} onClose={() => setMaterialsOpen(false)} context={materialContext} onUploaded={(row) => { if (closeOnUpload) setMaterialsOpen(false); onMaterialUploaded?.(row) }} />
    </header>
  )
}
