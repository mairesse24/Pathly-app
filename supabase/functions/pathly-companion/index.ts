import "jsr:@supabase/functions-js@2.5.0/edge-runtime.d.ts"
import { createClient } from "@supabase/supabase-js"
import { buildSmartPlan } from "../_shared/smartPlanning.ts"

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
type SourceType = "assignment" | "exam" | "calendar" | "lecture" | "syllabus" | "course" | "reflection"
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
    const wantsPlanning =
      /today|tonight|plan|focus|week|coming up|assignment|exam|schedule|energy/.test(
        lower,
      )
    const wantsLecture =
      /lecture|quiz|explain|concept|material|oscilloscope|waveform|uav|hardware/.test(
        lower,
      )
    const wantsSyllabus =
      /syllabus|deadline|requirement|course info|grading/.test(lower)
    const wantsDegree =
      /degree|graduat|requirement.*left|credits.*completed|academic progress/.test(lower)
    const sources: Source[] = []
    const context: string[] = []
    const add = (label: string, type: SourceType, value: unknown) => {
      sources.push({ label, type })
      context.push(`${label}: ${compact(value)}`)
    }
    const { data: courses = [] } = await admin
      .from("courses")
      .select(
        "id,course_code,course_name,instructor,meeting_days,meeting_start,meeting_end",
      )
      .eq("user_id", user.id)
    const courseById = new Map(
      (courses || []).map((course: any) => [course.id, course]),
    )
    const { data: profile } = await admin.from("profiles").select("timezone,preferred_study_time,focus_session_minutes,prefers_breaks,break_duration_minutes,university,major,catalog_year,expected_graduation_term,graduation_year").eq("id", user.id).maybeSingle()
    const timeZone = validTimeZone(profile?.timezone || requestedTimeZone)
    const localToday = localDateKey(new Date(), timeZone)

    if (wantsPlanning) {
      const now = new Date()
      const later = new Date(now.getTime() + 30 * 86400000)
      const [
        { data: assignments = [] },
        { data: exams = [] },
        { data: sessions = [] },
        { data: reflections = [] },
      ] = await Promise.all([
        admin
          .from("assignments")
          .select("id,course_id,title,due_at,estimated_minutes,status")
          .eq("user_id", user.id)
          .neq("status", "completed")
          .order("due_at")
          .limit(50),
        admin
          .from("exams")
          .select("id,course_id,title,exam_at,topics_summary")
          .eq("user_id", user.id)
          .gte("exam_at", now.toISOString())
          .lte("exam_at", later.toISOString())
          .order("exam_at")
          .limit(5),
        admin
          .from("study_sessions")
          .select("id,course_id,assignment_id,title,start_at,end_at,status")
          .eq("user_id", user.id)
          .gte("end_at", now.toISOString())
          .lte("start_at", later.toISOString())
          .order("start_at")
          .limit(8),
        admin
          .from("daily_reflections")
          .select("reflection_date,mood,energy,notes")
          .eq("user_id", user.id)
          .eq("reflection_date", localToday)
          .limit(1),
      ])
      const plan = buildSmartPlan({
        assignments: assignments || [],
        exams: exams || [],
        studySessions: sessions || [],
        courses: courses || [],
        reflection: reflections?.[0] || null,
        preferences: profile,
        timeZone,
        now,
      })
      add("Today's focus", "assignment", plan)
    }
    if (wantsDegree) {
      const { data: completed = [] } = await admin.from("completed_courses")
        .select("course_code,course_title,credit_hours,status").eq("user_id", user.id)
      const { data: program } = profile?.university && profile?.major && profile?.catalog_year
        ? await admin.from("degree_programs").select("id,university,degree,major,catalog_year,total_credits_required,source_title")
          .ilike("university", profile.university).ilike("major", profile.major).eq("catalog_year", profile.catalog_year).maybeSingle()
        : { data: null }
      if (!program) {
        add("Degree Planner", "course", { supported: false, university: profile?.university || null, major: profile?.major || null, catalog_year: profile?.catalog_year || null, message: "Pathly does not have verified requirements for this exact program and catalog year." })
      } else {
        const { data: groups = [] } = await admin.from("requirement_groups").select("id,name,requirement_type,minimum_credits").eq("program_id", program.id).order("sort_order")
        const groupIds = (groups || []).map((group: any) => group.id)
        const { data: options = [] } = groupIds.length ? await admin.from("requirement_course_options").select("group_id,course_code,credit_hours").in("group_id", groupIds) : { data: [] }
        const unique = new Map<string, any>(); for (const course of completed || []) unique.set(course.course_code.trim().toUpperCase().replace(/\s+/g, " "), course)
        const confirmed = [...unique.values()].filter((course: any) => course.status === "completed")
        const completedCredits = confirmed.reduce((sum: number, course: any) => sum + Number(course.credit_hours), 0)
        const codes = new Set(confirmed.map((course: any) => course.course_code.trim().toUpperCase().replace(/\s+/g, " ")))
        const requirementProgress = (groups || []).map((group: any) => {
          const groupOptions = (options || []).filter((option: any) => option.group_id === group.id)
          const matched = groupOptions.filter((option: any) => codes.has(option.course_code))
          return { name: group.name, completed_credits: group.requirement_type === "total_degree" ? Math.min(completedCredits, Number(group.minimum_credits)) : Math.min(Number(group.minimum_credits), matched.reduce((sum: number, option: any) => sum + Number(option.credit_hours), 0)), required_credits: Number(group.minimum_credits), remaining_courses: group.requirement_type === "all_courses" ? groupOptions.filter((option: any) => !codes.has(option.course_code)).map((option: any) => option.course_code) : [] }
        })
        add("Degree Planner", "course", { supported: true, program, completed_credits: completedCredits, in_progress_credits: [...unique.values()].filter((course: any) => course.status === "in_progress").reduce((sum: number, course: any) => sum + Number(course.credit_hours), 0), percent_complete: Math.min(100, Math.round(completedCredits / Number(program.total_credits_required) * 100)), requirement_progress: requirementProgress })
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
    if (wantsLecture || wantsSyllabus) {
      const kinds =
        wantsLecture && !wantsSyllabus
          ? ["lecture"]
          : wantsSyllabus && !wantsLecture
            ? ["syllabus"]
            : ["lecture", "syllabus"]
      const { data: results = [], error: resultsError } = await admin
        .from("ai_processing_results")
        .select("upload_id,kind,status,result,course_id,created_at")
        .eq("user_id", user.id)
        .in("kind", kinds)
        .in("status", ["ready_for_review", "approved"])
        .order("created_at", { ascending: false })
        .limit(8)
      if (resultsError) throw resultsError
      const uploadIds = (results || []).map((item: any) => item.upload_id)
      const { data: uploads = [], error: uploadsError } = uploadIds.length
        ? await admin
          .from("uploaded_files")
          .select("id,original_filename,category,processing_status")
          .eq("user_id", user.id)
          .in("id", uploadIds)
          .in("category", kinds)
          .in("processing_status", ["ready_for_review", "approved"])
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
    const system = `You are Pathly Companion, a grounded academic planning assistant. The student's current local date is ${localToday} in ${timeZone}. Use only the supplied Pathly context. Clearly distinguish stored facts, information extracted from processed material, and your recommendations. Never invent deadlines, grades, exam coverage, course requirements, or degree requirements. For planning, give 1-3 realistic priorities; adapt gently to a low-energy reflection without diagnosing the student.

Handle retrieved materials in exactly one of these ways:
- Source found and its content supports the student's assumed topic: answer normally from that source.
- Source found but its content conflicts with the filename or the student's assumed topic: do not imply retrieval failed. Open by naming the file and explaining the mismatch, then summarize only the content actually present. Use this framing: "I found '<filename>', but its contents appear to be <actual content> rather than <assumed topic>." Add the mismatch to things_to_double_check.
- No relevant source found: say Pathly does not have enough information and suggest what the student could upload or add.

If a lecture or syllabus source appears in AVAILABLE SOURCES, you found a retrieved document. Never say you do not have lecture notes, slides, or a source in that case. Check supplied material for filename/content mismatches, conflicting statements, dates, units, or arithmetic and put concise concerns in things_to_double_check. Cite only exact labels from AVAILABLE SOURCES. Do not mention AI providers or internal implementation. Do not use outside knowledge unless the student explicitly requests it.
When Today's focus appears in AVAILABLE SOURCES, its deterministic priorities are authoritative. Preserve their order and recommend only those items; explain them conversationally without inventing or reprioritizing work. Treat overdue work as unresolved and ask whether it was submitted—never call it failed or missed. Mention schedule conflicts without moving anything automatically.
When Degree Planner appears in AVAILABLE SOURCES, its structured calculations are authoritative. Report only those values. If supported is false, say verified requirements are unavailable; never calculate or infer degree progress yourself. Never treat Canvas enrollments as completed coursework.
AVAILABLE SOURCES: ${JSON.stringify(allowedLabels)}
PATHLY CONTEXT:
${context.join("\n").slice(0, 24000)}`
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
