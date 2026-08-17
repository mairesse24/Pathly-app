import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAcademicData } from "../../context/AcademicDataContext"
import { listUploads } from "../../services/uploads"
import { listReadNotificationKeys, markNotificationRead, markNotificationsRead } from "../../services/notifications"
import type { UploadedFileRecord } from "../../types/uploads"
import { Icon } from "../ui/Icon"

type Notice = { key: string; title: string; detail: string; path: string }
export function NotificationPanel() {
  const navigate = useNavigate(); const { assignments, exams, studySessions } = useAcademicData(); const ref = useRef<HTMLDivElement>(null)
  const [open,setOpen]=useState(false); const [uploads,setUploads]=useState<UploadedFileRecord[]>([]); const [read,setRead]=useState(new Set<string>())
  useEffect(()=>{ Promise.all([listUploads(),listReadNotificationKeys()]).then(([files,keys])=>{setUploads(files);setRead(keys)}).catch(()=>{}) },[])
  useEffect(()=>{ if(!open)return; const close=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false)}; document.addEventListener("mousedown",close); return()=>document.removeEventListener("mousedown",close)},[open])
  const notices=useMemo<Notice[]>(()=>{
    const now=Date.now(), day=86400000, hour=3600000, items:Notice[]=[]
    assignments.filter(a=>a.status!=="completed"&&a.due_at).forEach(a=>{const delta=new Date(a.due_at!).getTime()-now;if(delta<=day)items.push({key:`assignment:${a.id}:${a.status}`,title:delta<0?"Assignment awaiting confirmation":"Assignment due within 24 hours",detail:a.title,path:`/calendar?item=${a.id}&type=assignment`})})
    exams.filter(e=>e.exam_at&&new Date(e.exam_at).getTime()-now<=7*day&&new Date(e.exam_at).getTime()>=now).forEach(e=>items.push({key:`exam:${e.id}`,title:"Exam approaching",detail:e.title,path:`/calendar?item=${e.id}&type=exam`}))
    studySessions.filter(s=>{const d=new Date(s.start_at).getTime()-now;return d>=0&&d<=hour}).forEach(s=>items.push({key:`session:${s.id}`,title:"Study session starting soon",detail:s.title,path:`/calendar?item=${s.id}&type=session`}))
    uploads.filter(f=>["ready_for_review","processing_failed","processed"].includes(f.processing_status)).forEach(f=>items.push({key:`upload:${f.id}:${f.processing_status}`,title:f.processing_status==="processing_failed"?"File processing needs attention":f.category==="degree_audit"||f.category==="unofficial_transcript"?"Academic record ready for review":"File processing completed",detail:f.original_filename,path:`/uploads?file=${f.id}`}))
    return items
  },[assignments,exams,studySessions,uploads])
  const unread=notices.filter(n=>!read.has(n.key)).length
  async function mark(key:string){setRead(current=>new Set(current).add(key));await markNotificationRead(key)}
  return <div className="notification-wrap" ref={ref}><button className="icon-button notification-bell" aria-label={`Notifications${unread?` (${unread} unread)`:""}`} aria-expanded={open} onClick={()=>setOpen(!open)}><Icon name="bell" />{unread>0&&<span className="notification-count">{unread>9?"9+":unread}</span>}</button>{open&&<div className="notification-panel" role="dialog" aria-label="Notifications"><div className="notification-heading"><strong>Notifications</strong>{unread>0&&<button onClick={()=>{const keys=notices.map(n=>n.key);setRead(new Set(keys));void markNotificationsRead(keys)}}>Mark all read</button>}</div>{notices.length===0?<p>You’re all caught up.</p>:<div className="notification-list">{notices.map(n=><button key={n.key} className={read.has(n.key)?"read":"unread"} onClick={()=>{void mark(n.key);setOpen(false);navigate(n.path)}}><span>{n.title}</span><small>{n.detail}</small>{!read.has(n.key)&&<i aria-label="Unread"/>}</button>)}</div>}</div>}</div>
}
