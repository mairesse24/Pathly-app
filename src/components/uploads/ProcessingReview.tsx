import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "../ui/Button"
import { Card } from "../ui/Card"
import { approveSyllabus, confirmAcademicRecord, confirmDegreeAudit } from "../../services/processing"
import { getActiveUserDegreePlan } from "../../services/degreePlanning"
import type { AcademicRecordResult, DegreeAuditResult, LectureResult, ProcessingResultRecord, SyllabusResult } from "../../types/uploads"
import type { UploadedFileRecord } from "../../types/uploads"
import { useAcademicData } from "../../context/AcademicDataContext"
import { reassociateSyllabusCourse } from "../../services/uploads"
import { classifyCourseIdentity, courseCodesMatch } from "../../utils/courseIdentity"
import { useProfile } from "../../context/ProfileContext"
import { dateKey, formatInstant } from "../../utils/dateTime"
import { buildSyllabusReviewActionLabel } from "../../utils/syllabusReviewActions"
import { findReusableSyllabusCourse, formatSyllabusCourseOption, syllabusCourseDraft } from "../../utils/syllabusCourseCreation"
import "./ProcessingReview.css"

export function ProcessingReview({ record, upload, onApproved, onCourseChanged }: { record: ProcessingResultRecord; upload: UploadedFileRecord; onApproved: (row: ProcessingResultRecord, sourceDeleted?: boolean) => void; onCourseChanged?:(courseId:string)=>void }) {
  if (record.kind === "degree_audit") return <DegreeAuditReview record={record} onApproved={onApproved}/>
  if (record.kind === "unofficial_transcript") return <AcademicRecordReview record={record} onApproved={onApproved}/>
  if (record.kind === "lecture") return <LectureStudyView result={record.result as LectureResult}/>
  return <NewSyllabusReview record={record} upload={upload} onApproved={onApproved} onCourseChanged={onCourseChanged}/>
}

function LectureStudyView({result}:{result:LectureResult}) {
  const [summaryOpen,setSummaryOpen]=useState(false),[cardIndex,setCardIndex]=useState(0),[revealed,setRevealed]=useState(false)
  const summaryLong=result.summary.length>420,preview=summaryLong?`${result.summary.slice(0,360).trim()}…`:result.summary
  const words=[result.summary,...result.key_concepts,...result.practice_questions].join(" ").trim().split(/\s+/).filter(Boolean).length
  const reviewMinutes=Math.max(1,Math.ceil(words/180)+Math.ceil(result.flashcards.length/3))
  const card=result.flashcards[cardIndex]
  function move(direction:number){setCardIndex(current=>(current+direction+result.flashcards.length)%result.flashcards.length);setRevealed(false)}
  return <Card className="processing-review lecture-study-view"><div className="study-view-header"><div><p className="eyebrow">Study materials</p><h3>{result.title}</h3></div><div className="study-metadata"><span>{result.key_concepts.length} concepts</span><span>{result.flashcards.length} flashcards</span><span>{result.practice_questions.length} practice questions</span><span>About {reviewMinutes} min</span></div></div>
    <section className="quick-summary"><h4>Quick summary</h4><p>{summaryOpen?result.summary:preview}</p>{summaryLong&&<button className="text-button" aria-expanded={summaryOpen} onClick={()=>setSummaryOpen(!summaryOpen)}>{summaryOpen?"Show less":"Read full summary"}</button>}</section>
    <section><h4>Key concepts</h4><div className="concept-list">{result.key_concepts.map(concept=><span key={concept}>{concept}</span>)}</div></section>
    <section className="flashcard-section"><div className="study-section-heading"><h4>Flashcards</h4>{result.flashcards.length>0&&<span>{cardIndex+1} / {result.flashcards.length}</span>}</div>{card?<div className="flashcard" tabIndex={0} onKeyDown={event=>{if(event.key==="ArrowLeft")move(-1);if(event.key==="ArrowRight")move(1);if(event.key==="Enter"||event.key===" "){event.preventDefault();setRevealed(value=>!value)}}}><strong>{card.front}</strong>{revealed?<div className="flashcard-answer"><small>Answer</small><p>{card.back}</p></div>:<Button variant="secondary" onClick={()=>setRevealed(true)}>Reveal answer</Button>}<div className="flashcard-actions"><Button variant="quiet" disabled={result.flashcards.length<2} onClick={()=>move(-1)}>Previous</Button>{revealed&&<Button variant="quiet" onClick={()=>setRevealed(false)}>Hide answer</Button>}<Button variant="quiet" disabled={result.flashcards.length<2} onClick={()=>move(1)}>Next</Button></div></div>:<p>No flashcards were identified.</p>}</section>
    <details className="study-details"><summary>Practice questions ({result.practice_questions.length})</summary><ol>{result.practice_questions.map(question=><li key={question}>{question}</li>)}</ol></details>
    <details className="study-details"><summary>Topics worth reviewing ({result.topics_worth_reviewing.length})</summary><ul>{result.topics_worth_reviewing.map(topic=><li key={topic}>{topic}</li>)}</ul></details>
  </Card>
}

