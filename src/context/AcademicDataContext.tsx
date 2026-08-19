import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useAuth } from "./AuthContext"

import * as semesterService from "../services/semesters"

import * as courseService from "../services/courses"
import type { CourseRemovalMode } from "../services/courses"

import * as assignmentService from "../services/assignments"

import * as examService from "../services/exams"

import * as sessionService from "../services/studySessions"

import * as reflectionService from "../services/reflections"
import { useProfile } from "./ProfileContext"
import { todayKey } from "../utils/dateTime"
import {
  activeCourseIds,
  filterActiveCourseItems,
} from "../utils/activePlanning"
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

  refreshAcademicData: () => Promise<void>

  addCourse: (
    v: Pick<CourseRecord, "course_code" | "course_name">,
  ) => Promise<CourseRecord>
  updateCourse: (id:string,v:Pick<CourseRecord,"course_code"|"course_name">)=>Promise<CourseRecord>
  removeCourse: (id:string,mode:CourseRemovalMode)=>Promise<void>

  setAssignmentStatus: (
    id: string,

    status: AssignmentRecord["status"],
  ) => Promise<void>

  persistReflection: (mood: string, energy: string, notes: string) => Promise<ReflectionRecord>
}

const Context = createContext<Value | undefined>(undefined)

export function AcademicDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const today = todayKey(profile?.timezone)
  const [semesters, setSemesters] = useState<Semester[]>([]),
    [courses, setCourses] = useState<CourseRecord[]>([]),
    [assignments, setAssignments] = useState<AssignmentRecord[]>([]),
    [exams, setExams] = useState<ExamRecord[]>([]),
    [studySessions, setStudySessions] = useState<StudySessionRecord[]>([]),
    [reflection, setReflection] = useState<ReflectionRecord | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("")

  // load() can be re-triggered before a previous call finishes -- user/today
  // both change during normal startup (auth resolving, then profile/timezone
  // resolving), and refreshAcademicData() can also be called manually (e.g.
  // right after a syllabus approval) while that effect-driven call is still
  // in flight. Without a sequence guard, whichever call's Promise.all merely
  // *settles* last wins, including a stale call's `if (!user)` clear -- a
  // late-resolving stale success is harmless (it carries the same live data),
  // but a stale call landing after a fresher one has already set correct
  // state is not, and reliably nukes whichever table happens to be slowest
  // to resolve (assignments, being the largest of these queries here, was
  // the one that lost this race in practice). Only the most recently
  // *started* call is ever allowed to write state.
  const loadSeq = useRef(0)
  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    const stale = () => loadSeq.current !== seq
    if (import.meta.env.DEV) console.debug(`[AcademicData] load#${seq} start`, { userId: user?.id ?? null, today })
    if (!user) {
      if (stale()) return
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

        reflectionService.getReflection(today),
      ])

      if (stale()) {
        if (import.meta.env.DEV) console.debug(`[AcademicData] load#${seq} discarded -- superseded by load#${loadSeq.current}`)
        return
      }

      if (import.meta.env.DEV) console.debug(`[AcademicData] load#${seq} raw`, { courses: c.length, assignments: a.length, exams: e.length })

      setSemesters(s)

      setCourses(c)

      const currentCourseIds = activeCourseIds(c)
      const activeAssignments = filterActiveCourseItems(a, currentCourseIds)
      const activeExams = filterActiveCourseItems(e, currentCourseIds)

      if (import.meta.env.DEV) console.debug(`[AcademicData] load#${seq} filtered`, {
        activeCourseIds: Array.from(currentCourseIds),
        assignments: { before: a.length, after: activeAssignments.length, ids: activeAssignments.map((item) => item.id) },
        exams: { before: e.length, after: activeExams.length, ids: activeExams.map((item) => item.id) },
      })

      setAssignments(activeAssignments)

      setExams(activeExams)

      setStudySessions(filterActiveCourseItems(ss, currentCourseIds, true))

      setReflection(r)
    } catch (e) {
      if (stale()) return
      setError(e instanceof Error ? e.message : "Unable to load academic data")
    } finally {
      if (!stale()) setLoading(false)
    }
  }, [user, today])
  useEffect(() => {
    void load()
  }, [load])

  async function addCourse(
    v: Pick<CourseRecord, "course_code" | "course_name">,
  ) {
    if (!user) throw new Error("You must be signed in to add a course")

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

      is_active: true,
    })

    setCourses((x) => [...x, row])
    return row
  }

  async function updateCourse(id:string,v:Pick<CourseRecord,"course_code"|"course_name">){const row=await courseService.updateCourse(id,v);setCourses(current=>current.map(course=>course.id===id?row:course));return row}
  async function removeCourse(id:string,mode:CourseRemovalMode){await courseService.removeCourseSafely(id,mode);setCourses(current=>current.filter(course=>course.id!==id));await load()}

  async function setAssignmentStatus(
    id: string,

    status: AssignmentRecord["status"],
  ) {
    const row = await assignmentService.updateAssignment(id, { status })

    setAssignments((x) => x.map((a) => (a.id === id ? row : a)))
  }

  async function persistReflection(mood: string, energy: string, notes: string) {
    if (!user) throw new Error("You must be signed in to save a reflection")

    const row = await reflectionService.saveReflection({
      user_id: user.id,

      reflection_date: today,
      mood,

      energy: energy || null,

      notes,
    })

    setReflection(row)

    return row
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

        refreshAcademicData: load,

        addCourse,
        updateCourse,
        removeCourse,

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
