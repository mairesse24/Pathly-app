import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { Dialog } from "../../components/ui/Dialog"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useAuth } from "../../context/AuthContext"
import { useProfile } from "../../context/ProfileContext"
import { createAssignment, deleteAssignment, updateAssignment } from "../../services/assignments"
import { createExam, deleteExam, updateExam } from "../../services/exams"
import { createStudySession, deleteStudySession, updateStudySession } from "../../services/studySessions"
import { listCourseRoadmap, listCourseRoadmaps, roadmapSessionTitle } from "../../services/courseRoadmap"
import type { AssignmentRecord, CourseRoadmapEntryRecord, ExamRecord, StudySessionRecord } from "../../types/academic"
import { classMeetingStatus } from "../../utils/calendarEventPresentation"
import { classifySavedDate } from "../../utils/calendarSaveOutcome"
import { buildCalendarEvents } from "../../utils/calendarEvents"
import { buildRoadmapCalendarEvents, hasReliableRoadmapDate } from "../../utils/calendarRoadmap"
import { calendarWeekDays, shiftCalendarWeek } from "../../utils/calendarWeek"
import { dateKey, formatDateKey, todayKey, validTimeZone, zonedDateTimeToIso } from "../../utils/dateTime"
import "./calendar.css"

type Kind="assignment"|"exam"|"session"
type EventStatus="completed"|"overdue"|"upcoming"
type CalendarEvent={id:string;kind:Kind;day:number;title:string;time:string;tone:string;record:AssignmentRecord|ExamRecord|StudySessionRecord;canvasOwned?:boolean;eventStatus?:EventStatus}
type ConfirmationState={text:string;overdue:boolean}
const defaultTime="12:00"
const kindLabel=(value:Kind)=>value==="assignment"?"Assignment":value==="exam"?"Exam":"Study session"
const sourceNote=(value:string)=>value==="canvas"?"Synced from Canvas":value.startsWith("syllabus:")?"Imported from a syllabus upload":null
export function CalendarPage(){
 const [params]=useSearchParams()
 const location=useLocation(),navigate=useNavigate()
 const {user}=useAuth(); const {profile}=useProfile(); const data=useAcademicData(); const {courses,assignments,exams,studySessions,loading,refreshAcademicData}=data
 const timezone=profile?.timezone,tz=validTimeZone(timezone),today=todayKey(timezone)
 // The selected week is display state only. Academic timestamps remain unchanged,
 // and the already-loaded commitment arrays can be projected into any week.
 const [weekAnchor,setWeekAnchor]=useState(today)
 const days=useMemo(()=>calendarWeekDays(weekAnchor,timezone),[weekAnchor,timezone])
 const [dialogOpen,setDialogOpen]=useState(false); const [selected,setSelected]=useState<CalendarEvent|null>(null)
 const [overdueOpen,setOverdueOpen]=useState(false); const [completingId,setCompletingId]=useState<string|null>(null); const [overdueError,setOverdueError]=useState("")
 const [confirmation,setConfirmation]=useState<ConfirmationState|null>(null)
 const [kind,setKind]=useState<Kind>("assignment"),[courseId,setCourseId]=useState(""),[title,setTitle]=useState(""),[date,setDate]=useState(today),[time,setTime]=useState(defaultTime),[endTime,setEndTime]=useState("13:00"),[saving,setSaving]=useState(false),[message,setMessage]=useState("")
 const [sessionRoadmap,setSessionRoadmap]=useState<CourseRoadmapEntryRecord[]>([]); const [sessionTopicId,setSessionTopicId]=useState("")
 const [roadmapEnabled,setRoadmapEnabled]=useState(false),[roadmapEntries,setRoadmapEntries]=useState<CourseRoadmapEntryRecord[]>([]),[roadmapLoading,setRoadmapLoading]=useState(false),[roadmapError,setRoadmapError]=useState("")
 const roadmapRequest=useRef(0)
 const course=(id:string|null)=>courses.find(c=>c.id===id)?.course_code??"Course"
 // What actually lands on the main commitment Calendar (never roadmap topics/lectures/
 // holidays, which are never turned into assignment/exam rows in the first place) is a plain,
 // testable function -- see src/utils/calendarEvents.ts and its regression tests.
 const events=useMemo<CalendarEvent[]>(()=>buildCalendarEvents({assignments,exams,studySessions,courses,days,today,timezone}),[assignments,exams,studySessions,courses,days.join("|"),today,timezone])
 const roadmapEvents=useMemo(()=>buildRoadmapCalendarEvents({roadmapEntries,courses,days}),[roadmapEntries,courses,days.join("|")])
 const hiddenRoadmapDates=useMemo(()=>roadmapEntries.filter(entry=>entry.entry_date&&!hasReliableRoadmapDate(entry)).length,[roadmapEntries])
 const overdueAssignments=useMemo(()=>assignments.filter(a=>a.due_at&&a.status!=="completed"&&dateKey(a.due_at,timezone)<today).sort((a,b)=>(a.due_at as string).localeCompare(b.due_at as string)),[assignments,timezone,today])
 useEffect(()=>{const id=params.get("item"),type=params.get("type");if(!id||!type)return;const event=events.find(item=>item.id===id&&item.kind===(type==="session"?"session":type));if(event)openExisting(event)},[events,params])
 useEffect(()=>{if(!confirmation)return;const timer=setTimeout(()=>setConfirmation(null),6000);return()=>clearTimeout(timer)},[confirmation])
 useEffect(()=>{if(!courseId){setSessionRoadmap([]);return}listCourseRoadmap(courseId).then(setSessionRoadmap).catch(()=>setSessionRoadmap([]))},[courseId])
 useEffect(()=>{
  const request=++roadmapRequest.current
  if(!roadmapEnabled){setRoadmapEntries([]);setRoadmapError("");setRoadmapLoading(false);return}
  const courseIds=courses.map(course=>course.id)
  if(!courseIds.length){setRoadmapEntries([]);setRoadmapLoading(false);return}
  setRoadmapLoading(true);setRoadmapError("")
  listCourseRoadmaps(courseIds).then(rows=>{if(roadmapRequest.current===request)setRoadmapEntries(rows)}).catch(()=>{if(roadmapRequest.current===request){setRoadmapEntries([]);setRoadmapError("Course roadmap context is unavailable right now.")}}).finally(()=>{if(roadmapRequest.current===request)setRoadmapLoading(false)})
 },[roadmapEnabled,courses.map(course=>course.id).join("|")])
 // "Plan study session" (Course Detail -> Calendar) hands off a course +
 // prefilled title via navigation state, exactly like the account-deletion
 // and password-recovery one-shot signals elsewhere in this app -- it never
 // saves anything itself, it only opens the dialog with the date/time left
 // for the student to choose, then clears the state so returning to this
 // page later (back button, revisit) doesn't reopen it.
 useEffect(()=>{
  const plan=(location.state as {planSession?:{courseId:string;title:string}}|null)?.planSession
  if(!plan)return
  setSelected(null);setKind("session");setCourseId(plan.courseId);setTitle(plan.title);setSessionTopicId("");setDate(today);setTime(defaultTime);setEndTime("13:00");setMessage("");setDialogOpen(true)
  navigate(location.pathname,{replace:true,state:null})
 },[location.state])
 function openNew(day=today){setSelected(null);setKind("assignment");setCourseId("");setTitle("");setSessionTopicId("");setDate(day);setTime(defaultTime);setEndTime("13:00");setMessage("");setDialogOpen(true)}
 function openExisting(event:CalendarEvent){setSelected(event);setKind(event.kind);setTitle("title" in event.record?event.record.title:"");setCourseId(event.record.course_id||"");setSessionTopicId("");const iso=event.kind==="assignment"?(event.record as AssignmentRecord).due_at:event.kind==="exam"?(event.record as ExamRecord).exam_at:(event.record as StudySessionRecord).start_at;if(iso){setDate(dateKey(iso,timezone));setTime(new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:tz}))}if(event.kind==="session")setEndTime(new Date((event.record as StudySessionRecord).end_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",timeZone:tz}));setMessage("");setDialogOpen(true)}
 async function markComplete(id:string){setCompletingId(id);setOverdueError("");try{await updateAssignment(id,{status:"completed"});await refreshAcademicData()}catch(reason){setOverdueError(reason instanceof Error?reason.message:"Unable to update this assignment.")}finally{setCompletingId(null)}}
 async function completeFromDialog(){if(!selected||selected.kind!=="assignment")return;setSaving(true);setMessage("");try{await updateAssignment(selected.id,{status:"completed"});await refreshAcademicData();setDialogOpen(false)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to update this assignment.")}finally{setSaving(false)}}
 function reviewItem(assignment:AssignmentRecord){if(!assignment.due_at)return;const event=events.find(item=>item.id===assignment.id&&item.kind==="assignment");setOverdueOpen(false);setWeekAnchor(dateKey(assignment.due_at,timezone));if(event)openExisting(event)}
 function announceSave(savedKind:Kind,savedDate:string,wasEdit:boolean){
  const label=`${kindLabel(savedKind)} ${wasEdit?"updated":"added"}`
  // Never silently close the dialog on a past/today/future save: always
  // land on a banner that says what happened, and for anything not
  // overdue, re-anchor the displayed week to the saved date so the item
  // is actually visible on screen rather than just trusted to exist. The
  // due date and status themselves are never touched here -- this only
  // decides what to show and which week to display.
  const timing=classifySavedDate(savedDate,today)
  if(savedKind==="assignment"&&timing==="past"){setConfirmation({text:`${label} · This item is overdue.`,overdue:true});return}
  if(!days.includes(savedDate))setWeekAnchor(savedDate)
  if(timing==="today")setConfirmation({text:`${label} · Showing in today's schedule.`,overdue:false})
  else setConfirmation({text:`${label} · Showing in the week of ${formatDateKey(savedDate,{month:"long",day:"numeric"})}.`,overdue:false})
 }
 async function save(e:FormEvent){e.preventDefault();if(!user)return;setSaving(true);setMessage("");try{const start=zonedDateTimeToIso(date,time,timezone);const wasEdit=!!selected;if(kind==="assignment"){if(!courseId)throw new Error("Select a course.");const values={course_id:courseId,title:title.trim(),due_at:start};if(selected)await updateAssignment(selected.id,values);else await createAssignment({user_id:user.id,...values,description:null,estimated_minutes:null,status:"not_started",source:"manual"})}else if(kind==="exam"){if(!courseId)throw new Error("Select a course.");const values={course_id:courseId,title:title.trim(),exam_at:start};if(selected)await updateExam(selected.id,values);else await createExam({user_id:user.id,...values,location:null,topics_summary:null,source:"manual"})}else{const end=zonedDateTimeToIso(date,endTime,timezone);if(end<=start)throw new Error("End time must be after the start time.");const sessionTitle=title.trim()||(courseId?`${course(courseId)} study session`:"Study session");const values={course_id:courseId||null,title:sessionTitle,start_at:start,end_at:end};if(selected)await updateStudySession(selected.id,values);else await createStudySession({user_id:user.id,...values,assignment_id:null,status:"scheduled"})}await refreshAcademicData();setDialogOpen(false);announceSave(kind,date,wasEdit)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to save this item.")}finally{setSaving(false)}}
 async function remove(){if(!selected||!window.confirm("Delete this calendar item?"))return;setSaving(true);try{if(selected.kind==="assignment")await deleteAssignment(selected.id);else if(selected.kind==="exam")await deleteExam(selected.id);else await deleteStudySession(selected.id);await refreshAcademicData();setDialogOpen(false)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to delete this item.")}finally{setSaving(false)}}
 const labels=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] as const; const meetingEvents:{day:number;title:string;time:string;tone:string}[]=[];courses.forEach(c=>(c.meeting_days??[]).forEach(name=>{const day=labels.findIndex(label=>label.toLowerCase().startsWith(name.toLowerCase().slice(0,3)));if(day>=0)meetingEvents.push({day,title:`${c.course_code} — ${c.course_name}`,time:c.meeting_start?.slice(0,5)??"Class",tone:classMeetingStatus(days[day],today)==="past"?"history":"blue"})}))
 return <><PageHeader title="Your week"/><main className="page"><div className="calendar-toolbar"><div><h2>A week with room to breathe.</h2><p aria-live="polite">{formatDateKey(days[0],{month:"long",day:"numeric",year:days[0].slice(0,4)!==days[6].slice(0,4)?"numeric":undefined})} – {formatDateKey(days[6],{month:"long",day:"numeric",year:"numeric"})}</p></div><div className="calendar-toolbar-actions"><div className="calendar-week-controls" aria-label="Calendar week navigation"><Button variant="secondary" onClick={()=>setWeekAnchor(shiftCalendarWeek(days[0],-1,timezone))}>Previous week</Button><Button variant="secondary" disabled={days.includes(today)} onClick={()=>setWeekAnchor(today)}>Today</Button><Button variant="secondary" onClick={()=>setWeekAnchor(shiftCalendarWeek(days[0],1,timezone))}>Next week</Button></div><label className="calendar-layer-toggle"><input type="checkbox" checked={roadmapEnabled} onChange={event=>setRoadmapEnabled(event.target.checked)}/> Course roadmap</label><Button onClick={()=>openNew()}>+ Add</Button></div></div>{roadmapError&&<p className="form-message" role="alert">{roadmapError}</p>}{roadmapEnabled&&hiddenRoadmapDates>0&&<p className="calendar-roadmap-notice" role="status">{hiddenRoadmapDates} roadmap date{hiddenRoadmapDates===1?" is":"s are"} hidden because Pathly cannot verify that the date came directly from the source document.</p>}{confirmation&&<div className="calendar-save-banner" role="status"><p className="save-success">{confirmation.text}</p>{confirmation.overdue&&<Button variant="secondary" onClick={()=>{setOverdueError("");setOverdueOpen(true);setConfirmation(null)}}>Review overdue</Button>}</div>}{overdueAssignments.length>0&&<div className="calendar-overdue-banner"><div><strong>{overdueAssignments.length} overdue item{overdueAssignments.length===1?"":"s"}</strong><p>You have unfinished work from earlier dates.</p></div><Button variant="secondary" onClick={()=>{setOverdueError("");setOverdueOpen(true)}}>Review overdue</Button></div>}<Card className="week-card"><div className="week-grid">{days.map((day,index)=><div className={`day ${day===today?"today":""}`} key={day}><button className="calendar-day-button" onClick={()=>openNew(day)} aria-label={`Add item on ${formatDateKey(day,{month:"long",day:"numeric"})}`}>{formatDateKey(day,{weekday:"short",day:"numeric"})}</button><div className="time-label">Schedule</div>{events.filter(event=>event.day===index).map(event=><button className={`calendar-event ${event.tone} ${event.kind==="session"?"study-session-event":""}`} key={`${event.kind}-${event.id}`} onClick={()=>openExisting(event)}>{event.kind==="session"&&<small className="event-kind-label">Study session</small>}{event.title}<br/><small>{event.time}</small>{event.eventStatus==="completed"&&<><br/><small className="event-status">✓ Completed</small></>}{event.eventStatus==="overdue"&&<><br/><small className="event-status">Overdue</small></>}</button>)}{roadmapEnabled&&roadmapEvents.filter(event=>event.day===index).map(event=><Link className="roadmap-calendar-event" key={`roadmap-${event.id}`} to={`/study/${event.courseId}`}><small>{event.label}</small>{event.title}</Link>)}{meetingEvents.filter(event=>event.day===index).map((event,i)=><div className={`calendar-event ${event.tone}`} key={`meeting-${day}-${i}`}>{event.title}<br/><small>{event.time}</small></div>)}</div>)}</div></Card><div className="calendar-bottom"><Card><p className="eyebrow">Displayed week</p><h3>{loading?"Loading…":`${events.filter(event=>event.day>=0&&event.day<7).length+meetingEvents.length} academic commitments`}</h3><p>Assignments, exams, course meetings, and study sessions stay together here.{roadmapEnabled?` ${roadmapLoading?"Loading roadmap context…":`${roadmapEvents.length} roadmap item${roadmapEvents.length===1?"":"s"} shown separately.`}`:""}</p></Card><Card><p className="eyebrow">In-app check-ins</p><h3>Nothing disappears when it’s late.</h3><p>Overdue work remains visible until you confirm it is complete.</p></Card></div></main>
 <Dialog open={dialogOpen} onClose={()=>setDialogOpen(false)} title={selected?"Calendar item":"Add to calendar"}>{selected?.canvasOwned?<div><p><strong>{selected.title}</strong></p><p>{selected.time}</p><p>This assignment is managed by Canvas. Edit it in Canvas so synced source data stays accurate.</p><div className="dialog-actions"><Button onClick={()=>setDialogOpen(false)}>Close</Button></div></div>:<form className="dialog-form" onSubmit={save}><label>Item type<select value={kind} disabled={!!selected} onChange={e=>setKind(e.target.value as Kind)}><option value="assignment">Assignment</option><option value="exam">Exam</option><option value="session">Study session</option></select></label>{selected&&kind!=="session"&&sourceNote((selected.record as AssignmentRecord|ExamRecord).source)&&<p className="dialog-source-note"><small>{sourceNote((selected.record as AssignmentRecord|ExamRecord).source)}</small></p>}<label>Course {kind==="session"&&"(optional)"}<select value={courseId} onChange={e=>{setCourseId(e.target.value);setSessionTopicId("")}}><option value="">{kind==="session"?"No course":"Select a course"}</option>{courses.map(c=><option key={c.id} value={c.id}>{c.course_code} — {c.course_name}</option>)}</select></label>{kind==="session"&&courseId&&sessionRoadmap.length>0&&<label>Roadmap topic (optional)<select value={sessionTopicId} onChange={e=>{setSessionTopicId(e.target.value);const entry=sessionRoadmap.find(r=>r.id===e.target.value);if(entry)setTitle(roadmapSessionTitle(entry))}}><option value="">Choose a topic to prefill the title</option>{sessionRoadmap.map(r=><option key={r.id} value={r.id}>{r.period_label?`${r.period_label} — `:""}{r.topic}</option>)}</select></label>}<label>{kind==="session"?"Study goal or title (optional)":"Title"}<input required={kind!=="session"} value={title} onChange={e=>setTitle(e.target.value)}/></label><div className="dialog-grid"><label>Date<input required type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>{kind==="session"?"Start":"Time (optional)"}<input type="time" required={kind==="session"} value={time} onChange={e=>setTime(e.target.value||defaultTime)}/></label>{kind==="session"&&<label>End<input required type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label>}</div>{message&&<p className="form-message" role="alert">{message}</p>}<div className="dialog-actions">{selected&&kind==="assignment"&&(selected.record as AssignmentRecord).status!=="completed"&&<Button type="button" variant="secondary" disabled={saving} onClick={()=>void completeFromDialog()}>Mark complete</Button>}{selected&&<Button type="button" variant="quiet" onClick={()=>void remove()}>Delete</Button>}<Button type="button" variant="secondary" onClick={()=>setDialogOpen(false)}>Cancel</Button><Button disabled={saving}>{saving?"Saving…":"Save"}</Button></div></form>}</Dialog>
 <Dialog open={overdueOpen} onClose={()=>setOverdueOpen(false)} title="Overdue items"><div className="overdue-review">{overdueAssignments.length?<ul className="overdue-list">{overdueAssignments.map(a=><li key={a.id} className="overdue-row"><div><strong>{course(a.course_id)} — {a.title}</strong><p>Was due {formatDateKey(dateKey(a.due_at!,timezone),{month:"short",day:"numeric"})}{a.source==="canvas"?" · Synced from Canvas":""}</p></div><div className="overdue-actions"><Button type="button" disabled={completingId===a.id} onClick={()=>void markComplete(a.id)}>{completingId===a.id?"Marking…":"Mark complete"}</Button><Button type="button" variant="secondary" onClick={()=>reviewItem(a)}>Open</Button></div></li>)}</ul>:<p>Nothing overdue right now.</p>}{overdueError&&<p className="form-message" role="alert">{overdueError}</p>}<div className="dialog-actions"><Button type="button" variant="secondary" onClick={()=>setOverdueOpen(false)}>Close</Button></div></div></Dialog></>
}
