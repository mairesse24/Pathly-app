import { useEffect, useRef, useState } from "react"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useAuth } from "../../context/AuthContext"
import { formatBytes, uploadSourceFile, validateUpload } from "../../services/uploads"
import type { UploadCategory, UploadedFileRecord } from "../../types/uploads"
import { Button } from "../ui/Button"
import { Dialog } from "../ui/Dialog"

const labels: Record<UploadCategory, string> = { syllabus: "Syllabus", lecture: "Lecture material", degree_audit: "Degree audit", unofficial_transcript: "Unofficial transcript" }
export type MaterialContext = { courseId?: string; origin?: "course" | "degree" | "study" | "dashboard" }
export function AddMaterialDialog({ open, onClose, context, onUploaded }: { open: boolean; onClose: () => void; context?: MaterialContext; onUploaded?: (file: UploadedFileRecord) => void }) {
  const { user } = useAuth(); const { courses } = useAcademicData(); const inputRef = useRef<HTMLInputElement>(null)
  const priorities: UploadCategory[] = context?.origin === "degree" ? ["degree_audit", "unofficial_transcript", "syllabus", "lecture"] : ["lecture", "syllabus", "degree_audit", "unofficial_transcript"]
  const [category, setCategory] = useState<UploadCategory>(priorities[0]); const [courseId, setCourseId] = useState(context?.courseId || "")
  const [file, setFile] = useState<File | null>(null); const [state, setState] = useState<"idle"|"uploading"|"success"|"error">("idle"); const [message, setMessage] = useState("")
  useEffect(() => { if (open) { setCategory(priorities[0]); setCourseId(context?.courseId || ""); setFile(null); setState("idle"); setMessage("") } }, [open, context?.courseId, context?.origin])
  async function upload() {
    if (!user || !file) return
    setState("uploading"); setMessage("Uploading securely…")
    try { const row = await uploadSourceFile({ userId: user.id, file, category, courseId: courseId || null }); setState("success"); setMessage("Upload complete. You can review and process it from Upload Center."); onUploaded?.(row) }
    catch (reason) { setState("error"); setMessage(reason instanceof Error ? reason.message : "Upload failed. Please try again.") }
  }
  return <Dialog open={open} onClose={onClose} title="Add material"><div className="dialog-form">
    <label>Material type<select value={category} onChange={(e) => { setCategory(e.target.value as UploadCategory); setMessage("") }}>{priorities.map(value => <option value={value} key={value}>{labels[value]}</option>)}</select></label>
    {(category === "lecture" || category === "syllabus") && <label>Course<select value={courseId} onChange={e => setCourseId(e.target.value)}><option value="">Select a course</option>{courses.map(course => <option value={course.id} key={course.id}>{course.course_code} — {course.course_name}</option>)}</select></label>}
    <input ref={inputRef} className="visually-hidden-file" type="file" accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg" onChange={e => { const selected=e.target.files?.[0]||null; try { if(selected) validateUpload(selected); setFile(selected); setMessage("") } catch(reason) { setFile(null); setState("error"); setMessage(reason instanceof Error?reason.message:"Invalid file") } }}/>
    <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>Choose file</Button>
    {file && <p><strong>{file.name}</strong> · {formatBytes(file.size)}</p>}
    {(category === "degree_audit" || category === "unofficial_transcript") && <p className="privacy-notice">Remove unnecessary personal, financial, or identification information before uploading.</p>}
    {message && <p className={state === "error" ? "form-message" : "save-success"} role="status">{message}</p>}
    <div className="dialog-actions"><Button variant="quiet" onClick={onClose}>{state === "success" ? "Done" : "Cancel"}</Button>{state !== "success" && <Button disabled={!file || state === "uploading"} onClick={() => void upload()}>{state === "uploading" ? "Uploading…" : "Upload"}</Button>}</div>
  </div></Dialog>
}
