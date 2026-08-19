import { useEffect, useRef, useState } from "react"
import { useAcademicData } from "../../context/AcademicDataContext"
import { useAuth } from "../../context/AuthContext"
import { deleteOrganizedNote, deleteOriginalNoteUpload, listOrganizedNotes, NOTE_FILE_ACCEPT, organizeNotes, saveOrganizedNotes, uploadNoteSource, validateNoteUpload, type OrganizedNoteRecord, type OrganizedNoteResult } from "../../services/organizedNotes"
import type { UploadedFileRecord } from "../../types/uploads"
import { Button } from "../ui/Button"
import { Card } from "../ui/Card"

export function OrganizeNotes({ courseId: launchedCourseId }: { courseId?: string }) {
  const { user } = useAuth(), { courses } = useAcademicData(), fileRef = useRef<HTMLInputElement>(null)
  const [courseId, setCourseId] = useState(launchedCourseId || ""), [title, setTitle] = useState(""), [original, setOriginal] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null), [sourceUpload, setSourceUpload] = useState<UploadedFileRecord | null>(null)
  const [result, setResult] = useState<OrganizedNoteResult | null>(null), [model, setModel] = useState(""), [createCards, setCreateCards] = useState(false)
  const [saved, setSaved] = useState<OrganizedNoteRecord[]>([]), [busy, setBusy] = useState(false), [message, setMessage] = useState("")

  useEffect(() => { if (launchedCourseId) setCourseId(launchedCourseId) }, [launchedCourseId])
  useEffect(() => { if (!courseId) { setSaved([]); return }; void listOrganizedNotes(courseId).then(setSaved).catch(() => setMessage("Unable to load saved organized notes.")) }, [courseId])

  function clearDraft() { setResult(null); setTitle(""); setOriginal(""); setSelectedFile(null); setSourceUpload(null); setCreateCards(false); if (fileRef.current) fileRef.current.value = "" }
  function chooseFile(file?: File) {
    if (!file) return
    try { validateNoteUpload(file); setSelectedFile(file); setSourceUpload(null); setOriginal(""); setTitle((current) => current || file.name.replace(/\.[^.]+$/, "")); setMessage("") }
    catch (reason) { setSelectedFile(null); setMessage(reason instanceof Error ? reason.message : "Choose a supported note file.") }
  }
  async function run() {
    if (!user || !courseId || !title.trim()) return setMessage("Choose an active course and add a note title.")
    if (!selectedFile && original.trim().length < 20) return setMessage("Paste at least 20 characters or choose a note file.")
    setBusy(true); setMessage("")
    try { let upload = sourceUpload; if (selectedFile && !upload) { upload = await uploadNoteSource(user.id, courseId, selectedFile); setSourceUpload(upload) }; const generated = await organizeNotes({ courseId, title, originalText: upload ? undefined : original, uploadId: upload?.id }); setResult(generated.result); setModel(generated.model) }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to organize notes.") } finally { setBusy(false) }
  }
  async function save() {
    if (!result) return
    setBusy(true); setMessage("")
    try { await saveOrganizedNotes({ courseId, title: result.title || title, originalText: sourceUpload ? undefined : original, sourceUploadId: sourceUpload?.id, result, model, createFlashcards: createCards }); setSaved(await listOrganizedNotes(courseId)); clearDraft(); setMessage("Organized notes saved to this course. Your original upload was preserved.") }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to save organized notes.") } finally { setBusy(false) }
  }
  async function removeNote(note: OrganizedNoteRecord) {
    if (!window.confirm(`Delete the organized note “${note.title}”? The original upload will be preserved.`)) return
    setBusy(true); setMessage("")
    try { await deleteOrganizedNote(note.id); setSaved((current) => current.filter((item) => item.id !== note.id)); setMessage("Organized note deleted. The original upload was preserved.") }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to delete the organized note.") } finally { setBusy(false) }
  }
  async function removeOriginal(upload: UploadedFileRecord, dependsOnIt: boolean) {
    const warning = dependsOnIt ? "Delete the original upload? The saved organized note will remain, but its source file will no longer be available." : "Delete this original upload? This does not delete any saved organized note."
    if (!window.confirm(warning)) return
    setBusy(true); setMessage("")
    try { await deleteOriginalNoteUpload(upload); if (sourceUpload?.id === upload.id) setSourceUpload(null); setSaved((current) => current.map((note) => note.source_upload_id === upload.id ? { ...note, source_upload_id: null, source_upload: null } : note)); setMessage("Original upload deleted. Any saved organized note was preserved.") }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Unable to delete the original upload.") } finally { setBusy(false) }
  }

  return <Card className="organize-notes"><p className="eyebrow">Course notes</p><h3>Organize notes</h3><p>Upload notes securely or paste text. Notes may contain personal information, so remove anything Pathly does not need. Files stay private to your account and are processed server-side. You’ll review and edit the result before anything is saved.</p>
    {!launchedCourseId && <label>Active Study Hub course<select value={courseId} onChange={(event) => { setCourseId(event.target.value); clearDraft(); setMessage("") }}><option value="">Choose a course</option>{courses.map((course) => <option value={course.id} key={course.id}>{course.course_code} — {course.course_name}</option>)}</select></label>}
    {!result ? <div className="notes-input"><label>Note title<input maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Week 4 lecture notes" /></label><label>Paste notes (optional)<textarea maxLength={100000} value={original} disabled={Boolean(selectedFile)} onChange={(event) => setOriginal(event.target.value)} placeholder="Paste your course notes here…" /></label><input ref={fileRef} className="visually-hidden-file" type="file" accept={NOTE_FILE_ACCEPT} onChange={(event) => chooseFile(event.target.files?.[0])}/><div className="form-actions"><Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>Choose note file</Button>{selectedFile && <span className="selected-note-file"><strong>{selectedFile.name}</strong></span>}<Button disabled={busy || !courseId || !title.trim() || (!selectedFile && original.trim().length < 20)} onClick={() => void run()}>{busy ? "Organizing…" : "Organize notes"}</Button></div>{sourceUpload && <Button type="button" variant="quiet" className="btn-destructive" disabled={busy} onClick={() => void removeOriginal(sourceUpload, false)}>Delete original upload</Button>}</div> : <div className="notes-review"><h4>Organized notes</h4><p className="review-note">Review and edit this course-focused result. Your pasted text or original upload stays unchanged.</p><label>Title<input value={result.title} maxLength={200} onChange={(event) => setResult({ ...result, title: event.target.value })}/></label><label>Cleaned notes<textarea value={result.structured_notes} onChange={(event) => setResult({ ...result, structured_notes: event.target.value })}/></label><label>Concise summary<textarea value={result.summary} onChange={(event) => setResult({ ...result, summary: event.target.value })}/></label><label>Key concepts<textarea value={result.key_concepts.join("\n")} onChange={(event) => setResult({ ...result, key_concepts: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })}/></label><label>Practice questions<textarea value={result.practice_questions.join("\n")} onChange={(event) => setResult({ ...result, practice_questions: event.target.value.split("\n").map((value) => value.trim()).filter(Boolean) })}/></label>{result.flashcards.length > 0 && <label className="delete-source-choice"><input type="checkbox" checked={createCards} onChange={(event) => setCreateCards(event.target.checked)}/><span><strong>Create {result.flashcards.length} flashcards</strong><small>Save Claude’s suggested cards with these organized notes.</small></span></label>}<div className="form-actions"><Button variant="secondary" disabled={busy} onClick={clearDraft}>Cancel</Button><Button disabled={busy || !result.title.trim() || !result.structured_notes.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save to course"}</Button></div></div>}
    {message && <p className={message.startsWith("Organized notes saved") || message.includes("preserved") ? "save-success" : "form-message"} role="status">{message}</p>}
    <div className="saved-notes"><h4>Saved organized notes</h4>{saved.length ? saved.map((note) => <details key={note.id}><summary>{note.title}</summary><p>{note.organized_content.summary}</p><pre>{note.organized_content.structured_notes}</pre><div className="form-actions"><Button type="button" variant="quiet" className="btn-destructive" disabled={busy} onClick={() => void removeNote(note)}>Delete organized note</Button>{note.source_upload && <Button type="button" variant="quiet" className="btn-destructive" disabled={busy} onClick={() => void removeOriginal(note.source_upload!, true)}>Delete original upload</Button>}</div></details>) : <p>No organized notes saved yet.</p>}</div>
  </Card>
}
