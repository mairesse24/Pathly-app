import { Icon } from "../ui/Icon";
import type { FocusTask } from "../../types/app";
export function FocusItem({ task, number, completed, onToggle }: {task:FocusTask;number:number;completed:boolean;onToggle:()=>void}) { return <button onClick={onToggle} className={`focus-item ${completed ? "done" : ""}`}><span className="focus-number">{completed ? <Icon name="check" size={16}/> : `0${number}`}</span><span className="focus-copy"><strong>{task.title}</strong><small>{task.detail}</small></span><span className="focus-time"><Icon name="clock" size={15}/>{task.duration}</span></button>; }
