import { Icon } from "../ui/Icon"
import type { FocusTask } from "../../types/app"

export function FocusItem({
  task,
  number,
  actionLabel,
  onAction,
}: {
  task: FocusTask
  number: number
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="focus-item">
      <span className="focus-number">{`0${number}`}</span>
      <span className="focus-copy">
        <strong>{task.title}</strong>
        <small>{task.detail}</small>
      </span>
      <span className="focus-time">
        <Icon name="clock" size={15} />
        {task.duration}
      </span>
      <button className="text-button focus-action" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  )
}