function SyllabusCourseOverview({result}:{result:SyllabusResult}) {
  const { profile } = useProfile()
  const hasSchedule=Boolean(result.meeting_days?.length||result.meeting_start||result.meeting_end||result.location)
  const datedExams=result.exams.filter(exam=>exam.exam_at)
  return <section className="syllabus-course-overview" aria-labelledby="course-overview-heading">
    <div className="syllabus-overview-section syllabus-overview-about">
      <p className="eyebrow" id="course-overview-heading">About this course</p>
      <p>{result.course_summary}</p>
    </div>
    {result.topics?.length?<div className="syllabus-overview-section"><h4>What you'll study</h4><ul className="syllabus-topic-list">{result.topics.map(topic=><li key={topic}>{topic}</li>)}</ul></div>:null}
    {hasSchedule&&<div className="syllabus-overview-section"><h4>Class schedule</h4><div className="syllabus-schedule"><strong>{result.meeting_days?.join(" & ")}</strong>{(result.meeting_start||result.meeting_end)&&<span>{formatCourseTime(result.meeting_start)}{result.meeting_end?`–${formatCourseTime(result.meeting_end)}`:""}</span>}{result.location&&<span>{result.location}</span>}</div></div>}
    {result.grading_breakdown?.length?<div className="syllabus-overview-section"><h4>Grading</h4><dl className="syllabus-grading">{result.grading_breakdown.map(item=><div key={`${item.label}-${item.value}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl></div>:null}
    {datedExams.length>0&&<div className="syllabus-overview-section"><h4>Important dates</h4><dl className="syllabus-important-dates">{datedExams.map((exam,index)=><div key={`${exam.title}-${exam.exam_at}-${index}`}><dt>{exam.title}</dt><dd>{formatSyllabusDate(exam.exam_at!,profile?.timezone)}</dd></div>)}</dl></div>}
  </section>
}

function formatCourseTime(value:string|null) {
  if(!value)return ""
  const match=value.match(/^(\d{1,2}):(\d{2})/)
  if(!match)return value
  const hour=Number(match[1]),minute=match[2],suffix=hour>=12?"PM":"AM"
  return `${hour%12||12}:${minute} ${suffix}`
}

function formatSyllabusDate(value:string,timeZone?:string|null) {
  const options:Intl.DateTimeFormatOptions={month:"short",day:"numeric"}
  if(/T/.test(value))return formatInstant(value,timeZone,{...options,hour:"numeric",minute:"2-digit"})
  const dateOnly=value.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  return dateOnly?new Intl.DateTimeFormat(undefined,{...options,timeZone:"UTC"}).format(new Date(`${dateOnly}T12:00:00Z`)):value
}

function DegreeAuditReview({ record, onApproved }: { record: ProcessingResultRecord; onApproved: (row: ProcessingResultRecord, sourceDeleted?: boolean) => void }) {
  // Records saved before document_type existed have no field to read here --
  // they were only ever produced from a real personal audit, so that stays
  // the safe default for them.
  const documentType = (record.result as DegreeAuditResult).document_type || "personal_audit"
  if (documentType === "unsupported") return <UnsupportedDegreeDocumentReview/>
  if (documentType === "program_guide") return <DegreeGuideReview record={record} onApproved={onApproved}/>
  return <PersonalDegreeAuditReview record={record} onApproved={onApproved}/>
}

function UnsupportedDegreeDocumentReview() {
  return <Card className="processing-review">
    <p className="eyebrow">Document not recognized</p>
    <h3>Pathly couldn&apos;t recognize this as a degree audit or a degree/transfer guide.</h3>
    <p className="review-note">Nothing was extracted or saved, and nothing was marked as failed -- Pathly just doesn&apos;t support this kind of document yet. Your original file is still safely stored. You can delete it or try uploading a different document, such as an official degree audit or a program/transfer guide.</p>
  </Card>
}

function DegreeGuideReview({ record, onApproved }: { record: ProcessingResultRecord; onApproved: (row: ProcessingResultRecord, sourceDeleted?: boolean) => void }) {
  const raw = record.result as DegreeAuditResult
  // A program guide never carries a completed/in-progress signal -- forced
  // here too, in addition to the server-side normalization, so an edit
  // can't reintroduce one.
  const initial = { ...raw, courses: [], total_credits_completed: null, requirements: raw.requirements.map(requirement => ({ ...requirement, status: "unclear" as const, applied_courses: [] })) }
  const [result, setResult] = useState(() => structuredClone(initial))
  const [requirementIndexes, setRequirementIndexes] = useState(() => initial.requirements.map((_, index) => index))
  const [deleteOriginal, setDeleteOriginal] = useState(false)
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("")
  const [hasActivePlan, setHasActivePlan] = useState(false)
  const selectedRequirements = useMemo(() => new Set(requirementIndexes), [requirementIndexes])
  const toggle = (index: number, current: number[], set: (value: number[]) => void) => set(current.includes(index) ? current.filter(value => value !== index) : [...current, index])
  useEffect(() => { void getActiveUserDegreePlan().then(plan => setHasActivePlan(!!plan)).catch(() => {}) }, [])
  async function confirm() {
    setSaving(true); setMessage("")
    try {
      const requirements = requirementIndexes.map(index => ({ ...result.requirements[index], status: "unclear" as const, applied_courses: [] })).filter(Boolean)
      onApproved(await confirmDegreeAudit(record, result, [], requirements, deleteOriginal), deleteOriginal)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save this degree plan.") }
    finally { setSaving(false) }
  }
  if (record.status === "approved") return <Card className="processing-review"><p className="save-success">This program guide was saved as your degree plan.</p></Card>
  return <Card className="processing-review">
    <p className="eyebrow">Degree/transfer guide detected</p>
    <h3>This looks like a program guide, not your personal degree audit.</h3>
    <p className="review-note">This appears to be a degree/transfer guide rather than your personal degree audit. It can help Pathly understand your program requirements, but it does not show which courses you have completed.</p>
    <p className="review-note">Nothing below is marked completed or in progress -- a program guide never shows that. Your personal progress (completed and in-progress courses you&apos;ve added or confirmed elsewhere) stays separate and is never changed by confirming a guide.</p>
    {hasActivePlan && <p className="review-note">You already have an active degree plan on file. Confirming this guide will replace that plan&apos;s requirement snapshot with this one; your saved completed and in-progress courses are not affected.</p>}
    <div className="degree-audit-metadata">
      <label>University<input value={result.university || ""} onChange={event => setResult(current => ({ ...current, university: event.target.value || null }))}/></label>
      <label>Program<input value={result.major || ""} onChange={event => setResult(current => ({ ...current, major: event.target.value || null }))}/></label>
      <label>Catalog year<input type="number" min="1900" max="2200" value={result.catalog_year || ""} onChange={event => setResult(current => ({ ...current, catalog_year: event.target.value ? Number(event.target.value) : null }))}/></label>
      <label>Minimum credits required<input type="number" min="0" step="0.5" value={result.total_credits_required ?? ""} onChange={event => setResult(current => ({ ...current, total_credits_required: event.target.value ? Number(event.target.value) : null }))}/></label>
    </div>
    <h4>Requirement groups found</h4>
    {result.requirements.length ? result.requirements.map((requirement, index) => <div className="review-item degree-requirement-review" key={`${requirement.requirement_label}-${index}`}>
      <input type="checkbox" aria-label={`Include ${requirement.requirement_label}`} checked={selectedRequirements.has(index)} onChange={() => toggle(index, requirementIndexes, setRequirementIndexes)}/>
      <label>Requirement name<input value={requirement.requirement_label} onChange={event => setResult(current => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, requirement_label: event.target.value } : item) }))}/></label>
      <label>Required course codes<input value={requirement.required_course_codes.join(", ")} onChange={event => setResult(current => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, required_course_codes: event.target.value.split(",").map(value => value.trim()).filter(Boolean) } : item) }))}/></label>
      <label>Credits required<input type="number" min="0" step="0.5" value={requirement.credits_required ?? ""} onChange={event => setResult(current => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, credits_required: event.target.value ? Number(event.target.value) : null } : item) }))}/></label>
      <label>Choice or elective wording<textarea value={requirement.choice_requirement_text || ""} onChange={event => setResult(current => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, choice_requirement_text: event.target.value || null } : item) }))}/></label>
      <label>Details (recommended year/semester, transfer or TCCNS equivalents, etc.)<textarea value={requirement.details || ""} onChange={event => setResult(current => ({ ...current, requirements: current.requirements.map((item, i) => i === index ? { ...item, details: event.target.value || null } : item) }))}/></label>
      <p className="requirement-status-note">Status: not tracked from a program guide.</p>
    </div>) : <p>No requirement groups were found. Pathly will not invent missing requirements.</p>}
    <label className="delete-source-choice"><input type="checkbox" checked={deleteOriginal} onChange={event => setDeleteOriginal(event.target.checked)}/><span><strong>Delete original file after confirmation</strong><small>Optional -- a program guide contains no personal information, so keeping it is safe.</small></span></label>
    <Button disabled={saving || requirementIndexes.length === 0} onClick={() => void confirm()}>{saving ? "Saving…" : "Use as degree plan"}</Button>
    {message && <p className="form-message" role="alert">{message}</p>}
  </Card>
}

function PersonalDegreeAuditReview({ record, onApproved }: { record: ProcessingResultRecord; onApproved: (row: ProcessingResultRecord, sourceDeleted?: boolean) => void }) {
  const raw = record.result as DegreeAuditResult
  const initial = { ...raw, requirements: raw.requirements.map(requirement => ({ ...requirement, applied_courses: requirement.applied_courses || [] })) }
  const [result, setResult] = useState(() => structuredClone(initial))
  const [courseIndexes, setCourseIndexes] = useState(() => initial.courses.map((_,index)=>index))
  const [requirementIndexes, setRequirementIndexes] = useState(() => initial.requirements.map((_,index)=>index))
  const [deleteOriginal, setDeleteOriginal] = useState(true)
  const [saving,setSaving] = useState(false); const [message,setMessage] = useState("")
  const selectedCourses = useMemo(()=>new Set(courseIndexes),[courseIndexes]); const selectedRequirements = useMemo(()=>new Set(requirementIndexes),[requirementIndexes])
  const toggle=(index:number,current:number[],set:(value:number[])=>void)=>set(current.includes(index)?current.filter(value=>value!==index):[...current,index])
  async function confirm(){setSaving(true);setMessage("");try{onApproved(await confirmDegreeAudit(record,result,courseIndexes.map(index=>result.courses[index]).filter(Boolean),requirementIndexes.map(index=>result.requirements[index]).filter(Boolean),deleteOriginal),deleteOriginal)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to confirm this degree audit.")}finally{setSaving(false)}}
  if(record.status==="approved") return <Card className="processing-review"><p className="save-success">Your reviewed degree audit was saved.</p></Card>
  return <Card className="processing-review"><p className="eyebrow">Degree audit review required</p><h3>Review your degree audit</h3><p className="review-note">Nothing becomes authoritative until you confirm it. Exclude anything Pathly identified incorrectly. Personal identifiers, grades, and GPA are not stored.</p>
    <div className="degree-audit-metadata"><label>University<input value={result.university||""} onChange={event=>setResult(current=>({...current,university:event.target.value||null}))}/></label><label>Major<input value={result.major||""} onChange={event=>setResult(current=>({...current,major:event.target.value||null}))}/></label><label>Catalog start year<input type="number" min="1900" max="2200" value={result.catalog_year||""} onChange={event=>setResult(current=>({...current,catalog_year:event.target.value?Number(event.target.value):null}))}/></label><label>Total credits required<input type="number" min="0" step="0.5" value={result.total_credits_required??""} onChange={event=>setResult(current=>({...current,total_credits_required:event.target.value?Number(event.target.value):null}))}/></label><label>Completed credits shown<input type="number" min="0" step="0.5" value={result.total_credits_completed??""} onChange={event=>setResult(current=>({...current,total_credits_completed:event.target.value?Number(event.target.value):null}))}/></label></div>
    <h4>Courses found</h4>{result.courses.length?result.courses.map((course,index)=><div className="review-item academic-course-review" key={`${course.course_code}-${index}`}><input type="checkbox" aria-label={`Include ${course.course_code}`} checked={selectedCourses.has(index)} onChange={()=>toggle(index,courseIndexes,setCourseIndexes)}/><label>Course code<input value={course.course_code} onChange={event=>setResult(current=>({...current,courses:current.courses.map((item,i)=>i===index?{...item,course_code:event.target.value}:item)}))}/></label><label>Course title<input value={course.course_title} onChange={event=>setResult(current=>({...current,courses:current.courses.map((item,i)=>i===index?{...item,course_title:event.target.value}:item)}))}/></label><label>Credits<input type="number" min="0.5" max="12" step="0.5" value={course.credit_hours} onChange={event=>setResult(current=>({...current,courses:current.courses.map((item,i)=>i===index?{...item,credit_hours:Number(event.target.value)}:item)}))}/></label><label>Status<select value={course.status} onChange={event=>setResult(current=>({...current,courses:current.courses.map((item,i)=>i===index?{...item,status:event.target.value as typeof course.status}:item)}))}><option value="completed">Completed</option><option value="in_progress">In progress</option></select></label></div>):<p>No coursework candidates were found.</p>}
    <h4>Requirements found</h4>{result.requirements.length?result.requirements.map((requirement,index)=><div className="review-item degree-requirement-review" key={`${requirement.requirement_label}-${index}`}><input type="checkbox" aria-label={`Include ${requirement.requirement_label}`} checked={selectedRequirements.has(index)} onChange={()=>toggle(index,requirementIndexes,setRequirementIndexes)}/><label>Requirement name<input value={requirement.requirement_label} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,requirement_label:event.target.value}:item)}))}/></label><label>Status<select value={requirement.status} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,status:event.target.value as typeof requirement.status}:item)}))}>{["satisfied","incomplete","in_progress","unclear"].map(status=><option value={status} key={status}>{status.replace("_"," ")}</option>)}</select></label><label>Required course codes<input value={requirement.required_course_codes.join(", ")} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,required_course_codes:event.target.value.split(",").map(value=>value.trim()).filter(Boolean)}:item)}))}/><small>Eligible or required courses are not counted as applied courses.</small></label><label>Applied courses and credits<textarea value={requirement.applied_courses.map(item=>`${item.course_code}: ${item.credits_applied}`).join("\n")} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,applied_courses:event.target.value.split("\n").map(line=>{const [code,credits]=line.split(":");return {course_code:(code||"").trim(),credits_applied:Number((credits||"").trim())}}).filter(item=>item.course_code&&item.credits_applied>0)}:item)}))}/><small>One explicit degree-audit placement per line, for example CSCE 4000: 3.</small></label><label>Credits required<input type="number" min="0" step="0.5" value={requirement.credits_required??""} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,credits_required:event.target.value?Number(event.target.value):null}:item)}))}/></label><label>Credits completed<input type="number" min="0" step="0.5" value={requirement.credits_completed??""} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,credits_completed:event.target.value?Number(event.target.value):null}:item)}))}/></label><label>Credits remaining<input type="number" min="0" step="0.5" value={requirement.credits_remaining??""} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,credits_remaining:event.target.value?Number(event.target.value):null}:item)}))}/></label><label>Choice or elective wording<textarea value={requirement.choice_requirement_text||""} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,choice_requirement_text:event.target.value||null}:item)}))}/></label><label>Details<textarea value={requirement.details||""} onChange={event=>setResult(current=>({...current,requirements:current.requirements.map((item,i)=>i===index?{...item,details:event.target.value||null}:item)}))}/></label></div>):<p>No requirement candidates were found. Pathly will not invent missing requirements.</p>}
    <label className="delete-source-choice"><input type="checkbox" checked={deleteOriginal} onChange={event=>setDeleteOriginal(event.target.checked)}/><span><strong>Delete original degree audit after confirmation</strong><small>Recommended and selected by default. Confirmed minimal coursework and requirement data will remain.</small></span></label>
    <Button disabled={saving||courseIndexes.length+requirementIndexes.length===0} onClick={()=>void confirm()}>{saving?"Confirming…":"Confirm reviewed degree audit"}</Button>{message&&<p className="form-message" role="alert">{message}</p>}
  </Card>
}

function AcademicRecordReview({ record, onApproved }: { record: ProcessingResultRecord; onApproved: (row: ProcessingResultRecord, sourceDeleted?: boolean) => void }) {
  const initial = record.result as AcademicRecordResult
  const [courses, setCourses] = useState(() => structuredClone(initial.courses))
  const [selected, setSelected] = useState(() => initial.courses.map((_, index) => index))
  const [deleteOriginal, setDeleteOriginal] = useState(true)
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState("")
  const selectedSet = useMemo(() => new Set(selected), [selected])
  async function confirm() {
    setSaving(true); setMessage("")
    try { onApproved(await confirmAcademicRecord(record, selected.map((index) => courses[index]).filter(Boolean), deleteOriginal), deleteOriginal) }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to confirm these courses.") }
    finally { setSaving(false) }
  }
  if (record.status === "approved") return <Card className="processing-review"><p className="save-success">Confirmed coursework was added to your academic record.</p></Card>
  return <Card className="processing-review"><p className="eyebrow">Academic record review required</p><h3>Confirm only accurate courses</h3><p className="review-note">Extraction can make mistakes. Select, edit, or ignore every candidate before saving. No grades or personal identifiers are stored.</p>
    {courses.length ? courses.map((course,index)=><div className="review-item academic-course-review" key={`${course.course_code}-${index}`}><input type="checkbox" aria-label={`Include ${course.course_code}`} checked={selectedSet.has(index)} onChange={()=>setSelected((current)=>current.includes(index)?current.filter((value)=>value!==index):[...current,index])}/><label>Course code<input value={course.course_code} onChange={(e)=>setCourses((current)=>current.map((item,i)=>i===index?{...item,course_code:e.target.value}:item))}/></label><label>Course title<input value={course.course_title} onChange={(e)=>setCourses((current)=>current.map((item,i)=>i===index?{...item,course_title:e.target.value}:item))}/></label><label>Credits<input type="number" min="0.5" max="12" step="0.5" value={course.credit_hours} onChange={(e)=>setCourses((current)=>current.map((item,i)=>i===index?{...item,credit_hours:Number(e.target.value)}:item))}/></label><label>Status<select value={course.status} onChange={(e)=>setCourses((current)=>current.map((item,i)=>i===index?{...item,status:e.target.value as "completed"|"in_progress"}:item))}><option value="completed">Completed</option><option value="in_progress">In progress</option></select></label><label>Term<select value={course.term || ""} onChange={(e)=>setCourses((current)=>current.map((item,i)=>i===index?{...item,term:(e.target.value || null) as typeof course.term}:item))}><option value="">Not provided</option>{["Spring","Summer","Fall","Winter"].map((term)=><option key={term}>{term}</option>)}</select></label><label>Year<input type="number" min="1900" max="2200" placeholder="2026" value={course.year || ""} onChange={(e)=>setCourses((current)=>current.map((item,i)=>i===index?{...item,year:e.target.value?Number(e.target.value):null}:item))}/></label></div>) : <p>No candidate coursework was found.</p>}
    <label className="delete-source-choice"><input type="checkbox" checked={deleteOriginal} onChange={(e)=>setDeleteOriginal(e.target.checked)}/><span><strong>Delete original document after confirmation</strong><small>Recommended for sensitive transcripts and degree audits. Confirmed structured coursework will remain.</small></span></label>
    <Button disabled={saving || selected.length===0} onClick={()=>void confirm()}>{saving ? "Confirming…" : `Confirm ${selected.length} course${selected.length===1?"":"s"}`}</Button>{message&&<p className="form-message" role="alert">{message}</p>}
  </Card>
}

function SyllabusReview({ record, onApproved }: { record: ProcessingResultRecord; onApproved: (row: ProcessingResultRecord) => void }) {
  const initial = record.result as SyllabusResult
  const [result, setResult] = useState(() => structuredClone(initial))
  const [assignmentIndexes, setAssignmentIndexes] = useState(() => initial.assignments.map((_, index) => index))
  const [examIndexes, setExamIndexes] = useState(() => initial.exams.map((_, index) => index))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const selectedCount = assignmentIndexes.length + examIndexes.length
  const selectedAssignments = useMemo(() => new Set(assignmentIndexes), [assignmentIndexes])
  const selectedExams = useMemo(() => new Set(examIndexes), [examIndexes])
  function toggle(index: number, current: number[], set: (value: number[]) => void) {
    set(current.includes(index) ? current.filter((value) => value !== index) : [...current, index])
  }
  async function approve() {
    setSaving(true); setMessage("")
    try {
      const row = await approveSyllabus({ processing: record, result, assignmentIndexes, examIndexes, courseId: record.course_id || "" })
      onApproved(row)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save reviewed items.")
    } finally { setSaving(false) }
  }
  if (record.status === "approved") return <Card className="processing-review"><p className="save-success">Reviewed syllabus items were saved.</p></Card>
  return <Card className="processing-review"><p className="eyebrow">Syllabus review required</p><h3>Review before anything is added</h3>
    <SyllabusCourseOverview result={result}/><p className="review-note">Automated extraction can make mistakes. Select only accurate items and edit titles or dates before saving.</p>
    <h4>Assignments</h4>{result.assignments.length ? result.assignments.map((item, index) => <div className="review-item" key={`assignment-${index}`}>
      <input aria-label={`Include assignment ${item.title}`} type="checkbox" checked={selectedAssignments.has(index)} onChange={() => toggle(index, assignmentIndexes, setAssignmentIndexes)}/>
      <label>Title<input value={item.title} onChange={(event) => setResult((current) => ({ ...current, assignments: current.assignments.map((value, i) => i === index ? { ...value, title: event.target.value } : value) }))}/></label>
      <label>Due date (ISO)<input placeholder="YYYY-MM-DD or ISO date-time" value={item.due_at ?? ""} onChange={(event) => setResult((current) => ({ ...current, assignments: current.assignments.map((value, i) => i === index ? { ...value, due_at: event.target.value || null } : value) }))}/></label>
    </div>) : <p>No assignments found.</p>}
    <h4>Exams</h4>{result.exams.length ? result.exams.map((item, index) => <div className="review-item" key={`exam-${index}`}>
      <input aria-label={`Include exam ${item.title}`} type="checkbox" checked={selectedExams.has(index)} onChange={() => toggle(index, examIndexes, setExamIndexes)}/>
      <label>Title<input value={item.title} onChange={(event) => setResult((current) => ({ ...current, exams: current.exams.map((value, i) => i === index ? { ...value, title: event.target.value } : value) }))}/></label>
      <label>Exam date (ISO)<input placeholder="YYYY-MM-DD or ISO date-time" value={item.exam_at ?? ""} onChange={(event) => setResult((current) => ({ ...current, exams: current.exams.map((value, i) => i === index ? { ...value, exam_at: event.target.value || null } : value) }))}/></label>
    </div>) : <p>No exams found.</p>}
    <Button disabled={saving || selectedCount === 0} onClick={() => void approve()}>{saving ? "Saving…" : `Save ${selectedCount} reviewed item${selectedCount === 1 ? "" : "s"}`}</Button>
    {message && <p className="form-message" role="alert">{message}</p>}
  </Card>
}

type RoadmapDraft={key:string;period_label:string;topic:string;description:string;deliverable:string;date:string;included:boolean}

function NewSyllabusReview({record,upload,onApproved,onCourseChanged}:{record:ProcessingResultRecord;upload:UploadedFileRecord;onApproved:(row:ProcessingResultRecord)=>void;onCourseChanged?:(courseId:string)=>void}){
  const navigate=useNavigate(),{profile}=useProfile()
  const {courses:allCourses,addCourse}=useAcademicData(),initial=record.result as SyllabusResult
  const [result,setResult]=useState(()=>structuredClone(initial))
  // Only items that already carry a concrete date start selected -- an
  // undated assignment/exam (from a stale pre-roadmap result, or one the
  // model still miscategorized) is never calendar-ready until a real date
  // is added by editing it below.
  const [assignmentIndexes,setAssignmentIndexes]=useState(()=>initial.assignments.map((_,i)=>i).filter(i=>!!initial.assignments[i].due_at))
  const [examIndexes,setExamIndexes]=useState(()=>initial.exams.map((_,i)=>i).filter(i=>!!initial.exams[i].exam_at))
  // Roadmap entries are informational (never calendar items), so unlike
  // assignments/exams every extracted entry starts included -- there's no
  // "wrong date on Calendar" risk to guard against, only a wrong week
  // structure the student can edit or uncheck before saving.
  const [roadmapDrafts,setRoadmapDrafts]=useState<RoadmapDraft[]>(()=>(initial.roadmap??[]).map((entry,i)=>({key:`r${i}`,period_label:entry.period_label??"",topic:entry.topic,description:entry.description??"",deliverable:entry.deliverable??"",date:entry.date??"",included:true})))
  const initialCourseDraft=syllabusCourseDraft(initial.course_code,initial.course_title)
  const [saving,setSaving]=useState(false),[message,setMessage]=useState(""),[courseId,setCourseId]=useState(upload.course_id||record.course_id||""),[identityConfirmed,setIdentityConfirmed]=useState(false),[cancelled,setCancelled]=useState(false),[metadataFields,setMetadataFields]=useState<string[]>([])
  const [courseActionBusy,setCourseActionBusy]=useState(false),[creatingCourse,setCreatingCourse]=useState(false),[newCourseCode,setNewCourseCode]=useState(initialCourseDraft.courseCode),[newCourseTitle,setNewCourseTitle]=useState(initialCourseDraft.courseTitle)
  function updateRoadmapDraft(key:string,patch:Partial<RoadmapDraft>){setRoadmapDrafts(current=>current.map(entry=>entry.key===key?{...entry,...patch}:entry))}
  const selectedAssignments=useMemo(()=>new Set(assignmentIndexes),[assignmentIndexes]),selectedExams=useMemo(()=>new Set(examIndexes),[examIndexes]),selectedCount=assignmentIndexes.length+examIndexes.length
  const selectedRoadmap=useMemo(()=>roadmapDrafts.filter(entry=>entry.included&&entry.topic.trim()),[roadmapDrafts])
  const courses=allCourses,selectedCourse=allCourses.find(course=>course.id===courseId)
  const documentCode=initial.course_code||null,documentTitle=initial.course_title||null
  const identifiedCourse=allCourses.find(course=>documentCode?courseCodesMatch(course.course_code,documentCode):documentTitle?course.course_name.trim().toLowerCase()===documentTitle.trim().toLowerCase():false)
  const identity=classifyCourseIdentity({documentCode,documentTitle,selectedCode:selectedCourse?.course_code,selectedTitle:selectedCourse?.course_name})
  const explicitMatch=identity==="match",mismatch=identity==="mismatch"
  const metadata={instructor:result.instructor,credits:result.credits,meeting_days:result.meeting_days,meeting_start:result.meeting_start,meeting_end:result.meeting_end}
  const actionLabel=buildSyllabusReviewActionLabel({hasCourseDetails:metadataFields.length>0,roadmapCount:selectedRoadmap.length,datedItemCount:selectedCount})
  useEffect(()=>{if(!selectedCourse)return;setMetadataFields(Object.entries(metadata).filter(([key,value])=>value!==null&&value!==undefined&&!(Array.isArray(value)&&value.length===0)&&!selectedCourse[key as keyof typeof selectedCourse]).map(([key])=>key))},[courseId])
  const toggle=(index:number,current:number[],set:(value:number[])=>void)=>set(current.includes(index)?current.filter(value=>value!==index):[...current,index])
  async function move(targetId:string){if(courseActionBusy)return;setCourseActionBusy(true);setMessage("");try{await reassociateSyllabusCourse(record.id,targetId);setCourseId(targetId);setIdentityConfirmed(true);setCreatingCourse(false);onCourseChanged?.(targetId)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to move this syllabus.")}finally{setCourseActionBusy(false)}}
  async function createNewCourse(){if(courseActionBusy)return;const code=newCourseCode.trim(),title=newCourseTitle.trim();if(!code||!title){setMessage("Enter both a course code and course title.");return}setCourseActionBusy(true);setMessage("");try{const reusable=findReusableSyllabusCourse(allCourses,code);const created=reusable??await addCourse({course_code:code,course_name:title});await reassociateSyllabusCourse(record.id,created.id);setCourseId(created.id);setIdentityConfirmed(true);setCreatingCourse(false);onCourseChanged?.(created.id)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to add this course.")}finally{setCourseActionBusy(false)}}
  async function createIdentifiedCourse(){if(!documentCode||courseActionBusy)return;setCourseActionBusy(true);setMessage("");try{const reusable=findReusableSyllabusCourse(allCourses,documentCode);const created=reusable??await addCourse({course_code:documentCode,course_name:documentTitle||documentCode});await reassociateSyllabusCourse(record.id,created.id);setCourseId(created.id);setIdentityConfirmed(true);onCourseChanged?.(created.id)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to add this course.")}finally{setCourseActionBusy(false)}}
  async function approve(){setSaving(true);setMessage("");try{if(!courseId||(!explicitMatch&&!identityConfirmed))throw new Error("Confirm the syllabus course before adding items.");const courseMetadata=Object.fromEntries(Object.entries(metadata).filter(([key,value])=>metadataFields.includes(key)&&value!==null&&value!==undefined));const roadmap=selectedRoadmap.map(entry=>({period_label:entry.period_label.trim()||null,topic:entry.topic.trim(),description:entry.description.trim()||null,deliverable:entry.deliverable.trim()||null,date:entry.date||null}));const row=await approveSyllabus({processing:record,result,assignmentIndexes,examIndexes,courseId,courseMetadata,roadmap});onApproved(row)}catch(reason){setMessage(reason instanceof Error?reason.message:"Unable to save reviewed items.")}finally{setSaving(false)}}
  if(record.status==="approved"){
    const savedExams=examIndexes.map(index=>result.exams[index]).filter(Boolean),savedAssignments=assignmentIndexes.map(index=>result.assignments[index]).filter(Boolean)
    const parts=[]
    if(savedExams.length)parts.push(`${savedExams.length} exam${savedExams.length===1?"":"s"}`)
    if(savedAssignments.length)parts.push(`${savedAssignments.length} assignment${savedAssignments.length===1?"":"s"}`)
    const summary=parts.length?`${parts.join(" and ")} added${selectedCourse?` to ${selectedCourse.course_code}`:""}`:"Reviewed syllabus items were saved."
    const earliestDate=[...savedExams.map(item=>item.exam_at),...savedAssignments.map(item=>item.due_at)].filter((value):value is string=>!!value).sort((a,b)=>new Date(a).getTime()-new Date(b).getTime())[0]
    return <Card className="processing-review"><p className="save-success">{summary}</p>{selectedRoadmap.length>0&&<p className="save-success">{selectedRoadmap.length} course roadmap entr{selectedRoadmap.length===1?"y":"ies"} saved to Course Details.</p>}<p>Reopening this result will not create duplicates.</p>{earliestDate&&<Button variant="secondary" onClick={()=>navigate(`/calendar?date=${dateKey(earliestDate,profile?.timezone)}`)}>View in Calendar</Button>}</Card>
  }
  if(cancelled)return <Card className="processing-review"><p className="eyebrow">Syllabus review paused</p><h3>Nothing was added.</h3><p>Your original file and extracted candidates remain available.</p><Button variant="secondary" onClick={()=>setCancelled(false)}>Return to review</Button></Card>
  const datedFound=result.assignments.filter(a=>a.due_at).length+result.exams.filter(e=>e.exam_at).length
  return <Card className="processing-review"><p className="eyebrow">Syllabus review required</p><h3>{datedFound} dated item{datedFound===1?"":"s"} ready for Calendar</h3>
    {explicitMatch?<p className="course-match-note">Course matched: <strong>{formatSyllabusCourseOption(selectedCourse!)}</strong>.</p>:identityConfirmed?<p className="course-match-note">Course confirmed by you: <strong>{selectedCourse?formatSyllabusCourseOption(selectedCourse):"Selected course"}</strong>.</p>:mismatch?<div className="course-mismatch" role="alert"><h4>This syllabus may belong to a different course.</h4><p>You uploaded it under {selectedCourse?formatSyllabusCourseOption(selectedCourse):"the selected course"}, but the document appears to be for {documentCode}{documentTitle?` — ${documentTitle}`:""}.</p><div className="form-actions">{identifiedCourse?<Button disabled={courseActionBusy} onClick={()=>void move(identifiedCourse.id)}>Move to {formatSyllabusCourseOption(identifiedCourse)}</Button>:<Button disabled={courseActionBusy} onClick={()=>void createIdentifiedCourse()}>Create this course</Button>}<Button variant="secondary" disabled={courseActionBusy} onClick={()=>setIdentityConfirmed(true)}>Keep under {selectedCourse?.course_code} anyway</Button><Button variant="quiet" disabled={courseActionBusy} onClick={()=>setCancelled(true)}>Cancel</Button></div></div>:<div className="course-unknown"><h4>We couldn't confidently identify the course from this syllabus.</h4><div className="syllabus-course-choice"><h5>Use an existing Pathly course</h5><label>Pathly course<select value={courseId} disabled={courseActionBusy} onChange={event=>{setCourseId(event.target.value);setIdentityConfirmed(false)}}><option value="">Choose a course</option>{courses.map(course=><option key={course.id} value={course.id}>{formatSyllabusCourseOption(course)}</option>)}</select></label><Button disabled={!courseId||courseActionBusy} onClick={()=>void move(courseId)}>{courseActionBusy?"Confirming…":"Confirm selected course"}</Button></div><div className="syllabus-course-choice"><h5>Create a new course from this syllabus</h5>{creatingCourse?<><label>Course code<input required maxLength={30} value={newCourseCode} onChange={event=>setNewCourseCode(event.target.value)}/></label><label>Course title<input required maxLength={200} value={newCourseTitle} onChange={event=>setNewCourseTitle(event.target.value)}/></label>{findReusableSyllabusCourse(allCourses,newCourseCode)&&<p className="review-note">A Pathly course with this code already exists. Confirming will reuse it instead of creating a duplicate.</p>}<div className="form-actions"><Button disabled={courseActionBusy||!newCourseCode.trim()||!newCourseTitle.trim()} onClick={()=>void createNewCourse()}>{courseActionBusy?"Creating…":"Create course and continue review"}</Button><Button variant="quiet" disabled={courseActionBusy} onClick={()=>setCreatingCourse(false)}>Cancel new course</Button></div></>:<Button variant="secondary" disabled={courseActionBusy} onClick={()=>setCreatingCourse(true)}>Create a new course</Button>}</div><Button variant="quiet" disabled={courseActionBusy} onClick={()=>setCancelled(true)}>Cancel syllabus review</Button></div>}
    <section className="course-metadata-review"><h4>Course details found</h4><p><strong>Course:</strong> {result.course_code||"Not found"} {result.course_title?`— ${result.course_title}`:""}</p>{(["instructor","credits","meeting_days","meeting_start","meeting_end"] as const).map(key=><label key={key}><input type="checkbox" checked={metadataFields.includes(key)} disabled={metadata[key]===null||metadata[key]===undefined} onChange={()=>setMetadataFields(current=>current.includes(key)?current.filter(value=>value!==key):[...current,key])}/><span>{key.replace(/_/g," ")}: {Array.isArray(metadata[key])?metadata[key]?.join(", ")||"Not found":metadata[key]??"Not found"}</span>{selectedCourse?.[key as keyof typeof selectedCourse]&&metadata[key]&&selectedCourse[key as keyof typeof selectedCourse]!==metadata[key]&&<small>Differs from the current value; check to apply.</small>}</label>)}</section>
    <SyllabusCourseOverview result={result}/><p className="review-note">Select only accurate items. Edit titles and dates before adding them to the course and calendar.</p>
    <section className="course-roadmap" id="syllabus-roadmap-section">
      <h4>Course roadmap found</h4>
      {roadmapDrafts.length>0?<><p className="review-note">This is your course's week-by-week structure -- it's saved to Course Details, not Calendar. Edit or uncheck entries before saving.</p>
      {roadmapDrafts.map(draft=><div className="review-item roadmap-item" key={draft.key}>
        <input aria-label={`Include roadmap entry ${draft.topic||draft.period_label}`} type="checkbox" checked={draft.included} onChange={()=>updateRoadmapDraft(draft.key,{included:!draft.included})}/>
        <label>Period<input value={draft.period_label} placeholder="Week 4" onChange={event=>updateRoadmapDraft(draft.key,{period_label:event.target.value})}/></label>
        <label>Topic<input value={draft.topic} onChange={event=>updateRoadmapDraft(draft.key,{topic:event.target.value})}/></label>
        <label>Deliverable (optional)<input value={draft.deliverable} placeholder="Assignment 1 due" onChange={event=>updateRoadmapDraft(draft.key,{deliverable:event.target.value})}/></label>
        <label>Details (optional)<textarea value={draft.description} onChange={event=>updateRoadmapDraft(draft.key,{description:event.target.value})}/></label>
        <label>Exact date (optional)<input type="date" value={draft.date} onChange={event=>updateRoadmapDraft(draft.key,{date:event.target.value})}/></label>
      </div>)}</>:<p>No week-by-week schedule was found in this document.</p>}
    </section>
    <h4>Dated items ready for Calendar</h4>
    {result.assignments.length?result.assignments.map((item,index)=>{const hasDate=!!item.due_at;return <div className="review-item" key={`assignment-${index}`}><input aria-label={`Include assignment ${item.title}`} type="checkbox" disabled={!hasDate} checked={hasDate&&selectedAssignments.has(index)} onChange={()=>toggle(index,assignmentIndexes,setAssignmentIndexes)}/><label>Type<select value="assignment" disabled><option>Assignment</option></select></label><label>Title<input value={item.title} onChange={event=>setResult(current=>({...current,assignments:current.assignments.map((value,i)=>i===index?{...value,title:event.target.value}:value)}))}/></label><label>Due date and time<input type="datetime-local" value={item.due_at?.slice(0,16)??""} onChange={event=>{const value=event.target.value||null;setResult(current=>({...current,assignments:current.assignments.map((v,i)=>i===index?{...v,due_at:value}:v)}));setAssignmentIndexes(current=>{const has=current.includes(index);if(value&&!has)return [...current,index];if(!value&&has)return current.filter(i=>i!==index);return current})}}/></label></div>}):null}
    {result.exams.length?result.exams.map((item,index)=>{const hasDate=!!item.exam_at;return <div className="review-item" key={`exam-${index}`}><input aria-label={`Include exam ${item.title}`} type="checkbox" disabled={!hasDate} checked={hasDate&&selectedExams.has(index)} onChange={()=>toggle(index,examIndexes,setExamIndexes)}/><label>Type<select value="exam" disabled><option>Exam</option></select></label><label>Title<input value={item.title} onChange={event=>setResult(current=>({...current,exams:current.exams.map((value,i)=>i===index?{...value,title:event.target.value}:value)}))}/></label><label>Exam date and time<input type="datetime-local" value={item.exam_at?.slice(0,16)??""} onChange={event=>{const value=event.target.value||null;setResult(current=>({...current,exams:current.exams.map((v,i)=>i===index?{...v,exam_at:value}:v)}));setExamIndexes(current=>{const has=current.includes(index);if(value&&!has)return [...current,index];if(!value&&has)return current.filter(i=>i!==index);return current})}}/></label></div>}):null}
    {selectedCount===0?<div className="no-dated-items"><p>No dated items ready for Calendar.</p></div>:<p>{selectedCount} dated item{selectedCount===1?"":"s"} ready for Calendar.</p>}
    {actionLabel?<Button disabled={saving||(!explicitMatch&&!identityConfirmed)} onClick={()=>void approve()}>{saving?"Saving…":actionLabel}</Button>:<div className="no-dated-items"><p>No savable course details, roadmap entries, or dated Calendar items were found. Nothing will be added unless you edit the review above.</p></div>}
    {message&&<p className="form-message" role="alert">{message}</p>}
  </Card>
}
