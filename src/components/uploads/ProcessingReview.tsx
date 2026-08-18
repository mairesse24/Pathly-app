import { useMemo, useState } from "react"
import { Button } from "../ui/Button"
import { Card } from "../ui/Card"
import { approveSyllabus } from "../../services/processing"
import type { LectureResult, ProcessingResultRecord, SyllabusResult } from "../../types/uploads"

export function ProcessingReview({ record, onApproved }: { record: ProcessingResultRecord; onApproved: (row: ProcessingResultRecord) => void }) {
  if (record.kind === "lecture") {
    const result = record.result as LectureResult
    return <Card className="processing-review"><p className="eyebrow">Study materials</p><h3>{result.title}</h3>
      <h4>Summary</h4><p className="generated-summary">{result.summary}</p>
      <h4>Key concepts</h4><ul className="generated-key-concepts">{result.key_concepts.map((concept) => <li key={concept}>{concept}</li>)}</ul>
      <h4>Flashcards</h4><dl>{result.flashcards.map((item) => <div key={item.front}><dt>{item.front}</dt><dd>{item.back}</dd></div>)}</dl>
      <h4>Practice questions</h4><ol className="generated-practice-questions">{result.practice_questions.map((question) => <li key={question}>{question}</li>)}</ol>
      <h4>Topics worth reviewing</h4><ul>{result.topics_worth_reviewing.map((topic) => <li key={topic}>{topic}</li>)}</ul>
    </Card>
  }
  return <SyllabusReview record={record} onApproved={onApproved}/>
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
      const row = await approveSyllabus({ processing: record, result, assignmentIndexes, examIndexes })
      onApproved(row)
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Unable to save reviewed items.")
    } finally { setSaving(false) }
  }
  if (record.status === "approved") return <Card className="processing-review"><p className="save-success">Reviewed syllabus items were saved.</p></Card>
  return <Card className="processing-review"><p className="eyebrow">Syllabus review required</p><h3>Review before anything is added</h3>
    <p>{result.course_summary}</p><p className="review-note">Automated extraction can make mistakes. Select only accurate items and edit titles or dates before saving.</p>
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
