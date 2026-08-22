import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useProfile } from "../../context/ProfileContext"
import { calculateDegreeProgress, deleteCompletedCourse, getActiveUserDegreePlan, getLatestDegreeAuditUploadState, getRequirementGroups, listCompletedCourses, matchVerifiedProgram, removeAllImportedCoursework, removeConfirmedGuide, saveCompletedCourse, type CourseInput, type DegreeAuditUploadState } from "../../services/degreePlanning"
import { listTranscriptImports, previewTranscriptImportRemoval, removeTranscriptImport, type TranscriptImport } from "../../services/transcriptImports"
import type { CompletedCourse, DegreeProgram, DegreeProgramMatch, RequirementGroup, UserDegreePlan } from "../../types/degreePlanning"
import { formatCatalogYear } from "../../utils/catalogYear"
import { degreeAuditNotice } from "../../utils/degreeAuditStatus"
import { formatInstant } from "../../utils/dateTime"

const empty: CourseInput = { course_code: "", course_title: "", credit_hours: 3, term: null, year: null, status: "completed" }

export function DegreePlannerPage() {
  const { profile, loading: profileLoading } = useProfile()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CompletedCourse[]>([])
  const [program, setProgram] = useState<DegreeProgram | null>(null)
  const [programMatch, setProgramMatch] = useState<DegreeProgramMatch | null>(null)
  const [auditPlan, setAuditPlan] = useState<UserDegreePlan | null>(null)
  const [latestAuditUpload, setLatestAuditUpload] = useState<DegreeAuditUploadState | null>(null)
  const [groups, setGroups] = useState<RequirementGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [auditError, setAuditError] = useState("")
  const [requirementsError, setRequirementsError] = useState("")
  const [form, setForm] = useState<CourseInput>(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [transcriptImports, setTranscriptImports] = useState<TranscriptImport[]>([])
  const [importsError, setImportsError] = useState("")
  const [importMessage, setImportMessage] = useState("")
  const [removingImportId, setRemovingImportId] = useState("")
  const [guideMessage, setGuideMessage] = useState("")
  const [guideError, setGuideError] = useState("")
  const [removingGuide, setRemovingGuide] = useState(false)
  const [courseworkMessage, setCourseworkMessage] = useState("")
  const [courseworkError, setCourseworkError] = useState("")
  const [removingAllImports, setRemovingAllImports] = useState(false)

  async function load() {
    if (profileLoading) return
    setLoading(true)
    setError("")
    setAuditError("")
    setRequirementsError("")
    setImportsError("")
    try {
      const [courseResult, matchResult, auditResult, auditUploadResult, importsResult] = await Promise.allSettled([
        listCompletedCourses(),
        matchVerifiedProgram(profile?.university, profile?.major, profile?.catalog_year),
        getActiveUserDegreePlan(),
        getLatestDegreeAuditUploadState(),
        listTranscriptImports(),
      ])
      if (courseResult.status === "fulfilled") setCourses(courseResult.value)
      else setError("Your completed coursework could not be loaded. Try refreshing this page.")
      if (matchResult.status === "fulfilled") {
        const match = matchResult.value
        setProgramMatch(match)
        setProgram(match.program)
        if (match.program) {
          try { setGroups(await getRequirementGroups(match.program.id)) }
          catch { setGroups([]); setRequirementsError("Verified requirement details are temporarily unavailable. Your completed courses are still shown below.") }
        } else setGroups([])
      } else setRequirementsError("Pathly could not check verified program requirements right now. Your completed courses are still available below.")
      if (auditResult.status === "fulfilled") setAuditPlan(auditResult.value)
      else setAuditError("Your confirmed supplemental degree plan could not be loaded. Verified catalog progress and manually entered coursework, when available, remain separate and unchanged.")
      if (auditUploadResult.status === "fulfilled") setLatestAuditUpload(auditUploadResult.value)
      if (importsResult.status === "fulfilled") setTranscriptImports(importsResult.value)
      else setImportsError("Your transcript import history could not be loaded. Completed coursework below is still accurate.")
    } finally {
      setLoading(false)
    }
  }

  // Scoped to this one transcript import (by import_id) -- only completed_courses rows this
  // specific import created or last updated are affected, and only when no other still-active
  // import also covers that course code (that row is restored to the other import's data
  // instead of deleted). Manually added coursework (source='manual') and every other import
  // are structurally untouched: see preview_transcript_import_removal /
  // remove_transcript_import in supabase/migrations/20260821170000_transcript_import_provenance_and_removal.sql.
  async function removeImportedCourses(item: TranscriptImport) {
    setImportMessage("")
    setImportsError("")
    try {
      const preview = await previewTranscriptImportRemoval(item.id)
      const details = [
        `${preview.imported_records} imported course record${preview.imported_records === 1 ? "" : "s"}`,
        `${preview.completed_course_rows_deleted} completed-course row${preview.completed_course_rows_deleted === 1 ? "" : "s"} removed`,
        preview.completed_course_rows_restored ? `${preview.completed_course_rows_restored} restored from another transcript` : "",
        preview.manual_rows_preserved ? `${preview.manual_rows_preserved} manual course${preview.manual_rows_preserved === 1 ? "" : "s"} preserved` : "",
      ].filter(Boolean).join("; ")
      if (!window.confirm(`Remove this transcript import? ${details}. This can only be reversed by re-importing the transcript.`)) return
      setRemovingImportId(item.id)
      await removeTranscriptImport(item.id)
      setTranscriptImports((current) => current.filter((value) => value.id !== item.id))
      setCourses(await listCompletedCourses())
      setImportMessage("Transcript-imported course history removed. Other imports and manually added coursework were preserved.")
    } catch (reason) {
      setImportsError(reason instanceof Error ? reason.message : "Unable to remove imported courses.")
    } finally {
      setRemovingImportId("")
    }
  }

  // Scoped to the single currently-active user_degree_plans row (by id) -- cascades only to
  // its own user_degree_requirement_groups/user_degree_requirements. completed_courses (this
  // student's actual completed/in-progress coursework) has no foreign-key path from
  // user_degree_plans and is never touched; the RPC also refuses to run at all unless this
  // plan is a guide (total_credits_completed is null), never a personal degree audit. The
  // source upload is untouched too -- source_upload_id only ever points *at* uploaded_files,
  // never the reverse, so removing the plan can't cascade toward the file. See
  // remove_confirmed_guide in supabase/migrations/20260821180000_remove_confirmed_guide.sql.
  async function removeGuide() {
    if (!auditPlan) return
    const groupCount = auditPlan.user_degree_requirement_groups.length
    if (!window.confirm(`Remove your confirmed program guide? This clears ${groupCount} saved requirement area${groupCount === 1 ? "" : "s"} from Degree Plan. Your completed and in-progress coursework is not affected, and the uploaded file (if kept) is not deleted.`)) return
    setRemovingGuide(true)
    setGuideMessage("")
    setGuideError("")
    try {
      await removeConfirmedGuide(auditPlan.id)
      setAuditPlan(null)
      setGuideMessage("Confirmed program guide removed. Your completed and in-progress coursework was not changed.")
    } catch (reason) {
      setGuideError(reason instanceof Error ? reason.message : "Unable to remove the confirmed guide.")
    } finally {
      setRemovingGuide(false)
    }
  }

  // Scoped to the caller (auth.uid()) -- clears all transcript-sourced completed_courses
  // rows and active transcript-import history in one atomic RPC. Manual coursework,
  // Degree Audit coursework/applications, confirmed guides, and uploads remain untouched.
  // See remove_all_imported_coursework in
  // supabase/migrations/20260822030000_remove_all_completed_courses.sql.
  async function removeAllImports() {
    const importedCount = courses.filter((course) => course.source === "transcript").length
    if (!importedCount && !transcriptImports.length) return
    if (!window.confirm(`Remove all transcript-imported coursework? This permanently deletes ${importedCount} imported course record${importedCount === 1 ? "" : "s"} and clears ${transcriptImports.length} active transcript import${transcriptImports.length === 1 ? "" : "s"}. Manually entered coursework, Degree Audit coursework and requirement applications, your confirmed program guide, and uploaded files will remain. This cannot be undone.`)) return
    setRemovingAllImports(true)
    setCourseworkMessage("")
    setCourseworkError("")
    try {
      const result = await removeAllImportedCoursework()
      await load()
      setCourseworkMessage(`${result.courses_removed} imported course record${result.courses_removed === 1 ? "" : "s"} removed.${result.imports_cleared ? ` ${result.imports_cleared} transcript import${result.imports_cleared === 1 ? "" : "s"} cleared.` : ""} Manual and Degree Audit coursework, requirement applications, and your confirmed program guide were not changed.`)
    } catch (reason) {
      setCourseworkError(reason instanceof Error ? reason.message : "Unable to remove imported coursework.")
    } finally {
      setRemovingAllImports(false)
    }
  }

  useEffect(() => { void load() }, [profileLoading, profile?.university, profile?.major, profile?.catalog_year])
  const progress = useMemo(() => program ? calculateDegreeProgress(program, groups, courses, auditPlan) : null, [program, groups, courses, auditPlan])
  const auditNotice = degreeAuditNotice(latestAuditUpload)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const saved = await saveCompletedCourse(form, editing || undefined)
      setCourses((current) => editing ? current.map((item) => item.id === editing ? saved : item) : [...current, saved])
      setForm(empty)
      setEditing(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this course.")
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this course from your academic record?")) return
    await deleteCompletedCourse(id)
    setCourses((current) => current.filter((item) => item.id !== id))
  }

  function edit(course: CompletedCourse) {
    setEditing(course.id)
    setForm({ course_code: course.course_code, course_title: course.course_title, credit_hours: Number(course.credit_hours), term: course.term, year: course.year, status: course.status })
  }

  return <><PageHeader title="Degree plan" materialContext={{origin:"degree"}}/><main className="page degree-planner-page">
    <div className="intro-row"><div><h2>Build an accurate degree plan.</h2><p>Progress uses requirements Pathly has reviewed from an official source or a degree audit you personally confirmed.</p></div></div>
    <p className="academic-disclaimer">Pathly helps you organize and understand academic information, but it does not replace your university&apos;s official records or an academic advisor. AI-generated summaries and extracted dates can make mistakes. Review important information before relying on it.</p>
    {requirementsError && <p className="form-message section-error" role="alert">{requirementsError}</p>}
    {auditError && <p className="form-message section-error" role="alert">{auditError}</p>}
    {auditNotice && <Card className="section-error"><h3>{auditNotice.title}</h3><p>{auditNotice.message}</p><Button variant="secondary" onClick={() => navigate("/uploads?category=degree_audit")}>{auditNotice.action}</Button></Card>}
    <Card className="degree-metadata"><p className="eyebrow">Program information</p><h3>{profile?.major || "Major not added"}</h3><p>{profile?.university || "University not added"}{profile?.catalog_year ? ` · ${formatCatalogYear(profile.catalog_year)} catalog` : ""}</p>{(profile?.graduation_year || profile?.expected_graduation_term) && <p>Expected graduation: {[profile.expected_graduation_term, profile.graduation_year].filter(Boolean).join(" ")} (provided by you; not a Pathly prediction)</p>}<Button variant="secondary" onClick={() => navigate("/settings")}>Edit in Settings</Button></Card>
    {loading ? <Card><p>Loading your academic record…</p></Card> : program && progress ? <>
      <Card className="degree-progress-card"><p className="eyebrow">Total degree credits</p><h2>{progress.completedCredits} / {program.total_credits_required} completed</h2><p>{program.university} · {program.major} · {formatCatalogYear(program.catalog_year)}</p><div className="wide-progress" aria-label={`${progress.percent}% complete`}><i style={{width:`${progress.percent}%`}}/></div>{progress.inProgressCredits > 0 && <p><strong>{progress.inProgressCredits} credits in progress</strong> (not counted as completed)</p>}<p>{Math.max(0,Number(program.total_credits_required)-progress.completedCredits)} credits needed to reach the {program.total_credits_required}-credit minimum.</p><small>Courses may satisfy both the {program.total_credits_required}-credit degree minimum and specific requirements below. Remaining requirement credits should not be added together. Source: <a href={program.source_url} target="_blank" rel="noreferrer">{program.source_title}</a></small></Card>
      <h2 className="degree-section-title">Required courses and requirement groups</h2>
      <div className="degree-requirements">{progress.groupProgress.filter(group=>group.requirement_type!=="total_degree").map((group) => <RequirementProgressCard key={group.id} group={group} auditPlan={auditPlan} onUploadAudit={()=>navigate("/uploads?category=degree_audit")}/>)}</div>
      {auditPlan && <VerifiedAuditNote audit={auditPlan} groups={groups}/>}</> : auditPlan ? <AuditPlanView plan={auditPlan}/> : programMatch?.status === "missing_academic_details" ? <TruthfulState title="We need more academic details." text={programMatch.message} action="Add academic details" onAction={() => navigate("/settings")}/> : programMatch?.status === "missing_catalog_year" ? <TruthfulState title={programMatch.message} text={catalogSupportText(programMatch)} action="Add catalog year" onAction={() => navigate("/settings")}/> : programMatch?.status === "unsupported_catalog_year" ? <UnsupportedState title="No confirmed requirement source yet." text={`${programMatch.message} ${catalogSupportText(programMatch)}`} navigate={navigate}/> : programMatch?.status === "program_unavailable" ? <UnsupportedState title="No confirmed requirement source yet." text="Pathly doesn't have independently verified requirements for this program yet. You can upload your degree audit and review the requirements Pathly identifies." navigate={navigate}/> : <UnsupportedState title="No confirmed requirement source yet." text="Pathly doesn't have enough verified or student-confirmed degree information yet." navigate={navigate}/>}
    {auditPlan && auditPlan.total_credits_completed == null && <Card className="danger-zone"><p className="eyebrow">Confirmed program guide</p><h3>Remove confirmed guide</h3><p>Removes only the requirement areas confirmed from your program/transfer guide ({auditPlan.user_degree_requirement_groups.length} saved). Your completed and in-progress coursework, and any uploaded file you kept, are not affected.</p><Button variant="secondary" className="btn-danger" disabled={removingGuide} onClick={() => void removeGuide()}>{removingGuide ? "Removing…" : "Remove confirmed guide"}</Button>{guideMessage && <p className="save-success" role="status">{guideMessage}</p>}{guideError && <p className="form-message" role="alert">{guideError}</p>}</Card>}
    <Card><p className="eyebrow">Completed coursework</p><h3>Add a course</h3>
      <form className="completed-course-form" onSubmit={save}>
        <label className="course-code-field">Course code<input required maxLength={30} value={form.course_code} onChange={(event) => setForm({...form, course_code: event.target.value})} placeholder="CSCE 2100"/></label>
        <label className="course-title-field">Course title<input required maxLength={200} value={form.course_title} onChange={(event) => setForm({...form, course_title: event.target.value})} placeholder="Foundations of Computing"/></label>
        <label className="course-credits-field">Credits<input required type="number" min="0.5" max="12" step="0.5" value={form.credit_hours} onChange={(event) => setForm({...form, credit_hours: Number(event.target.value)})}/></label>
        <label className="course-status-field">Status<select value={form.status} onChange={(event) => setForm({...form, status: event.target.value as CourseInput["status"]})}><option value="completed">Completed</option><option value="in_progress">In progress</option></select></label>
        <label className="course-term-field">Term<select value={form.term || ""} onChange={(event) => setForm({...form, term: (event.target.value || null) as CourseInput["term"]})}><option value="">Not provided</option>{["Spring", "Summer", "Fall", "Winter"].map((term) => <option key={term}>{term}</option>)}</select></label>
        <label className="course-year-field">Year<input type="number" min="1900" max="2200" placeholder="2026" value={form.year || ""} onChange={(event) => setForm({...form, year: event.target.value ? Number(event.target.value) : null})}/></label>
        <div className="form-actions completed-course-actions"><Button disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add course"}</Button>{editing && <Button type="button" variant="quiet" onClick={() => { setEditing(null); setForm(empty) }}>Cancel</Button>}</div>
      </form>
      {courses.length ? <div className="completed-course-list">{courses.map((course) => <div key={course.id}><span><strong>{course.course_code} · {course.course_title}</strong><small>{course.credit_hours} credits · {course.status === "completed" ? "Completed" : "In progress"}{course.term ? ` · ${course.term} ${course.year || ""}` : ""}</small></span><div className="form-actions"><Button variant="quiet" onClick={() => edit(course)}>Edit</Button><Button variant="quiet" onClick={() => void remove(course.id)}>Delete</Button></div></div>)}</div> : <p className="completed-courses-empty">No completed courses added yet.</p>}
      {(courses.some((course) => course.source === "transcript") || transcriptImports.length > 0) && <div className="danger-zone-inline"><p>Remove every transcript import at once. Manually entered and Degree Audit coursework remain.</p><Button variant="secondary" className="btn-danger" disabled={removingAllImports} onClick={() => void removeAllImports()}>{removingAllImports ? "Removing…" : "Remove all imported coursework"}</Button></div>}
      {courseworkMessage && <p className="save-success" role="status">{courseworkMessage}</p>}
      {courseworkError && <p className="form-message" role="alert">{courseworkError}</p>}
    </Card>
    {importsError && <p className="form-message section-error" role="alert">{importsError}</p>}
    {transcriptImports.length > 0 && <Card><p className="eyebrow">Transcript imports</p><h3>Remove imported coursework</h3><p>Removing an import affects only coursework recorded from that specific transcript. Manually added coursework, other transcript imports, and unrelated course data are not removed.</p>
      <div className="completed-course-list">{transcriptImports.map((item) => <div key={item.id}><span><strong>{item.course_count} imported course record{item.course_count === 1 ? "" : "s"}</strong><small>Imported {formatInstant(item.created_at, profile?.timezone, { dateStyle: "medium" })}</small></span><Button variant="quiet" disabled={removingImportId === item.id} onClick={() => void removeImportedCourses(item)}>{removingImportId === item.id ? "Removing…" : "Remove imported coursework"}</Button></div>)}</div>
      {importMessage && <p className="save-success" role="status">{importMessage}</p>}
    </Card>}
    <Card><p className="eyebrow">Academic record upload</p><h3>Review before sharing</h3><p>Before uploading, review your document and remove information you don't want Pathly to process. Do not include Social Security numbers, financial information, addresses, or other unnecessary personal information.</p><div className="form-actions"><Button onClick={() => navigate("/uploads?category=unofficial_transcript")}>Upload unofficial transcript</Button><Button variant="secondary" onClick={() => navigate("/uploads?category=degree_audit")}>{auditPlan?"Upload updated degree audit":"Upload degree audit"}</Button></div></Card>
    {error && <p className="form-message" role="alert">{error}</p>}
  </main></>
}

function UnsupportedState({title,text,navigate}:{title:string;text:string;navigate:(path:string)=>void}){return <Card className="degree-empty-state"><p className="eyebrow">Degree progress</p><h2>{title}</h2><p>{text}</p><div className="degree-empty-actions"><Button onClick={()=>navigate("/uploads?category=degree_audit")}>Upload degree audit</Button><Button variant="secondary" onClick={()=>document.querySelector<HTMLInputElement>(".course-code-field input")?.focus()}>Add completed courses</Button></div></Card>}

type ProgressGroup = ReturnType<typeof calculateDegreeProgress>["groupProgress"][number]
function RequirementProgressCard({group,auditPlan,onUploadAudit}:{group:ProgressGroup;auditPlan:UserDegreePlan|null;onUploadAudit:()=>void}) {
  const auditGroup=auditPlan?.user_degree_requirement_groups.find(item=>item.requirement_label.trim().toUpperCase()===group.name.trim().toUpperCase())
  const applications=auditGroup?.user_degree_requirements.filter(item=>item.application_source==="degree_audit"&&item.course_code&&Number(item.credits_applied)>0)||[]
  const unresolved=group.matching_strategy==="degree_audit_review"&&applications.length===0
  const complete=group.minimum_credits>0&&group.completedCredits>=group.minimum_credits&&!group.requiresReview
  const percent=group.minimum_credits>0?Math.min(100,Math.round(group.completedCredits/group.minimum_credits*100)):0
  return <Card className={`requirement-progress-card${complete?" requirement-complete":""}${unresolved?" requirement-unresolved":""}`}>
    <header><h3>{group.name}</h3>{complete&&<span className="requirement-complete-label">✓ Complete</span>}</header>
    {unresolved?<div className="requirement-confirmation"><strong>Confirmation needed</strong><p>Pathly needs your degree audit to confirm which completed courses apply to this requirement.</p></div>:<>
      <div className="requirement-progress-copy"><strong>{group.completedCredits} / {group.minimum_credits} credits</strong><span>{percent}% complete</span></div>
      <div className="requirement-progress-bar" role="progressbar" aria-label={`${group.name}: ${percent}% complete`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{width:`${percent}%`}}/></div>
      {group.satisfied.length>0&&<RequirementCourseList title="Completed" courses={group.satisfied} completed source={group.provenance==="degree_audit"?"Applied according to your degree audit":undefined}/>}
      {group.inProgress.length>0&&<RequirementCourseList title="In progress" courses={group.inProgress} source="Applied according to your degree audit; not counted as completed."/>}
      {group.remaining.length>0&&<RequirementCourseList title="Still needed" courses={group.remaining}/>}
      {group.remainingCredits>0&&group.remaining.length===0&&<p className="requirement-secondary">{group.remainingCredits} credits still needed.</p>}
    </>}
    {group.needsReview.length>0&&<div className="requirement-review"><strong>Needs review</strong><p>The degree audit application and confirmed coursework disagree for:</p><RequirementCourseList courses={group.needsReview}/></div>}
    {group.unresolvedCredits>0&&group.matching_strategy==="degree_audit_review"&&!unresolved&&<p className="requirement-secondary">{group.unresolvedCredits} credits still need a confirmed course application.</p>}
    {group.matching_strategy==="degree_audit_review"&&<div className="requirement-audit-action">{auditGroup&&applications.length>0&&<details className="audit-details"><summary>View audit applications</summary><ul>{applications.map(item=><li key={item.id}>{item.course_code} — {item.credits_applied} credits</li>)}</ul></details>}<Button variant="secondary" onClick={onUploadAudit}>Check degree audit</Button></div>}
  </Card>
}

function RequirementCourseList({title,courses,completed=false,source}:{title?:string;courses:string[];completed?:boolean;source?:string}) {
  const [expanded,setExpanded]=useState(false)
  const visible=expanded?courses:courses.slice(0,4),hidden=Math.max(0,courses.length-visible.length)
  return <section className="requirement-course-section">{title&&<h4>{title}</h4>}<ul className="requirement-course-list">{visible.map(code=><li key={code} className={`${completed?"completed ":""}${source?"with-source":""}`}><span>{completed&&<span aria-hidden="true">✓ </span>}{code}</span>{source&&<small>{source}</small>}</li>)}</ul>{courses.length>4&&<button type="button" className="requirement-list-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?"Show less":`+ ${hidden} more · Show all`}</button>}</section>
}

function AuditPlanView({plan}:{plan:UserDegreePlan}){
  // A confirmed program/transfer guide flows through this same plan shape
  // but is never given a completed-credits figure (see DegreeGuideReview),
  // so that field's presence is what tells personal-audit and guide-sourced
  // plans apart here -- there is no separate "kind" column to read instead.
  const fromPersonalAudit=plan.total_credits_completed!=null
  const reviewed=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(plan.confirmed_at))
  const groups=plan.user_degree_requirement_groups||[]
  const requirementCards=<div className="degree-requirements">{groups.map(group=><Card key={group.id}><p className="eyebrow">{fromPersonalAudit?group.status.replace("_"," "):"Requirement from program guide"}</p><h3>{group.requirement_label}</h3>{group.credits_remaining!=null&&<p>{group.credits_remaining} credits remaining</p>}{group.details&&<p>{group.details}</p>}{group.user_degree_requirements?.length>0&&<p>{group.user_degree_requirements.map(item=>item.requirement_text).join(", ")}</p>}</Card>)}</div>
  return <>
    <Card className="degree-progress-card"><p className="eyebrow">{fromPersonalAudit?"Based on your degree audit":"Based on your confirmed program guide"}</p><h2>{fromPersonalAudit?`${plan.total_credits_completed} completed credits shown`:"Confirmed program requirements"}</h2><p>{[plan.university,plan.major,plan.catalog_year?formatCatalogYear(plan.catalog_year):null].filter(Boolean).join(" · ")}</p><small>{fromPersonalAudit?`Based on the degree audit you confirmed on ${reviewed}. This is student-confirmed information, not a Pathly-verified catalog.`:`Based on the degree/transfer guide you confirmed on ${reviewed}. It shows program requirements only -- not your completed or in-progress courses.`}</small>{!fromPersonalAudit&&<p className="program-requirement-summary"><strong>{groups.length}</strong> confirmed requirement area{groups.length===1?"":"s"}. Completion is determined from your coursework, not from this guide.</p>}</Card>
    {fromPersonalAudit?requirementCards:<details className="program-requirements-disclosure"><summary>View program requirements <span>({groups.length})</span></summary><div className="program-requirements-content">{requirementCards}</div></details>}
  </>
}

function VerifiedAuditNote({audit,groups}:{audit:UserDegreePlan;groups:RequirementGroup[]}){const verifiedCodes=new Set(groups.flatMap(group=>group.requirement_course_options.map(option=>option.course_code)));const auditCodes=audit.user_degree_requirement_groups.flatMap(group=>group.user_degree_requirements).filter(item=>item.requirement_type==="course"&&item.course_code).map(item=>item.course_code!);const differences=auditCodes.filter(code=>!verifiedCodes.has(code));return <Card><p className="eyebrow">Degree audit context</p><h3>Your verified catalog remains the baseline.</h3><p>Your confirmed degree audit may add student-specific status, but Pathly does not silently merge it into verified requirements.</p>{differences.length>0&&<><h4>Things to double-check</h4><p>Your degree audit and Pathly's verified catalog appear to differ for: {differences.join(", ")}.</p></>}</Card>}

function catalogSupportText(match: DegreeProgramMatch) {
  if (match.canonical_university === "University of North Texas" && match.canonical_major === "Computer Science") return `Pathly currently has verified requirements for the ${match.supported_catalog_years.map(formatCatalogYear).join(" and ")} UNT Computer Science catalogs.`
  return match.supported_catalog_years.length ? `Verified catalogs available: ${match.supported_catalog_years.map(formatCatalogYear).join(", ")}.` : ""
}

function TruthfulState({title, text, action, onAction}: {title: string; text: string; action?: string; onAction?: () => void}) {
  return <Card className="degree-empty-state"><p className="eyebrow">Degree progress</p><h2>{title}</h2><p>{text}</p>{action && onAction && <Button onClick={onAction}>{action}</Button>}</Card>
}
