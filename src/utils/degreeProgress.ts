import type { CompletedCourse, DegreeProgram, RequirementGroup, UserDegreePlan } from "../types/degreePlanning.ts"

const normalize = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ")
const matchesOption = (courseCode: string, optionCode: string) => {
  const course = normalize(courseCode), option = normalize(optionCode)
  return option.endsWith("***") ? course.startsWith(option.slice(0,-3)) && /^\d{3}$/.test(course.slice(option.length-3)) : course === option
}

export function calculateDegreeProgress(program: DegreeProgram, groups: RequirementGroup[], courses: CompletedCourse[], auditPlan: UserDegreePlan | null = null) {
  const unique = new Map<string, CompletedCourse>()
  for (const course of courses) {
    const key=normalize(course.course_code), existing=unique.get(key)
    if (!existing || (course.status==="completed"&&existing.status!=="completed")) unique.set(key,course)
  }
  const completed=[...unique.values()].filter(course=>course.status==="completed"), inProgress=[...unique.values()].filter(course=>course.status==="in_progress")
  const completedCredits=completed.reduce((sum,course)=>sum+Number(course.credit_hours),0), inProgressCredits=inProgress.reduce((sum,course)=>sum+Number(course.credit_hours),0)
  const groupProgress=groups.map(group=>{
    const minimum=Number(group.minimum_credits)
    if(group.matching_strategy==="degree_total"||group.requirement_type==="total_degree") return {...group,completedCredits:Math.min(completedCredits,minimum),inProgressCredits:Math.min(inProgressCredits,Math.max(0,minimum-completedCredits)),remainingCredits:Math.max(0,minimum-completedCredits),unresolvedCredits:Math.max(0,minimum-completedCredits-inProgressCredits),satisfied:[] as string[],inProgress:[] as string[],needsReview:[] as string[],remaining:[] as string[],requiresReview:false,provenance:"verified_catalog" as const}
    if(group.matching_strategy==="degree_audit_review") {
      const auditGroup=auditPlan?.user_degree_requirement_groups.find(item=>normalize(item.requirement_label)===normalize(group.name))
      const applications=auditGroup?.user_degree_requirements.filter(item=>item.application_source==="degree_audit"&&item.course_code&&Number(item.credits_applied)>0)||[]
      const seen=new Set<string>(), satisfied:string[]=[], appliedInProgress:string[]=[], needsReview:string[]=[]
      let completedApplied=0, inProgressApplied=0
      for(const application of applications){const code=normalize(application.course_code!);if(seen.has(code))continue;seen.add(code);const course=unique.get(code),credits=Number(application.credits_applied);if(!course||credits>Number(course.credit_hours)){needsReview.push(application.course_code!);continue}if(course.status==="completed"){completedApplied+=credits;satisfied.push(application.course_code!)}else{inProgressApplied+=credits;appliedInProgress.push(application.course_code!)}}
      const cappedCompleted=Math.min(completedApplied,minimum),cappedInProgress=Math.min(inProgressApplied,Math.max(0,minimum-cappedCompleted))
      return {...group,completedCredits:cappedCompleted,inProgressCredits:cappedInProgress,remainingCredits:Math.max(0,minimum-cappedCompleted),unresolvedCredits:Math.max(0,minimum-cappedCompleted-cappedInProgress),satisfied,inProgress:appliedInProgress,needsReview,remaining:[] as string[],requiresReview:!auditGroup||applications.length===0||needsReview.length>0||cappedCompleted+cappedInProgress<minimum,provenance:applications.length?"degree_audit" as const:null}
    }
    const matched=group.requirement_course_options.filter(option=>completed.some(course=>matchesOption(course.course_code,option.course_code))), credits=matched.reduce((sum,option)=>sum+Number(option.credit_hours),0)
    const satisfied=matched.map(option=>completed.find(course=>matchesOption(course.course_code,option.course_code))?.course_code||option.course_code)
    const remaining=group.requirement_course_options.filter(option=>!completed.some(course=>matchesOption(course.course_code,option.course_code))).map(option=>option.course_code)
    return {...group,completedCredits:Math.min(credits,minimum),inProgressCredits:0,remainingCredits:Math.max(0,minimum-credits),unresolvedCredits:Math.max(0,minimum-credits),satisfied,inProgress:[] as string[],needsReview:[] as string[],remaining,requiresReview:false,provenance:"verified_catalog" as const}
  })
  return {completedCredits,inProgressCredits,percent:Math.min(100,Math.round(completedCredits/Number(program.total_credits_required)*100)),groupProgress}
}
