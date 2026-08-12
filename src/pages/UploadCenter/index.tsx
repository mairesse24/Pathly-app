import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { PageHeader } from "../../components/layout/PageHeader"
import { Button } from "../../components/ui/Button"
import { Card } from "../../components/ui/Card"
import { Icon } from "../../components/ui/Icon"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useAuth } from "../../context/AuthContext"
import {
  deleteUpload,
  formatBytes,
  listUploads,
  uploadSourceFile,
  USER_QUOTA_BYTES,
  validateUpload,
} from "../../services/uploads"
import type { UploadCategory, UploadedFileRecord } from "../../types/uploads"

const labels: Record<UploadCategory, string> = {
  syllabus: "Syllabus",
  lecture: "Lecture material",
  degree_audit: "Degree audit",
  unofficial_transcript: "Unofficial transcript",
}

export function UploadCenterPage() {
  const { user } = useAuth()
  const { courses } = useAcademicData()
  const [params] = useSearchParams()
  const requested = params.get("category") as UploadCategory | null
  const [category, setCategory] = useState<UploadCategory>(requested && labels[requested] ? requested : "syllabus")
  const [courseId, setCourseId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [files, setFiles] = useState<UploadedFileRecord[]>([])
  const [state, setState] = useState<"idle" | "validating" | "uploading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function openFilePicker() {
    inputRef.current?.click()
  }

  useEffect(() => {
    listUploads().then(setFiles).catch((reason: unknown) => {
      setState("error")
      setMessage(reason instanceof Error ? reason.message : "Unable to load uploads.")
    })
  }, [])

  const sensitive = category === "degree_audit" || category === "unofficial_transcript"
  const used = files.reduce((sum, item) => sum + item.size_bytes, 0)

  function choose(selected: File | null) {
    setState("validating")
    setMessage("")
    try {
      if (!selected) throw new Error("Choose a file to continue.")
      validateUpload(selected)
      setFile(selected)
      setState("idle")
    } catch (reason) {
      setFile(null)
      setState("error")
      setMessage(reason instanceof Error ? reason.message : "That file cannot be uploaded.")
    }
  }

  async function upload() {
    if (!user || !file) return
    setState("uploading")
    setMessage("Uploading securely…")
    try {
      const row = await uploadSourceFile({ userId: user.id, file, category, courseId: courseId || null })
      setFiles((current) => [row, ...current])
      setFile(null)
      if (inputRef.current) inputRef.current.value = ""
      setState("success")
      setMessage("Upload complete. AI processing is not yet enabled.")
    } catch (reason) {
      setState("error")
      setMessage(reason instanceof Error ? reason.message : "Upload failed. Please try again.")
    }
  }

  async function remove(row: UploadedFileRecord) {
    if (!window.confirm(`Delete ${row.original_filename}? This cannot be undone.`)) return
    setMessage("")
    try {
      await deleteUpload(row)
      setFiles((current) => current.filter((item) => item.id !== row.id))
      setState("success")
      setMessage("File deleted and storage space reclaimed.")
    } catch (reason) {
      setState("error")
      setMessage(reason instanceof Error ? reason.message : "Unable to delete the file.")
    }
  }

  return <><PageHeader title="Upload center"/><main className="page">
    <div className="intro-row"><div><h2>Add your source materials.</h2><p>Files stay private to your account. Pathly does not analyze them yet.</p></div></div>
    <Card className="upload-zone" onClick={(event) => {
      if (!(event.target as HTMLElement).closest("button, input, select, label")) openFilePicker()
    }}>
      <div className="upload-graphic"><Icon name="upload" size={32}/></div>
      <h3>Upload a file</h3><p>PDF, PPTX, DOCX, PNG, JPG, or JPEG · 25 MB maximum</p>
      <div className="upload-fields">
        <label>File category<select value={category} onChange={(event) => { setCategory(event.target.value as UploadCategory); setCourseId("") }}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {(category === "syllabus" || category === "lecture") && <label>Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)}><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.course_code} — {course.course_name}</option>)}</select></label>}
        <input id="source-file" ref={inputRef} className="visually-hidden-file" type="file" aria-label="Choose a source file" accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg" onChange={(event) => choose(event.target.files?.[0] ?? null)}/>
      </div>
      <Button type="button" variant="secondary" onClick={openFilePicker}>Choose file</Button>
      {file && <p><strong>Selected:</strong> {file.name} · {formatBytes(file.size)}</p>}
      {sensitive && <p className="privacy-notice"><strong>Sensitive academic record.</strong> Only you can access this source file. You can delete it at any time. No course data or degree progress will be extracted until a future review-and-confirm workflow is available.</p>}
      <Button onClick={upload} disabled={!file || state === "uploading"}>{state === "uploading" ? "Uploading…" : "Upload file"}</Button>
      {message && <p className={state === "error" ? "form-message" : "save-success"} role={state === "error" ? "alert" : "status"}>{message}</p>}
    </Card>
    <div className="storage-summary"><strong>{formatBytes(used)} of 500 MB used</strong><span>Source-file quota</span><div className="mini-progress"><i style={{width:`${Math.min(100, used / USER_QUOTA_BYTES * 100)}%`}}/></div></div>
    {files.length ? <div className="uploaded-file-list">{files.map((row) => <Card key={row.id} className="uploaded-file-row"><div><p className="eyebrow">{labels[row.category]}</p><h3>{row.original_filename}</h3><p>{formatBytes(row.size_bytes)} · Uploaded {new Date(row.created_at).toLocaleDateString()}</p><p className="upload-status">Uploaded — AI processing not yet enabled</p></div><Button variant="secondary" onClick={() => void remove(row)}>Delete</Button></Card>)}</div> : <div className="empty-materials"><Icon name="file" size={28}/><h3>No uploads yet</h3><p>Files you upload will appear here.</p></div>}
  </main></>
}
