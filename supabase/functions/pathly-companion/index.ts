import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import {
  activeCourseIds,
  filterActiveCourseItems,
} from "../_shared/activePlanning.ts"
import { buildSmartPlan } from "../_shared/smartPlanning.ts"
import { classifyCompanionIntent } from "../_shared/companionIntent.ts"
import { buildCompanionSystemPrompt } from "../_shared/companionPrompt.ts"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
}
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers })
const failure = {
  error: "companion_failed",
  message: "Pathly couldn't answer that right now. Try again.",
}
type SourceType = "assignment" | "exam" | "calendar" | "lecture" | "syllabus" | "course" | "reflection" | "note" | "roadmap"
type Source = { label: string; type: SourceType }

function readNamedKey(name: string, legacyName: string) {
  const legacy = Deno.env.get(legacyName)
  if (legacy) return legacy
  const encoded = Deno.env.get(name)
  if (!encoded) return ""
  try {
    return JSON.parse(encoded).default || ""
  } catch {
    return ""
  }
}
function words(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) || [])
}
function relevance(query: string, candidate: string) {
  const queryWords = words(query)
  let score = 0
  for (const word of words(candidate)) if (queryWords.has(word)) score += 1
  return score
}
function compact(value: unknown, max = 6000) {
  return JSON.stringify(value).slice(0, max)
}
function validTimeZone(value: unknown) {
  if (typeof value !== "string" || value.length > 100) return "UTC"
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return value } catch { return "UTC" }
}
function localDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}
async function duplicateClaim(userId: string, message: string) {
  const bucket = Math.floor(Date.now() / 30_000)
  const bytes = new TextEncoder().encode(`${userId}\n${bucket}\n${message}`)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    things_to_double_check: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "sources", "things_to_double_check"],
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers })
  if (req.method !== "POST")
    return respond({ error: "method_not_allowed" }, 405)
  const authorization = req.headers.get("Authorization")
  if (!authorization?.startsWith("Bearer "))
    return respond({ error: "authentication_required" }, 401)

  const url = Deno.env.get("SUPABASE_URL") || ""
  const publishableKey = readNamedKey(
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_ANON_KEY",
  )
  const secretKey = readNamedKey(
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_SERVICE_ROLE_KEY",
  )
  if (!url || !publishableKey || !secretKey) {
    console.error("Companion is missing Supabase environment variables")
    return respond(failure, 500)
  }
  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
  })
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser(authorization.slice(7))
  if (authError || !user) return respond({ error: "invalid_session" }, 401)
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false },
  })

  try {
    const body = await req.json()
    const message = typeof body.message === "string" ? body.message.trim() : ""
    const requestedTimeZone = validTimeZone(body.timezone)
    let conversationId =
      typeof body.conversation_id === "string" ? body.conversation_id : ""
    if (!message || message.length > 2000) return respond({ error: "invalid_request" }, 400)

    if (conversationId) {
      const { data: owned } = await admin
        .from("companion_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle()
      if (!owned) return respond({ error: "conversation_not_found" }, 404)
    }
    const dedupeKey = await duplicateClaim(user.id, message)
    const { data: claimed } = await admin.from("companion_messages").select("*").eq("user_id", user.id).eq("dedupe_key", dedupeKey).eq("role", "user").maybeSingle()
    if (claimed) {
      const { data: existing } = await admin.from("companion_messages").select("*").eq("conversation_id", claimed.conversation_id).eq("request_id", claimed.request_id).eq("role", "assistant").maybeSingle()
      const { data: conversation } = await admin.from("companion_conversations").select("*").eq("id", claimed.conversation_id).eq("user_id", user.id).single()
      if (existing) return respond({ conversation, user_message: claimed, message: existing })
      return respond({ error: "request_in_progress", message: "Pathly is already working on that request." }, 409)
    }
    const createdConversation = !conversationId
    if (!conversationId) {
      const title = message.length > 60 ? `${message.slice(0, 57)}...` : message
      const { data: created, error } = await admin
        .from("companion_conversations")
        .insert({ user_id: user.id, title })
        .select("*")
        .single()
      if (error) throw error
      conversationId = created.id
    }
    const { data: userMessage, error: claimError } = await admin.from("companion_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: message, dedupe_key: dedupeKey }).select("*").single()
    if (claimError) {
      const { data: competing } = await admin.from("companion_messages").select("*").eq("user_id", user.id).eq("dedupe_key", dedupeKey).eq("role", "user").maybeSingle()
      if (competing) {
        if (createdConversation) await admin.from("companion_conversations").delete().eq("id", conversationId).eq("user_id", user.id)
        return respond({ error: "request_in_progress", message: "Pathly is already working on that request." }, 409)
      }
      throw claimError
    }
    const requestId = userMessage.request_id

    const lower = message.toLowerCase()
    const { wantsPlanning, wantsLecture, wantsSyllabus, wantsRoadmap, wantsNotes, wantsDegree } =
      classifyCompanionIntent(message)
    const sources: Source[] = []
    const context: string[] = []
    const add = (label: string, type: SourceType, value: unknown) => {
      sources.push({ label, type })
      context.push(`${label}: ${compact(value)}`)
    }
    const { data: courses = [] } = await admin
      .from("courses")
      .select(
        "id,course_code,course_name,instructor,meeting_days,meeting_start,meeting_end,is_active",
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
    const currentCourseIds = activeCourseIds(courses || [])
    const currentCourseIdList = [...currentCourseIds]
    const courseById = new Map(
      (courses || []).map((course: any) => [course.id, course]),
    )
    const { data: profile } = await admin.from("profiles").select("timezone,preferred_study_time,focus_session_minutes,prefers_breaks,break_duration_minutes,non_academic_constraints,planning_style,primary_support_goal,university,major,catalog_year,expected_graduation_term,graduation_year").eq("id", user.id).maybeSingle()
    const timeZone = validTimeZone(profile?.timezone || requestedTimeZone)
    const localToday = localDateKey(new Date(), timeZone)

    if (wantsPlanning) {
      const now = new Date()
      const later = new Date(now.getTime() + 30 * 86400000)
      const assignmentsRequest = currentCourseIdList.length
        ? admin
          .from("assignments")
          .select("id,course_id,title,due_at,estimated_minutes,status,canvas_submission_status")
          .eq("user_id", user.id)
          .in("course_id", currentCourseIdList)
          .neq("status", "completed")
          .order("due_at")
          .limit(50)
        : Promise.resolve({ data: [] })
      const examsRequest = currentCourseIdList.length
        ? admin
          .from("exams")
          .select("id,course_id,title,exam_at,topics_summary")
          .eq("user_id", user.id)
          .in("course_id", currentCourseIdList)
          .gte("exam_at", now.toISOString())
          .lte("exam_at", later.toISOString())
          .order("exam_at")
          .limit(5)
        : Promise.resolve({ data: [] })
      const sessionsRequest = currentCourseIdList.length
        ? admin
          .from("study_sessions")
          .select("id,course_id,assignment_id,title,start_at,end_at,status")
          .eq("user_id", user.id)
          .or(`course_id.is.null,course_id.in.(${currentCourseIdList.join(",")})`)
          .gte("end_at", now.toISOString())
          .lte("start_at", later.toISOString())
          .order("start_at")
          .limit(8)
        : admin
          .from("study_sessions")
          .select("id,course_id,assignment_id,title,start_at,end_at,status")
          .eq("user_id", user.id)
          .is("course_id", null)
          .gte("end_at", now.toISOString())
          .lte("start_at", later.toISOString())
          .order("start_at")
          .limit(8)
      const busyPeriodsRequest = admin
        .from("calendar_busy_periods")
        .select("starts_at,ends_at,source")
        .eq("user_id", user.id)
        .lt("starts_at", later.toISOString())
        .gt("ends_at", now.toISOString())
        .order("starts_at")
        .limit(100)
      const [
        { data: assignments = [] },
        { data: exams = [] },
        { data: sessions = [] },
        { data: busyPeriods = [] },
        { data: reflections = [] },
      ] = await Promise.all([
        assignmentsRequest,
        examsRequest,
        sessionsRequest,
        busyPeriodsRequest,
        admin
          .from("daily_reflections")
          .select("reflection_date,mood,energy,notes")
          .eq("user_id", user.id)
          .eq("reflection_date", localToday)
          .limit(1),
      ])
      const plan = buildSmartPlan({
        assignments: filterActiveCourseItems(assignments || [], currentCourseIds),
        exams: filterActiveCourseItems(exams || [], currentCourseIds),
        studySessions: filterActiveCourseItems(sessions || [], currentCourseIds, true),
        courses: courses || [],
        reflection: reflections?.[0] || null,
        preferences: profile,
        timeZone,
        now,
      })
      add("Today's focus", "assignment", plan)
      if (busyPeriods?.length) add("Personal busy times", "calendar", busyPeriods)
    }
    if (wantsDegree) {
      const { data: completed = [] } = await admin.from("completed_courses")
        .select("course_code,course_title,credit_hours,status").eq("user_id", user.id)
      const { data: auditPlan, error: auditPlanError } = await admin.from("user_degree_plans")
        .select("id,university,major,catalog_year,total_credits_required,total_credits_completed,confirmed_at,user_degree_requirement_groups(requirement_label,status,credits_required,credits_completed,credits_remaining,details,user_degree_requirements(requirement_type,course_code,requirement_text,status,credits_applied,application_source))")
        .eq("user_id",user.id).eq("status","active").maybeSingle()
      if (auditPlanError) throw auditPlanError
      const { data: programMatch, error: programMatchError } = await admin.rpc("match_degree_program", {
        p_university: profile?.university || null,
        p_major: profile?.major || null,
        p_catalog_year: profile?.catalog_year || null,
      })
      if (programMatchError) throw programMatchError
      const program = programMatch?.program
      if ((programMatch?.status !== "matched" || !program) && auditPlan) {
        add("Degree Planner", "course", { supported: true, requirement_source: "degree_audit", provenance_label: "Based on your degree audit", confirmed_at: auditPlan.confirmed_at, university: auditPlan.university, major: auditPlan.major, catalog_year: auditPlan.catalog_year, completed_credits_shown_by_audit: auditPlan.total_credits_completed, total_credits_required_shown_by_audit: auditPlan.total_credits_required, requirement_progress: auditPlan.user_degree_requirement_groups, message: "Use only the requirements from the degree audit the student reviewed. Do not extrapolate beyond it." })
      } else if (programMatch?.status !== "matched" || !program) {
        add("Degree Planner", "course", { supported: false, requirement_source: null, ...programMatch, message: "I don't have enough verified or student-confirmed degree information yet. Upload a degree audit and review the extracted requirements first." })
      } else {
        const { data: groups = [] } = await admin.from("requirement_groups").select("id,name,description,requirement_type,minimum_credits,matching_strategy").eq("program_id", program.id).order("sort_order")
        const groupIds = (groups || []).map((group: any) => group.id)
        const { data: options = [] } = groupIds.length ? await admin.from("requirement_course_options").select("group_id,course_code,course_title,credit_hours,prerequisite_text").in("group_id", groupIds) : { data: [] }
        const unique = new Map<string, any>(); for (const course of completed || []) unique.set(course.course_code.trim().toUpperCase().replace(/\s+/g, " "), course)
        const confirmed = [...unique.values()].filter((course: any) => course.status === "completed")
        const completedCredits = confirmed.reduce((sum: number, course: any) => sum + Number(course.credit_hours), 0)
        const normalized = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ")
        const matchesOption = (courseCode: string, optionCode: string) => {
          const course = normalized(courseCode), option = normalized(optionCode)
          return option.endsWith("***") ? course.startsWith(option.slice(0, -3)) && /^\d{3}$/.test(course.slice(option.length - 3)) : course === option
        }
        const requirementProgress = (groups || []).map((group: any) => {
          const groupOptions = (options || []).filter((option: any) => option.group_id === group.id)
          if (group.matching_strategy === "degree_audit_review") {
            const auditGroup = auditPlan?.user_degree_requirement_groups?.find((item: any) => normalized(item.requirement_label) === normalized(group.name))
            const applications = auditGroup?.user_degree_requirements?.filter((item: any) => item.application_source === "degree_audit" && item.course_code && Number(item.credits_applied) > 0) || []
            const seen = new Set<string>(), satisfiedCourses: any[] = [], inProgressCourses: any[] = [], needsReview: string[] = []
            let appliedCompleted = 0, appliedInProgress = 0
            for (const application of applications) {
              const code = normalized(application.course_code)
              if (seen.has(code)) continue
              seen.add(code)
              const course = unique.get(code), credits = Number(application.credits_applied)
              if (!course || credits > Number(course.credit_hours)) { needsReview.push(application.course_code); continue }
              const applied = { course_code: application.course_code, credits_applied: credits, provenance: "degree_audit" }
              if (course.status === "completed") { appliedCompleted += credits; satisfiedCourses.push(applied) }
              else { appliedInProgress += credits; inProgressCourses.push(applied) }
            }
            const required = Number(group.minimum_credits), completedApplied = Math.min(required, appliedCompleted), progressApplied = Math.min(appliedInProgress, Math.max(0, required-appliedCompleted))
            return { name: group.name, description: group.description, completed_credits: completedApplied, in_progress_credits: progressApplied, required_credits: required, remaining_credits: Math.max(0, required-completedApplied), unresolved_credits: Math.max(0, required-completedApplied-progressApplied), remaining_courses: [], satisfied_courses: satisfiedCourses, in_progress_courses: inProgressCourses, needs_review: needsReview, requires_degree_audit_review: !auditGroup || !applications.length || needsReview.length>0 || completedApplied+progressApplied<required, provenance: applications.length ? "degree_audit" : null }
          }
          if (group.matching_strategy === "degree_total" || group.requirement_type === "total_degree") return { name: group.name, description: group.description, completed_credits: Math.min(completedCredits, Number(group.minimum_credits)), required_credits: Number(group.minimum_credits), remaining_credits: Math.max(0, Number(group.minimum_credits) - completedCredits), remaining_courses: [], satisfied_courses: [], requires_degree_audit_review: false }
          const matched = groupOptions.filter((option: any) => confirmed.some((course: any) => matchesOption(course.course_code, option.course_code)))
          const matchedCredits = matched.reduce((sum: number, option: any) => sum + Number(option.credit_hours), 0)
          return { name: group.name, description: group.description, completed_credits: Math.min(Number(group.minimum_credits), matchedCredits), required_credits: Number(group.minimum_credits), remaining_credits: Math.max(0, Number(group.minimum_credits) - matchedCredits), remaining_courses: groupOptions.filter((option: any) => !confirmed.some((course: any) => matchesOption(course.course_code, option.course_code))).map((option: any) => ({ course_code: option.course_code, course_title: option.course_title, prerequisite: option.prerequisite_text })), satisfied_courses: matched.map((option: any) => confirmed.find((course: any) => matchesOption(course.course_code, option.course_code))?.course_code || option.course_code), requires_degree_audit_review: false }
        })
        add("Degree Planner", "course", { supported: true, requirement_source: "verified_catalog", provenance_label: "Verified program requirements", program, catalog_label: `${program.catalog_year}–${program.catalog_year + 1}`, completed_credits: completedCredits, in_progress_courses: [...unique.values()].filter((course: any) => course.status === "in_progress"), in_progress_credits: [...unique.values()].filter((course: any) => course.status === "in_progress").reduce((sum: number, course: any) => sum + Number(course.credit_hours), 0), percent_complete: Math.min(100, Math.round(completedCredits / Number(program.total_credits_required) * 100)), target_graduation_term: [profile?.expected_graduation_term, profile?.graduation_year].filter(Boolean).join(" ") || null, requirement_progress: requirementProgress, degree_audit_supplement: auditPlan ? { confirmed_at: auditPlan.confirmed_at, requirement_progress: auditPlan.user_degree_requirement_groups, warning: "The verified catalog remains the baseline. If the audit differs, identify it under things_to_double_check; do not merge or resolve the conflict silently." } : null })
      }
    }
    const { data: history = [], error: historyError } = await admin
      .from("companion_messages")
      .select("role,content,sources")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(9)
    if (historyError) throw historyError
    const recentSourceLabels = (history || []).flatMap((item: any) =>
      Array.isArray(item.sources) ? item.sources.map((source: any) => source?.label).filter(Boolean) : [],
    )
    if (wantsNotes) {
      const { data: notes = [], error: notesError } = currentCourseIdList.length
        ? await admin.from("organized_course_notes")
          .select("id,course_id,title,organized_content,created_at").eq("user_id", user.id).in("course_id", currentCourseIdList).order("created_at", { ascending: false }).limit(20)
        : { data: [], error: null }
      if (notesError) throw notesError
      const rankedNotes = (notes || []).map((note: any, index: number) => {
        const course = courseById.get(note.course_id), content = compact(note.organized_content, 12000)
        return { note, course, score: relevance(message, `${note.title} ${course?.course_code || ""} ${course?.course_name || ""} ${content}`) - index * 0.01 }
      }).filter((entry: any) => entry.score > 0).sort((a: any, b: any) => b.score - a.score).slice(0, 3)
      for (const entry of rankedNotes) add([entry.course?.course_code, entry.note.title].filter(Boolean).join(" — "), "note", entry.note.organized_content)
    }
    if (wantsSyllabus || wantsRoadmap) {
      // Course Roadmap entries are the syllabus-derived week/topic schedule, persisted
      // separately from the raw processed document (see course_roadmap_entries migration).
      // They're the authoritative, structured answer to "what topics/what are we covering"
      // and were previously never fetched here at all, so Companion had nothing to cite even
      // when a syllabus had been reviewed and its roadmap extracted.
      const { data: roadmapEntries = [], error: roadmapError } = currentCourseIdList.length
        ? await admin
          .from("course_roadmap_entries")
          .select("course_id,period_label,topic,description,deliverable,entry_date")
          .eq("user_id", user.id)
          .in("course_id", currentCourseIdList)
          .order("sort_order")
        : { data: [], error: null }
      if (roadmapError) throw roadmapError
      const roadmapByCourse = new Map<string, any[]>()
      for (const entry of roadmapEntries || []) {
        const list = roadmapByCourse.get(entry.course_id) || []
        list.push(entry)
        roadmapByCourse.set(entry.course_id, list)
      }
      for (const [courseId, entries] of roadmapByCourse) {
        const course = courseById.get(courseId)
        add([course?.course_code, "Course Roadmap"].filter(Boolean).join(" — "), "roadmap", entries)
      }
    }
    if (wantsLecture || wantsSyllabus || wantsRoadmap) {
      const kinds =
        wantsLecture && !(wantsSyllabus || wantsRoadmap)
          ? ["lecture"]
          : (wantsSyllabus || wantsRoadmap) && !wantsLecture
            ? ["syllabus"]
            : ["lecture", "syllabus"]
      const { data: results = [], error: resultsError } = currentCourseIdList.length
        ? await admin
          .from("ai_processing_results")
          .select("upload_id,kind,status,result,course_id,created_at")
          .eq("user_id", user.id)
          .in("course_id", currentCourseIdList)
          .in("kind", kinds)
          .in("status", ["ready_for_review", "approved"])
          .order("created_at", { ascending: false })
          .limit(8)
        : { data: [], error: null }
      if (resultsError) throw resultsError
      const uploadIds = (results || []).map((item: any) => item.upload_id)
      // `uploaded_files.processing_status` only ever reaches "ready_for_review" or,
      // once the student reviews and approves it, "processed" -- "approved" is not a value
      // this column ever takes (that's ai_processing_results.status, a different column on a
      // different table). Filtering on "approved" here silently excluded every syllabus and
      // lecture the student had actually reviewed and confirmed, which is exactly why
      // Companion claimed it had no syllabus for a course whose syllabus was fully processed.
      const { data: uploads = [], error: uploadsError } = uploadIds.length
        ? await admin
          .from("uploaded_files")
          .select("id,original_filename,category,processing_status")
          .eq("user_id", user.id)
          .in("id", uploadIds)
          .in("category", kinds)
          .in("processing_status", ["ready_for_review", "processed"])
        : { data: [], error: null }
      if (uploadsError) throw uploadsError
      const uploadById = new Map(
        (uploads || []).map((upload: any) => [upload.id, upload]),
      )
      const ranked = (results || [])
        .filter((item: any) => uploadById.has(item.upload_id))
        .map((item: any, index: number) => {
          const course = courseById.get(item.course_id)
          const file = uploadById.get(item.upload_id)?.original_filename || "Processed material"
          const resultText = compact(item.result, 12000)
          const continuesPriorMaterial = /\b(that|this|it|latest)\b/.test(lower) && recentSourceLabels.some((label: string) => label.toLowerCase().includes(file.toLowerCase()))
          const requestsLatestMaterial = /\b(latest|most recent)\b/.test(lower)
          return {
            item,
            course,
            file,
            score:
              relevance(
                message,
                `${file} ${course?.course_code || ""} ${course?.course_name || ""} ${resultText}`,
              ) -
              index * 0.01 + (continuesPriorMaterial ? 4 : 0) + (requestsLatestMaterial && index === 0 ? 2 : 0),
          }
        })
        .sort((a: any, b: any) => b.score - a.score)
        .filter((entry: any) => entry.score > 0)
        .slice(0, 2)
      for (const entry of ranked)
        add(
          [entry.course?.course_code, entry.file].filter(Boolean).join(" — "),
          entry.item.kind,
          { filename: entry.file, content: entry.item.result },
        )
    }
    if (!context.length && courses?.length)
      add(
        "Current courses",
        "course",
        courses.map(({ id: _id, ...course }: any) => course),
      )

    const prior = (history || [])
      .reverse()
      .filter(
        (item: any) => !(item.role === "user" && item.content === message),
      )
      .map((item: any) => ({
        role: item.role,
        content: item.content.slice(0, 2000),
      }))
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || ""
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY is not configured")
    const allowedLabels = sources.map((source) => source.label)
    const system = buildCompanionSystemPrompt({ localToday, timeZone, allowedLabels, context })
    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-5",
          max_tokens: 1800,
          system,
          messages: [...prior, { role: "user", content: message }],
          output_config: {
            format: { type: "json_schema", schema: responseSchema },
          },
        }),
      },
    )
    if (!claudeResponse.ok)
      throw new Error(
        `Anthropic request failed (${claudeResponse.status}): ${(await claudeResponse.text()).slice(0, 500)}`,
      )
    const payload = await claudeResponse.json()
    const text = payload.content?.find((part: any) => part.type === "text")
      ?.text
    const result = JSON.parse(text || "null")
    if (
      !result ||
      typeof result.answer !== "string" ||
      !Array.isArray(result.sources) ||
      !Array.isArray(result.things_to_double_check)
    )
      throw new Error("Companion structured response failed validation")
    const cited = sources.filter((source) =>
      result.sources.includes(source.label),
    )
    const { data: assistant, error: saveError } = await admin
      .from("companion_messages")
      .insert({
        conversation_id: conversationId,
        user_id: user.id,
        request_id: requestId,
        role: "assistant",
        content: result.answer.slice(0, 12000),
        sources: cited,
        metadata: {
          things_to_double_check: result.things_to_double_check.slice(0, 8),
        },
      })
      .select("*")
      .single()
    if (saveError) throw saveError
    const { data: conversation } = await admin
      .from("companion_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("user_id", user.id)
      .select("*")
      .single()
    return respond({ conversation, user_message: userMessage, message: assistant })
  } catch (error) {
    console.error("Pathly Companion request failed", error)
    return respond(failure, 500)
  }
})
