import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { useAuth } from "./AuthContext"
import * as semesterService from "../services/semesters"
import * as courseService from "../services/courses"
import * as assignmentService from "../services/assignments"
import * as examService from "../services/exams"
import * as sessionService from "../services/studySessions"
import * as reflectionService from "../services/reflections"
import type {
  AssignmentRecord,
  CourseRecord,
  ExamRecord,
  ReflectionRecord,
  Semester,
  StudySessionRecord,
} from "../types/academic"
type Value = {
  semesters: Semester[]
  courses: CourseRecord[]
  assignments: AssignmentRecord[]
  exams: ExamRecord[]
  studySessions: StudySessionRecord[]
  reflection: ReflectionRecord | null
  loading: boolean
  error: string
  addCourse: (
    v: Pick<CourseRecord, "course_code" | "course_name">,
  ) => Promise<void>
  setAssignmentStatus: (
    id: string,
    status: AssignmentRecord["status"],
  ) => Promise<void>
  persistReflection: (mood: string, notes: string) => Promise<void>
}
const Context = createContext<Value | undefined>(undefined)
const today = () => new Date().toISOString().slice(0, 10)
export function AcademicDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [semesters, setSemesters] = useState<Semester[]>([]),
    [courses, setCourses] = useState<CourseRecord[]>([]),
    [assignments, setAssignments] = useState<AssignmentRecord[]>([]),
    [exams, setExams] = useState<ExamRecord[]>([]),
    [studySessions, setStudySessions] = useState<StudySessionRecord[]>([]),
    [reflection, setReflection] = useState<ReflectionRecord | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("")
  const load = useCallback(async () => {
    if (!user) {
      setSemesters([])
      setCourses([])
      setAssignments([])
      setExams([])
      setStudySessions([])
      setReflection(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    setSemesters([])
    setCourses([])
    setAssignments([])
    setExams([])
    setStudySessions([])
    setReflection(null)
    try {
      const [s, c, a, e, ss, r] = await Promise.all([
        semesterService.listSemesters(),
        courseService.listCourses(),
        assignmentService.listAssignments(),
        examService.listExams(),
        sessionService.listStudySessions(),
        reflectionService.getReflection(today()),
      ])
      setSemesters(s)
      setCourses(c)
      setAssignments(a)
      setExams(e)
      setStudySessions(ss)
      setReflection(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load academic data")
    } finally {
      setLoading(false)
    }
  }, [user])
  useEffect(() => {
    void load()
  }, [load])
  async function addCourse(
    v: Pick<CourseRecord, "course_code" | "course_name">,
  ) {
    if (!user) return
    const row = await courseService.createCourse({
      user_id: user.id,
      semester_id: semesters.find((s) => s.is_current)?.id ?? null,
      course_code: v.course_code,
      course_name: v.course_name,
      credits: null,
      instructor: null,
      meeting_days: null,
      meeting_start: null,
      meeting_end: null,
    })
    setCourses((x) => [...x, row])
  }
  async function setAssignmentStatus(
    id: string,
    status: AssignmentRecord["status"],
  ) {
    const row = await assignmentService.updateAssignment(id, { status })
    setAssignments((x) => x.map((a) => (a.id === id ? row : a)))
  }
  async function persistReflection(mood: string, notes: string) {
    if (!user) return
    const row = await reflectionService.saveReflection({
      user_id: user.id,
      reflection_date: today(),
      mood,
      energy: null,
      notes,
    })
    setReflection(row)
  }
  return (
    <Context.Provider
      value={{
        semesters,
        courses,
        assignments,
        exams,
        studySessions,
        reflection,
        loading,
        error,
        addCourse,
        setAssignmentStatus,
        persistReflection,
      }}
    >
      {children}
    </Context.Provider>
  )
}
export function useAcademicData() {
  const v = useContext(Context)
  if (!v)
    throw new Error("useAcademicData must be used within AcademicDataProvider")
  return v
}
