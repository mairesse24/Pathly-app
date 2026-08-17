import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useProfile } from "../../context/ProfileContext"
import { calculateDegreeProgress, deleteCompletedCourse, getActiveUserDegreePlan, getRequirementGroups, listCompletedCourses, matchVerifiedProgram, saveCompletedCourse, type CourseInput } from "../../services/degreePlanning"
import type { CompletedCourse, DegreeProgram, DegreeProgramMatch, RequirementGroup, UserDegreePlan } from "../../types/degreePlanning"
import { formatCatalogYear } from "../../utils/catalogYear"

const empty: CourseInput = { course_code: "", course_title: "", credit_hours: 3, term: null, year: null, status: "completed" }

export function DegreePlannerPage() {
  const { profile, loading: profileLoading } = useProfile()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<CompletedCourse[]>([])
  const [program, setProgram] = useState<DegreeProgram | null>(null)
  const [programMatch, setProgramMatch] = useState<DegreeProgramMatch | null>(null)
  const [auditPlan, setAuditPlan] = useState<UserDegreePlan | null>(null)
  const [groups, setGroups] = useState<RequirementGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [auditError, setAuditError] = useState("")
  const [requirementsError, setRequirementsError] = useState("")
  const [form, setForm] = useState<CourseInput>(empty)
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (profileLoading) return
    setLoading(true)
    setError("")
    setAuditError("")
    setRequirementsError("")
    try {
      const [courseResult, matchResult, auditResult] = await Promise.allSettled([
        listCompletedCourses(),
        matchVerifiedProgram(profile?.university, profile?.major, profile?.catalog_year),
        getActiveUserDegreePlan(),
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
      else setAuditError("Your supplemental degree audit could not be loaded. Verified progress remains available.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [profileLoading, profile?.university, profile?.major, profile?.catalog_year])
  const progress = useMemo(() => program ? calculateDegreeProgress(program, groups, courses, auditPlan) : null, [program, groups, courses, auditPlan])

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
    {requirementsError && <p className="form-message section-error" role="alert">{requirementsError}</p>}
    {auditError && <p className="form-message section-error" role="alert">{auditError}</p>}
    <Card className="degree-metadata"><p className="eyebrow">Program information</p><h3>{profile?.major || "Major not added"}</h3><p>{profile?.university || "University not added"}{profile?.catalog_year ? ` · ${formatCatalogYear(profile.catalog_year)} catalog` : ""}</p>{(profile?.graduation_year || profile?.expected_graduation_term) && <p>Expected graduation: {[profile.expected_graduation_term, profile.graduation_year].filter(Boolean).join(" ")} (provided by you; not a Pathly prediction)</p>}<Button variant="secondary" onClick={() => navigate("/settings")}>Edit in Settings</Button></Card>
    {loading ? <Card><p>Loading your academic record…</p></Card> : program && progress ? <>
      <Card className="degree-progress-card"><p className="eyebrow">Total degree credits</p><h2>{progress.completedCredits} / {program.total_credits_required} completed</h2><p>{program.university} · {program.major} · {formatCatalogYear(program.catalog_year)}</p><div className="wide-progress" aria-label={`${progress.percent}% complete`}><i style={{width:`${progress.percent}%`}}/></div>{progress.inProgressCredits > 0 && <p><strong>{progress.inProgressCredits} credits in progress</strong> (not counted as completed)</p>}<p>{Math.max(0,Number(program.total_credits_required)-progress.completedCredits)} credits needed to reach the {program.total_credits_required}-credit minimum.</p><small>Courses may satisfy both the {program.total_credits_required}-credit degree minimum and specific requirements below. Remaining requirement credits should not be added together. Source: <a href={program.source_url} target="_blank" rel="noreferrer">{program.source_title}</a></small></Card>
      <h2 className="degree-section-title">Required courses and requirement groups</h2>
      <div className="degree-requirements">{progress.groupProgress.filter(group=>group.requirement_type!=="total_degree").map((group) => <RequirementProgressCard key={group.id} group={group} auditPlan={auditPlan} onUploadAudit={()=>navigate("/uploads?category=degree_audit")}/>)}</div>
      {auditPlan && <VerifiedAuditNote audit={auditPlan} groups={groups}/>}</> : auditPlan ? <AuditPlanView plan={auditPlan}/> : programMatch?.status === "missing_academic_details" ? <TruthfulState title="We need more academic details." text={programMatch.message} action="Add academic details" onAction={() => navigate("/settings")}/> : programMatch?.status === "missing_catalog_year" ? <TruthfulState title={programMatch.message} text={catalogSupportText(programMatch)} action="Add catalog year" onAction={() => navigate("/settings")}/> : programMatch?.status === "unsupported_catalog_year" ? <UnsupportedState title="No confirmed requirement source yet." text={`${programMatch.message} ${catalogSupportText(programMatch)}`} navigate={navigate}/> : programMatch?.status === "program_unavailable" ? <UnsupportedState title="No confirmed requirement source yet." text="Pathly doesn't have independently verified requirements for this program yet. You can upload your degree audit and review the requirements Pathly identifies." navigate={navigate}/> : <UnsupportedState title="No confirmed requirement source yet." text="Pathly doesn't have enough verified or student-confirmed degree information yet." navigate={navigate}/>}
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
    </Card>
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

function AuditPlanView({plan}:{plan:UserDegreePlan}){const reviewed=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(plan.confirmed_at));const groups=plan.user_degree_requirement_groups||[];return <><Card className="degree-progress-card"><p className="eyebrow">Based on your degree audit</p><h2>{plan.total_credits_completed!=null?`${plan.total_credits_completed} completed credits shown`:"Confirmed degree requirements"}</h2><p>{[plan.university,plan.major,plan.catalog_year?formatCatalogYear(plan.catalog_year):null].filter(Boolean).join(" · ")}</p><small>Based on the degree audit you confirmed on {reviewed}. This is student-confirmed information, not a Pathly-verified catalog.</small></Card><div className="degree-requirements">{groups.map(group=><Card key={group.id}><p className="eyebrow">{group.status.replace("_"," ")}</p><h3>{group.requirement_label}</h3>{group.credits_remaining!=null&&<p>{group.credits_remaining} credits remaining</p>}{group.details&&<p>{group.details}</p>}{group.user_degree_requirements?.length>0&&<p>{group.user_degree_requirements.map(item=>item.requirement_text).join(", ")}</p>}</Card>)}</div></>}

function VerifiedAuditNote({audit,groups}:{audit:UserDegreePlan;groups:RequirementGroup[]}){const verifiedCodes=new Set(groups.flatMap(group=>group.requirement_course_options.map(option=>option.course_code)));const auditCodes=audit.user_degree_requirement_groups.flatMap(group=>group.user_degree_requirements).filter(item=>item.requirement_type==="course"&&item.course_code).map(item=>item.course_code!);const differences=auditCodes.filter(code=>!verifiedCodes.has(code));return <Card><p className="eyebrow">Degree audit context</p><h3>Your verified catalog remains the baseline.</h3><p>Your confirmed degree audit may add student-specific status, but Pathly does not silently merge it into verified requirements.</p>{differences.length>0&&<><h4>Things to double-check</h4><p>Your degree audit and Pathly's verified catalog appear to differ for: {differences.join(", ")}.</p></>}</Card>}

function catalogSupportText(match: DegreeProgramMatch) {
  if (match.canonical_university === "University of North Texas" && match.canonical_major === "Computer Science") return `Pathly currently has verified requirements for the ${match.supported_catalog_years.map(formatCatalogYear).join(" and ")} UNT Computer Science catalogs.`
  return match.supported_catalog_years.length ? `Verified catalogs available: ${match.supported_catalog_years.map(formatCatalogYear).join(", ")}.` : ""
}

function TruthfulState({title, text, action, onAction}: {title: string; text: string; action?: string; onAction?: () => void}) {
  return <Card className="degree-empty-state"><p className="eyebrow">Degree progress</p><h2>{title}</h2><p>{text}</p>{action && onAction && <Button onClick={onAction}>{action}</Button>}</Card>
}
