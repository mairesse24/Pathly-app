import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { useProfile } from "../../context/ProfileContext"
import { calculateDegreeProgress, deleteCompletedCourse, getRequirementGroups, getVerifiedProgram, listCompletedCourses, saveCompletedCourse, type CourseInput } from "../../services/degreePlanning"
import type { CompletedCourse, DegreeProgram, RequirementGroup } from "../../types/degreePlanning"

const empty: CourseInput = { course_code: "", course_title: "", credit_hours: 3, term: null, year: null, status: "completed" }
export function DegreePlannerPage() {
  const { profile, loading: profileLoading } = useProfile(); const navigate = useNavigate()
  const [courses, setCourses] = useState<CompletedCourse[]>([]); const [program, setProgram] = useState<DegreeProgram | null>(null)
  const [groups, setGroups] = useState<RequirementGroup[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("")
  const [form, setForm] = useState<CourseInput>(empty); const [editing, setEditing] = useState<string | null>(null); const [saving, setSaving] = useState(false)
  async function load() {
    if (profileLoading) return
    setLoading(true); setError("")
    try {
      const [items, match] = await Promise.all([listCompletedCourses(), getVerifiedProgram(profile?.university, profile?.major, profile?.catalog_year)])
      setCourses(items); setProgram(match); setGroups(match ? await getRequirementGroups(match.id) : [])
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load your degree plan.") }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [profileLoading, profile?.university, profile?.major, profile?.catalog_year])
  const progress = useMemo(() => program ? calculateDegreeProgress(program, groups, courses) : null, [program, groups, courses])
  const missing = [!profile?.university && "university", !profile?.major && "major", !profile?.catalog_year && "catalog year"].filter(Boolean)
  async function save(event: React.FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { const saved = await saveCompletedCourse(form, editing || undefined); setCourses((current) => editing ? current.map((item) => item.id === editing ? saved : item) : [...current, saved]); setForm(empty); setEditing(null) } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save this course.") } finally { setSaving(false) } }
  async function remove(id: string) { if (!window.confirm("Remove this course from your academic record?")) return; await deleteCompletedCourse(id); setCourses((current) => current.filter((item) => item.id !== id)) }
  return <><PageHeader title="Degree plan"/><main className="page degree-planner-page">
    <div className="intro-row"><div><h2>Build an accurate degree plan.</h2><p>Progress is calculated only from coursework you confirm and verified program requirements.</p></div></div>
    <Card className="degree-metadata"><p className="eyebrow">Program information</p><h3>{profile?.major || "Major not added"}</h3><p>{profile?.university || "University not added"}{profile?.catalog_year ? ` · ${profile.catalog_year} catalog` : ""}</p>{(profile?.graduation_year || profile?.expected_graduation_term) && <p>Expected graduation: {[profile.expected_graduation_term, profile.graduation_year].filter(Boolean).join(" ")} (provided by you; not a Pathly prediction)</p>}<Button variant="secondary" onClick={() => navigate("/settings")}>Edit in Settings</Button></Card>
    {loading ? <Card><p>Loading your academic record…</p></Card> : missing.length ? <TruthfulState title="We don't know your degree progress yet." text={`Add your ${missing.join(", ")} in Settings, then add completed courses or upload a degree audit.`}/> : !program ? <TruthfulState title="Pathly doesn't have verified requirements for your program yet." text="You can still store completed courses. Pathly will not estimate progress without a reviewed requirement source."/> : !courses.some((course) => course.status === "completed") ? <TruthfulState title="Add completed courses to calculate your progress." text="Enter coursework manually or upload a degree audit or unofficial transcript for review."/> : progress && <>
      <Card className="degree-progress-card"><p className="eyebrow">Confirmed degree progress</p><h2>{progress.completedCredits} of {program.total_credits_required} credits confirmed</h2><div className="wide-progress" aria-label={`${progress.percent}% complete`}><i style={{width:`${progress.percent}%`}}/></div><strong>{progress.percent}% complete</strong>{progress.inProgressCredits > 0 && <p>In progress: {progress.inProgressCredits} credits (not counted as completed)</p>}<small>Verified source: <a href={program.source_url} target="_blank" rel="noreferrer">{program.source_title}</a></small></Card>
      <div className="degree-requirements">{progress.groupProgress.map((group) => <Card key={group.id}><p className="eyebrow">Requirement group</p><h3>{group.name}</h3><p>{group.completedCredits} of {group.minimum_credits} credits confirmed</p>{group.remaining.length > 0 && <p>Remaining: {group.remaining.join(", ")}</p>}</Card>)}</div>
    </>}
    <Card><p className="eyebrow">Completed coursework</p><h3>Add a course</h3><form className="completed-course-form" onSubmit={save}><label>Course code<input required maxLength={30} value={form.course_code} onChange={(e)=>setForm({...form,course_code:e.target.value})} placeholder="CSCE 2100"/></label><label>Course title<input required maxLength={200} value={form.course_title} onChange={(e)=>setForm({...form,course_title:e.target.value})} placeholder="Foundations of Computing"/></label><label>Credits<input required type="number" min="0.5" max="12" step="0.5" value={form.credit_hours} onChange={(e)=>setForm({...form,credit_hours:Number(e.target.value)})}/></label><label>Status<select value={form.status} onChange={(e)=>setForm({...form,status:e.target.value as CourseInput["status"]})}><option value="completed">Completed</option><option value="in_progress">In progress</option></select></label><label>Term<select value={form.term || ""} onChange={(e)=>setForm({...form,term:(e.target.value || null) as CourseInput["term"]})}><option value="">Not provided</option>{["Spring","Summer","Fall","Winter"].map((term)=><option key={term}>{term}</option>)}</select></label><label>Year<input type="number" min="1900" max="2200" value={form.year || ""} onChange={(e)=>setForm({...form,year:e.target.value ? Number(e.target.value) : null})}/></label><div className="form-actions"><Button disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add course"}</Button>{editing && <Button type="button" variant="quiet" onClick={()=>{setEditing(null);setForm(empty)}}>Cancel</Button>}</div></form>
      {courses.length ? <div className="completed-course-list">{courses.map((course)=><div key={course.id}><span><strong>{course.course_code} · {course.course_title}</strong><small>{course.credit_hours} credits · {course.status === "completed" ? "Completed" : "In progress"}{course.term ? ` · ${course.term} ${course.year || ""}` : ""}</small></span><div className="form-actions"><Button variant="quiet" onClick={()=>{setEditing(course.id);setForm({course_code:course.course_code,course_title:course.course_title,credit_hours:Number(course.credit_hours),term:course.term,year:course.year,status:course.status})}}>Edit</Button><Button variant="quiet" onClick={()=>void remove(course.id)}>Delete</Button></div></div>)}</div> : <p>No completed courses added yet.</p>}
    </Card>
    <Card><p className="eyebrow">Academic record upload</p><h3>Review before sharing</h3><p>Before uploading, review your document and remove information you don't want Pathly to process. Do not include Social Security numbers, financial information, addresses, or other unnecessary personal information.</p><div className="form-actions"><Button onClick={()=>navigate("/uploads?category=unofficial_transcript")}>Upload unofficial transcript</Button><Button variant="secondary" onClick={()=>navigate("/uploads?category=degree_audit")}>Upload degree audit</Button></div></Card>
    {error && <p className="form-message" role="alert">{error}</p>}
  </main></>
}
function TruthfulState({title,text}:{title:string;text:string}) { return <Card className="degree-empty-state"><p className="eyebrow">Degree progress</p><h2>{title}</h2><p>{text}</p></Card> }
