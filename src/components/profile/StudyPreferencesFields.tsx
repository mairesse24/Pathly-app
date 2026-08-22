import { useState } from "react";
import type { NonAcademicConstraint, StudyPreferencesInput } from "../../services/profiles";

const constraintOptions: { value: NonAcademicConstraint; label: string }[] = [
  { value: "work", label: "Work" },
  { value: "commute", label: "Commute" },
  { value: "family", label: "Family" },
  { value: "extracurriculars", label: "Extracurriculars" },
  { value: "varies", label: "Varies" },
];
const focusPresets = [25, 45, 60, 90];

export function StudyPreferencesFields({ value, onChange }: { value: StudyPreferencesInput; onChange: (value: StudyPreferencesInput) => void }) {
  const [customSession, setCustomSession] = useState(() => value.focus_session_minutes != null && !focusPresets.includes(value.focus_session_minutes));
  const set = <K extends keyof StudyPreferencesInput>(key: K, next: StudyPreferencesInput[K]) => onChange({ ...value, [key]: next });
  return <>
    <label>Preferred study time<select value={value.preferred_study_time ?? ""} onChange={(event) => set("preferred_study_time", (event.target.value || null) as StudyPreferencesInput["preferred_study_time"])}><option value="">Choose if you want</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option><option value="late_night">Late night</option><option value="no_preference">Varies</option></select></label>
    <label>Typical focus session<select value={customSession ? "custom" : value.focus_session_minutes ?? ""} onChange={(event) => { const raw = event.target.value; setCustomSession(raw === "custom"); set("focus_session_minutes", raw === "custom" ? value.focus_session_minutes : raw ? Number(raw) : null); }}><option value="">Choose if you want</option>{focusPresets.map((minutes) => <option value={minutes} key={minutes}>{minutes} minutes</option>)}<option value="custom">Custom (90+ or other)</option></select></label>
    {customSession && <label>Custom focus length<input type="number" min="10" max="240" value={value.focus_session_minutes ?? ""} onChange={(event) => set("focus_session_minutes", event.target.value ? Number(event.target.value) : null)} /><small>Between 10 and 240 minutes.</small></label>}
    <label>Break preference<select value={value.prefers_breaks === null ? "" : value.prefers_breaks ? "breaks" : "straight"} onChange={(event) => { const raw = event.target.value; onChange({ ...value, prefers_breaks: raw === "" ? null : raw === "breaks", break_duration_minutes: raw === "breaks" ? value.break_duration_minutes : null }); }}><option value="">No preference</option><option value="breaks">I like short breaks</option><option value="straight">I usually study straight through</option></select></label>
    {value.prefers_breaks && <label>Optional break length<select value={value.break_duration_minutes ?? ""} onChange={(event) => set("break_duration_minutes", event.target.value ? Number(event.target.value) : null)}><option value="">No preference</option>{[5, 10, 15].map((minutes) => <option value={minutes} key={minutes}>{minutes} minutes</option>)}</select></label>}
    <fieldset><legend>Major non-academic constraints</legend><div className="theme-options" role="group" aria-label="Major non-academic constraints">{constraintOptions.map((opt) => <label key={opt.value}><input type="checkbox" checked={(value.non_academic_constraints ?? []).includes(opt.value)} onChange={(event) => { const next = new Set(value.non_academic_constraints ?? []); if (event.target.checked) next.add(opt.value); else next.delete(opt.value); set("non_academic_constraints", next.size ? [...next] : null); }} />{opt.label}</label>)}</div></fieldset>
    <label>Planning style<select value={value.planning_style ?? ""} onChange={(event) => set("planning_style", (event.target.value || null) as StudyPreferencesInput["planning_style"])}><option value="">Choose if you want</option><option value="structured">Structured — I like a clear plan</option><option value="flexible">Flexible — I like to decide as I go</option><option value="balanced">Balanced — a mix of both</option></select></label>
    <label>What would help most right now?<select value={value.primary_support_goal ?? ""} onChange={(event) => set("primary_support_goal", (event.target.value || null) as StudyPreferencesInput["primary_support_goal"])}><option value="">Choose if you want</option><option value="deadlines">Staying on top of deadlines</option><option value="study_planning">Planning study sessions</option><option value="degree_progress">Tracking degree progress</option><option value="balance">Balancing school with everything else</option></select></label>
  </>;
}
